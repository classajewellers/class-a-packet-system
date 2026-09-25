import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { loadWorkshopTeamMembers } from "@/lib/workshopTeam";

export const dynamic = "force-dynamic";

// New Job staff names. Migration 166 dropped workshop_team_members.
// Role-tagged logins are the roster now. An empty tenant must not look
// like an empty roster.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) {
    return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  }
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const { members, error } = await loadWorkshopTeamMembers(supabase, tenantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ members });
  } catch (err: unknown) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
