// Lightweight health check for the webhook_events staging table (migration
// 136). Surfaces rows stuck in 'received' or 'processing' beyond a
// reasonable window — the signal that would have caught order #3690 sitting
// unprocessed rather than relying on a customer or staff member noticing.
//
// Deliberately NOT a cron job: this repo has no scheduling infrastructure,
// so "reasonable window" visibility comes from staff opening a page that
// already gets checked regularly (Vault Brain / Settings), not from a
// background sweep. See the Phase 2 reconciliation-job note in the original
// investigation for the fuller, scheduled version of this.
import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const STUCK_THRESHOLD_MINUTES = 10;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) {
    return NextResponse.json({ error: "x-tenant-id header required" }, { status: 400 });
  }

  const supabase = await createTenantSupabaseClient(tenantId);
  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MINUTES * 60_000).toISOString();

  const { data, error } = await supabase
    .from("webhook_events")
    .select("id, source, topic, external_id, status, received_at")
    .eq("tenant_id", tenantId)
    .in("status", ["received", "processing"])
    .lt("received_at", cutoff)
    .order("received_at", { ascending: true });

  if (error) {
    console.error("[webhook-events/health] query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const stuck = data ?? [];
  const oldest = stuck[0] ?? null;
  const oldestMinutes = oldest
    ? Math.round((Date.now() - new Date(oldest.received_at).getTime()) / 60_000)
    : null;

  return NextResponse.json({
    stuckCount: stuck.length,
    oldestMinutes,
    events: stuck,
  });
}
