/**
 * melee-pricing.ts — melee price resolution.
 *
 * Melee pricing is a pure price-fetch by spec: origin + shape + carat + mm +
 * quality — quality is selected DIRECTLY (as it exists verbatim in
 * pricing_melee_stones, e.g. "EF VVS", "Fancy Yellow SI1-SI2+"), not resolved
 * from separate colour/clarity via a map (migration 122 retired that path —
 * pricing_melee_quality_map is left in place, unused, same treatment as
 * supplier_id). There is NO supplier concept (removed in migration 121) — the
 * single price list IS the source of truth, and `origin` ('natural' | 'lab')
 * only selects which rows apply.
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
// origin + shape + quality + carat (in band) + exact mm → pricing_melee_stones row
// → per_stone = real price_per_stone, or price_per_carat · carat as fallback.
//
// Origin-level resolution (diamond_type → origin, "no_origin"/"origin_unrecognized")
// stays in the CALLER — this function takes an already-resolved MeleeOrigin.
// Returns a discriminated status: ok | incomplete | no_price | error.
// Carat-range sizing only (size_type='carat_range'); mm/pieces modes out of scope.
// ─────────────────────────────────────────────────────────────────────────────
/** Format one numeric mm side to a fixed 2 decimals ("0.9" / "0.90" → "0.90");
 *  non-numeric input is returned trimmed, unchanged (defensive, never throws). */
function formatMmNumber(s: string): string {
  const n = Number(s.trim());
  return Number.isFinite(n) ? n.toFixed(2) : s.trim();
}

/** Canonical form of an mm dimension so import + lookup ALWAYS match exactly,
 *  regardless of how a source (xltx text cell vs CSV numeric export vs staff
 *  typing on a piece) formatted it: "0.9" / "0.90" both → "0.90";
 *  "2.5x2.5" / "2.50 X 2.50" both → "2.50 x 2.50". mm is an exact-match text
 *  key, so this canonicalization is load-bearing — without it, the same
 *  physical stone imported once as "0.9" and once as "0.90" would silently
 *  fail to match. */
export function normalizeMm(mm: string | null | undefined): string {
  const trimmed = (mm ?? "").trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s*[xX]\s*/);
  if (parts.length === 2) return `${formatMmNumber(parts[0])} x ${formatMmNumber(parts[1])}`;
  return formatMmNumber(trimmed);
}

/**
 * Resolve the effective quality for a piece: prefer melee_quality (the direct
 * field going forward); fall back to composing the LEGACY melee_colour_group +
 * melee_clarity fields for pieces saved before migration 122. This is not a
 * guess — it reverses the exact, well-established "<colour> <clarity>" join
 * this app has always used to build a quality string, so it reproduces the
 * same value the old quality-map flow would have resolved to.
 */
export function resolvePieceMeleeQuality(
  meleeQuality: string | null | undefined,
  legacyColourGroup: string | null | undefined,
  legacyClarity: string | null | undefined
): string {
  const direct = (meleeQuality ?? "").trim();
  if (direct) return direct;
  const colour = (legacyColourGroup ?? "").trim();
  const clarity = (legacyClarity ?? "").trim();
  if (colour && clarity) return `${colour} ${clarity}`;
  return "";
}

export interface PriceMeleeParams {
  tenantId: string;
  origin:   MeleeOrigin;
  shape:    string;
  quality:  string; // selected directly, verbatim as it exists in pricing_melee_stones
  carat:    number;
  mm:       string | null; // mm variant (exact match) — "0.90" or "2.50 x 2.50"
  qty:      number;
}

export type PriceMeleeResult =
  | { status: "ok"; quantity: number; carat: number; mm: string; per_stone: number; total: number;
      quality: string; shape: string; origin: MeleeOrigin }
  | { status: "incomplete"; missing: { carat: boolean; mm: boolean; quality: boolean; shape: boolean } }
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
  const qty     = Number(params.qty) || 0;
  const carat   = params.carat != null ? Number(params.carat) : NaN;
  const mm      = normalizeMm(params.mm);
  const quality = (params.quality ?? "").trim();
  const shape   = (params.shape ?? "").trim();

  if (!qty || qty <= 0) {
    return { status: "incomplete", missing: { carat: true, mm: true, quality: true, shape: true } };
  }
  // mm is required — pricing is mm-precise (0.01ct differs by mm).
  if (!Number.isFinite(carat) || carat <= 0 || !mm || !quality || !shape) {
    return { status: "incomplete", missing: {
      carat: !Number.isFinite(carat) || carat <= 0, mm: !mm, quality: !quality, shape: !shape,
    }};
  }

  // Exact price-list row: origin + shape + quality (selected directly, no map),
  // carat in band AND exact mm.
  const { data: priceRows, error: prErr } = await supabase
    .from("pricing_melee_stones")
    .select("price_per_carat, price_per_stone, size_from, size_to, size_type, shape, quality, mm")
    .eq("tenant_id", tenantId)
    .eq("origin", origin)
    .eq("size_type", "carat_range")
    .ilike("shape", shape)
    .ilike("quality", quality)
    .eq("mm", mm)
    .lte("size_from", carat)
    .gte("size_to", carat)
    .order("size_from", { ascending: true });
  if (prErr) return { status: "error", message: prErr.message };

  const row = (priceRows ?? [])[0];
  if (!row) {
    return { status: "no_price", shape, quality, carat, mm };
  }

  // Prefer the real per-stone price (now imported, not 0); fall back to per_carat × carat.
  const pps = row.price_per_stone != null && Number(row.price_per_stone) > 0 ? Number(row.price_per_stone) : null;
  const ppc = row.price_per_carat != null ? Number(row.price_per_carat) : null;
  const perStone = pps != null ? pps : (ppc != null ? ppc * carat : null);
  if (perStone == null) {
    return { status: "no_price", shape, quality, carat, mm };
  }

  return {
    status:     "ok",
    quantity:   qty,
    carat,
    mm,
    per_stone:  Math.round(perStone * 100) / 100,
    total:      Math.round(perStone * qty * 100) / 100,
    quality:    row.quality, // stored value (canonical casing) rather than the caller's input
    shape,
    origin,
  };
}
