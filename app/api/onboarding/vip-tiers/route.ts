import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const DEFAULT_TIERS = [
  { tier_name: "Bronze",   tier_order: 1, min_spend: 500,   min_orders: 5,  colour: "#CD7F32" },
  { tier_name: "Silver",   tier_order: 2, min_spend: 2500,  min_orders: 15, colour: "#6B7280" },
  { tier_name: "Gold",     tier_order: 3, min_spend: 7500,  min_orders: 30, colour: "#F59E0B" },
  { tier_name: "Platinum", tier_order: 4, min_spend: 20000, min_orders: 75, colour: "#635BFF" },
];

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    // Only seed if none exist yet
    const { data: existing } = await supabase
      .from("vip_tier_config")
      .select("id")
      .eq("tenant_id", tenantId)
      .limit(1);

    if (!existing?.length) {
      await supabase.from("vip_tier_config").insert(
        DEFAULT_TIERS.map(t => ({ ...t, tenant_id: tenantId }))
      );
    }

    // Advance onboarding step to at least 3
    const { data: current } = await supabase
      .from("tenants")
      .select("onboarding_step")
      .eq("id", tenantId)
      .maybeSingle();

    await supabase
      .from("tenants")
      .update({ onboarding_step: Math.max((current?.onboarding_step ?? 0), 3) })
      .eq("id", tenantId);

    // Return tiers for display
    const { data: tiers } = await supabase
      .from("vip_tier_config")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("tier_order", { ascending: true });

    return NextResponse.json({ tiers: tiers ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
