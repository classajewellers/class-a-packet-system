import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// POST /api/inventory/stock/receive — standalone receive of quantity-tracked
// stock. Logs a FIFO cost layer (the real unit cost paid now) AND increments
// on-hand, atomically via receive_quantity_stock(). PO integration is a later
// build; here the cost is entered directly at receipt.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  const body = await req.json();
  const variantId  = String(body?.variant_id ?? "");
  const locationId = String(body?.location_id ?? "");
  const quantity   = Number(body?.quantity);
  const unitCost   = Number(body?.unit_cost);

  if (!variantId || !locationId) {
    return NextResponse.json({ error: "variant_id and location_id are required" }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    return NextResponse.json({ error: "unit_cost must be zero or greater" }, { status: 400 });
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

  const { data: receiptId, error } = await supabase.rpc("receive_quantity_stock", {
    p_tenant:      tenantId,
    p_variant:     variantId,
    p_location:    locationId,
    p_qty:         quantity,
    p_unit_cost:   unitCost,
    p_received_by: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, receipt_id: receiptId });
}
