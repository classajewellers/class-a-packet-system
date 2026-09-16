/**
 * melee-pricing.ts — melee price resolution.
 *
 * Melee pricing is a pure price-fetch by spec: origin + shape + carat + mm +
 * (colour/clarity → quality via the quality map). There is NO supplier concept
 * (removed in migration 121) — the single price list IS the source of truth, and
 * `origin` ('natural' | 'lab') only selects which rows apply.
 */

export type MeleeOrigin = "lab" | "natural";

/**
 * Strict origin resolution for melee pricing. Unlike mapDiamondTypeToStoneOrigin
 * (which defaults ANY unrecognised value to "natural" for the centre-stone
 * calculate_price path), this recognises ONLY the known diamond_type values and
 * FLAGS anything else as "unrecognized" — so a typo like "Natual" surfaces as a
 * data error to fix on the piece, rather than being silently priced as natural.
 * This is deliberate: never guess an origin.
 */
export type MeleeOriginResult =
  | { origin: MeleeOrigin }
  | { origin: null; reason: "none" | "unrecognized" };

const KNOWN_DIAMOND_TYPE: Record<string, MeleeOrigin | "none"> = {
  "natural":   "natural",
  "lab grown": "lab",
  "lab-grown": "lab",
  "lab":       "lab",
  "none":      "none",
};

export function resolveMeleeOrigin(diamondType: string | null | undefined): MeleeOriginResult {
  const raw = (diamondType ?? "").trim();
  if (!raw) return { origin: null, reason: "none" };
  const known = KNOWN_DIAMOND_TYPE[raw.toLowerCase()];
  if (known === "none") return { origin: null, reason: "none" };
  if (known === "lab" || known === "natural") return { origin: known };
  return { origin: null, reason: "unrecognized" };
}

// NOTE: the old origin→supplier resolution (ORIGIN_SUPPLIER_NAME /
// resolveSupplierIdForOrigin) was removed in migration 121 — melee pricing no
// longer has a supplier concept. Origin only selects which price rows apply.

// ─────────────────────────────────────────────────────────────────────────────
// Carat → mm (round brilliant) — DISPLAY LABEL ONLY.
// Vault had no existing carat/mm helper (searched lib/ app/ components/), so this
// is a new util. Industry quick-conversion: a 1.00ct round brilliant ≈ 6.5mm, and
// weight scales with diameter³, so diameter ≈ 6.5 · ∛carat. This is a readability
// label only — carat is what drives the pricing_melee_stones lookup; mm is NEVER
// used in the query. e.g. 0.02ct → "1.8mm".
// ─────────────────────────────────────────────────────────────────────────────
export function caratToMmRoundBrilliant(carat: number): number {
  if (!Number.isFinite(carat) || carat <= 0) return 0;
  return Math.round(6.5 * Math.cbrt(carat) * 10) / 10; // one decimal
}

