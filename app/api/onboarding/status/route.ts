import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
// Force EVERY fetch in this route segment — including supabase-js's internal
// REST calls, which go through Next's patched global fetch — to bypass the Data
// Cache. force-dynamic governs rendering; this governs fetch-level caching.
export const fetchCache = "force-no-store";

// ⚠️ TEMPORARY DEBUG INSTRUMENTATION — remove after diagnosing the Preview
// onboarding/status discrepancy. Logs are prefixed [ONB-STATUS-DEBUG] for easy
// grepping in `vercel logs`. Never logs the service-role key.
export async function GET(req: NextRequest): Promise<NextResponse> {
  noStore(); // opt this request out of the Next.js Data Cache at runtime too
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

    // ⚠️ TEMPORARY: _debug echoed into the response so it can be read directly
    // from DevTools Network (no vercel-logs timing dependency). Remove with the
    // rest of the instrumentation. No secrets included.
    const _debug = {
      resolved_tenantId: tenantId,
      x_tenant_id_header: rawHeader,
      supabase_host: supabaseHost,
      filter: `tenants.id = eq.${tenantId}`,
      raw_data: data,
      raw_error: error ? { code: error.code, message: error.message, details: error.details } : null,
    };

    if (error) return NextResponse.json({ error: error.message, _debug }, { status: 500 });

    return NextResponse.json({
      onboarding_complete: data?.onboarding_complete ?? false,
      onboarding_step:     data?.onboarding_step     ?? 0,
      _debug,
    });
  } catch (err) {
    console.error("[ONB-STATUS-DEBUG] exception", String(err));
    return NextResponse.json({
      error: String(err),
      _debug: { resolved_tenantId: tenantId, x_tenant_id_header: rawHeader, supabase_host: supabaseHost },
    }, { status: 500 });
  }
}
