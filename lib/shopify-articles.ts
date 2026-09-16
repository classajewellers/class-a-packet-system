// Shopify order → packet "articles" text builder.
//
// Single source of truth shared by the live webhook (app/api/shopify/webhook)
// and the complimentary-item backfill (app/api/admin/backfill-complimentary).
// Keeping both on the same functions guarantees a re-processed order produces
// byte-identical output to a freshly-received one.
//
// Handles BOTH payload shapes Vault receives:
//   • native Shopify webhook  → buildArticles(order.line_items)
//   • legacy Zapier flat blob → parseLineItems(body.lineItems)
//
// ── Complimentary / free-gift items ────────────────────────────────────────────
// Complimentary items (e.g. heirloom scarves given with an order) arrive as $0
// line items, often titled "Free gift …" by Shopify's gift-with-purchase app.
// These USED to be dropped by two filters — a "free gift" title skip and a
// $0-with-no-meaningful-attributes skip — so staff never saw them and didn't
// know to include them when posting. They are now KEPT and flagged
// " — COMPLIMENTARY" so they can't be missed or mistaken for a paid item.
//
// A $0 line that DOES carry meaningful attributes is a configured add-on
// component (e.g. "Pendant 1" on a personalised necklace), not a gift — it is
// kept exactly as before, unflagged.
//
// The `legacy` option reproduces the OLD drop behaviour verbatim. The backfill
// uses it to tell an untouched import (stored text == legacy output → safe to
// upgrade) from a hand-edited packet (stored text != legacy output → leave it
// alone), so no staff edits are ever clobbered.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const COMPLIMENTARY_SUFFIX = " — COMPLIMENTARY";

export interface ShopifyProperty {
  name: string;
  value: string;
}

export interface ShopifyLineItem {
  title: string;
  variant_title?: string | null;
  quantity: number;
  price: string;
  properties?: ShopifyProperty[];
}

export interface BuildArticlesOptions {
  /** When true, reproduce the pre-fix behaviour (drop free-gift + $0-no-attrs
   *  items, no COMPLIMENTARY flag). Used only by the backfill's safety guard. */
  legacy?: boolean;
}

// Keys whose presence marks a line item's property as a meaningful spec worth
// showing (metal, stone, size, engraving, pendant/charm config, …).
export const meaningfulKeys = [
  "metal", "carat", "carat", "gold", "colour", "color",
  "stone", "gem", "diamond", "sapphire", "ruby", "emerald",
  "size", "ring size", "engraving", "personalisation", "personalization",
  "chain", "initial", "birthstone",
  // Pendants — numbered and un-numbered
  "pendant", "pendant 1", "pendant 2", "pendant 3", "pendant 4", "pendant 5", "pendant 6",
  // Charms — PCN products often use "Charm 1/2/3" not "Pendant 1/2/3"
  "charm", "charm 1", "charm 2", "charm 3", "charm 4", "charm 5", "charm 6",
  "number", "font", "text", "message", "name",
  "finish", "width", "length", "weight", "alloy",
  // Metal/material specifics
  "material", "plating", "rhodium", "silver", "platinum",
  "confirmation", "style", "design",
  // Explicit compound keys often used on PCN/necklace products
  "carat weight", "metal colour", "metal color", "gold colour", "gold color",
  "metal type", "gold type", "chain type", "chain metal", "chain colour",
  // Abbreviations
  "ct", "kt",
];

/** True when a raw webhook body is the native Shopify shape (vs the Zapier flat
 *  blob). Mirrors the detection used at receive time so the backfill routes a
 *  stored packet_data payload through the same parser it was built with. */
export function isNativeShopifyFormat(body: Record<string, unknown>): boolean {
  return (
    body.line_items !== undefined ||
    !!(body.id && body.name && body.shipping_address)
  );
}

function isDefaultVariantTitle(variantRaw: string): boolean {
  const v = variantRaw.toLowerCase();
  return !variantRaw || v === "default title" || v === "none" || v === "null";
}

