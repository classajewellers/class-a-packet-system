export interface GoldRate {
  id: string;
  metal_type: string;
  price_per_gram: number;
}

export interface MarginBracket {
  id: string;
  cost_min: number;
  cost_max: number | null;
  multiplier: number;
}

export interface LivePricingResult {
  liveCost: number | null;
  liveRetail: number | null;
  liveMarginMultiplier: number | null;
  lockedGrossProfit: number | null;
  lockedGrossProfitPct: number | null;
  liveGrossProfit: number | null;
  liveGrossProfitPct: number | null;
  liveCostBreakdown: {
    metalCost: number | null;
    goldRatePerGram: number | null;
    stoneCost: number | null;
    labourCost: number | null;
  };
}

function findGoldRate(metalKarat: string | null | undefined, goldRates: GoldRate[]): number | null {
  if (!metalKarat || goldRates.length === 0) return null;
  const kLower = metalKarat.toLowerCase().trim();

  for (const r of goldRates) {
    if (r.metal_type.toLowerCase() === kLower) return r.price_per_gram;
  }

  // "18ct" substring-matches "18ct Gold"
  for (const r of goldRates) {
    if (r.metal_type.toLowerCase().includes(kLower)) return r.price_per_gram;
  }

  // Numeric fallback: "18ct" → "18"
  const kDigits = kLower.replace(/\D/g, "");
  if (kDigits) {
    for (const r of goldRates) {
      const firstNum = r.metal_type.match(/\d+/)?.[0] ?? "";
      if (firstNum === kDigits) return r.price_per_gram;
    }
  }

  return null;
}

function findMultiplier(cost: number, brackets: MarginBracket[]): number | null {
  if (!brackets.length) return null;
  const sorted = [...brackets].sort((a, b) => a.cost_min - b.cost_min);
  for (const b of sorted) {
    if (cost >= b.cost_min && (b.cost_max == null || cost < b.cost_max)) {
      return b.multiplier;
    }
  }
  return sorted[sorted.length - 1]?.multiplier ?? null;
}

export function calculateLivePricing(
  piece: {
    metal_weight_grams?: number | null;
    metal_karat?: string | null;
    stone_cost?: number | null;
    labour_cost?: number | null;
    locked_cost?: number | null;
    retail_price?: number | null;
  },
  goldRates: GoldRate[],
  marginBrackets: MarginBracket[]
): LivePricingResult {
  const stoneCost  = piece.stone_cost  ?? null;
  const labourCost = piece.labour_cost ?? null;

  let metalCost:       number | null = null;
  let goldRatePerGram: number | null = null;

  if (piece.metal_weight_grams != null && piece.metal_weight_grams > 0) {
    const rate = findGoldRate(piece.metal_karat, goldRates);
    goldRatePerGram = rate;
    // Per spec: if no rate match, metalCost = 0
    metalCost = piece.metal_weight_grams * (rate ?? 0);
  }

  const hasAnyData = metalCost != null || stoneCost != null || labourCost != null;
  if (!hasAnyData) {
    return {
      liveCost: null,
      liveRetail: null,
      liveMarginMultiplier: null,
      lockedGrossProfit: null,
      lockedGrossProfitPct: null,
      liveGrossProfit: null,
      liveGrossProfitPct: null,
      liveCostBreakdown: { metalCost: null, goldRatePerGram: null, stoneCost: null, labourCost: null },
    };
  }

  const liveCost = (metalCost ?? 0) + (stoneCost ?? 0) + (labourCost ?? 0);
  const multiplier = findMultiplier(liveCost, marginBrackets);
  const liveRetail = multiplier != null ? liveCost * multiplier : null;

  const retail = piece.retail_price ?? null;
  const liveGrossProfit    = retail != null ? retail - liveCost : null;
  const liveGrossProfitPct = retail != null && retail > 0
    ? ((retail - liveCost) / retail) * 100
    : null;

  const locked = piece.locked_cost ?? null;
  const lockedGrossProfit    = retail != null && locked != null ? retail - locked : null;
  const lockedGrossProfitPct = retail != null && locked != null && retail > 0
    ? ((retail - locked) / retail) * 100
    : null;

  return {
    liveCost,
    liveRetail,
    liveMarginMultiplier: multiplier,
    lockedGrossProfit,
    lockedGrossProfitPct,
    liveGrossProfit,
    liveGrossProfitPct,
    liveCostBreakdown: { metalCost, goldRatePerGram, stoneCost, labourCost },
  };
}
