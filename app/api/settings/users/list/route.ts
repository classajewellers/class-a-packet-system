import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Server-side manager/admin gate (was previously client-hidden only).
    // Honours the view-as override, so Josh-as-staff is correctly 403'd.
    const auth = await requireManager(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.ctx.tenantId;

    const supabase = await createTenantSupabaseClient(tenantId);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, auth_user_id, created_at, permissions, can_see_costs")
      .eq("tenant_id", tenantId)
      .order("full_name", { ascending: true });

    if (error) return NextResponse.json({ users: [], error: error.message }, { status: 500 });
    return NextResponse.json({ users: data ?? [] });
  } catch (err) {
    return NextResponse.json({ users: [], error: String(err) }, { status: 500 });
  }
}
