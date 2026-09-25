import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { preparePoLineForWrite } from "@/lib/poLineColumns";
import { poPdfSchemaError } from "@/lib/poPdfSchema";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Do not embed supplier here. Staging has no foreign key from
// inventory_purchase_orders.supplier_id to inventory_suppliers, and PostgREST
// rejects the whole list when that relationship is missing. The detail route
// already loads the supplier in a separate query for the same reason.

async function generatePoNumber(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  year: number
): Promise<string> {
  const prefix = `PO-${year}-`;
  const { data } = await supabase
    .from("inventory_purchase_orders")
    .select("po_number")
    .ilike("po_number", `${prefix}%`)
    .order("po_number", { ascending: false })
    .limit(20);

  let maxSeq = 0;
  for (const row of data ?? []) {
    const parts = (row.po_number as string).split("-");
    const seq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

// GET /api/inventory/purchase-orders
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";

  let query = supabase
    .from("inventory_purchase_orders")
    .select("id, po_number, supplier_id, supplier_name, status, order_date, expected_date, notes, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const poIds = rows.map((po: { id: string }) => po.id);
  const supplierIds = Array.from(new Set(
    rows.map((po: { supplier_id: string | null }) => po.supplier_id).filter((id): id is string => !!id)
  ));

  const [linesRes, suppliersRes] = await Promise.all([
    poIds.length
      ? supabase
          .from("inventory_po_lines")
          .select("id, po_id, received, estimated_cost, actual_cost")
          .eq("tenant_id", tenantId)
          .in("po_id", poIds)
      : Promise.resolve({ data: [], error: null }),
    supplierIds.length
      ? supabase
          .from("inventory_suppliers")
          .select("id, name")
          .eq("tenant_id", tenantId)
          .in("id", supplierIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (linesRes.error) return NextResponse.json({ error: linesRes.error.message }, { status: 500 });
  if (suppliersRes.error) return NextResponse.json({ error: suppliersRes.error.message }, { status: 500 });

  const linesByPo = new Map<string, { received: boolean; estimated_cost: number | null; actual_cost: number | null }[]>();
  for (const line of linesRes.data ?? []) {
    const list = linesByPo.get(line.po_id) ?? [];
    list.push(line);
    linesByPo.set(line.po_id, list);
  }
  const suppliersById = new Map(
    (suppliersRes.data ?? []).map((supplier: { id: string; name: string }) => [supplier.id, supplier])
  );

  // Annotate each PO with line counts and pending invoice total
  const pos = rows.map((po: any) => {
    const lines = linesByPo.get(po.id) ?? [];
    const pendingLines = lines.filter((l) => l.actual_cost == null);
    return {
      ...po,
      supplier: po.supplier_id ? (suppliersById.get(po.supplier_id) ?? null) : null,
      line_count:            lines.length,
      received_count:        lines.filter((l) => l.received).length,
      pending_invoice_total: pendingLines.reduce(
        (sum: number, l) => sum + Number(l.estimated_cost ?? 0), 0
      ),
      pending_invoice_count: pendingLines.length,
    };
  });

  return NextResponse.json({ purchase_orders: pos }, { headers: { "Cache-Control": "no-store" } });
}

// POST /api/inventory/purchase-orders — create
export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const body = await req.json();
  const { lines, po_number: clientPoNumber, ...poData } = body;

  // Validate line writes (including Xero account id/code/name) before creating
  // the header, so a rejected account does not leave an empty purchase order.
  const preparedLines: Record<string, unknown>[] = [];
  if (Array.isArray(lines)) {
    for (const line of lines) {
      if (!line || typeof line !== "object") {
        return NextResponse.json({ error: "Each purchase order line must be an object" }, { status: 400 });
      }
      const prepared = preparePoLineForWrite(line as Record<string, unknown>);
      if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: 400 });
      preparedLines.push(prepared.line);
    }
  }

  const year = new Date().getFullYear();
  const po_number = clientPoNumber?.trim()
    ? clientPoNumber.trim()
    : await generatePoNumber(supabase, year);

  const header = { ...poData, po_number, tenant_id: tenantId, status: poData.status ?? "draft" } as Record<string, unknown>;
  if (header.payment_terms == null || header.payment_terms === "") delete header.payment_terms;
  if (header.ship_to_address == null || header.ship_to_address === "") delete header.ship_to_address;

  const { data: po, error: poErr } = await supabase
    .from("inventory_purchase_orders")
    .insert(header)
    .select()
    .single();

  if (poErr) {
    const hint = poPdfSchemaError(poErr);
    return NextResponse.json({ error: hint ?? poErr.message }, { status: hint ? 503 : 500 });
  }

  // Insert lines if provided
  if (preparedLines.length > 0) {
    const lineInserts = preparedLines.map(l => ({
      ...l,
      po_id:     po.id,
      tenant_id: tenantId,
      received:  false,
    }));

    const { error: lineErr } = await supabase
      .from("inventory_po_lines")
      .insert(lineInserts);
    if (lineErr) {
      const hint = poPdfSchemaError(lineErr);
      return NextResponse.json({ error: hint ?? `Line insert failed: ${lineErr.message}` }, { status: hint ? 503 : 500 });
    }
  }

  return NextResponse.json({ purchase_order: po });
}
