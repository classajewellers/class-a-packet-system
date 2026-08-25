import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
export const dynamic = "force-dynamic";

interface ComponentRuleInput {
  component_type: string;
  carat_min?: number;
  carat_max?: number | null;
  multiplier: number;
  notes?: string | null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  try {
    const body = await req.json() as { rules?: ComponentRuleInput[] };
    const rules = body.rules;
    if (!Array.isArray(rules) || rules.length === 0) {
      return NextResponse.json({ error: "rules array is required" }, { status: 400 });
    }

    const db = await createTenantSupabaseClient(tenantId);

    for (const rule of rules) {
      if (!rule.component_type || rule.multiplier == null) continue;
      await db.from("pricing_component_rules").upsert(
        {
          tenant_id: tenantId,
          component_type: rule.component_type,
          carat_min: rule.carat_min ?? 0,
          carat_max: rule.carat_max ?? null,
          multiplier: Number(rule.multiplier),
          notes: rule.notes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,component_type,carat_min" }
      );
    }

    // Mark onboarding step 3 complete (pricing margins)
    const { data: current } = await db
      .from("tenants")
      .select("onboarding_step")
      .eq("id", tenantId)
      .maybeSingle();

    await db
      .from("tenants")
      .update({ onboarding_step: Math.max((current?.onboarding_step ?? 0), 3) })
      .eq("id", tenantId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
