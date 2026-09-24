import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";
import { pathwayStepUpdate } from "@/lib/cadAccess";
import { CAD_DESIGN_STATUS, CASTING_STATUS, type CadVersionStatus } from "@/lib/cadStage";

export const dynamic = "force-dynamic";

const ACTIONS = ["approve", "request_changes", "reject"] as const;
type DecisionAction = (typeof ACTIONS)[number];

function nextStatus(action: DecisionAction): CadVersionStatus {
  if (action === "approve") return "approved";
  if (action === "request_changes") return "changes_requested";
  return "rejected";
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; versionId: string } }
): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId, userId } = auth.ctx;

  try {
    const body = await req.json();
    const action = body.action as DecisionAction;
    const note = String(body.note ?? "").trim();
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Action must be approve, request_changes, or reject." }, { status: 400 });
    }
    if (action !== "approve" && !note) {
      return NextResponse.json(
        { error: action === "reject" ? "A reject reason is required." : "A change note is required." },
        { status: 400 }
      );
    }

    const supabase = await createTenantSupabaseClient(tenantId);
    const { data: packet, error: packetErr } = await supabase
      .from("packets")
      .select("id, status, pending_customer_approval, workshop_pathway_id, cad_required")
      .eq("tenant_id", tenantId)
      .eq("id", params.id)
      .maybeSingle();
    if (packetErr) return NextResponse.json({ error: packetErr.message }, { status: 500 });
    if (!packet) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (packet.pending_customer_approval) {
      return NextResponse.json(
        { error: "This order is pending manager approval. Approve the order before reviewing CAD." },
        { status: 422 }
      );
    }

    const { data: version, error: versionErr } = await supabase
      .from("workshop_cad_versions")
      .select("id, status, version_number")
      .eq("tenant_id", tenantId)
      .eq("packet_id", params.id)
      .eq("id", params.versionId)
      .maybeSingle();
    if (versionErr) return NextResponse.json({ error: versionErr.message }, { status: 500 });
    if (!version) return NextResponse.json({ error: "CAD version not found" }, { status: 404 });
    if (version.status !== "pending") {
      return NextResponse.json({ error: "This version has already been decided. Upload a new version to review again." }, { status: 422 });
    }

    const decidedAt = new Date().toISOString();
    const { error: decideErr } = await supabase
      .from("workshop_cad_versions")
      .update({
        status: nextStatus(action),
        decision_note: note || null,
        decided_by: userId,
        decided_at: decidedAt,
      })
      .eq("tenant_id", tenantId)
      .eq("id", version.id);
    if (decideErr) return NextResponse.json({ error: decideErr.message }, { status: 500 });

    const packetUpdate: Record<string, unknown> = {};
    if (action === "approve") {
      packetUpdate.status = CASTING_STATUS;
      packetUpdate.workshop_intake_substatus = null;
      packetUpdate.status_updated_at = decidedAt;
      const step = await pathwayStepUpdate(supabase, tenantId, packet.workshop_pathway_id, CASTING_STATUS);
      if (step !== null) packetUpdate.workshop_step_index = step;
    } else if (action === "request_changes") {
      packetUpdate.status = CAD_DESIGN_STATUS;
      packetUpdate.workshop_intake_substatus = null;
      packetUpdate.status_updated_at = decidedAt;
      const step = await pathwayStepUpdate(supabase, tenantId, packet.workshop_pathway_id, CAD_DESIGN_STATUS);
      if (step !== null) packetUpdate.workshop_step_index = step;
    }

    let updatedPacket = null;
    if (Object.keys(packetUpdate).length > 0) {
      const { data, error } = await supabase
        .from("packets")
        .update(packetUpdate)
        .eq("tenant_id", tenantId)
        .eq("id", params.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      updatedPacket = data;
    } else {
      const { data } = await supabase.from("packets").select("*").eq("tenant_id", tenantId).eq("id", params.id).single();
      updatedPacket = data;
    }

    await supabase.from("packet_activity_log").insert({
      packet_id: params.id,
      tenant_id: tenantId,
      event_type: "cad_decision",
      old_value: { version_id: version.id, version_number: version.version_number, status: "pending" },
      new_value: { version_id: version.id, version_number: version.version_number, action, note: note || null },
    });

    return NextResponse.json({ packet: updatedPacket });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
