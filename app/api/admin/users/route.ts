import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Admin client — uses service role key, server-side only
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/admin/users — list users with their profiles, scoped to the caller's tenant
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    if (!tenantId) {
      return NextResponse.json({ error: "x-tenant-id header required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch emails from auth.users via admin API
    const { data: authData, error: authError } =
      await supabase.auth.admin.listUsers({ perPage: 1000 });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    const emailMap = new Map(
      authData.users.map((u) => [u.id, u.email ?? ""])
    );

    const users = (data ?? []).map((p) => ({
      id: p.id,
      email: emailMap.get(p.id) ?? "",
      full_name: p.full_name ?? "",
      role: p.role ?? "staff",
      created_at: p.created_at,
    }));

    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/admin/users — invite a new user by email
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { email, full_name, role } = await req.json();

    if (!email || !role) {
      return NextResponse.json(
        { error: "email and role are required" },
        { status: 400 }
      );
    }

    if (!["admin", "manager", "staff"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const tenantId = req.headers.get("x-tenant-id") ?? "";
    if (!tenantId) {
      return NextResponse.json({ error: "x-tenant-id header required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Invite user — Supabase sends them a magic link to set their password
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role, tenant_id: tenantId },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/login`,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Upsert their profile row immediately so the invite shows up in the list
    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        full_name: full_name ?? "",
        role,
        tenant_id: tenantId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
