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
