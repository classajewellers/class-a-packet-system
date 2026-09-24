import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { MIN_PASSWORD, replaceWorkshopRoles } from "@/lib/workshopTeam";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface WorkshopRoleTag {
  id: string;
  key: string;
  label: string;
  active: boolean;
  sort: number;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  auth_user_id: string | null;
  created_at: string;
}

interface LinkRow {
  profile_id: string;
  workshop_role_tag_id: string;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function loadRoleTags(supabase: ReturnType<typeof createServerSupabaseClient>, tenantId: string) {
  const { data, error } = await supabase
    .from("workshop_role_tags")
    .select("id, key, label, active, sort")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("sort", { ascending: true });
  return { tags: (data ?? []) as WorkshopRoleTag[], error };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireManager(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.ctx.tenantId;
    const supabase = createServerSupabaseClient();

    const [tagsRes, profilesRes, linksRes] = await Promise.all([
      loadRoleTags(supabase, tenantId),
      supabase
        .from("profiles")
        .select("id, full_name, email, role, auth_user_id, created_at")
        .eq("tenant_id", tenantId)
        .order("full_name", { ascending: true }),
      supabase
        .from("profile_workshop_roles")
        .select("profile_id, workshop_role_tag_id")
        .eq("tenant_id", tenantId),
    ]);

    const error = tagsRes.error ?? profilesRes.error ?? linksRes.error;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const tags = tagsRes.tags;
    const tagById = new Map(tags.map((r) => [r.id, r]));
    const tagsByProfile = new Map<string, WorkshopRoleTag[]>();
    for (const link of (linksRes.data ?? []) as LinkRow[]) {
      const tag = tagById.get(link.workshop_role_tag_id);
      if (!tag) continue;
      const list = tagsByProfile.get(link.profile_id) ?? [];
      list.push(tag);
      tagsByProfile.set(link.profile_id, list);
    }

    const members = ((profilesRes.data ?? []) as ProfileRow[]).map((p) => ({
      ...p,
      workshop_role_tags: (tagsByProfile.get(p.id) ?? []).sort((a, b) => a.sort - b.sort),
    }));

    return NextResponse.json({ tags, members });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireManager(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.ctx.tenantId;

    const body = await req.json();
    const fullName = String(body.name ?? "").trim();
    const email = String(body.email ?? "").toLowerCase().trim();
    const role = body.role === "manager" ? "manager" : body.role === "staff" ? "staff" : "";
    const password = String(body.password ?? "");
    const workshopRoleIds: string[] = Array.isArray(body.workshop_role_ids)
      ? body.workshop_role_ids.filter((id: unknown) => typeof id === "string")
      : [];

    if (!fullName || !email || !role) {
      return NextResponse.json({ error: "Name, email, and system role are required" }, { status: 400 });
    }
    if (!isEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD) {
      return NextResponse.json(
        { error: `Temporary password must be at least ${MIN_PASSWORD} characters` },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", email)
      .maybeSingle();
    if (existingProfile) {
      return NextResponse.json({ error: "A staff member with this email already exists" }, { status: 409 });
    }

    // Same direct-create path as store signup: confirmed email, no invite message.
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role, tenant_id: tenantId },
    });

    if (authError || !authData.user) {
      const message = authError?.message ?? "Failed to create account";
      const status = /already|registered|exists/i.test(message) ? 409 : 500;
      return NextResponse.json({ error: message }, { status });
    }

    const userId = authData.user.id;

    // handle_new_user already inserted a profile row. Upsert corrects tenant,
    // email, and the auth link — the same reason signup upserts.
    const { error: profileError } = await supabase.from("profiles").upsert(
      {
        id: userId,
        full_name: fullName,
        role,
        email,
        auth_user_id: userId,
        tenant_id: tenantId,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
      return NextResponse.json({ error: "Failed to finish setting up the account" }, { status: 500 });
    }

    if (workshopRoleIds.length > 0) {
      const tagError = await replaceWorkshopRoles(supabase, tenantId, userId, workshopRoleIds);
      if (tagError) {
        return NextResponse.json(
          { error: `Account created, but workshop roles could not be saved: ${tagError}`, id: userId },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, id: userId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
