import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    if (!tenantId) {
      return NextResponse.json({ error: "x-tenant-id header required" }, { status: 400 });
    }

    const supabase = await createTenantSupabaseClient(tenantId);

    // Delete profile — only if it belongs to this tenant
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", params.id)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("[settings/users DELETE]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET — list all profiles for a tenant (used by the users settings page)
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
