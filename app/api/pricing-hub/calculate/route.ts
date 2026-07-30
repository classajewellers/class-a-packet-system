import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

// ── Pure calculation helpers ─────────────────────────────────────────────────
// Exact replica of findGoldPrice in app/pricing-hub/products/[id]/page.tsx

type GoldPrice     = { id: string; metal_type: string; price_per_gram: number | null };
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
  let body: {
    variantId?: string;
    melee_quantity?: number;
    melee_carat_weight?: number;
    melee_colour_group?: string;
    melee_clarity?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { variantId } = body;
  if (!variantId?.trim()) {
    return NextResponse.json({ error: "variantId is required" }, { status: 400 });
  }

  // Resolve tenant from session cookie (same pattern as products GET)
  let tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const { createServerClient: createSSR } = await import("@supabase/ssr");
    const sessionClient = createSSR(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await sessionClient.auth.getUser();
    if (user) {
      const db2 = createServerSupabaseClient();
      const { data: profile } = await db2.from("profiles").select("tenant_id").eq("auth_user_id", user.id).single();
      if (profile?.tenant_id) tenantId = profile.tenant_id;
    }
  } catch { /* fall through to header value */ }

  const db = createServerSupabaseClient();

  // Fetch all data in parallel
  const [variantRes, goldRes, rateRes, bracketRes, featuresRes] = await Promise.all([
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
    db.from("tenant_features")
      .select("fx_usd_aud")
      .eq("tenant_id", tenantId)
      .single(),
  ]);

  if (variantRes.error || !variantRes.data) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  const variant     = variantRes.data;
  const goldPrices  = (goldRes.data ?? []) as GoldPrice[];
  const rateCards   = (rateRes.data ?? []) as RateCard[];
  const allBrackets = (bracketRes.data ?? []) as MarginBracket[];
  const fxRate      = Number(featuresRes.data?.fx_usd_aud ?? 1.58);

  // Melee fields: prefer request body override, fall back to what's stored on the variant
  const meleeQty    = body.melee_quantity      ?? (variant.melee_quantity      != null ? Number(variant.melee_quantity)      : null);
  const meleeCt     = body.melee_carat_weight  ?? (variant.melee_carat_weight  != null ? Number(variant.melee_carat_weight)  : null);
  const meleeColour = body.melee_colour_group  ?? variant.melee_colour_group  ?? null;
  const meleeClarity = body.melee_clarity      ?? variant.melee_clarity       ?? null;

  // ── Metal cost ────────────────────────────────────────────────────────────
  const metalGrams    = variant.metal_grams != null ? Number(variant.metal_grams) : null;
  const gp = findGoldPrice(goldPrices, variant.metal_type);

  if (gp && gp.price_per_gram === null) {
    return NextResponse.json(
      { error: `No rate set for ${gp.metal_type} — cannot calculate metal cost. Set a rate in Settings > Pricing first.` },
      { status: 422 }
    );
  }

  const goldRatePerGram = gp ? Number(gp.price_per_gram) : null;

  if (metalGrams == null || metalGrams <= 0) {
    return NextResponse.json(
      { error: "Variant has no metal weight — cannot calculate cost", code: "MISSING_WEIGHT" },
      { status: 422 }
    );
  }

  // goldRatePerGram is null only when no row matched (not: row matched but rate is null — that 422s above)
  const metalCost = metalGrams * (goldRatePerGram ?? 0);

  // ── Labour cost (rate cards matching pricing_mode) ────────────────────────
  // Exact replica of calcLiveCost: all cards whose card_type === pricing_mode, summed flat
  const mode          = (variant.pricing_mode ?? "our_build") as string;
  const matchingCards = rateCards.filter(r => r.card_type === mode);
  const labourCost    = matchingCards.reduce((s, r) => s + Number(r.amount), 0);

  // ── Fixed cost ────────────────────────────────────────────────────────────
  const fixedCost = 0;

  // ── Melee stone cost ──────────────────────────────────────────────────────
  let meleeCostAud     = 0;
  let meleeCostUsd     = 0;
  let meleePricePerCt  = 0;
  let meleeTotalCarats = 0;
  let meleeRapDate: string | null = null;
  let meleeNote: string | null = null;

  if (meleeQty != null && meleeQty > 0 && meleeCt != null && meleeCt > 0 && meleeColour && meleeClarity) {
    meleeTotalCarats = meleeQty * meleeCt;

    // Look up the most recent matching parcel price
    const { data: parcelRow } = await db
      .from("rapaport_parcels")
      .select("price_usd_per_carat, rap_date")
      .eq("tenant_id", tenantId)
      .eq("colour_group", meleeColour)
      .eq("clarity", meleeClarity)
      .lte("size_min", meleeCt)
      .gte("size_max", meleeCt)
      .order("rap_date", { ascending: false })
      .limit(1)
      .single();

    if (parcelRow) {
      meleePricePerCt = Number(parcelRow.price_usd_per_carat);
      meleeRapDate    = String(parcelRow.rap_date);
      meleeCostUsd    = meleePricePerCt * meleeTotalCarats;
      meleeCostAud    = meleeCostUsd * fxRate;
    } else {
      meleeNote = `No parcel price found for ${meleeColour} / ${meleeClarity} at ${meleeCt}ct — check Rapaport parcel settings`;
    }
  }

  // ── Total ────────────────────────────────────────────────────────────────
  const totalCost = metalCost + labourCost + fixedCost + meleeCostAud;

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
        ? `${metalGrams.toFixed(2)}g × $${Number(gp.price_per_gram ?? 0).toFixed(2)}/g — ${variant.metal_type ?? "metal"}`
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

  if (meleeCostAud > 0) {
    breakdown.push({
      type:   "melee",
      label:  `${meleeQty} × ${meleeCt}ct ${meleeColour}/${meleeClarity} @ USD $${meleePricePerCt.toFixed(2)}/ct × ${fxRate.toFixed(4)} AUD`,
      amount: meleeCostAud,
    });
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
    meleeCostAud,
    meleeCostUsd,
    meleePriceUsedUsdPerCt: meleePricePerCt,
    meleeTotalCarats,
    meleeRapDate,
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
    meleeNote,
  });
}
