import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// GET /api/inventory/stock?variant_id=… — grid data for a quantity-tracked variant:
// its tracking_mode, per-location on-hand levels, and the tenant's locations.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const variantId = new URL(req.url).searchParams.get("variant_id");
  if (!variantId) return NextResponse.json({ error: "variant_id is required" }, { status: 400 });

  const supabase = createServerSupabaseClient();

  const { data: variant, error: vErr } = await supabase
    .from("inventory_product_variants")
    .select("id, name, tracking_mode, metal_karat, metal_colour, design_id")
    .eq("tenant_id", tenantId)
    .eq("id", variantId)
    .single();
  if (vErr || !variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });

  const { data: locations, error: lErr } = await supabase
    .from("inventory_locations")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

  const { data: levels, error: sErr } = await supabase
    .from("inventory_stock_levels")
    .select("location_id, quantity, updated_at")
    .eq("tenant_id", tenantId)
    .eq("variant_id", variantId);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  const locName = new Map((locations ?? []).map(l => [l.id, l.name]));
  const rows = (levels ?? []).map(l => ({
    location_id:   l.location_id,
    location_name: locName.get(l.location_id) ?? "(unknown location)",
    quantity:      Number(l.quantity),
    updated_at:    l.updated_at,
  }));
  const totalOnHand = rows.reduce((sum, r) => sum + r.quantity, 0);

  return NextResponse.json({
    variant: {
      id:            variant.id,
      name:          variant.name,
      tracking_mode: variant.tracking_mode,
      metal_karat:   variant.metal_karat,
      metal_colour:  variant.metal_colour,
    },
    locations:     locations ?? [],
    levels:        rows,
    total_on_hand: totalOnHand,
  });
}
