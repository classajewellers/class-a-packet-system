import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Authoritative stone retail estimator for the Browse Stones modal.
// Reads pricing_component_rules from the database — same source and same
// cost-based tier lookup as calculate_price() (migration 133): tiers are
// selected by the stone's own wholesale cost, not its carat weight. A stone
// whose cost falls above the highest priced tier gets no entry in the
// response (frontend already treats a missing id as retailAud: null) rather
// than a silently guessed multiplier - same "explicit no_price status,
// never a hardcoded fallback" policy calculate_price() uses.

interface StoneInput {
  id: string;
  wholesale_aud: number;
  labgrown: boolean;
}

interface ComponentRule {
  component_type: string;
  cost_min: number | null;
  cost_max: number | null;
  multiplier: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  let stones: StoneInput[];
  try {
    const body = await req.json();
    if (!Array.isArray(body.stones)) {
      return NextResponse.json({ error: "stones array required" }, { status: 400 });
    }
    stones = body.stones;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = await createTenantSupabaseClient(tenantId);
  const { data: rules, error } = await db
    .from("pricing_component_rules")
    .select("component_type, cost_min, cost_max, multiplier")
    .eq("tenant_id", tenantId)
    .in("component_type", ["lab_stone", "natural_stone"])
    .not("cost_min", "is", null)
    .order("component_type")
    .order("cost_min");

  if (error) {
    console.error(`[estimate-stone-retail] pricing_component_rules query failed: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const componentRules = (rules ?? []) as ComponentRule[];

  // Sorted by cost_min descending so .find() below picks the same tier
  // calculate_price()'s "ORDER BY cost_min DESC LIMIT 1" would - the highest
  // cost_min whose range still contains this stone's wholesale cost.
  const labTiers = componentRules
    .filter(r => r.component_type === "lab_stone")
    .sort((a, b) => (b.cost_min ?? 0) - (a.cost_min ?? 0));

  const naturalTiers = componentRules
    .filter(r => r.component_type === "natural_stone")
    .sort((a, b) => (b.cost_min ?? 0) - (a.cost_min ?? 0));

  const retail: Record<string, number> = {};

  for (const stone of stones) {
    if (stone.wholesale_aud <= 0) continue;
    const tiers = stone.labgrown ? labTiers : naturalTiers;
    const tier = tiers.find(
      r => r.cost_min != null && stone.wholesale_aud >= r.cost_min && (r.cost_max == null || stone.wholesale_aud < r.cost_max)
    );
    // No matching tier (above the highest priced bracket) - omit this stone
    // rather than guess. The modal already renders a missing id as "—".
    if (!tier) continue;
    retail[stone.id] = Math.round(stone.wholesale_aud * tier.multiplier);
  }

  // One consolidated line — shows exactly what ids came in, what wholesale figure each
  // one carried, and what key/value went out, so an id-format mismatch between request
  // and response (e.g. a DIAMOND/ prefix present on one side and not the other) is
  // directly visible rather than inferred.
  console.log(`[estimate-stone-retail] in=${JSON.stringify(stones.map(s => ({ id: s.id, wholesale_aud: s.wholesale_aud })))} out=${JSON.stringify(retail)}`);

  return NextResponse.json({ retail });
}
