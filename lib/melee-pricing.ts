/**
 * melee-pricing.ts — resolving which supplier's melee price list applies to a
 * piece, based on the stone origin.
 *
 * ⚠️ CURRENT-STATE BUSINESS ASSUMPTION (confirmed 2026-09-03), NOT a general rule:
 *   Class A currently buys melee from exactly ONE supplier per origin —
 *     lab-grown  → "Grown Diamonds"
 *     natural    → "Sapphire Export"
 *   so the supplier can be derived automatically from the piece's origin with no
 *   extra field on the piece. This holds ONLY while there is a single supplier
 *   per origin. If a SECOND supplier is ever added for either origin, this
 *   automatic resolution is no longer valid — it must become an EXPLICIT choice
 *   (a supplier field on the piece's melee, or a user selection at pricing time)
 *   rather than an inferred one. Do not extend this map to cover that case; make
 *   it a real decision instead.
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

export const ORIGIN_SUPPLIER_NAME: Record<MeleeOrigin, string> = {
  lab:     "Grown Diamonds",
  natural: "Sapphire Export",
};

/**
 * Resolve the supplier id for a melee origin from a list of the tenant's
 * suppliers. Case-insensitive exact name match. Returns null if no such
 * supplier exists (caller flags "supplier not found" rather than guessing).
 */
export function resolveSupplierIdForOrigin(
  origin: MeleeOrigin,
  suppliers: { id: string; name: string }[]
): string | null {
  const wanted = ORIGIN_SUPPLIER_NAME[origin].toLowerCase();
  const match = suppliers.find(s => (s.name ?? "").toLowerCase() === wanted);
  return match?.id ?? null;
}

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
export interface PriceMeleeParams {
  tenantId:    string;
  origin:      MeleeOrigin;
  shape:       string;
  colourGroup: string;
  clarity:     string;
  carat:       number;
  qty:         number;
}

export type PriceMeleeResult =
  | { status: "ok"; quantity: number; carat: number; per_stone: number; total: number;
      quality: string; shape: string; supplier_name: string; origin: MeleeOrigin }
  | { status: "incomplete"; missing: { carat: boolean; colour_group: boolean; clarity: boolean; shape: boolean } }
  | { status: "supplier_missing"; origin: MeleeOrigin; supplier_name: string }
  | { status: "unmapped"; colour_group: string; clarity: string; origin: MeleeOrigin; supplier_name: string }
  | { status: "no_price"; shape: string; quality: string; carat: number; supplier_name: string }
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
  const colour = (params.colourGroup ?? "").trim();
  const clar   = (params.clarity ?? "").trim();
  const shape  = (params.shape ?? "").trim();

  if (!qty || qty <= 0) {
    return { status: "incomplete", missing: { carat: true, colour_group: true, clarity: true, shape: true } };
  }
  if (!Number.isFinite(carat) || carat <= 0 || !colour || !clar || !shape) {
    return { status: "incomplete", missing: {
      carat: !Number.isFinite(carat) || carat <= 0, colour_group: !colour, clarity: !clar, shape: !shape,
    }};
  }

  // origin → supplier (single-supplier-per-origin assumption, see top of file).
  const { data: suppliers } = await supabase
    .from("inventory_suppliers").select("id, name").eq("tenant_id", tenantId);
  const supplierId = resolveSupplierIdForOrigin(origin, suppliers ?? []);
  if (!supplierId) {
    return { status: "supplier_missing", origin, supplier_name: ORIGIN_SUPPLIER_NAME[origin] };
  }

  // (colour_group, clarity) → confirmed quality. No mapping = flag, never guess.
  const { data: mapRow } = await supabase
    .from("pricing_melee_quality_map")
    .select("quality")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .ilike("colour_group", colour)
    .ilike("clarity", clar)
    .maybeSingle();
  if (!mapRow) {
    return { status: "unmapped", colour_group: colour, clarity: clar, origin, supplier_name: ORIGIN_SUPPLIER_NAME[origin] };
  }

  // Exact price-list row: supplier + origin + shape + mapped quality, carat in band.
  const { data: priceRows, error: prErr } = await supabase
    .from("pricing_melee_stones")
    .select("price_per_carat, price_per_stone, size_from, size_to, size_type, shape, quality")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .eq("origin", origin)
    .eq("size_type", "carat_range")
    .ilike("shape", shape)
    .eq("quality", mapRow.quality)
    .lte("size_from", carat)
    .gte("size_to", carat)
    .order("size_from", { ascending: true });
  if (prErr) return { status: "error", message: prErr.message };

  const row = (priceRows ?? [])[0];
  if (!row) {
    return { status: "no_price", shape, quality: mapRow.quality, carat, supplier_name: ORIGIN_SUPPLIER_NAME[origin] };
  }

  const ppc = row.price_per_carat != null ? Number(row.price_per_carat) : null;
  const pps = row.price_per_stone != null ? Number(row.price_per_stone) : null;
  const perStone = ppc != null ? ppc * carat : pps;
  if (perStone == null) {
    return { status: "no_price", shape, quality: mapRow.quality, carat, supplier_name: ORIGIN_SUPPLIER_NAME[origin] };
  }

  return {
    status:        "ok",
    quantity:      qty,
    carat,
    per_stone:     Math.round(perStone * 100) / 100,
    total:         Math.round(perStone * qty * 100) / 100,
    quality:       mapRow.quality,
    shape,
    supplier_name: ORIGIN_SUPPLIER_NAME[origin],
    origin,
  };
}
