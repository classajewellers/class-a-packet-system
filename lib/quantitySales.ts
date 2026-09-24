import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { ReorderDraftResult, ReorderSnapshot } from "@/lib/reorderTypes";

type SaleSource = "manual" | "shopify";

export async function loadReorderSnapshot(
  supabase: SupabaseClient,
  tenantId: string,
  variantId: string,
): Promise<{ snapshot: ReorderSnapshot | null; error: string | null }> {
  const { data, error } = await supabase.rpc("variant_reorder_snapshot", {
    p_tenant: tenantId,
    p_variant: variantId,
  });
  if (error) return { snapshot: null, error: error.message };
  return { snapshot: (data ?? null) as ReorderSnapshot | null, error: null };
}

export async function maybeCreateReorderDraft(
  supabase: SupabaseClient,
  tenantId: string,
  variantId: string,
): Promise<ReorderDraftResult | null> {
  const { data, error } = await supabase.rpc("maybe_create_reorder_draft_po", {
    p_tenant: tenantId,
    p_variant: variantId,
  });
  if (error) throw new Error(error.message);
  return (data ?? null) as ReorderDraftResult | null;
}

export async function sellQuantityStock(
  supabase: SupabaseClient,
  args: {
    tenantId: string;
    variantId: string;
    locationId: string | null;
    quantity: number;
    source: SaleSource;
    externalId?: string | null;
    packetId?: string | null;
    strict: boolean;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc("sell_quantity_stock", {
    p_tenant: args.tenantId,
    p_variant: args.variantId,
    p_location: args.locationId,
    p_qty: args.quantity,
    p_source: args.source,
    p_external_id: args.externalId ?? null,
    p_packet_id: args.packetId ?? null,
    p_strict: args.strict,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

interface ShopifySaleLine {
  shopifyVariantId: string;
  quantity: number;
  lineKey: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function lineItemsOf(raw: Record<string, unknown>): unknown[] {
  const rawItems = raw.line_items ?? raw.lineItems;
  if (Array.isArray(rawItems)) return rawItems;
  if (typeof rawItems === "string") {
    try {
      const parsed = JSON.parse(rawItems);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Zapier sometimes sends an unstructured text blob with no variant id.
    }
  }
  return [];
}

function shopifySaleLines(raw: Record<string, unknown>): ShopifySaleLine[] {
  const lines: ShopifySaleLine[] = [];
  lineItemsOf(raw).forEach((item, index) => {
    const row = asRecord(item);
    if (!row) return;
    const variantRaw = row.variant_id ?? row.variantId;
    if (variantRaw == null || String(variantRaw).trim() === "") return;
    const qty = Number(row.quantity ?? row.qty);
    if (!Number.isInteger(qty) || qty <= 0) return;
    const lineRaw = row.id ?? row.line_item_id ?? index;
    lines.push({
      shopifyVariantId: String(variantRaw).trim(),
      quantity: qty,
      lineKey: String(lineRaw),
    });
  });
  return lines;
}

/**
 * Record quantity sales for Shopify line items whose variant id is linked on
 * a quantity-tracked variant. Unlinked lines are skipped. Safe to call again
 * for the same order: external_id makes the ledger insert a no-op.
 * Failures are logged and swallowed so a packet is still saved.
 */
export async function captureShopifyQuantitySales(
  tenantId: string,
  rawBody: Record<string, unknown>,
  packetId: string | null,
): Promise<void> {
  try {
    const lines = shopifySaleLines(rawBody);
    if (lines.length === 0) {
      console.log("[shopify/webhook] quantity sales — no line items with a variant id");
      return;
    }

    const supabase = createServerSupabaseClient();
    const ids = Array.from(new Set(lines.map((l) => l.shopifyVariantId)));
    const { data: variants, error: lookupErr } = await supabase
      .from("inventory_product_variants")
      .select("id, shopify_variant_id")
      .eq("tenant_id", tenantId)
      .eq("tracking_mode", "quantity")
      .in("shopify_variant_id", ids);
    if (lookupErr) throw new Error(lookupErr.message);

    const byShopifyId = new Map<string, string[]>();
    for (const variant of variants ?? []) {
      const key = String(variant.shopify_variant_id ?? "");
      const list = byShopifyId.get(key) ?? [];
      list.push(variant.id as string);
      byShopifyId.set(key, list);
    }

    const orderKey = String(rawBody.id ?? rawBody.orderNumber ?? rawBody.name ?? packetId ?? "order").trim();
    const touched = new Set<string>();
    let recorded = 0;
    let unlinked = 0;
    let ambiguous = 0;

    for (const line of lines) {
      const matches = byShopifyId.get(line.shopifyVariantId) ?? [];
      if (matches.length === 0) {
        unlinked += 1;
        continue;
      }
      if (matches.length > 1) {
        ambiguous += 1;
        console.warn(
          `[shopify/webhook] shopify variant ${line.shopifyVariantId} matches ${matches.length} quantity variants — skipped`,
        );
        continue;
      }
      const variantId = matches[0];

      const { data: levels } = await supabase
        .from("inventory_stock_levels")
        .select("location_id, quantity")
        .eq("tenant_id", tenantId)
        .eq("variant_id", variantId)
        .order("quantity", { ascending: false })
        .limit(1);
      const locationId = (levels?.[0]?.location_id as string | undefined) ?? null;

      await sellQuantityStock(supabase, {
        tenantId,
        variantId,
        locationId,
        quantity: line.quantity,
        source: "shopify",
        externalId: `${orderKey}:${line.lineKey}`,
        packetId,
        strict: false,
      });
      touched.add(variantId);
      recorded += 1;
    }

    for (const variantId of Array.from(touched)) {
      try {
        const draft = await maybeCreateReorderDraft(supabase, tenantId, variantId);
        if (draft?.purchase_order_id) {
          console.log(
            `[shopify/webhook] reorder draft ${draft.po_number} for variant ${variantId} qty ${draft.quantity}`,
          );
        }
      } catch (err) {
        console.error(
          "[shopify/webhook] reorder draft failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    console.log(
      `[shopify/webhook] quantity sales — recorded ${recorded}, unlinked ${unlinked}, ambiguous ${ambiguous}`,
    );
  } catch (err) {
    console.error(
      "[shopify/webhook] quantity sale capture failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
