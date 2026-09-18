import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Deliberately separate from GET /api/inventory/pieces (app/api/inventory/pieces/route.ts),
// which joins on status_id/category_id/supplier_id relationships and searches a
// "title" column - none of which exist on the real inventory_pieces schema on
// staging (confirmed directly: that route currently errors with PGRST200,
// "no relationship between inventory_pieces and inventory_statuses"). That's a
// pre-existing, unrelated bug - out of scope here, flagged separately. This
// route queries only columns confirmed to actually exist: sku, metal_weight_grams,
// a plain text status column, and the (working) FK to inventory_products for a
// display name when the piece is linked to a design.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") ?? "").trim();
  const perPage = Math.min(20, parseInt(searchParams.get("per_page") ?? "8", 10));

  if (search.length < 2) {
    return NextResponse.json({ pieces: [] });
  }

  let query = supabase
    .from("inventory_pieces")
    .select("id, sku, metal_weight_grams, status, product:inventory_products(name)")
    .ilike("sku", `%${search}%`)
    .order("created_at", { ascending: false })
    .limit(perPage);

  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message, pieces: [] }, { status: 500 });

  return NextResponse.json({ pieces: data ?? [] });
}
