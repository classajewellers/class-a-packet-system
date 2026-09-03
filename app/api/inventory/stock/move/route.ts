import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// POST /api/inventory/stock/move — move quantity between two locations for a
// variant. Runs the move_stock() function so the decrement + increment are
// atomic and the source cannot be over-drawn.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const body = await req.json();
  const variantId    = String(body?.variant_id ?? "");
  const fromLocation = String(body?.from_location_id ?? "");
  const toLocation   = String(body?.to_location_id ?? "");
  const quantity     = Number(body?.quantity);

  if (!variantId || !fromLocation || !toLocation) {
    return NextResponse.json({ error: "variant_id, from_location_id and to_location_id are required" }, { status: 400 });
  }
  if (fromLocation === toLocation) {
    return NextResponse.json({ error: "Source and destination locations must differ" }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
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

  // move_stock raises on insufficient stock / same-location — surface as 400.
  const { error } = await supabase.rpc("move_stock", {
    p_tenant:        tenantId,
    p_variant:       variantId,
    p_from_location: fromLocation,
    p_to_location:   toLocation,
    p_qty:           quantity,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
