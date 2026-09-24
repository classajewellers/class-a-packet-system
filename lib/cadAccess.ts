import type { SupabaseClient } from "@supabase/supabase-js";
import { CAD_DESIGNER_SLUG, pathwayStepIndex } from "@/lib/cadStage";

export async function profileIsCadDesigner(
  supabase: SupabaseClient,
  tenantId: string,
  profileId: string
): Promise<boolean> {
  const { data: role, error: roleErr } = await supabase
    .from("workshop_roles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("slug", CAD_DESIGNER_SLUG)
    .eq("active", true)
    .maybeSingle();
  if (roleErr || !role) return false;

  const { data: link, error: linkErr } = await supabase
    .from("profile_workshop_roles")
    .select("profile_id")
    .eq("tenant_id", tenantId)
    .eq("profile_id", profileId)
    .eq("workshop_role_id", role.id)
    .maybeSingle();
  return !linkErr && !!link;
}

export async function nameIsCadDesigner(
  supabase: SupabaseClient,
  tenantId: string,
  name: string
): Promise<boolean> {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return false;

  const { data: role, error: roleErr } = await supabase
    .from("workshop_roles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("slug", CAD_DESIGNER_SLUG)
    .eq("active", true)
    .maybeSingle();
  if (roleErr || !role) return false;

  const { data: links, error: linkErr } = await supabase
    .from("profile_workshop_roles")
    .select("profile_id")
    .eq("tenant_id", tenantId)
    .eq("workshop_role_id", role.id);
  if (linkErr || !links?.length) return false;

  const ids = links.map((row) => row.profile_id as string);
  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (profileErr) return false;

  return (profiles ?? []).some((row) => (row.full_name ?? "").trim().toLowerCase() === wanted);
}

export async function latestApprovedCadVersion(
  supabase: SupabaseClient,
  tenantId: string,
  packetId: string,
  exceptId?: string
): Promise<{ id: string; version_number: number } | null> {
  const { data, error } = await supabase
    .from("workshop_cad_versions")
    .select("id, version_number")
    .eq("tenant_id", tenantId)
    .eq("packet_id", packetId)
    .eq("status", "approved")
    .order("version_number", { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);
  const row = (data ?? []).find((item) => item.id !== exceptId);
  return row ? { id: row.id as string, version_number: row.version_number as number } : null;
}

export async function pathwayStepUpdate(
  supabase: SupabaseClient,
  tenantId: string,
  pathwayId: string | null | undefined,
  stageKey: string
): Promise<number | null> {
  if (!pathwayId) return null;
  const { data, error } = await supabase
    .from("workshop_pathways")
    .select("steps")
    .eq("tenant_id", tenantId)
    .eq("id", pathwayId)
    .maybeSingle();
  if (error || !data) return null;
  const steps = Array.isArray(data.steps) ? data.steps as { name?: string }[] : [];
  return pathwayStepIndex(steps, stageKey);
}
