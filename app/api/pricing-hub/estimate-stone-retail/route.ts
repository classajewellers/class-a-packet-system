import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Authoritative stone retail estimator for the Browse Stones modal.
// Reads pricing_component_rules from the database — same source as calculate_price().
// The modal calls this once per search batch; no pricing logic lives in client TypeScript.

interface StoneInput {
  id: string;
  wholesale_aud: number;
  carats: number;
  labgrown: boolean;
}

interface ComponentRule {
  component_type: string;
  carat_min: number;
  carat_max: number | null;
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
    .select("component_type, carat_min, carat_max, multiplier")
    .eq("tenant_id", tenantId)
    .in("component_type", ["lab_stone", "natural_stone"])
    .order("component_type")
    .order("carat_min");

  if (error) {
    console.error(`[estimate-stone-retail] pricing_component_rules query failed: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const componentRules = (rules ?? []) as ComponentRule[];

  const labTiers = componentRules
    .filter(r => r.component_type === "lab_stone")
    .sort((a, b) => b.carat_min - a.carat_min);

  const naturalTiers = componentRules
    .filter(r => r.component_type === "natural_stone")
    .sort((a, b) => b.carat_min - a.carat_min);

  const retail: Record<string, number> = {};

  for (const stone of stones) {
    if (stone.wholesale_aud <= 0) continue;
    let mult: number;
    if (stone.labgrown) {
      const tier = labTiers.find(
        r => stone.carats >= r.carat_min && (r.carat_max == null || stone.carats < r.carat_max)
      );
      mult = tier?.multiplier ?? labTiers[labTiers.length - 1]?.multiplier ?? 10.5;
    } else {
      const tier = naturalTiers.find(
        r => stone.carats >= r.carat_min && (r.carat_max == null || stone.carats < r.carat_max)
      );
      mult = tier?.multiplier ?? naturalTiers[naturalTiers.length - 1]?.multiplier ?? 2.5;
    }
    retail[stone.id] = Math.round(stone.wholesale_aud * mult);
  }

  // One consolidated line — shows exactly what ids came in, what wholesale figure each
  // one carried, and what key/value went out, so an id-format mismatch between request
  // and response (e.g. a DIAMOND/ prefix present on one side and not the other) is
  // directly visible rather than inferred.
  console.log(`[estimate-stone-retail] in=${JSON.stringify(stones.map(s => ({ id: s.id, wholesale_aud: s.wholesale_aud })))} out=${JSON.stringify(retail)}`);

  return NextResponse.json({ retail });
}
