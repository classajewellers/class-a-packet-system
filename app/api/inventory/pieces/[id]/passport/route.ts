import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import {
  assemblePiecePassport,
  PassportColumns,
  PassportInvoice,
  PassportJob,
  PassportPacket,
} from "@/lib/piecePassport";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OPTIONAL_PIECE_COLUMNS = ["supplier_id", "packet_id", "invoice_id"] as const;

async function pieceColumns(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>
): Promise<PassportColumns> {
  const probes = await Promise.all(
    OPTIONAL_PIECE_COLUMNS.map(async (column) => {
      const probe = await supabase.from("inventory_pieces").select(column).limit(1);
      return [column, !probe.error] as const;
    })
  );
  const present = Object.fromEntries(probes) as Record<(typeof OPTIONAL_PIECE_COLUMNS)[number], boolean>;
  return {
    supplier_id: present.supplier_id,
    packet_id: present.packet_id,
    invoice_id: present.invoice_id,
  };
}

async function invoiceTableColumns(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>
): Promise<{ po_id: boolean; tenant_id: boolean }> {
  const probes = await Promise.all(
    (["po_id", "tenant_id"] as const).map(async (column) => {
      const probe = await supabase.from("inventory_purchase_invoices").select(column).limit(1);
      return [column, !probe.error] as const;
    })
  );
  const present = Object.fromEntries(probes) as Record<"po_id" | "tenant_id", boolean>;
  return { po_id: present.po_id, tenant_id: present.tenant_id };
}

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
// Joins the piece back to its PO line, purchase order, packet, and
// receiving event. supplier_id / packet_id / invoice_id on the piece are
// used only when those columns exist.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  const supabase = await createTenantSupabaseClient(tenantId);

  const columns = await pieceColumns(supabase);
  const selectCols = ["id", "po_line_id", "receiving_event_id", "sku"];
  if (columns.supplier_id) selectCols.push("supplier_id");
  if (columns.packet_id) selectCols.push("packet_id");
  if (columns.invoice_id) selectCols.push("invoice_id");

  const { data: piece, error: pieceErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_pieces")
    .select(selectCols.join(", "))
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

  const pieceSupplierId = columns.supplier_id ? (row.supplier_id ?? null) : null;
  const piecePacketId = columns.packet_id ? (row.packet_id ?? null) : null;
  const pieceInvoiceId = columns.invoice_id ? (row.invoice_id ?? null) : null;

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

  // Invoice shows when one is already stored. Prefer the id stamped on
  // the piece. Otherwise use an inventory_purchase_invoices row whose
  // po_id is this order, and only if that column exists. This slice does
  // not create invoices or send them to Xero.
  const invoiceColumns = await invoiceTableColumns(supabase);
  let invoice: PassportInvoice | null = null;
  let invoiceSource: "piece" | "po" | null = null;
  if (pieceInvoiceId) {
    const lookup = invoiceColumns.tenant_id
      ? tenantScoped(supabase, tenantId).from("inventory_purchase_invoices")
      : supabase.from("inventory_purchase_invoices");
    const { data } = await lookup
      .select("id, invoice_number, invoice_date, status, total_amount")
      .eq("id", pieceInvoiceId)
      .maybeSingle();
    if (data?.id) {
      invoice = invoiceFromRow(data);
      invoiceSource = "piece";
    }
  }
  if (!invoice && invoiceColumns.po_id && purchaseOrder?.id) {
    const lookup = invoiceColumns.tenant_id
      ? tenantScoped(supabase, tenantId).from("inventory_purchase_invoices")
      : supabase.from("inventory_purchase_invoices");
    const { data } = await lookup
      .select("id, invoice_number, invoice_date, status, total_amount")
      .eq("po_id", purchaseOrder.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      invoice = invoiceFromRow(data);
      invoiceSource = "po";
    }
  }

  const passport = assemblePiecePassport({
    poLineId,
    receivingEventId,
    pieceSupplierId,
    piecePacketId,
    columns,
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

  return NextResponse.json({
    passport,
    columns,
  });
}
