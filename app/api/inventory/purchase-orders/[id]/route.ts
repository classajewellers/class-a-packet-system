import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PO_DETAIL_SELECT = `
  *,
  supplier:inventory_suppliers(id,name),
  lines:inventory_po_lines(
    *,
    pieces:inventory_pieces(id,sku,quantity),
    packet:packets(id,reference_number,customer_first_name,customer_last_name,packet_type)
  )
`.trim();
// Note: category_id is returned as a plain column via *.
// The category:inventory_categories join is omitted because inventory_po_lines.category_id
// has no FK constraint — PostgREST would error. Category names are resolved client-side
// from the reference data already loaded by the page.

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data, error } = await supabase
    .from("inventory_purchase_orders")
    .select(PO_DETAIL_SELECT)
    .eq("id", params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ purchase_order: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const body = await req.json();
  const { lines, deleted_line_ids, supplier: _sup, ...updateData } = body;

  const { data, error } = await supabase
    .from("inventory_purchase_orders")
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select(PO_DETAIL_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Delete removed lines — only non-received lines belonging to this PO
  if (Array.isArray(deleted_line_ids) && deleted_line_ids.length > 0) {
    const { error: delErr } = await supabase
      .from("inventory_po_lines")
      .delete()
      .in("id", deleted_line_ids)
      .eq("po_id", params.id)
      .eq("received", false);
    if (delErr) return NextResponse.json({ error: `Line delete failed: ${delErr.message}` }, { status: 500 });
  }

  // Upsert lines if provided — lines with id are updated, lines without id are inserted
  if (Array.isArray(lines)) {
    for (const line of lines) {
      if (line.id) {
        const { id: lineId, category: _cat, piece: _pc, packet: _pkt, ...lineUpdate } = line;
        const { error: luErr } = await supabase
          .from("inventory_po_lines").update(lineUpdate).eq("id", lineId);
        if (luErr) return NextResponse.json({ error: `Line update failed: ${luErr.message}` }, { status: 500 });
      } else {
        // Destructure id out so an empty-string id from the UI is never sent —
        // Postgres rejects "" for a UUID column; omitting it triggers the DB default.
        const { id: _newLineId, ...insertData } = line;
        const { error: liErr } = await supabase
          .from("inventory_po_lines").insert({
            ...insertData, po_id: params.id, tenant_id: tenantId, received: false,
          });
        if (liErr) return NextResponse.json({ error: `Line insert failed: ${liErr.message}` }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ purchase_order: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { error } = await supabase
    .from("inventory_purchase_orders")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
