import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { Quote } from "@/lib/types";
import { PIPELINE_STAGES, PipelineStage } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId);
  const q = supabase.from("quotes").select("*").eq("id", params.id);
  const { data, error } = await (tenantId ? q.eq("tenant_id", tenantId) : q).single();

  if (error || !data) {
    console.error("[quotes/[id]] GET failed:", { id: params.id, code: error?.code, message: error?.message });
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  return NextResponse.json({ quote: data as Quote });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  let body: {
    status?: string;
    assigned_to?: string | null;
    follow_up_date?: string | null;
    accepted_option?: number | null;
    quote_builder_data?: Record<string, unknown> | null;
    quoted_price?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  const now = new Date().toISOString();

  // ── Status / stage change ─────────────────────────────────────────────────
  if (body.status !== undefined) {
    updates.status = body.status;
    updates.status_changed_at = now;

    // Record the timestamp for the specific stage entered
    const stageTimestampMap: Record<PipelineStage, string> = {
      pending:     "pending_at",
      follow_up_1: "follow_up_1_at",
      follow_up_2: "follow_up_2_at",
      job_won:     "job_won_at",
      job_lost:    "job_lost_at",
    };
    if (PIPELINE_STAGES.includes(body.status as PipelineStage)) {
      updates[stageTimestampMap[body.status as PipelineStage]] = now;
    }
  }

  // ── Assigned To ───────────────────────────────────────────────────────────
  if ("assigned_to" in body) {
    updates.assigned_to = body.assigned_to ?? null;
  }

  // ── Follow Up Date ────────────────────────────────────────────────────────
  if ("follow_up_date" in body) {
    updates.follow_up_date = body.follow_up_date ?? null;
  }

  // ── Accepted Option (stone option index) ──────────────────────────────────
  if ("accepted_option" in body) {
    updates.accepted_option = body.accepted_option ?? null;
  }

  // ── Quote Builder Data (append-item flow) ─────────────────────────────────
  if ("quote_builder_data" in body) {
    updates.quote_builder_data = body.quote_builder_data ?? null;
  }
  if ("quoted_price" in body) {
    updates.quoted_price = body.quoted_price ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const tenantId = req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId);
  const pq = supabase.from("quotes").update(updates).eq("id", params.id);
  const { data, error } = await (tenantId ? pq.eq("tenant_id", tenantId) : pq).select().single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Update failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ quote: data as Quote });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  console.log("[DELETE quote] id:", params.id);
  const tenantId = req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId);

  // Clear FK reference on packets before deleting to avoid constraint errors
  const { error: clearErr } = await supabase
    .from("quotes")
    .update({ converted_to_packet_id: null })
    .eq("id", params.id);
  if (clearErr) {
    console.warn("[DELETE quote] FK clear failed (non-fatal):", clearErr.message);
  }

  // Delete related notifications (notifications.quote_id FK blocks deletion)
  const { error: notifErr } = await supabase
    .from("notifications")
    .delete()
    .eq("quote_id", params.id);
  if (notifErr) {
    console.warn("[DELETE quote] notifications clear failed (non-fatal):", notifErr.message);
  }

  const dq = supabase.from("quotes").delete().eq("id", params.id);
  const { error } = await (tenantId ? dq.eq("tenant_id", tenantId) : dq);

  if (error) {
    console.error("[DELETE quote] error:", error);
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }

  console.log("[DELETE quote] success — id:", params.id);
  return NextResponse.json({ success: true });
}
