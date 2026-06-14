import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PO_DETAIL_SELECT = `
  *,
  supplier:inventory_suppliers(id,name),
  lines:inventory_po_lines(
    *,
    category:inventory_categories(id,name),
    piece:inventory_pieces(id,sku)
  )
`.trim();

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
  const { lines, supplier: _sup, ...updateData } = body;

  const { data, error } = await supabase
    .from("inventory_purchase_orders")
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select(PO_DETAIL_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Upsert lines if provided
  if (Array.isArray(lines)) {
    for (const line of lines) {
      if (line.id) {
        const { id: lineId, category: _cat, piece: _pc, ...lineUpdate } = line;
        await supabase.from("inventory_po_lines").update(lineUpdate).eq("id", lineId);
      } else {
        await supabase.from("inventory_po_lines").insert({
          ...line, po_id: params.id, tenant_id: tenantId, received: false,
        });
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
