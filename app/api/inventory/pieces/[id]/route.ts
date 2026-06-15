import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const JOINED_SELECT = `
  *,
  status:inventory_statuses(id,name,colour),
  location:inventory_locations(id,name,type),
  category:inventory_categories(id,name),
  supplier:inventory_suppliers(id,name)
`.trim();

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data, error } = await supabase
    .from("inventory_pieces")
    .select(JOINED_SELECT)
    .eq("id", params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ piece: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const body = await req.json();

  // Strip joined relation keys
  const { status: _s, location: _l, category: _c, supplier: _sp, ...updateData } = body;

  // Convert empty strings to null for all UUID fields
  const toUUID = (val: any) => (val && val !== "" ? val : null);
  updateData.category_id = toUUID(updateData.category_id);
  updateData.status_id   = toUUID(updateData.status_id);
  updateData.location_id = toUUID(updateData.location_id);
  updateData.supplier_id = toUUID(updateData.supplier_id);
  updateData.assigned_to = toUUID(updateData.assigned_to);

  const { data, error } = await supabase
    .from("inventory_pieces")
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select(JOINED_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ piece: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { error } = await supabase.from("inventory_pieces").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
