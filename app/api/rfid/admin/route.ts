import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/rfid/admin
// Returns printers, bridge installations, and recent print job stats for the tenant.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const [
    { data: printers },
    { data: bridges },
    { data: recentJobs },
    { data: activeTags },
  ] = await Promise.all([
    supabase
      .from("rfid_printers")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),

    supabase
      .from("rfid_bridge_installations")
      .select("id, display_name, is_active, last_heartbeat_at, bridge_version, printer_id, last_error")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),

    supabase
      .from("print_jobs")
      .select("id, status, requested_at, completed_at, failed_at, last_error, piece_id")
      .eq("tenant_id", tenantId)
      .order("requested_at", { ascending: false })
      .limit(20),

    supabase
      .from("inventory_rfid_tags")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
  ]);

  return NextResponse.json({
    printers:    printers ?? [],
    bridges:     bridges  ?? [],
    recent_jobs: recentJobs ?? [],
    active_tag_count: (activeTags as any)?.length ?? 0,
  });
}
