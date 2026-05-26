import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Quote } from "@/lib/types";
import { PIPELINE_STAGES, PipelineStage } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", params.id)
    .single();

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

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("quotes")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Update failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ quote: data as Quote });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  console.log("[DELETE quote] id:", params.id);
  const supabase = createServerSupabaseClient();

  // Clear FK reference on packets before deleting to avoid constraint errors
  const { error: clearErr } = await supabase
    .from("quotes")
    .update({ converted_to_packet_id: null })
    .eq("id", params.id);
  if (clearErr) {
    console.warn("[DELETE quote] FK clear failed (non-fatal):", clearErr.message);
  }

  const { error } = await supabase
    .from("quotes")
    .delete()
    .eq("id", params.id);

  if (error) {
    console.error("[DELETE quote] error:", error);
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }

  console.log("[DELETE quote] success — id:", params.id);
  return NextResponse.json({ success: true });
}
