import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const CLASS_A_TENANT = "00000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";

  if (tenantId === CLASS_A_TENANT) {
    return NextResponse.json({ subscription_status: "active", plan: null, trial_ends_at: null });
  }

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    const { data } = await supabase
      .from("tenants")
      .select("subscription_status, plan, trial_ends_at")
      .eq("id", tenantId)
      .maybeSingle();

    return NextResponse.json({
      subscription_status: data?.subscription_status ?? "trialing",
      plan:                data?.plan                ?? null,
      trial_ends_at:       data?.trial_ends_at       ?? null,
    });
  } catch (err) {
    console.error("[billing/status]", err);
    // Fail open — don't block the app if billing check fails
    return NextResponse.json({ subscription_status: "trialing", plan: null, trial_ends_at: null });
  }
}
