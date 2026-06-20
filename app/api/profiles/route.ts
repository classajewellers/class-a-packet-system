import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    let q = supabase
      .from("profiles")
      .select("id, full_name, role")
      .order("full_name", { ascending: true });
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q;
    if (error) return NextResponse.json({ profiles: [], error: error.message }, { status: 500 });
    return NextResponse.json({ profiles: data ?? [] });
  } catch (err) {
    return NextResponse.json({ profiles: [], error: String(err) }, { status: 500 });
  }
}
