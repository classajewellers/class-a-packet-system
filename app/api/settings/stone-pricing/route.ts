import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// ── Seed defaults ───────────────────────────────────────────────────────────────

const COLOUR_GRADES = [
  { colour_grade: "D",  adjustment_percent:   0, sort_order: 0 },
  { colour_grade: "E",  adjustment_percent:  -5, sort_order: 1 },
  { colour_grade: "F",  adjustment_percent: -10, sort_order: 2 },
  { colour_grade: "G",  adjustment_percent: -15, sort_order: 3 },
  { colour_grade: "H",  adjustment_percent: -20, sort_order: 4 },
  { colour_grade: "I",  adjustment_percent: -25, sort_order: 5 },
  { colour_grade: "J",  adjustment_percent: -30, sort_order: 6 },
];

const CLARITY_GRADES = [
  { clarity_grade: "IF",   adjustment_percent: 475, sort_order: 0 },
  { clarity_grade: "VVS1", adjustment_percent: 195, sort_order: 1 },
  { clarity_grade: "VVS2", adjustment_percent:   3, sort_order: 2 },
  { clarity_grade: "VS1",  adjustment_percent:   0, sort_order: 3 },
  { clarity_grade: "VS2",  adjustment_percent:  -3, sort_order: 4 },
  { clarity_grade: "SI1",  adjustment_percent:  -4, sort_order: 5 },
  { clarity_grade: "SI2",  adjustment_percent:  -8, sort_order: 6 },
  { clarity_grade: "I1",   adjustment_percent: -20, sort_order: 7 },
];

const CARAT_MULTIPLIERS: Array<{ carat_from: number; carat_to: number | null; multiplier: number; sort_order: number }> = [
  { carat_from: 0,    carat_to: 0.99, multiplier: 0.75, sort_order: 0 },
  { carat_from: 1,    carat_to: 1.49, multiplier: 0.40, sort_order: 1 },
  { carat_from: 1.5,  carat_to: 1.99, multiplier: 0.45, sort_order: 2 },
  { carat_from: 2,    carat_to: 2.99, multiplier: 0.70, sort_order: 3 },
  { carat_from: 3,    carat_to: 3.99, multiplier: 1.00, sort_order: 4 },
  { carat_from: 4,    carat_to: 4.99, multiplier: 1.55, sort_order: 5 },
  { carat_from: 5,    carat_to: null, multiplier: 1.65, sort_order: 6 },
];

const DIAMOND_TYPES = ["lab_diamond", "natural_diamond"] as const;
const ALL_STONE_TYPES = ["lab_diamond", "natural_diamond", "gem_stone"] as const;

async function seedDefaults(supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>, tenantId: string) {
  // Base prices
  await supabase.from("stone_base_prices").upsert([
    { tenant_id: tenantId, stone_type: "lab_diamond",     base_price_per_carat: 300, updated_at: new Date().toISOString() },
    { tenant_id: tenantId, stone_type: "natural_diamond", base_price_per_carat: 800, updated_at: new Date().toISOString() },
    { tenant_id: tenantId, stone_type: "gem_stone",       base_price_per_carat: 200, updated_at: new Date().toISOString() },
  ], { onConflict: "tenant_id,stone_type" });

  // Colour adjustments (diamonds only)
  const colourRows = DIAMOND_TYPES.flatMap(st =>
    COLOUR_GRADES.map(g => ({ tenant_id: tenantId, stone_type: st, ...g, updated_at: new Date().toISOString() }))
  );
  await supabase.from("stone_colour_adjustments").upsert(colourRows, { onConflict: "tenant_id,stone_type,colour_grade" });

  // Clarity adjustments (diamonds only)
  const clarityRows = DIAMOND_TYPES.flatMap(st =>
    CLARITY_GRADES.map(g => ({ tenant_id: tenantId, stone_type: st, ...g, updated_at: new Date().toISOString() }))
  );
  await supabase.from("stone_clarity_adjustments").upsert(clarityRows, { onConflict: "tenant_id,stone_type,clarity_grade" });

  // Carat multipliers (all stone types)
  const caratRows = ALL_STONE_TYPES.flatMap(st =>
    CARAT_MULTIPLIERS.map(m => ({ tenant_id: tenantId, stone_type: st, ...m, updated_at: new Date().toISOString() }))
  );
  for (const row of caratRows) {
    await supabase.from("stone_carat_multipliers").upsert(row);
  }

  // Stone margin categories in pricing_margin_config
  const marginRows = [
    { tenant_id: tenantId, category: "stone_lab",     margin_percent: 55, hourly_rate: null, updated_at: new Date().toISOString() },
    { tenant_id: tenantId, category: "stone_natural", margin_percent: 30, hourly_rate: null, updated_at: new Date().toISOString() },
    { tenant_id: tenantId, category: "stone_gem",     margin_percent: 40, hourly_rate: null, updated_at: new Date().toISOString() },
  ];
  await supabase.from("pricing_margin_config").upsert(marginRows, { onConflict: "tenant_id,category" });
}

