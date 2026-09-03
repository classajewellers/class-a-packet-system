import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// POST /api/inventory/stock/set — set the absolute on-hand quantity for a
// (variant, location). This is a stock-take correction; it does NOT create a
// cost layer. Cost-bearing stock-in goes through /receive instead.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const body = await req.json();
  const variantId  = String(body?.variant_id ?? "");
  const locationId = String(body?.location_id ?? "");
  const quantity   = Number(body?.quantity);

  if (!variantId || !locationId) {
    return NextResponse.json({ error: "variant_id and location_id are required" }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    return NextResponse.json({ error: "quantity must be a non-negative integer" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: variant, error: vErr } = await supabase
    .from("inventory_product_variants")
    .select("id, tracking_mode")
    .eq("tenant_id", tenantId)
    .eq("id", variantId)
    .single();
  if (vErr || !variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  if (variant.tracking_mode !== "quantity") {
    return NextResponse.json({ error: "Variant is not quantity-tracked" }, { status: 400 });
  }

  const { error } = await supabase
    .from("inventory_stock_levels")
    .upsert(
      { tenant_id: tenantId, variant_id: variantId, location_id: locationId, quantity, updated_at: new Date().toISOString() },
      { onConflict: "variant_id,location_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
