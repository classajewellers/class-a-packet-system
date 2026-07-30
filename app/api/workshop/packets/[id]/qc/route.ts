import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { fireReadyForPickupZap } from "@/lib/zapier";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const body = await req.json();
    const { action, notes, inspector_name, revert_step_index } = body as {
      action: "pass" | "rework" | "fail";
      notes?: string;
      inspector_name?: string;
      revert_step_index?: number;
    };

    if (!["pass", "rework", "fail"].includes(action)) {
      return NextResponse.json({ error: "Invalid action. Use: pass | rework | fail" }, { status: 400 });
    }

    const supabase = await createTenantSupabaseClient(tenantId);

    const { data: pkt } = await supabase
      .from("packets")
      .select("status, workshop_needs_valuation, customer_id, customer_phone, customer_first_name, customer_last_name, reference_number")
      .eq("id", params.id)
      .single();

    if (!pkt) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    if (pkt.status !== "quality_check") {
      return NextResponse.json({
        error: `Job must be in Quality Control to record QC results. Current stage: ${pkt.status ?? "unknown"}`,
      }, { status: 422 });
    }

    const updates: Record<string, unknown> = { status_updated_at: new Date().toISOString() };

    if (action === "pass") {
      updates.status = pkt.workshop_needs_valuation ? "to_be_valued" : "ready";
      if (updates.status === "ready") updates.collection_notified_at = new Date().toISOString();
    } else if (action === "rework") {
      updates.status = "on_bench";
      updates.workshop_step_index = revert_step_index ?? 0;
    } else {
      updates.status = "intake";
      updates.workshop_intake_substatus = "pre_check";
      updates.workshop_step_index = 0;
    }

    let q = supabase.from("packets").update(updates).eq("id", params.id);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data: updated, error } = await q.select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Log QC action to activity log
    await supabase.from("packet_activity_log").insert({
      packet_id: params.id,
      tenant_id: tenantId || null,
      event_type: "qc_action",
      old_value: { status: "quality_check" },
      new_value: {
        action,
        status: updates.status,
        inspector_name: inspector_name ?? null,
        notes: notes ?? null,
        revert_step_index: revert_step_index ?? null,
      },
    });

    if (updates.status === "ready" && updated) {
      fireReadyForPickupZap(updated);
    }

    return NextResponse.json({ packet: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
