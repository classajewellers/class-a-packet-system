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
//
// ── Gemstone shape ─────────────────────────────────────────────────────────────
// Shopify variant_title is only the option VALUES joined with " / "
// ("9ct Yellow Gold / Lab Grown Diamond / Blue Topaz"). On Toi et Moi the
// CUT lives in the option NAME ("Pear Gemstone", "Emerald Gemstone"), which
// the REST webhook does not include. Callers that can resolve those names
// (see lib/shopify-option-lookup.ts) pass them as options_with_values.
// Shape line-item properties ("Diamond Shape", "Blue Topaz Shape", …) are
// folded onto the matching stone. `legacy: true` skips all of this so the
// complimentary backfill's byte-comparison stays stable.

/* eslint-disable @typescript-eslint/no-explicit-any */

export const COMPLIMENTARY_SUFFIX = " — COMPLIMENTARY";

export interface ShopifyProperty {
  name: string;
  value: string;
}

/** One product-option or line-item-property name/value pair. */
export interface NamedOption {
  name: string;
  value: string;
}

export interface ShopifyLineItem {
  title: string;
  variant_title?: string | null;
  quantity: number;
  price: string;
  properties?: ShopifyProperty[];
  /** REST webhook. Used to look up option names; not printed on its own. */
  product_id?: number | string | null;
  variant_id?: number | string | null;
  /**
   * Option name + value, when the payload (or a product lookup) has them.
   * REST orders/create does not send these; GraphQL and our lookup do.
   */
  options_with_values?: NamedOption[];
  selected_options?: NamedOption[];
  selectedOptions?: NamedOption[];
  variant_options?: NamedOption[];
  variantOptions?: NamedOption[];
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

// Longer phrases first so "old european" wins over a shorter prefix.
const GEMSTONE_SHAPES: { word: string; label: string }[] = [
  { word: "old european", label: "Old European" },
  { word: "old mine", label: "Old Mine" },
  { word: "half moon", label: "Half Moon" },
  { word: "emerald", label: "Emerald cut" },
  { word: "marquise", label: "Marquise" },
  { word: "princess", label: "Princess" },
  { word: "radiant", label: "Radiant" },
  { word: "cushion", label: "Cushion" },
  { word: "asscher", label: "Asscher" },
  { word: "baguette", label: "Baguette" },
  { word: "trillion", label: "Trillion" },
  { word: "octagon", label: "Octagon" },
  { word: "hexagon", label: "Hexagon" },
  { word: "briolette", label: "Briolette" },
  { word: "crescent", label: "Crescent" },
  { word: "heart", label: "Heart" },
  { word: "oval", label: "Oval" },
  { word: "pear", label: "Pear" },
  { word: "rose", label: "Rose" },
  { word: "kite", label: "Kite" },
  { word: "round", label: "Round" },
];

const SHAPE_WORD_RE = /\bshapes?\b/i;
const METAL_SEGMENT_RE = /\b(gold|platinum|silver|palladium)\b/i;
const SHAPE_STOPWORDS = new Set([
  "gemstone", "gemstones", "stone", "stones", "diamond", "diamonds",
  "grown", "natural", "colour", "color", "gem", "gems", "cut", "cuts",
  "the", "and",
]);

function findShapeWord(text: string): { word: string; label: string } | null {
  const lower = text.toLowerCase();
  for (const shape of GEMSTONE_SHAPES) {
    const re = new RegExp(`\\b${shape.word.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(lower)) return shape;
  }
  return null;
}

/**
 * Shape encoded in an option NAME ("Pear Gemstone", "Round Diamond").
 * Returns null when the name is a "Shape" field — there the VALUE is the shape.
 * "Emerald" is labelled "Emerald cut" so it is not read as the gemstone species.
 */
export function shapeLabelFromOptionName(name: string): string | null {
  if (SHAPE_WORD_RE.test(name)) return null;
  const lower = name.trim().toLowerCase();
  const found = findShapeWord(lower);
  if (!found) return null;
  const exact = lower === found.word;
  const carriesStone = /\b(gemstones?|stones?|diamonds?|gems?|cuts?)\b/i.test(lower);
  if (!exact && !carriesStone) return null;
  return found.label;
}

/** Render one option. Shape-in-the-name becomes "Lab Grown Diamond (Pear)". */
export function formatOptionSegment(name: string, value: string): string {
  const v = value.trim();
  const shape = shapeLabelFromOptionName(name);
  if (shape) {
    if (v.toLowerCase().includes(shape.toLowerCase())) return v;
    return `${v} (${shape})`;
  }
  if (SHAPE_WORD_RE.test(name)) return `${name.trim()}: ${v}`;
  return v;
}

function readOptionArray(raw: unknown): NamedOption[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const pairs: NamedOption[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const rec = entry as Record<string, unknown>;
    const name = String(rec.name ?? rec.key ?? "").trim();
    const value = String(rec.value ?? "").trim();
    if (!name || !value) return null;
    pairs.push({ name, value });
  }
  return pairs;
}

/** Option name/value pairs already present on a line item, if any payload has them. */
export function extractOptionPairs(item: ShopifyLineItem | Record<string, unknown>): NamedOption[] {
  const rec = item as Record<string, unknown>;
  const candidates = [
    rec.options_with_values,
    rec.selected_options,
    rec.selectedOptions,
    rec.variant_options,
    rec.variantOptions,
  ];
  for (const candidate of candidates) {
    const pairs = readOptionArray(candidate);
    if (pairs) return pairs;
  }
  return [];
}

function variantSegments(variantText: string): string[] {
  return variantText.split(/\s+\/\s+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Zip variant_title segments with product options (position order).
 * Equal-length zip keeps duplicate values in place
 * ("Lab Grown Diamond / Lab Grown Diamond" → pear then emerald).
 */
export function pairVariantWithProductOptions(
  variantTitle: string,
  options: { name: string; position?: number; values?: string[] }[],
): NamedOption[] {
  const opts = [...options].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const parts = variantSegments(variantTitle);
  if (!opts.length || !parts.length || isDefaultVariantTitle(variantTitle)) return [];
  if (parts.length === opts.length) {
    return opts.map((o, i) => ({ name: o.name, value: parts[i] }));
  }
  const used = new Array(parts.length).fill(false);
  const pairs: NamedOption[] = [];
  for (const opt of opts) {
    const allowed = new Set((opt.values ?? []).map((v) => v.trim().toLowerCase()));
    let idx = allowed.size
      ? parts.findIndex((p, i) => !used[i] && allowed.has(p.toLowerCase()))
      : -1;
    if (idx === -1) idx = parts.findIndex((_, i) => !used[i]);
    if (idx === -1) break;
    used[idx] = true;
    pairs.push({ name: opt.name, value: parts[idx] });
  }
  return pairs;
}

function shapePropertyTarget(key: string, segments: string[]): number | null {
  if (!SHAPE_WORD_RE.test(key)) return null;
  const residue = key
    .replace(SHAPE_WORD_RE, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const matchResidue = (needle: string): number | null => {
    if (needle.length < 3) return null;
    const hits = segments
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.toLowerCase().includes(needle));
    return hits.length === 1 ? hits[0].i : null;
  };

  const full = matchResidue(residue);
  if (full != null) return full;

  const tokens = residue
    .split(" ")
    .filter((t) => t.length >= 4 && !SHAPE_STOPWORDS.has(t))
    .sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const hit = matchResidue(token);
    if (hit != null) return hit;
  }

  const stoneIndexes = segments
    .map((s, i) => i)
    .filter((i) => !METAL_SEGMENT_RE.test(segments[i]));
  if (!residue && stoneIndexes.length === 1) return stoneIndexes[0];
  return null;
}

/**
 * Attach "Diamond Shape: Pear" / "Blue Topaz Shape: Round" onto the stone
 * segment those words name. Unmatched shape properties stay as their own lines.
 */
export function foldShapeProperties(
  variantText: string,
  props: ShopifyProperty[],
): { variantText: string; props: ShopifyProperty[] } {
  const segments = variantSegments(variantText);
  if (!segments.length) return { variantText, props };
  const next = [...segments];
  const remaining: ShopifyProperty[] = [];
  for (const p of props) {
    const key = p.name?.trim() ?? "";
    const val = p.value?.trim() ?? "";
    if (!key || !val || !SHAPE_WORD_RE.test(key)) {
      remaining.push(p);
      continue;
    }
    const idx = shapePropertyTarget(key, next);
    if (idx == null || /\([^)]+\)/.test(next[idx])) {
      remaining.push(p);
      continue;
    }
    if (next[idx].toLowerCase().includes(val.toLowerCase())) continue;
    next[idx] = `${next[idx]} (${val})`;
  }
  return { variantText: next.join(" / "), props: remaining };
}

/** Split a flat name/value dump into variant options vs leftover properties. */
export function splitNamedPairs(
  variantRaw: string,
  pairs: NamedOption[],
): { options: NamedOption[]; properties: ShopifyProperty[] } {
  if (!optionPairsReplaceVariant(variantRaw, pairs)) {
    return { options: [], properties: pairs };
  }
  const parts = new Set(variantSegments(variantRaw).map((p) => p.toLowerCase()));
  const options: NamedOption[] = [];
  const properties: ShopifyProperty[] = [];
  // Only pairs whose VALUE is a variant segment are options ("Pear Gemstone"
  // = "Lab Grown Diamond"). A shape field whose value is the cut ("Diamond
  // Shape" = "Pear") stays a property so it is folded onto the stone, not
  // used to replace the variant line.
  const variantHasSegments = !!variantRaw && !isDefaultVariantTitle(variantRaw);
  for (const p of pairs) {
    if (variantHasSegments && parts.has(p.value.trim().toLowerCase())) options.push(p);
    else properties.push(p);
  }
  if (!options.length) return { options: [], properties: pairs };
  return { options, properties };
}

function optionPairsReplaceVariant(variantRaw: string, optionPairs: NamedOption[]): boolean {
  if (!optionPairs.length) return false;
  if (!variantRaw || isDefaultVariantTitle(variantRaw)) return true;
  const parts = variantSegments(variantRaw);
  if (optionPairs.length === parts.length) return true;
  const values = new Set(optionPairs.map((p) => p.value.trim().toLowerCase()));
  const covered = parts.every((p) => values.has(p.toLowerCase()));
  return covered && optionPairs.some((p) => !SHAPE_WORD_RE.test(p.name));
}

function resolveVariantAndProps(
  variantRaw: string,
  optionPairs: NamedOption[],
  properties: ShopifyProperty[],
  legacy: boolean,
): { variantText: string; properties: ShopifyProperty[] } {
  if (legacy) return { variantText: variantRaw, properties };
  let variantText = variantRaw;
  if (optionPairsReplaceVariant(variantRaw, optionPairs)) {
    variantText = optionPairs.map((p) => formatOptionSegment(p.name, p.value)).join(" / ");
  }
  if (!variantText) return { variantText, properties };
  const folded = foldShapeProperties(variantText, properties);
  return { variantText: folded.variantText, properties: folded.props };
}

function isShownProperty(key: string, legacy: boolean): boolean {
  if (meaningfulKeys.some((k) => key.includes(k))) return true;
  // "shape" is intentionally NOT in meaningfulKeys: adding it there would
  // change legacy output and break the complimentary backfill's comparison.
  return !legacy && key.includes("shape");
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
    const resolved = resolveVariantAndProps(
      variantRaw,
      extractOptionPairs(item),
      item.properties ?? [],
      legacy,
    );
    const variantText = resolved.variantText;
    const variantAlreadyInName = !!variantText && name.toLowerCase().includes(variantText.toLowerCase());
    const shouldAppendVariant  = !isDefaultVariantTitle(variantText) && !variantAlreadyInName;
    const displayName = shouldAppendVariant ? `${name} - ${variantText}` : name;

    // Attribute parsing runs BEFORE the price=0 handling so $0 add-on line items
    // (e.g. "Pendant 1") are retained when they carry meaningful attributes.
    const props = resolved.properties;
    const attrs = props
      .filter((p) => {
        const key = p.name?.toLowerCase().trim() ?? "";
        const val = p.value?.trim() ?? "";
        if (!val) return false;
        if (key.startsWith("_") || key.startsWith("cl_")) return false;
        return isShownProperty(key, legacy);
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

    const priceMatch = block.match(/discountedTotalSet:.*?'amount':\s*'([\d.]+)'/);
    const price = parseFloat(priceMatch?.[1] || "0");

    const qtyMatch = block.match(/^quantity:\s*(\d+)$/m);
    const qty = qtyMatch?.[1] || "1";

    // Original Zapier/GraphQL dump uses 'key'/'value'. REST-style dumps use
    // 'name'/'value'. Name pairs are only read outside legacy mode so the
    // complimentary backfill's byte-comparison does not change.
    const keyPairs: NamedOption[] = [];
    const keyRe = /'key':\s*'([^']*)',\s*'value':\s*'([^']*)'/g;
    let attrM: RegExpExecArray | null;
    while ((attrM = keyRe.exec(block)) !== null) keyPairs.push({ name: attrM[1], value: attrM[2] });

    let optionPairs: NamedOption[] = [];
    let propertyPairs: ShopifyProperty[] = keyPairs;
    if (!legacy) {
      const extra: NamedOption[] = [];
      const nameRe = /'name':\s*'([^']*)',\s*'value':\s*'([^']*)'/g;
      const jsonRe = /"(?:key|name)":\s*"([^"]*)",\s*"value":\s*"([^"]*)"/g;
      while ((attrM = nameRe.exec(block)) !== null) extra.push({ name: attrM[1], value: attrM[2] });
      while ((attrM = jsonRe.exec(block)) !== null) extra.push({ name: attrM[1], value: attrM[2] });
      const seen = new Set(keyPairs.map((p) => `${p.name}\0${p.value}`));
      const merged = [...keyPairs];
      for (const p of extra) {
        const id = `${p.name}\0${p.value}`;
        if (seen.has(id)) continue;
        seen.add(id);
        merged.push(p);
      }
      const split = splitNamedPairs(variantRaw, merged);
      optionPairs = split.options;
      propertyPairs = split.properties;
    }

    const resolved = resolveVariantAndProps(variantRaw, optionPairs, propertyPairs, legacy);
    const variantText = resolved.variantText;
    const variantAlreadyInName = !!variantText && name.toLowerCase().includes(variantText.toLowerCase());
    const shouldAppendVariant  = !isDefaultVariantTitle(variantText) && !variantAlreadyInName;
    const displayName = shouldAppendVariant ? `${name} - ${variantText}` : name;

    // Attribute parsing runs BEFORE the price=0 handling so pendant add-on line
    // items (Pendant 1 as a $0 add-on) are retained.
    const attrs = resolved.properties
      .filter((p) => {
        const key = p.name.toLowerCase().trim();
        const val = p.value.trim();
        if (!val) return false;
        if (key.startsWith("_") || key.startsWith("cl_")) return false;
        return isShownProperty(key, legacy);
      })
      .map((p) => `  ${p.name}: ${p.value.trim()}`)
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
