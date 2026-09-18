import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";

// lab_stone/natural_stone tiers are cost-based only (migration 133 cutover) -
// carat_min/carat_max are vestigial for these two types (carat_min stays 0,
// a NOT NULL column with no meaningful per-row value anymore; see migration
// 132's own comment). Every other component_type (metal/labour/melee) keeps
// using carat_min/carat_max exactly as before - untouched by this file.
const TIERED_STONE_TYPES = new Set(["lab_stone", "natural_stone"]);

type SupabaseDb = Awaited<ReturnType<typeof createTenantSupabaseClient>>;

// A stone can only ever fall into one tier - reject an add/edit that would
// make two tiers of the same component_type overlap. Ranges are treated as
// [cost_min, cost_max) exactly like calculate_price()'s own tier lookup.
async function findOverlappingTier(
  db: SupabaseDb,
  tenantId: string,
  componentType: string,
  costMin: number,
  costMax: number | null,
  excludeId?: string
): Promise<boolean> {
  let query = db
    .from("pricing_component_rules")
    .select("id, cost_min, cost_max")
    .eq("tenant_id", tenantId)
    .eq("component_type", componentType)
    .not("cost_min", "is", null);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return (data ?? []).some((r: { cost_min: number | null; cost_max: number | null }) => {
    const existingMax = r.cost_max ?? Infinity;
    const newMax = costMax ?? Infinity;
    return costMin < existingMax && (r.cost_min ?? 0) < newMax;
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });
  const db = await createTenantSupabaseClient(tenantId);
  const { data, error } = await db
    .from("pricing_component_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("component_type")
    .order("carat_min");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });
  const body = await req.json();
  const { component_type, carat_min, carat_max, cost_min, cost_max, multiplier, notes } = body;
  if (!component_type || multiplier == null) {
    return NextResponse.json({ error: "component_type and multiplier are required" }, { status: 400 });
  }

  const db = await createTenantSupabaseClient(tenantId);
  const insertRow: Record<string, unknown> = {
    tenant_id: tenantId,
    component_type,
    multiplier: Number(multiplier),
    notes: notes ?? null,
    updated_at: new Date().toISOString(),
  };

  if (TIERED_STONE_TYPES.has(component_type)) {
    if (cost_min == null) {
      return NextResponse.json({ error: "cost_min is required for lab_stone/natural_stone tiers" }, { status: 400 });
    }
    const newCostMin = Number(cost_min);
    const newCostMax = cost_max != null ? Number(cost_max) : null;
    if (await findOverlappingTier(db, tenantId, component_type, newCostMin, newCostMax)) {
      return NextResponse.json({ error: "This range overlaps an existing tier" }, { status: 409 });
    }
    insertRow.carat_min = 0; // vestigial NOT NULL column for these two types
    insertRow.carat_max = null;
    insertRow.cost_min = newCostMin;
    insertRow.cost_max = newCostMax;
  } else {
    insertRow.carat_min = carat_min ?? 0;
    insertRow.carat_max = carat_max ?? null;
  }

  const { data, error } = await db
    .from("pricing_component_rules")
    .insert(insertRow)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
