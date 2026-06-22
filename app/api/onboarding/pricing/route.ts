import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// metal_type values that match the seeded pricing_metal_rates rows
const METAL_MAP: Record<string, string> = {
  gold_9ct:  "9ct Yellow Gold",
  gold_18ct: "18ct Yellow Gold",
  silver:    "Sterling Silver",
  platinum:  "Platinum",
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  try {
    const body = await req.json() as Record<string, unknown>;
    const supabase = await createTenantSupabaseClient(tenantId);

    // Upsert each metal rate (pricing_metal_rates has UNIQUE on metal_type)
    const metalUpdates: Promise<unknown>[] = [];
    for (const [key, metalType] of Object.entries(METAL_MAP)) {
      if (key in body) {
        const price = parseFloat(String(body[key]));
        if (!isNaN(price) && price > 0) {
          metalUpdates.push(
            supabase
              .from("pricing_metal_rates")
              .upsert({ metal_type: metalType, price_per_gram: price, updated_at: new Date().toISOString() }, { onConflict: "metal_type" })
          );
        }
      }
    }
    await Promise.all(metalUpdates);

    // Update GST registered + advance onboarding step
    const { data: current } = await supabase
      .from("tenants")
      .select("onboarding_step")
      .eq("id", tenantId)
      .maybeSingle();

    const tenantUpdates: Record<string, unknown> = {
      onboarding_step: Math.max((current?.onboarding_step ?? 0), 2),
    };
    if ("gst_registered" in body) {
      tenantUpdates.gst_registered = Boolean(body.gst_registered);
    }

    const { error: tenantErr } = await supabase
      .from("tenants")
      .update(tenantUpdates)
      .eq("id", tenantId);

    if (tenantErr) return NextResponse.json({ error: tenantErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
