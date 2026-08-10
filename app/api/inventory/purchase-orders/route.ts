import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PO_SELECT = `
  *,
  supplier:inventory_suppliers(id,name),
  lines:inventory_po_lines(id,received,estimated_cost,actual_cost)
`.trim();

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
    .select(PO_SELECT)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Annotate each PO with line counts and pending invoice total
  const pos = (data ?? []).map((po: any) => {
    const lines: any[] = po.lines ?? [];
    const pendingLines = lines.filter((l: any) => l.actual_cost == null);
    return {
      ...po,
      line_count:            lines.length,
      received_count:        lines.filter((l: any) => l.received).length,
      pending_invoice_total: pendingLines.reduce(
        (sum: number, l: any) => sum + Number(l.estimated_cost ?? 0), 0
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

  const year = new Date().getFullYear();
  const po_number = clientPoNumber?.trim()
    ? clientPoNumber.trim()
    : await generatePoNumber(supabase, year);

  const { data: po, error: poErr } = await supabase
    .from("inventory_purchase_orders")
    .insert({ ...poData, po_number, tenant_id: tenantId, status: poData.status ?? "draft" })
    .select()
    .single();

  if (poErr) return NextResponse.json({ error: poErr.message }, { status: 500 });

  // Insert lines if provided
  if (Array.isArray(lines) && lines.length > 0) {
    const lineInserts = lines.map((l: any) => ({
      ...l,
      po_id:     po.id,
      tenant_id: tenantId,
      received:  false,
    }));
    const { error: lineErr } = await supabase
      .from("inventory_po_lines")
      .insert(lineInserts);
    if (lineErr) console.error("[po POST] line insert error:", lineErr.message);
  }

  return NextResponse.json({ purchase_order: po });
}
