import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// ⚠️ TEMPORARY DEBUG INSTRUMENTATION — remove after diagnosing the Preview
// onboarding/status discrepancy. Logs are prefixed [ONB-STATUS-DEBUG] for easy
// grepping in `vercel logs`. Never logs the service-role key.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const rawHeader = req.headers.get("x-tenant-id");
  const tenantId = rawHeader ?? "";

  // Runtime project confirmation (public URL only — safe to log)
  const supabaseHost = (() => {
    try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host; }
    catch { return "(NEXT_PUBLIC_SUPABASE_URL unset/invalid)"; }
  })();

  console.log("[ONB-STATUS-DEBUG] incoming", JSON.stringify({
    x_tenant_id_header: rawHeader,
    resolved_tenantId:  tenantId,
    tenantId_length:    tenantId.length,
    x_user_id_header:   req.headers.get("x-user-id"),
    supabase_host:      supabaseHost,
  }));

  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const { data, error } = await supabase
      .from("tenants")
      .select("onboarding_complete, onboarding_step")
      .eq("id", tenantId)
      .maybeSingle();

    console.log("[ONB-STATUS-DEBUG] query result", JSON.stringify({
      filter:          `tenants.id = eq.${tenantId}`,
      raw_data:        data,
      raw_error:       error ? { code: error.code, message: error.message, details: error.details } : null,
    }));

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      onboarding_complete: data?.onboarding_complete ?? false,
      onboarding_step:     data?.onboarding_step     ?? 0,
    });
  } catch (err) {
    console.error("[ONB-STATUS-DEBUG] exception", String(err));
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
