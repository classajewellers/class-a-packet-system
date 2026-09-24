import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { loadReorderSnapshot, maybeCreateReorderDraft } from "@/lib/quantitySales";

export const dynamic = "force-dynamic";

function parseOptionalNonNegInt(
  value: unknown,
  field: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) {
    return { ok: false, error: `${field} must be a whole number of 0 or more, or empty` };
  }
  return { ok: true, value: n };
}

// PATCH /api/inventory/stock/reorder — manual setup for a quantity variant.
// reorder_point here is the temporary manual threshold used while sales
// history is still under 90 days. Par level is always manual.
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  const body = await req.json();
  const variantId = String(body?.variant_id ?? "");
  if (!variantId) return NextResponse.json({ error: "variant_id is required" }, { status: 400 });

  const par = parseOptionalNonNegInt(body?.par_level, "Par level");
  if (!par.ok) return NextResponse.json({ error: par.error }, { status: 400 });
  const manual = parseOptionalNonNegInt(body?.reorder_point, "Reorder point");
  if (!manual.ok) return NextResponse.json({ error: manual.error }, { status: 400 });

  if (body && typeof body === "object" && "reorder_point_mode" in body) {
    return NextResponse.json(
      { error: "Reorder point mode is set by Vault from sales history" },
      { status: 400 },
    );
  }

  const supplierRaw = body?.supplier_id;
  const supplierId =
    supplierRaw == null || String(supplierRaw).trim() === "" ? null : String(supplierRaw).trim();
  const shopifyRaw = body?.shopify_variant_id;
  const shopifyVariantId =
    shopifyRaw == null || String(shopifyRaw).trim() === "" ? null : String(shopifyRaw).trim();

  const supabase = createServerSupabaseClient();

  const { data: variant, error: vErr } = await supabase
    .from("inventory_product_variants")
    .select("id, tracking_mode")
    .eq("tenant_id", tenantId)
    .eq("id", variantId)
    .single();
  if (vErr || !variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  if (variant.tracking_mode !== "quantity") {
    return NextResponse.json({ error: "Reorder setup applies to quantity-tracked variants" }, { status: 400 });
  }

  if (supplierId) {
    const { data: supplier, error: sErr } = await supabase
      .from("inventory_suppliers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", supplierId)
      .maybeSingle();
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    if (!supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 400 });
  }

  const { error } = await supabase
    .from("inventory_product_variants")
    .update({
      supplier_id: supplierId,
      par_level: par.value,
      reorder_point: manual.value,
      shopify_variant_id: shopifyVariantId,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", variantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { snapshot, error: snapErr } = await loadReorderSnapshot(supabase, tenantId, variantId);

  let draft = null;
  try {
    draft = await maybeCreateReorderDraft(supabase, tenantId, variantId);
  } catch (err) {
    console.error("[inventory/stock/reorder] reorder draft failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    ok: true,
    reorder: snapshot,
    reorder_error: snapErr,
    draft_purchase_order: draft,
  });
}
