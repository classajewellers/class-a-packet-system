import type { SupabaseClient } from "@supabase/supabase-js";

export const MIN_PASSWORD = 8;

/** Replace a profile's workshop tags. Role ids must belong to the tenant. Returns an error message, or null. */
export async function replaceWorkshopRoles(
  supabase: SupabaseClient,
  tenantId: string,
  profileId: string,
  roleIds: string[]
): Promise<string | null> {
  const unique = Array.from(new Set(roleIds));
  if (unique.length > 0) {
    const { data, error } = await supabase
      .from("workshop_roles")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", unique);
    if (error) return error.message;
    if ((data ?? []).length !== unique.length) {
      return "One or more workshop roles are not available for this store";
    }
  }

  const { error: delErr } = await supabase
    .from("profile_workshop_roles")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("profile_id", profileId);
  if (delErr) return delErr.message;

  if (unique.length === 0) return null;

  const { error: insErr } = await supabase.from("profile_workshop_roles").insert(
    unique.map((workshop_role_id) => ({
      tenant_id: tenantId,
      profile_id: profileId,
      workshop_role_id,
    }))
  );
  return insErr?.message ?? null;
}

/**
 * Workshop team list that used to be workshop_team_members.
 *
 * A person appears here when their profile has at least one active workshop
 * role tag (Jeweller, CAD Designer, or a later tag). System role
 * (admin/manager/staff) is not a workshop tag.
 *
 * profile_id is intentionally null on this projection. The workshop Assign To
 * control already writes packets.assigned_to when profile_id is set, and
 * writes workshop_subcontractor_name when it is not. Part C keeps the name
 * path the old list used. Part E is the change that points Assign To at the
 * real profile id.
 */
export interface WorkshopTeamMember {
  id: string;
  tenant_id: string;
  name: string;
  profile_id: null;
  sort_order: number;
  active: boolean;
  workshop_role_slugs: string[];
}

interface RoleRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}

interface LinkRow {
  profile_id: string;
  workshop_role_id: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
}

export async function loadWorkshopTeamMembers(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ members: WorkshopTeamMember[]; error: { message: string } | null }> {
  const [rolesRes, linksRes, profilesRes] = await Promise.all([
    supabase
      .from("workshop_roles")
      .select("id, slug, name, active")
      .eq("tenant_id", tenantId)
      .eq("active", true),
    supabase
      .from("profile_workshop_roles")
      .select("profile_id, workshop_role_id")
      .eq("tenant_id", tenantId),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("tenant_id", tenantId),
  ]);

  const error = rolesRes.error ?? linksRes.error ?? profilesRes.error;
  if (error) {
    return { members: [], error: { message: error.message } };
  }

  const roles = (rolesRes.data ?? []) as RoleRow[];
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const slugsByProfile = new Map<string, string[]>();
  for (const link of (linksRes.data ?? []) as LinkRow[]) {
    const role = roleById.get(link.workshop_role_id);
    const profile = profileById.get(link.profile_id);
    if (!role || !profile) continue;
    const name = (profile.full_name ?? "").trim();
    if (!name) continue;
    const list = slugsByProfile.get(link.profile_id) ?? [];
    list.push(role.slug);
    slugsByProfile.set(link.profile_id, list);
  }

  const members: WorkshopTeamMember[] = [];
  for (const [profileId, slugs] of Array.from(slugsByProfile.entries())) {
    const profile = profileById.get(profileId);
    if (!profile) continue;
    members.push({
      id: profileId,
      tenant_id: tenantId,
      name: (profile.full_name ?? "").trim(),
      profile_id: null,
      sort_order: 0,
      active: true,
      workshop_role_slugs: slugs,
    });
  }

  members.sort((a, b) => a.name.localeCompare(b.name));
  members.forEach((m, i) => {
    m.sort_order = i + 1;
  });

  return { members, error: null };
}
