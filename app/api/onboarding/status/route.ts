import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
// Force EVERY fetch in this route segment — including supabase-js's internal
// REST calls, which go through Next's patched global fetch — to bypass the Data
// Cache. Without this, a stale onboarding status could be served indefinitely.
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest): Promise<NextResponse> {
  noStore(); // belt-and-suspenders: opt this request out of the Data Cache at runtime too
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data, error } = await supabase
      .from("tenants")
      .select("onboarding_complete, onboarding_step")
      .eq("id", tenantId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      onboarding_complete: data?.onboarding_complete ?? false,
      onboarding_step:     data?.onboarding_step     ?? 0,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