// ── GET ─────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    // Check if seeding is needed (any base_prices rows for this tenant)
    const { data: existing } = await supabase
      .from("stone_base_prices")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(1);

    if (!existing || existing.length === 0) {
      await seedDefaults(supabase, tenantId);
    }

    const [basePricesRes, colourRes, clarityRes, caratRes, marginsRes] = await Promise.all([
      supabase.from("stone_base_prices").select("id,stone_type,base_price_per_carat").eq("tenant_id", tenantId).order("stone_type"),
      supabase.from("stone_colour_adjustments").select("id,stone_type,colour_grade,adjustment_percent,sort_order").eq("tenant_id", tenantId).order("stone_type").order("sort_order"),
      supabase.from("stone_clarity_adjustments").select("id,stone_type,clarity_grade,adjustment_percent,sort_order").eq("tenant_id", tenantId).order("stone_type").order("sort_order"),
      supabase.from("stone_carat_multipliers").select("id,stone_type,carat_from,carat_to,multiplier,sort_order").eq("tenant_id", tenantId).order("stone_type").order("sort_order"),
      supabase.from("pricing_margin_config").select("category,margin_percent").eq("tenant_id", tenantId).in("category", ["stone_lab","stone_natural","stone_gem"]),
    ]);

    return NextResponse.json({
      base_prices:        basePricesRes.data   ?? [],
      colour_adjustments: colourRes.data       ?? [],
      clarity_adjustments: clarityRes.data     ?? [],
      carat_multipliers:  caratRes.data        ?? [],
      margins:            marginsRes.data      ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ── POST ────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  try {
    const body = await req.json() as {
      base_prices:         Array<{ stone_type: string; base_price_per_carat: number }>;
      colour_adjustments:  Array<{ stone_type: string; colour_grade: string; adjustment_percent: number; sort_order: number }>;
      clarity_adjustments: Array<{ stone_type: string; clarity_grade: string; adjustment_percent: number; sort_order: number }>;
      carat_multipliers:   Array<{ carat_from: number; carat_to: number | null; multiplier: number; sort_order: number }>;
      margins:             Array<{ category: string; margin_percent: number }>;
    };

    const supabase = await createTenantSupabaseClient(tenantId);
    const now = new Date().toISOString();

    // Base prices
    if (Array.isArray(body.base_prices)) {
      await supabase.from("stone_base_prices").upsert(
        body.base_prices.map(r => ({ tenant_id: tenantId, stone_type: r.stone_type, base_price_per_carat: r.base_price_per_carat, updated_at: now })),
        { onConflict: "tenant_id,stone_type" }
      );
    }

    // Colour adjustments
    if (Array.isArray(body.colour_adjustments)) {
      await supabase.from("stone_colour_adjustments").upsert(
        body.colour_adjustments.map(r => ({ tenant_id: tenantId, stone_type: r.stone_type, colour_grade: r.colour_grade, adjustment_percent: r.adjustment_percent, sort_order: r.sort_order, updated_at: now })),
        { onConflict: "tenant_id,stone_type,colour_grade" }
      );
    }

    // Clarity adjustments
    if (Array.isArray(body.clarity_adjustments)) {
      await supabase.from("stone_clarity_adjustments").upsert(
        body.clarity_adjustments.map(r => ({ tenant_id: tenantId, stone_type: r.stone_type, clarity_grade: r.clarity_grade, adjustment_percent: r.adjustment_percent, sort_order: r.sort_order, updated_at: now })),
        { onConflict: "tenant_id,stone_type,clarity_grade" }
      );
    }

    // Carat multipliers — save for all stone types (same values apply to all)
    if (Array.isArray(body.carat_multipliers)) {
      // Delete existing and re-insert to handle added/removed rows cleanly
      await supabase.from("stone_carat_multipliers").delete().eq("tenant_id", tenantId);
      const caratRows = ALL_STONE_TYPES.flatMap(st =>
        body.carat_multipliers.map((m, i) => ({
          tenant_id: tenantId, stone_type: st,
          carat_from: m.carat_from, carat_to: m.carat_to ?? null,
          multiplier: m.multiplier, sort_order: m.sort_order ?? i,
          updated_at: now,
        }))
      );
      if (caratRows.length > 0) {
        await supabase.from("stone_carat_multipliers").insert(caratRows);
      }
    }

    // Stone margins in pricing_margin_config
    if (Array.isArray(body.margins)) {
      for (const m of body.margins) {
        await supabase.from("pricing_margin_config").upsert(
          { tenant_id: tenantId, category: m.category, margin_percent: m.margin_percent, updated_at: now },
          { onConflict: "tenant_id,category" }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