/** "0.02ct (1.8mm)" — the label shown next to a melee carat size. */
export function caratWithMmLabel(carat: number): string {
  if (!Number.isFinite(carat) || carat <= 0) return "";
  const mm = caratToMmRoundBrilliant(carat);
  return `${carat}ct (${mm}mm)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// priceMelee — the single melee pricing lookup, shared by the per-piece endpoint
// and the quote-builder endpoint. Pure parameter logic (no piece/quote coupling):
// origin → supplier → (colour_group, clarity) quality-map → pricing_melee_stones
// (carat within band) → per_stone = price_per_carat · carat.
//
// Origin-level resolution (diamond_type → origin, "no_origin"/"origin_unrecognized")
// stays in the CALLER — this function takes an already-resolved MeleeOrigin. It
// returns the same discriminated statuses the piece endpoint returned before:
//   ok | incomplete | supplier_missing | unmapped | no_price | error
// Carat-range sizing only (size_type='carat_range'); mm/pieces modes out of scope.
// ─────────────────────────────────────────────────────────────────────────────
/** Canonical form of an mm dimension so import + lookup match exactly:
 *  "2.50x2.50" / "2.50 X 2.50" → "2.50 x 2.50"; "0.90 " → "0.90". */
export function normalizeMm(mm: string | null | undefined): string {
  return (mm ?? "").trim().replace(/\s*[xX]\s*/g, " x ").replace(/\s+/g, " ");
}

export interface PriceMeleeParams {
  tenantId:    string;
  origin:      MeleeOrigin;
  shape:       string;
  colourGroup: string;
  clarity:     string;
  carat:       number;
  mm:          string | null; // mm variant (exact match) — "0.90" or "2.50 x 2.50"
  qty:         number;
}

export type PriceMeleeResult =
  | { status: "ok"; quantity: number; carat: number; mm: string; per_stone: number; total: number;
      quality: string; shape: string; origin: MeleeOrigin }
  | { status: "incomplete"; missing: { carat: boolean; mm: boolean; colour_group: boolean; clarity: boolean; shape: boolean } }
  | { status: "unmapped"; colour_group: string; clarity: string; origin: MeleeOrigin }
  | { status: "no_price"; shape: string; quality: string; carat: number; mm: string }
  | { status: "error"; message: string };

/**
 * @param supabase a service-role Supabase client (bypasses RLS); the caller
 *                 supplies it so this stays decoupled from client construction.
 */
export async function priceMelee(
  supabase: {
    from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  },
  params: PriceMeleeParams
): Promise<PriceMeleeResult> {
  const { tenantId, origin } = params;
  const qty    = Number(params.qty) || 0;
  const carat  = params.carat != null ? Number(params.carat) : NaN;
  const mm     = normalizeMm(params.mm);
  const colour = (params.colourGroup ?? "").trim();
  const clar   = (params.clarity ?? "").trim();
  const shape  = (params.shape ?? "").trim();

  if (!qty || qty <= 0) {
    return { status: "incomplete", missing: { carat: true, mm: true, colour_group: true, clarity: true, shape: true } };
  }
  // mm is required — pricing is mm-precise now (0.01ct differs by mm).
  if (!Number.isFinite(carat) || carat <= 0 || !mm || !colour || !clar || !shape) {
    return { status: "incomplete", missing: {
      carat: !Number.isFinite(carat) || carat <= 0, mm: !mm,
      colour_group: !colour, clarity: !clar, shape: !shape,
    }};
  }

  // (colour_group, clarity) → confirmed quality. No supplier concept. No mapping = flag.
  const { data: mapRow } = await supabase
    .from("pricing_melee_quality_map")
    .select("quality")
    .eq("tenant_id", tenantId)
    .ilike("colour_group", colour)
    .ilike("clarity", clar)
    .maybeSingle();
  if (!mapRow) {
    return { status: "unmapped", colour_group: colour, clarity: clar, origin };
  }

  // Exact price-list row: origin + shape + mapped quality, carat in band AND exact mm.
  const { data: priceRows, error: prErr } = await supabase
    .from("pricing_melee_stones")
    .select("price_per_carat, price_per_stone, size_from, size_to, size_type, shape, quality, mm")
    .eq("tenant_id", tenantId)
    .eq("origin", origin)
    .eq("size_type", "carat_range")
    .ilike("shape", shape)
    .eq("quality", mapRow.quality)
    .eq("mm", mm)
    .lte("size_from", carat)
    .gte("size_to", carat)
    .order("size_from", { ascending: true });
  if (prErr) return { status: "error", message: prErr.message };

  const row = (priceRows ?? [])[0];
  if (!row) {
    return { status: "no_price", shape, quality: mapRow.quality, carat, mm };
  }

  // Prefer the real per-stone price (now imported, not 0); fall back to per_carat × carat.
  const pps = row.price_per_stone != null && Number(row.price_per_stone) > 0 ? Number(row.price_per_stone) : null;
  const ppc = row.price_per_carat != null ? Number(row.price_per_carat) : null;
  const perStone = pps != null ? pps : (ppc != null ? ppc * carat : null);
  if (perStone == null) {
    return { status: "no_price", shape, quality: mapRow.quality, carat, mm };
  }

  return {
    status:     "ok",
    quantity:   qty,
    carat,
    mm,
    per_stone:  Math.round(perStone * 100) / 100,
    total:      Math.round(perStone * qty * 100) / 100,
    quality:    mapRow.quality,
    shape,
    origin,
  };
}
