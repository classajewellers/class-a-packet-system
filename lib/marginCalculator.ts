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

// ── DB-sourced blended calculation ───────────────────────────────────────────

export interface DBMarginBracket {
  cost_min: number;
  cost_max: number | null;
  multiplier: number;
}

export interface BlendedBreakdownLine {
  label: string;
  portion: number;
  multiplier: number;
  subtotal: number;
}

export interface BlendedResult {
  unrounded: number;
  retail: number;
  breakdown: BlendedBreakdownLine[];
}

/**
 * Blended retail calculation using DB-sourced brackets.
 * Each bracket's multiplier applies only to the cost portion within that bracket —
 * identical to income-tax bracket logic. Retail always increases as cost increases.
 */
export function calculateBlendedRetailFromBrackets(
  cost: number,
  brackets: DBMarginBracket[]
): BlendedResult {
  if (cost <= 0 || brackets.length === 0) return { unrounded: 0, retail: 0, breakdown: [] };

  const sorted = [...brackets].sort((a, b) => Number(a.cost_min) - Number(b.cost_min));

  let retail = 0;
  let remaining = cost;
  const breakdown: BlendedBreakdownLine[] = [];

  for (const bracket of sorted) {
    if (remaining <= 0) break;
    const costMin = Number(bracket.cost_min);
    const costMax = bracket.cost_max != null ? Number(bracket.cost_max) : null;
    const multiplier = Number(bracket.multiplier);
    const capacity = costMax != null ? costMax - costMin : remaining;
    const portion = Math.min(remaining, capacity);
    if (portion <= 0) continue;
    const subtotal = portion * multiplier;
    retail += subtotal;
    remaining -= portion;
    const label = breakdown.length === 0
      ? `First $${Math.round(portion).toLocaleString("en-AU")}`
      : `Next $${Math.round(portion).toLocaleString("en-AU")}`;
    breakdown.push({ label, portion, multiplier, subtotal });
  }

  // Cost exceeds the highest bracket — use the top bracket's multiplier
  if (remaining > 0) {
    const topMultiplier = Number(sorted[sorted.length - 1].multiplier);
    const subtotal = remaining * topMultiplier;
    retail += subtotal;
    breakdown.push({
      label: `Next $${Math.round(remaining).toLocaleString("en-AU")}`,
      portion: remaining,
      multiplier: topMultiplier,
      subtotal,
    });
  }

  return { unrounded: retail, retail: Math.ceil(retail / 5) * 5, breakdown };
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

  return Math.ceil(retail / 5) * 5;
}

/**
 * Calculate the actual multiplier (retail ÷ cost).
 * Returns null if either value is 0 or invalid.
 */
export function calculateMultiplier(retail: number, cost: number): number | null {
  if (retail <= 0 || cost <= 0) return null;
  return retail / cost;
}

/**
 * Return a colour token based on the multiplier.
 * green  = ≥ 2.50
 * orange = 2.00 – 2.49
 * red    = < 2.00
 */
export function multiplierColour(mult: number): "green" | "orange" | "red" {
  if (mult >= 2.50) return "green";
  if (mult >= 2.00) return "orange";
  return "red";
}

// ── Legacy helpers kept for any remaining call-sites ─────────────────────────

/** @deprecated Use calculateMultiplier + multiplierColour instead */
export function calculateMarginPct(retail: number, cost: number): number | null {
  if (retail <= 0 || cost <= 0) return null;
  return ((retail - cost) / retail) * 100;
}

/** @deprecated Use multiplierColour instead */
export function marginColour(pct: number): "green" | "orange" | "red" {
  if (pct >= 55) return "green";
  if (pct >= 40) return "orange";
  return "red";
}
