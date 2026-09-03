import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// PATCH /api/inventory/stock/tracking-mode — set a variant's tracking mode.
// This is a deliberate human choice; it is never inferred elsewhere.
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const body = await req.json();
  const variantId    = String(body?.variant_id ?? "");
  const trackingMode = String(body?.tracking_mode ?? "");

  if (!variantId) return NextResponse.json({ error: "variant_id is required" }, { status: 400 });
  if (trackingMode !== "serialized" && trackingMode !== "quantity") {
    return NextResponse.json({ error: "tracking_mode must be 'serialized' or 'quantity'" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: updated, error } = await supabase
    .from("inventory_product_variants")
    .update({ tracking_mode: trackingMode, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", variantId)
    .select("id, tracking_mode")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Variant not found" }, { status: error ? 500 : 404 });
  }

  return NextResponse.json({ ok: true, tracking_mode: updated.tracking_mode });
}
