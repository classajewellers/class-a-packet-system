import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

// ── Pure calculation helpers ─────────────────────────────────────────────────
// Exact replica of findGoldPrice in app/pricing-hub/products/[id]/page.tsx

type GoldPrice     = { id: string; metal_type: string; price_per_gram: number };
type RateCard      = { id: string; card_type: string; label: string; amount: number; unit: string; sort_order: number };
type MarginBracket = { id: string; cost_min: number; cost_max: number | null; multiplier: number; stone_type: string | null };

function findGoldPrice(goldPrices: GoldPrice[], metalType: string | null): GoldPrice | null {
  if (!metalType) return null;
  const exact = goldPrices.find(g => g.metal_type === metalType);
  if (exact) return exact;
  const lower = metalType.toLowerCase();
  return (
    goldPrices.find(g =>
      lower.includes(g.metal_type.toLowerCase()) ||
      g.metal_type.toLowerCase().includes(lower)
    ) ?? null
  );
}

// Exact replica of findMultiplier in lib/inventoryPricing.ts
function findMultiplier(cost: number, brackets: MarginBracket[]): { multiplier: number; bracket: MarginBracket } | null {
  if (!brackets.length) return null;
  const sorted = [...brackets].sort((a, b) => a.cost_min - b.cost_min);
  for (const b of sorted) {
    if (cost >= b.cost_min && (b.cost_max == null || cost < b.cost_max)) {
      return { multiplier: b.multiplier, bracket: b };
    }
  }
  const last = sorted[sorted.length - 1];
  return last ? { multiplier: last.multiplier, bracket: last } : null;
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { variantId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { variantId } = body;
  if (!variantId?.trim()) {
    return NextResponse.json({ error: "variantId is required" }, { status: 400 });
  }

  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const db = createServerSupabaseClient();

  // Fetch all data in parallel
  const [variantRes, goldRes, rateRes, bracketRes] = await Promise.all([
    db.from("pricing_product_variants").select("*").eq("id", variantId).single(),
    db.from("pricing_gold_prices").select("id, metal_type, price_per_gram").order("metal_type"),
    db.from("pricing_rate_cards")
      .select("id, card_type, label, amount, unit, sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true })
      .order("label",      { ascending: true }),
    db.from("pricing_margin_brackets")
      .select("id, cost_min, cost_max, multiplier, stone_type")
      .order("cost_min", { ascending: true }),
  ]);

  if (variantRes.error || !variantRes.data) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  const variant    = variantRes.data;
  const goldPrices = (goldRes.data ?? []) as GoldPrice[];
  const rateCards  = (rateRes.data ?? []) as RateCard[];
  const allBrackets = (bracketRes.data ?? []) as MarginBracket[];

  // ── Metal cost ────────────────────────────────────────────────────────────
  const metalGrams    = variant.metal_grams != null ? Number(variant.metal_grams) : null;
  const gp            = findGoldPrice(goldPrices, variant.metal_type);
  const goldRatePerGram = gp ? Number(gp.price_per_gram) : null;

  if (metalGrams == null || metalGrams <= 0) {
    return NextResponse.json(
      { error: "Variant has no metal weight — cannot calculate cost", code: "MISSING_WEIGHT" },
      { status: 422 }
    );
  }

  const metalCost = metalGrams * (goldRatePerGram ?? 0);

  // ── Labour cost (rate cards matching pricing_mode) ────────────────────────
  // Exact replica of calcLiveCost: all cards whose card_type === pricing_mode, summed flat
  const mode          = (variant.pricing_mode ?? "our_build") as string;
  const matchingCards = rateCards.filter(r => r.card_type === mode);
  const labourCost    = matchingCards.reduce((s, r) => s + Number(r.amount), 0);

  // ── Fixed cost ────────────────────────────────────────────────────────────
  // pricing_fixed_costs is not included in the current UI calculation.
  // Reserved here for Phase 2 of the pricing engine.
  const fixedCost = 0;

  // ── Total ────────────────────────────────────────────────────────────────
  const totalCost = metalCost + labourCost + fixedCost;

  // ── Margin bracket lookup ─────────────────────────────────────────────────
  // Filter by stone_type matching the variant's diamond_type.
  // Falls back to all brackets if no stone_type-specific brackets exist.
  const diamondType = (variant.diamond_type ?? "none") as string;
  const stoneKey    = diamondType === "natural" ? "natural" : diamondType === "lab" ? "lab" : null;

  let brackets = stoneKey
    ? allBrackets.filter(b => b.stone_type === stoneKey || b.stone_type === null)
    : allBrackets;

  if (brackets.length === 0) brackets = allBrackets;

  const bracketResult      = findMultiplier(totalCost, brackets);
  const multiplier         = bracketResult?.multiplier ?? null;
  const recommendedRetail  = multiplier != null ? totalCost * multiplier : null;

  // ── Breakdown items ───────────────────────────────────────────────────────
  const breakdown: { type: string; label: string; amount: number }[] = [
    {
      type:   "metal",
      label:  gp
        ? `${metalGrams.toFixed(2)}g × $${Number(gp.price_per_gram).toFixed(2)}/g — ${variant.metal_type ?? "metal"}`
        : `${metalGrams.toFixed(2)}g — ${variant.metal_type ?? "metal"} (no rate matched, cost $0)`,
      amount: metalCost,
    },
    ...matchingCards.map(c => ({
      type:   "labour",
      label:  c.label,
      amount: Number(c.amount),
    })),
  ];

  if (fixedCost > 0) {
    breakdown.push({ type: "fixed", label: "Fixed overheads", amount: fixedCost });
  }

  return NextResponse.json({
    variantId,
    variantName:   variant.name,
    metalType:     variant.metal_type,
    metalGrams,
    pricingMode:   mode,
    diamondType,
    // Costs
    goldRatePerGram,
    metalCost,
    labourCost,
    fixedCost,
    totalCost,
    // Margin
    multiplier,
    recommendedRetail,
    // Detail
    breakdown,
    rateCardsUsed: matchingCards.map(c => ({
      id:     c.id,
      label:  c.label,
      amount: Number(c.amount),
      unit:   c.unit,
    })),
    marginBracketUsed: bracketResult
      ? {
          id:         bracketResult.bracket.id,
          cost_min:   bracketResult.bracket.cost_min,
          cost_max:   bracketResult.bracket.cost_max,
          multiplier: bracketResult.bracket.multiplier,
          stone_type: bracketResult.bracket.stone_type,
        }
      : null,
    diamondNote: stoneKey
      ? `${stoneKey === "natural" ? "Natural" : "Lab grown"} diamond — stone cost not yet included`
      : null,
  });
}
