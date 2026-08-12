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

// PATCH — update role and/or permissions for a profile
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    if (!tenantId) {
      return NextResponse.json({ error: "x-tenant-id header required" }, { status: 400 });
    }

    const body = await req.json();
    const { full_name, role, permissions, can_see_costs } = body as {
      full_name?: string;
      role?: string;
      permissions?: Record<string, boolean>;
      can_see_costs?: boolean;
    };

    const updates: Record<string, unknown> = {};
    if (full_name !== undefined)    updates.full_name = full_name;
    if (role !== undefined)         updates.role = role;
    if (permissions !== undefined)  updates.permissions = permissions;
    if (can_see_costs !== undefined) updates.can_see_costs = can_see_costs;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const supabase = await createTenantSupabaseClient(tenantId);
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", params.id)
      .eq("tenant_id", tenantId);

    if (error) {
      console.error("[settings/users PATCH]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET — single profile
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    if (!tenantId) {
      return NextResponse.json({ users: [] }, { status: 400 });
    }

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