// ── Native Shopify line items ──────────────────────────────────────────────────
export function buildArticles(
  lineItems: ShopifyLineItem[],
  opts: BuildArticlesOptions = {}
): string {
  const legacy = opts.legacy === true;
  const results: string[] = [];

  for (const item of lineItems) {
    const name = item.title?.trim() || "";
    if (!name) continue;

    const isFreeGiftTitle = name.toLowerCase().includes("free gift");
    if (legacy && isFreeGiftTitle) continue;

    const price = parseFloat(item.price || "0");
    const qty   = item.quantity || 1;

    const variantRaw = item.variant_title?.trim() ?? "";
    const variantAlreadyInName = name.toLowerCase().includes(variantRaw.toLowerCase());
    const shouldAppendVariant  = !isDefaultVariantTitle(variantRaw) && !variantAlreadyInName;
    const displayName = shouldAppendVariant ? `${name} - ${variantRaw}` : name;

    // Attribute parsing runs BEFORE the price=0 handling so $0 add-on line items
    // (e.g. "Pendant 1") are retained when they carry meaningful attributes.
    const props = item.properties ?? [];
    const attrs = props
      .filter((p) => {
        const key = p.name?.toLowerCase().trim() ?? "";
        const val = p.value?.trim() ?? "";
        if (!val) return false;
        if (key.startsWith("_") || key.startsWith("cl_")) return false;
        return meaningfulKeys.some((k) => key.includes(k));
      })
      .map((p) => `  ${p.name}: ${p.value.trim()}`)
      .join("\n");

    const isComplimentary = isFreeGiftTitle || (price === 0 && !attrs);

    if (legacy) {
      // Old behaviour: drop $0 items with no meaningful attributes entirely.
      if (price === 0 && !attrs) continue;
      results.push(`${qty}x ${displayName}${attrs ? "\n" + attrs : ""}`);
      continue;
    }

    const displayNameFlagged = isComplimentary ? `${displayName}${COMPLIMENTARY_SUFFIX}` : displayName;
    results.push(`${qty}x ${displayNameFlagged}${attrs ? "\n" + attrs : ""}`);
  }

  return results.join("\n");
}

// ── Zapier flat text blob ───────────────────────────────────────────────────────
export function parseLineItems(raw: any, opts: BuildArticlesOptions = {}): string {
  if (!raw || typeof raw !== "string") return "";
  const legacy = opts.legacy === true;

  const blocks = raw.split(/\n\n+/);
  const results: string[] = [];

  for (const block of blocks) {
    const nameMatch = block.match(/^name:\s*(.+)$/m);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    const isFreeGiftTitle = name.toLowerCase().includes("free gift");
    if (legacy && isFreeGiftTitle) continue;

    const variantMatch = block.match(/^variantTitle:\s*(.+)$/m);
    const variantRaw   = variantMatch?.[1]?.trim() ?? "";
    const variantAlreadyInName = name.toLowerCase().includes(variantRaw.toLowerCase());
    const shouldAppendVariant  = !isDefaultVariantTitle(variantRaw) && !variantAlreadyInName;
    const displayName = shouldAppendVariant ? `${name} - ${variantRaw}` : name;

    const priceMatch = block.match(/discountedTotalSet:.*?'amount':\s*'([\d.]+)'/);
    const price = parseFloat(priceMatch?.[1] || "0");

    const qtyMatch = block.match(/^quantity:\s*(\d+)$/m);
    const qty = qtyMatch?.[1] || "1";

    const attrMatches: RegExpExecArray[] = [];
    const attrRe = /'key':\s*'([^']*)',\s*'value':\s*'([^']*)'/g;
    let attrM: RegExpExecArray | null;
    while ((attrM = attrRe.exec(block)) !== null) attrMatches.push(attrM);

    // Attribute parsing runs BEFORE the price=0 handling so pendant add-on line
    // items (Pendant 1 as a $0 add-on) are retained.
    const attrs = attrMatches
      .filter((m) => {
        const key = m[1].toLowerCase().trim();
        const val = m[2].trim();
        if (!val) return false;
        if (key.startsWith("_") || key.startsWith("cl_")) return false;
        return meaningfulKeys.some((k) => key.includes(k.toLowerCase()));
      })
      .map((m) => `  ${m[1]}: ${m[2].trim()}`)
      .join("\n");

    const isComplimentary = isFreeGiftTitle || (price === 0 && !attrs);

    if (legacy) {
      if (price === 0 && !attrs) continue;
      results.push(`${qty}x ${displayName}${attrs ? "\n" + attrs : ""}`);
      continue;
    }

    const displayNameFlagged = isComplimentary ? `${displayName}${COMPLIMENTARY_SUFFIX}` : displayName;
    results.push(`${qty}x ${displayNameFlagged}${attrs ? "\n" + attrs : ""}`);
  }

  return results.join("\n");
}
