import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    if (!tenantId) {
      return NextResponse.json({ users: [] }, { status: 400 });
    }

    const supabase = await createTenantSupabaseClient(tenantId);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, auth_user_id, created_at")
      .eq("tenant_id", tenantId)
      .order("full_name", { ascending: true });

    if (error) return NextResponse.json({ users: [], error: error.message }, { status: 500 });
    return NextResponse.json({ users: data ?? [] });
  } catch (err) {
    return NextResponse.json({ users: [], error: String(err) }, { status: 500 });
  }
}
