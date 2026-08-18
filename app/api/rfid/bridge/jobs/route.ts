import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateBridgeAuth } from "@/lib/rfid-bridge-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/rfid/bridge/jobs
// Used by the bridge to poll for queued print jobs.
// Authentication: Bearer <bridge_api_key>
// Returns: up to 5 queued jobs for the tenant (oldest first).
export async function GET(req: NextRequest): Promise<NextResponse> {
  const identity = await validateBridgeAuth(req.headers.get("authorization"));
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Update heartbeat on bridge installation
  await supabase
    .from("rfid_bridge_installations")
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq("id", identity.installationId);

  // Fetch queued jobs for this tenant's printer
  let query = supabase
    .from("print_jobs")
    .select("id, piece_id, printer_id, rfid_tag_id, zpl_payload, label_data, label_template, status, requested_at")
    .eq("tenant_id", identity.tenantId)
    .eq("status", "queued")
    .order("requested_at", { ascending: true })
    .limit(5);

  // If the bridge has an associated printer, scope to that printer only
  if (identity.printerId) {
    query = query.eq("printer_id", identity.printerId);
  }

  const { data: jobs, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: jobs ?? [] });
}
