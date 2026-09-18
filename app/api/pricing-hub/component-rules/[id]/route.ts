import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";

// See app/api/pricing-hub/component-rules/route.ts for why lab_stone/
// natural_stone are cost-based only and what the overlap check protects.
const TIERED_STONE_TYPES = new Set(["lab_stone", "natural_stone"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });
  const body = await req.json();
  const { multiplier, carat_min, carat_max, cost_min, cost_max, notes } = body;
  if (multiplier == null) return NextResponse.json({ error: "multiplier required" }, { status: 400 });

  const db = await createTenantSupabaseClient(tenantId);

  const { data: existing, error: fetchError } = await db
    .from("pricing_component_rules")
    .select("component_type, cost_min, cost_max")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();
  if (fetchError || !existing) {
    return NextResponse.json({ error: fetchError?.message ?? "Tier not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {
    multiplier: Number(multiplier),
    updated_at: new Date().toISOString(),
  };
  if (carat_min != null) update.carat_min = Number(carat_min);
  if ("carat_max" in body) update.carat_max = carat_max != null ? Number(carat_max) : null;
  if ("notes" in body) update.notes = notes ?? null;

  if (TIERED_STONE_TYPES.has(existing.component_type)) {
    const effectiveCostMin = cost_min != null ? Number(cost_min) : existing.cost_min;
    const effectiveCostMax = "cost_max" in body ? (cost_max != null ? Number(cost_max) : null) : existing.cost_max;
    if (effectiveCostMin == null) {
      return NextResponse.json({ error: "cost_min is required for lab_stone/natural_stone tiers" }, { status: 400 });
    }

    const { data: others } = await db
      .from("pricing_component_rules")
      .select("id, cost_min, cost_max")
      .eq("tenant_id", tenantId)
      .eq("component_type", existing.component_type)
      .not("cost_min", "is", null)
      .neq("id", params.id);
    const overlaps = (others ?? []).some((r: { cost_min: number | null; cost_max: number | null }) => {
      const existingMax = r.cost_max ?? Infinity;
      const newMax = effectiveCostMax ?? Infinity;
      return effectiveCostMin < existingMax && (r.cost_min ?? 0) < newMax;
    });
    if (overlaps) {
      return NextResponse.json({ error: "This range overlaps an existing tier" }, { status: 409 });
    }

    if (cost_min != null) update.cost_min = effectiveCostMin;
    if ("cost_max" in body) update.cost_max = effectiveCostMax;
  }

  const { data, error } = await db
    .from("pricing_component_rules")
    .update(update)
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });
  const db = await createTenantSupabaseClient(tenantId);
  const { error } = await db
    .from("pricing_component_rules")
    .delete()
    .eq("id", params.id)
    .eq("tenant_id", tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
