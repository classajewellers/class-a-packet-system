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

// GET /api/inventory/pieces
// Query: search, category_id, status_id, location_id, page (default 1), per_page (default 50)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { searchParams } = new URL(req.url);
  const search     = searchParams.get("search")      ?? "";
  const categoryId = searchParams.get("category_id") ?? "";
  const statusId   = searchParams.get("status_id")   ?? "";
  const locationId = searchParams.get("location_id") ?? "";
  const page       = Math.max(1, parseInt(searchParams.get("page")     ?? "1",  10));
  const perPage    = Math.min(200, parseInt(searchParams.get("per_page") ?? "50", 10));
  const from       = (page - 1) * perPage;
  const to         = from + perPage - 1;

  let query = supabase
    .from("inventory_pieces")
    .select(JOINED_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search)      query = query.or(`sku.ilike.%${search}%,title.ilike.%${search}%`);
  if (categoryId)  query = query.eq("category_id", categoryId);
  if (statusId)    query = query.eq("status_id",   statusId);
  if (locationId)  query = query.eq("location_id", locationId);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { pieces: data ?? [], total: count ?? 0, page, per_page: perPage },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST /api/inventory/pieces — create a new piece
export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const body = await req.json();

  // Strip joined relation keys before insert
  const { status: _s, location: _l, category: _c, supplier: _sp, ...insertData } = body;

  if (!insertData.sku || typeof insertData.sku !== "string" || !insertData.sku.trim()) {
    return NextResponse.json({ error: "sku is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("inventory_pieces")
    .insert({ ...insertData, tenant_id: tenantId })
    .select(JOINED_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ piece: data });
}
