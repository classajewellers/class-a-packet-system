import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    const [
      { data: teamMembers,    error: e1 },
      { data: subcontractors, error: e2 },
      { data: valuers,        error: e3 },
      { data: pathways,       error: e4 },
      { data: messages,       error: e5 },
      { data: leadTimes,      error: e6 },
      { data: categories,     error: e7 },
      { data: stages,         error: e8 },
      { data: locations,      error: e9 },
    ] = await Promise.all([
      supabase.from("workshop_team_members").select("*").eq("tenant_id", tenantId).order("sort_order"),
      supabase.from("workshop_subcontractors").select("*").eq("tenant_id", tenantId).order("sort_order"),
      supabase.from("workshop_valuers").select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("workshop_pathways").select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("workshop_manager_messages").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20),
      supabase.from("workshop_lead_times").select("*").eq("tenant_id", tenantId),
      supabase.from("workshop_stage_categories").select("*").eq("tenant_id", tenantId).order("sort_order"),
      supabase.from("workshop_stages").select("*").eq("tenant_id", tenantId).order("sort_order"),
      supabase.from("workshop_locations").select("*").eq("tenant_id", tenantId).order("sort_order"),
    ]);

    // Log any query-level errors — these don't throw, so they're invisible without this
    const queryErrors = { e1, e2, e3, e4, e5, e6, e7, e8, e9 };
    for (const [key, err] of Object.entries(queryErrors)) {
      if (err) console.error(`[workshop/config] query ${key} failed:`, err.code, err.message, err.details);
    }

    return NextResponse.json({
      teamMembers:    teamMembers    ?? [],
      subcontractors: subcontractors ?? [],
      valuers:        valuers        ?? [],
      pathways:       pathways       ?? [],
      messages:       messages       ?? [],
      leadTimes:      leadTimes      ?? [],
      categories:     categories     ?? [],
      stages:         stages         ?? [],
      locations:      locations      ?? [],
      // Surface any config-table errors to the client so the board can show a banner
      configError: e7?.message ?? e8?.message ?? e9?.message ?? null,
    });
  } catch (err) {
    console.error("[workshop/config] unexpected error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
