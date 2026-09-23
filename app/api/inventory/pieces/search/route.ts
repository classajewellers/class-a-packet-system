import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { resolvePieceExtras, toLocationsById, CategoryRow, StatusRow, ProductLite } from "@/lib/pieceResolution";

export const dynamic = "force-dynamic";

// Used by the quote builder's "Linked Piece" search (app/quotes/builder/
// new/page.tsx). Previously selected an explicit column list including
// metal_weight_grams and status, assuming both exist — confirmed
// 2026-09-23 that production's inventory_pieces has NO plain status
// column at all (status_id only), so this route 500'd on production for
// every search. The 500 was invisible in the UI: the response still
// carried `pieces: []`, and the frontend never checked response.ok, so a
// broken search looked identical to a genuine empty result (fixed
// separately in the frontend below).
//
// Fixed with the same schema-defensive approach as
// lib/pieceResolution.ts: select("*") never errors regardless of which
// columns exist, and status/design are resolved via the shared resolver
// instead of assuming a fixed shape.
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
    .select("*")
    .ilike("sku", `%${search}%`)
    .order("created_at", { ascending: false })
    .limit(perPage);

  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message, pieces: [] }, { status: 500 });

  const rawPieces = (data ?? []) as Record<string, unknown>[];
  const productIds = Array.from(new Set(
    rawPieces.map(p => p.product_id as string | null).filter((id): id is string => !!id)
  ));

  const [statusesRes, productsRes] = await Promise.all([
    supabase.from("inventory_statuses").select("*").eq("tenant_id", tenantId),
    productIds.length > 0
      ? supabase.from("inventory_products").select("id,name,category").in("id", productIds)
      : Promise.resolve({ data: [] as ProductLite[] }),
  ]);
  const ctx = {
    categoriesById: new Map<string, CategoryRow>(),
    statusesById: new Map(((statusesRes.data ?? []) as StatusRow[]).map(s => [s.id, s])),
    locationsById: toLocationsById([]),
    productsById: new Map(((productsRes.data ?? []) as ProductLite[]).map(p => [p.id, p])),
  };

  const pieces = rawPieces.map(p => {
    const extras = resolvePieceExtras(p, ctx);
    return {
      id: p.id,
      sku: p.sku,
      metal_weight_grams: p.metal_weight_grams ?? null,
      resolved_status: extras.resolved_status,
      resolved_design: extras.resolved_design,
    };
  });

  return NextResponse.json({ pieces });
}
