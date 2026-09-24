import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { MIN_PASSWORD, replaceWorkshopRoleTags } from "@/lib/workshopTeam";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const auth = await requireManager(req);
    if (!auth.ok) return auth.response;
    const tenantId = auth.ctx.tenantId;
    const profileId = params.id;

    const body = await req.json();
    const supabase = createServerSupabaseClient();

    const { data: existing, error: loadError } = await supabase
      .from("profiles")
      .select("id, role, auth_user_id")
      .eq("id", profileId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const fullName = body.name.trim();
      if (!fullName) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      updates.full_name = fullName;
    }

    if (body.role !== undefined) {
      if (body.role !== "staff" && body.role !== "manager") {
        return NextResponse.json({ error: "System role must be staff or manager" }, { status: 400 });
      }
      if (existing.role !== "admin") updates.role = body.role;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", profileId)
        .eq("tenant_id", tenantId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (Array.isArray(body.workshop_role_tag_ids)) {
      const roleIds = body.workshop_role_tag_ids.filter((id: unknown) => typeof id === "string") as string[];
      const tagError = await replaceWorkshopRoleTags(supabase, tenantId, profileId, roleIds);
      if (tagError) return NextResponse.json({ error: tagError }, { status: 400 });
    }

    if (typeof body.password === "string" && body.password.length > 0) {
      if (body.password.length < MIN_PASSWORD) {
        return NextResponse.json(
          { error: `Temporary password must be at least ${MIN_PASSWORD} characters` },
          { status: 400 }
        );
      }
      const authUserId = existing.auth_user_id ?? existing.id;
      const { error } = await supabase.auth.admin.updateUserById(authUserId, {
        password: body.password,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
