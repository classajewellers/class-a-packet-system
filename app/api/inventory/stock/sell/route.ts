import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { maybeCreateReorderDraft, sellQuantityStock } from "@/lib/quantitySales";

export const dynamic = "force-dynamic";

// POST /api/inventory/stock/sell — record a quantity-variant sale from today.
// Writes inventory_variant_sales and decrements on-hand at the location.
// Does not accept a past sold_at (the SQL function stamps now()).
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const body = await req.json();
  const variantId  = String(body?.variant_id ?? "");
  const locationId = String(body?.location_id ?? "");
  const quantity   = Number(body?.quantity);
  const notes = body?.notes == null || String(body.notes).trim() === "" ? null : String(body.notes).trim();

  if (!variantId || !locationId) {
    return NextResponse.json({ error: "variant_id and location_id are required" }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  let saleId: string;
  try {
    saleId = await sellQuantityStock(supabase, {
      tenantId,
      variantId,
      locationId,
      quantity,
      source: "app",
      notes,
      strict: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sale failed";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  let draft = null;
  try {
    draft = await maybeCreateReorderDraft(supabase, tenantId, variantId);
  } catch (err) {
    console.error("[inventory/stock/sell] reorder draft failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true, sale_id: saleId, draft_purchase_order: draft });
}
