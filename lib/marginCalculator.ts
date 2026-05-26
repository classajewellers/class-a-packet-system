/**
 * Blended tiered margin calculator.
 * Works like tax brackets — each portion of the cost is multiplied by the
 * rate for that bracket, so there are no cliff-edge jumps.
 */

export interface MarginBracket {
  min: number;
  max: number;
  multiplier: number;
}

export const MARGIN_BRACKETS: MarginBracket[] = [
  { min: 0,     max: 500,   multiplier: 3.20 },
  { min: 500,   max: 1000,  multiplier: 2.95 },
  { min: 1000,  max: 1500,  multiplier: 2.85 },
  { min: 1500,  max: 2000,  multiplier: 2.75 },
  { min: 2000,  max: 5000,  multiplier: 2.50 },
  { min: 5000,  max: 7500,  multiplier: 2.40 },
  { min: 7500,  max: 12500, multiplier: 2.30 },
];

const TOP_MULTIPLIER = MARGIN_BRACKETS[MARGIN_BRACKETS.length - 1].multiplier;

/**
 * Calculate the recommended retail price (incl. GST) for a given cost price.
 * Uses blended tiered multipliers — no cliff edges.
 * Result is rounded to the nearest $5.
 */
export function calculateRetailPrice(cost: number): number {
  if (cost <= 0) return 0;

  let retail = 0;
  let remaining = cost;

  for (const bracket of MARGIN_BRACKETS) {
    if (remaining <= 0) break;
    const bracketCapacity = bracket.max - bracket.min;
    const portionInBracket = Math.min(remaining, bracketCapacity);
    retail += portionInBracket * bracket.multiplier;
    remaining -= portionInBracket;
  }

  // Any cost above the highest bracket uses the top multiplier
  if (remaining > 0) {
    retail += remaining * TOP_MULTIPLIER;
  }

  return Math.round(retail / 5) * 5;
}

/**
 * Calculate margin percentage given retail and cost prices.
 * Returns null if retail is 0 or invalid.
 */
export function calculateMarginPct(retail: number, cost: number): number | null {
  if (retail <= 0 || cost <= 0) return null;
  return ((retail - cost) / retail) * 100;
}

/**
 * Return a colour class based on the margin percentage.
 * green  = >55%
 * orange = 40–55%
 * red    = <40%
 */
export function marginColour(pct: number): "green" | "orange" | "red" {
  if (pct >= 55) return "green";
  if (pct >= 40) return "orange";
  return "red";
}
