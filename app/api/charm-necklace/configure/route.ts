import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createServerClient } from "@supabase/ssr";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

const METAL_COST_FIELD: Record<string, string> = {
  "9ct_yellow":  "averaged_cost_9y",
  "9ct_white":   "averaged_cost_9w",
  "18ct_yellow": "averaged_cost_18y",
  "18ct_white":  "averaged_cost_18w",
};

const METAL_LABEL: Record<string, string> = {
  "9ct_yellow":  "9ct Yellow Gold",
  "9ct_white":   "9ct White Gold",
  "18ct_yellow": "18ct Yellow Gold",
  "18ct_white":  "18ct White Gold",
};

const METAL_GOLD_SEARCH: Record<string, string> = {
  "9ct_yellow":  "9ct yellow",
  "9ct_white":   "9ct white",
  "18ct_yellow": "18ct yellow",
  "18ct_white":  "18ct white",
};

async function getTenantId(req: NextRequest): Promise<string> {
  try {
    const sessionClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return req.cookies.getAll(); }, setAll() {} } }
    );
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user) return req.headers.get("x-tenant-id") ?? "";
    const db = createServerSupabaseClient();
    const { data: profile } = await db.from("profiles").select("tenant_id").eq("auth_user_id", user.id).single();
    return profile?.tenant_id ?? req.headers.get("x-tenant-id") ?? "";
  } catch {
    return req.headers.get("x-tenant-id") ?? "";
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = await getTenantId(req);
  if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServerSupabaseClient();

  // ── Feature flag check ────────────────────────────────────────────────────
  const { data: featureRow } = await db
    .from("tenant_features")
    .select("feature_configurable_products")
    .eq("tenant_id", tenantId)
    .single();
  if (!featureRow?.feature_configurable_products) {
    return NextResponse.json({ error: "Feature not enabled" }, { status: 403 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    metal: string;
    product_type?: string;
    selected_charm_ids: string[];
    quote_id?: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { metal, product_type = "necklace", selected_charm_ids, quote_id } = body;

  if (!metal || !METAL_COST_FIELD[metal]) {
    return NextResponse.json({ error: "Invalid metal. Must be 9ct_yellow, 9ct_white, 18ct_yellow, or 18ct_white" }, { status: 400 });
  }
  if (!selected_charm_ids?.length) {
    return NextResponse.json({ error: "selected_charm_ids is required" }, { status: 400 });
  }
  if (selected_charm_ids.length < 2) {
    return NextResponse.json({ error: "Minimum 2 charms required" }, { status: 400 });
  }
  if (selected_charm_ids.length > 6) {
    return NextResponse.json({ error: "Maximum 6 charms allowed" }, { status: 400 });
  }

  const costField = METAL_COST_FIELD[metal];

  // ── Fetch all selected components + chain ────────────────────────────────
  const allIds = selected_charm_ids;
  const [{ data: charmComponents }, { data: chainComponent }] = await Promise.all([
    db.from("charm_components")
      .select("*")
      .in("id", allIds)
      .eq("tenant_id", tenantId)
      .eq("active", true),
    db.from("charm_components")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("component_type", "chain")
      .eq("active", true)
      .order("sort_order")
      .limit(1)
      .single(),
  ]);

  if (!chainComponent) {
    return NextResponse.json({ error: "No chain component found in library" }, { status: 422 });
  }

  // ── Fetch gold prices for gram_weight calculation ─────────────────────────
  const { data: goldPrices } = await db.from("pricing_gold_prices").select("*");
  const metalSearch = METAL_GOLD_SEARCH[metal];
  const goldRate = (goldPrices ?? []).find((r: { metal_type: string }) =>
    r.metal_type?.toLowerCase().includes(metalSearch)
  );
  // null rate means "not yet set" — treat as 0 so gram-weight path is skipped
  // and componentCost falls through to flat-cost pricing (goldPricePerGram > 0 guard below)
  const goldPricePerGram: number = goldRate?.price_per_gram != null ? Number(goldRate.price_per_gram) : 0;

  // ── Helper: cost for a component given selected metal ────────────────────
  function componentCost(comp: Record<string, unknown>): number | null {
    if (comp.gram_weight != null && Number(comp.gram_weight) > 0 && goldPricePerGram > 0) {
      return Number(comp.gram_weight) * goldPricePerGram + Number(comp.making_charge ?? 0);
    }
    const val = comp[costField];
    return val != null ? Number(val) : null;
  }

  // ── Chain cost ────────────────────────────────────────────────────────────
  const chainCost = componentCost(chainComponent as Record<string, unknown>);
  const baseCost = chainCost ?? 0;

  // ── Check inventory stock for each selected charm ─────────────────────────
  const selectedCharms: Array<{
    component_id: string;
    name: string;
    supplier_code: string | null;
    cost: number | null;
    from_stock: boolean;
    inventory_piece_id: string | null;
    status: string;
  }> = [];

  let charmCount = 0;
  let charmCostSum = 0;
  let totalLabour = 0;

  for (const compId of selected_charm_ids) {
    const comp = (charmComponents ?? []).find((c: { id: string }) => c.id === compId) as Record<string, unknown> | undefined;
    if (!comp) continue;

    const cost = componentCost(comp);
    charmCostSum += cost ?? 0;

    const labourPerUnit = Number(comp.labour_per_unit ?? 40);
    totalLabour += labourPerUnit;
    if (labourPerUnit > 0) charmCount++;

    // Stock check
    let fromStock = false;
    let inventoryPieceId: string | null = null;
    if (comp.supplier_code) {
      try {
        const { data: stockPieces } = await db
          .from("inventory_pieces")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("supplier_code", comp.supplier_code as string)
          .eq("status", "available")
          .limit(1);
        if (stockPieces?.length) {
          fromStock = true;
          inventoryPieceId = stockPieces[0].id;
        }
      } catch { /* no supplier_code column — skip */ }
    }

    selectedCharms.push({
      component_id:       String(comp.id),
      name:               String(comp.name),
      supplier_code:      comp.supplier_code as string | null,
      cost,
      from_stock:         fromStock,
      inventory_piece_id: inventoryPieceId,
      status:             String(comp.product_status ?? "in_stock"),
    });
  }

  const whiteGoldPremium = metal.includes("white") ? 25 : 0;
  const totalCost = baseCost + charmCostSum + totalLabour + whiteGoldPremium;

  // ── Retail price from margin brackets ─────────────────────────────────────
  const { data: brackets } = await db
    .from("pricing_margin_brackets")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("cost_min", { ascending: true });

  const bracket = (brackets ?? []).find((b: { cost_min: number; cost_max: number | null }) =>
    totalCost >= b.cost_min && (b.cost_max === null || totalCost <= b.cost_max)
  ) as { multiplier: number } | undefined;
  const multiplier = bracket?.multiplier ?? 2.5;
  const rawRetail = totalCost * multiplier;
  // Round to nearest $5
  const retailPrice = Math.round(rawRetail / 5) * 5;

  // ── Build description ──────────────────────────────────────────────────────
  const charmNames = selectedCharms.map(c => c.name).join(", ");
  const productLabel = product_type === "bracelet" ? "Charm Bracelet" : "Charm Necklace";
  const description = `Personalised ${productLabel} — ${METAL_LABEL[metal]} — ${charmNames} (${selected_charm_ids.length} charm${selected_charm_ids.length !== 1 ? "s" : ""})`;

  // ── Save config ───────────────────────────────────────────────────────────
  const { data: config, error: configError } = await db
    .from("charm_necklace_configs")
    .insert({
      tenant_id:          tenantId,
      quote_id:           quote_id ?? null,
      metal,
      product_type,
      selected_charms:    selectedCharms,
      charm_count:        charmCount,
      base_cost:          baseCost,
      labour_cost:        totalLabour,
      total_cost:         totalCost,
      retail_price:       retailPrice,
      white_gold_premium: whiteGoldPremium,
    })
    .select()
    .single();

  if (configError) {
    console.error("[charm-necklace/configure] insert error:", configError.message);
    return NextResponse.json({ error: configError.message }, { status: 500 });
  }

  // ── Stock summary ─────────────────────────────────────────────────────────
  const fromStock = selectedCharms.filter(c => c.from_stock).map(c => c.name);
  const toOrder   = selectedCharms.filter(c => !c.from_stock).map(c => c.name);

  return NextResponse.json({
    config,
    description,
    breakdown: {
      chain:            { name: chainComponent.name, cost: baseCost },
      charms:           selectedCharms,
      charm_count:      charmCount,
      base_cost:        baseCost,
      charm_costs:      charmCostSum,
      labour_cost:      totalLabour,
      white_gold_premium: whiteGoldPremium,
      total_cost:       totalCost,
      multiplier,
      retail_price:     retailPrice,
    },
    stock_summary: {
      from_stock: fromStock,
      to_order:   toOrder,
    },
  });
}
