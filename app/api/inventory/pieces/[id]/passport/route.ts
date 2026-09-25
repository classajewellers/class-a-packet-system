import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import {
  assemblePiecePassport,
  PassportInvoice,
  PassportJob,
  PassportPacket,
} from "@/lib/piecePassport";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function invoiceFromRow(data: {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  status: string | null;
  total_amount: number | string | null;
}): PassportInvoice {
  return {
    id: data.id,
    invoice_number: data.invoice_number ?? null,
    invoice_date: data.invoice_date ?? null,
    status: data.status ?? null,
    total_amount: data.total_amount != null ? Number(data.total_amount) : null,
  };
}

function customerName(row: {
  customer_first_name?: string | null;
  customer_last_name?: string | null;
} | null): string | null {
  if (!row) return null;
  const name = [row.customer_first_name, row.customer_last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

// GET /api/inventory/pieces/[id]/passport
// Reads supplier, packet, and invoice from the piece, then loads the
// names. The purchase order and receive date still come from the line
// and the goods receipt. invoice_id is empty until a later step.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data: piece, error: pieceErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_pieces")
    .select("id, sku, po_line_id, receiving_event_id, supplier_id, packet_id, invoice_id")
    .eq("id", params.id)
    .maybeSingle();

  if (pieceErr) {
    return NextResponse.json({ error: pieceErr.message }, { status: 500 });
  }
  if (!piece) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = piece as unknown as Record<string, string | null>;
  const poLineId = row.po_line_id ?? null;
  const receivingEventId = row.receiving_event_id ?? null;

  let line: {
    id: string;
    po_id: string | null;
    title: string | null;
    notes: string | null;
    packet_id: string | null;
    category_id: string | null;
    metal_karat: string | null;
    metal_colour: string | null;
    metal_type: string | null;
  } | null = null;

  if (poLineId) {
    const { data } = await tenantScoped(supabase, tenantId)
      .from("inventory_po_lines")
      .select("id, po_id, title, notes, packet_id, category_id, metal_karat, metal_colour, metal_type")
      .eq("id", poLineId)
      .maybeSingle();
    line = data ?? null;
  }

  let purchaseOrder: {
    id: string;
    po_number: string | null;
    status: string | null;
    order_date: string | null;
    expected_date: string | null;
    supplier_id: string | null;
    supplier_name: string | null;
  } | null = null;

  if (line?.po_id) {
    const { data } = await tenantScoped(supabase, tenantId)
      .from("inventory_purchase_orders")
      .select("id, po_number, status, order_date, expected_date, supplier_id, supplier_name")
      .eq("id", line.po_id)
      .maybeSingle();
    purchaseOrder = data ?? null;
  }

  let receivedAt: string | null = null;
  if (receivingEventId) {
    const { data } = await tenantScoped(supabase, tenantId)
      .from("inventory_receiving_events")
      .select("id, received_at")
      .eq("id", receivingEventId)
      .maybeSingle();
    receivedAt = data?.received_at ?? null;
  }

  let categoryName: string | null = null;
  if (line?.category_id) {
    const { data } = await tenantScoped(supabase, tenantId)
      .from("inventory_categories")
      .select("id, name")
      .eq("id", line.category_id)
      .maybeSingle();
    categoryName = data?.name ?? null;
  }

  const pieceSupplierId = row.supplier_id ?? null;
  const piecePacketId = row.packet_id ?? null;
  const pieceInvoiceId = row.invoice_id ?? null;

  const supplierIds = [pieceSupplierId, purchaseOrder?.supplier_id].filter((id): id is string => Boolean(id));
  const supplierById: Record<string, string> = {};
  if (supplierIds.length > 0) {
    const { data } = await tenantScoped(supabase, tenantId)
      .from("inventory_suppliers")
      .select("id, name")
      .in("id", supplierIds);
    for (const supplier of data ?? []) {
      if (supplier?.id && supplier.name) supplierById[supplier.id] = supplier.name;
    }
  }

  const packetIds = [piecePacketId, line?.packet_id].filter((id): id is string => Boolean(id));
  const packetById: Record<string, PassportPacket> = {};
  if (packetIds.length > 0) {
    const { data } = await tenantScoped(supabase, tenantId)
      .from("packets")
      .select("id, reference_number, customer_first_name, customer_last_name")
      .in("id", packetIds);
    for (const packet of data ?? []) {
      packetById[packet.id] = {
        id: packet.id,
        reference_number: packet.reference_number ?? null,
        customer_name: customerName(packet),
      };
    }
  }

  const packetId = piecePacketId ?? line?.packet_id ?? null;
  let job: PassportJob | null = null;
  if (packetId) {
    const scoped = await tenantScoped(supabase, tenantId)
      .from("workshop_jobs")
      .select("id, stage, job_type, reference_number")
      .eq("packet_id", packetId)
      .limit(1)
      .maybeSingle();
    const jobRow = scoped.error
      ? (await supabase
          .from("workshop_jobs")
          .select("id, stage, job_type, reference_number")
          .eq("packet_id", packetId)
          .limit(1)
          .maybeSingle()).data
      : scoped.data;
    if (jobRow?.id) {
      job = {
        id: jobRow.id,
        stage: jobRow.stage ?? null,
        job_type: jobRow.job_type ?? null,
        reference_number: jobRow.reference_number ?? null,
      };
    }
  }

  // invoice_id stays null until a later step. Show an invoice only
  // when this piece already points at one.
  let invoice: PassportInvoice | null = null;
  const invoiceSource = pieceInvoiceId ? "piece" as const : null;
  if (pieceInvoiceId) {
    const { data } = await tenantScoped(supabase, tenantId)
      .from("inventory_purchase_invoices")
      .select("id, invoice_number, invoice_date, status, total_amount")
      .eq("id", pieceInvoiceId)
      .maybeSingle();
    if (data?.id) invoice = invoiceFromRow(data);
  }

  const passport = assemblePiecePassport({
    poLineId,
    receivingEventId,
    pieceSupplierId,
    piecePacketId,
    line: line
      ? {
          id: line.id,
          po_id: line.po_id,
          title: line.title,
          notes: line.notes,
          packet_id: line.packet_id,
          category_name: categoryName,
          metal_karat: line.metal_karat,
          metal_colour: line.metal_colour,
          metal_type: line.metal_type,
        }
      : null,
    purchaseOrder: purchaseOrder
      ? {
          id: purchaseOrder.id,
          po_number: purchaseOrder.po_number,
          status: purchaseOrder.status,
          order_date: purchaseOrder.order_date,
          expected_date: purchaseOrder.expected_date,
        }
      : null,
    poSupplierId: purchaseOrder?.supplier_id ?? null,
    poSupplierName: purchaseOrder?.supplier_name ?? null,
    supplierById,
    packetById,
    receivedAt,
    invoice,
    invoiceSource,
    job,
  });

  return NextResponse.json({ passport });
}
