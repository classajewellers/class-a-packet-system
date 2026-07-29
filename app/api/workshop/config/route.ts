import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const [
      { data: teamMembers },
      { data: subcontractors },
      { data: valuers },
      { data: pathways },
      { data: messages },
      { data: leadTimes },
    ] = await Promise.all([
      supabase.from("workshop_team_members").select("*").eq("tenant_id", tenantId).order("sort_order"),
      supabase.from("workshop_subcontractors").select("*").eq("tenant_id", tenantId).order("sort_order"),
      supabase.from("workshop_valuers").select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("workshop_pathways").select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("workshop_manager_messages").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20),
      supabase.from("workshop_lead_times").select("*").eq("tenant_id", tenantId),
    ]);
    return NextResponse.json({
      teamMembers: teamMembers ?? [],
      subcontractors: subcontractors ?? [],
      valuers: valuers ?? [],
      pathways: pathways ?? [],
      messages: messages ?? [],
      leadTimes: leadTimes ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
