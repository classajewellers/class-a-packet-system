import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { mapDiamondTypeToStoneOrigin } from "@/lib/inventoryPricing";
import { ORIGIN_SUPPLIER_NAME, resolveSupplierIdForOrigin } from "@/lib/melee-pricing";

export const dynamic = "force-dynamic";

// Looks up the confirmed melee price for a piece's set melee stones.
// Every step is exact-match-or-flag — no interpolation, no inferred quality.
// Returns a discriminated `status` the UI renders directly.
//
//   ok               → priced: { quantity, carat, per_stone, total, quality, shape, supplier_name }
//   none             → the piece has no melee stones
//   incomplete       → melee present but missing shape / colour / clarity / carat
//   no_origin        → diamond_type is None/absent, so no origin → no supplier
//   supplier_missing → the origin's supplier record wasn't found
//   unmapped         → (colour_group, clarity) has no confirmed quality mapping yet
//   no_price         → mapping exists but no exact price-list row matches
export async function GET(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const supabase = createServerSupabaseClient();

  const { data: piece, error: pErr } = await supabase
    .from("inventory_pieces")
    .select("id, diamond_type, melee_quantity, melee_carat_weight, melee_colour_group, melee_clarity, melee_shape")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();
  if (pErr || !piece) return NextResponse.json({ error: "Piece not found" }, { status: 404 });

  const qty    = piece.melee_quantity != null ? Number(piece.melee_quantity) : 0;
  const carat  = piece.melee_carat_weight != null ? Number(piece.melee_carat_weight) : null;
  const colour = (piece.melee_colour_group ?? "").trim();
  const clar   = (piece.melee_clarity ?? "").trim();
  const shape  = (piece.melee_shape ?? "").trim();

  if (!qty || qty <= 0) return NextResponse.json({ status: "none" });
  if (!carat || carat <= 0 || !colour || !clar || !shape) {
    return NextResponse.json({ status: "incomplete", missing: {
      carat: !carat, colour_group: !colour, clarity: !clar, shape: !shape,
    }});
  }

  // Origin → supplier (see lib/melee-pricing.ts for the current-state assumption).
  const origin = mapDiamondTypeToStoneOrigin(piece.diamond_type);
  if (origin == null) return NextResponse.json({ status: "no_origin" });

  const { data: suppliers } = await supabase
    .from("inventory_suppliers").select("id, name").eq("tenant_id", tenantId);
  const supplierId = resolveSupplierIdForOrigin(origin, suppliers ?? []);
  if (!supplierId) {
    return NextResponse.json({ status: "supplier_missing", origin, supplier_name: ORIGIN_SUPPLIER_NAME[origin] });
  }

  // (colour_group, clarity) → confirmed quality string. No mapping = flag, never guess.
  const { data: mapRow } = await supabase
    .from("pricing_melee_quality_map")
    .select("quality")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .ilike("colour_group", colour)
    .ilike("clarity", clar)
    .maybeSingle();
  if (!mapRow) {
    return NextResponse.json({
      status: "unmapped", colour_group: colour, clarity: clar,
      supplier_name: ORIGIN_SUPPLIER_NAME[origin], origin,
    });
  }

  // Exact price-list row: supplier + origin + shape + mapped quality, carat within band.
  const { data: priceRows, error: prErr } = await supabase
    .from("pricing_melee_stones")
    .select("price_per_carat, price_per_stone, size_from, size_to, size_type, shape, quality")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .eq("origin", origin)
    .eq("size_type", "carat_range")
    .ilike("shape", shape)
    .eq("quality", mapRow.quality)
    .lte("size_from", carat)
    .gte("size_to", carat)
    .order("size_from", { ascending: true });
  if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });

  const row = (priceRows ?? [])[0];
  if (!row) {
    return NextResponse.json({
      status: "no_price", shape, quality: mapRow.quality, carat,
      supplier_name: ORIGIN_SUPPLIER_NAME[origin],
    });
  }

  // Per-stone from price_per_carat (the real unit); fall back to legacy per-stone.
  const ppc = row.price_per_carat != null ? Number(row.price_per_carat) : null;
  const pps = row.price_per_stone != null ? Number(row.price_per_stone) : null;
  const perStone = ppc != null ? ppc * carat : pps;
  if (perStone == null) {
    return NextResponse.json({ status: "no_price", shape, quality: mapRow.quality, carat, supplier_name: ORIGIN_SUPPLIER_NAME[origin] });
  }

  return NextResponse.json({
    status:        "ok",
    quantity:      qty,
    carat,
    per_stone:     Math.round(perStone * 100) / 100,
    total:         Math.round(perStone * qty * 100) / 100,
    quality:       mapRow.quality,
    shape,
    supplier_name: ORIGIN_SUPPLIER_NAME[origin],
  });
}
