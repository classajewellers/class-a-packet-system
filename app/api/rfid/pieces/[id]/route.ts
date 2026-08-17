import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/rfid/pieces/[id]
// Returns the RFID tag and active print job status for a given piece_id.
// Used by the piece detail page to poll for print job completion.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const [{ data: activeTag }, { data: activeJob }] = await Promise.all([
    supabase
      .from("inventory_rfid_tags")
      .select("id, epc, status, activated_at, print_job_id")
      .eq("inventory_piece_id", params.id)
      .eq("status", "active")
      .maybeSingle(),

    supabase
      .from("print_jobs")
      .select("id, status, requested_at, completed_at, failed_at, last_error, rfid_tag_id")
      .eq("piece_id", params.id)
      .in("status", ["queued", "claimed", "printing"])
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Also fetch the most recent completed/failed job if no active job
  let recentJob = activeJob;
  if (!recentJob) {
    const { data: lastJob } = await supabase
      .from("print_jobs")
      .select("id, status, requested_at, completed_at, failed_at, last_error, rfid_tag_id")
      .eq("piece_id", params.id)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    recentJob = lastJob;
  }

  return NextResponse.json({
    active_tag:  activeTag  ?? null,
    active_job:  activeJob  ?? null,
    recent_job:  recentJob  ?? null,
  });
}
