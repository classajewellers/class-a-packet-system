import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { fireReadyForPickupZap } from "@/lib/zapier";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = [
  "status",
  "job_type",
  "assigned_to",
  "due_date",
  "articles",
  "instructions",
  "item_specifications",
  "internal_notes",
  "total_charges",
  "deposit",
  "balance",
  "customer_first_name",
  "customer_last_name",
  "customer_email",
  "customer_phone",
  "customer_id",
  "staff_member",
  "valuation_required",
  "workshop_subcontractor_name",
  "workshop_pathway_id",
  "workshop_step_index",
  "workshop_intake_substatus",
  "workshop_needs_valuation",
  "workshop_valuer",
  "workshop_supplier",
  "workshop_po_number",
  "blocked_reason",
  "blocked_note",
  "blocked_at",
];

// Fields that trigger a revert to intake/pre_check when the packet is not already in intake
const INTAKE_TRIGGER_FIELDS = ["due_date", "instructions", "articles", "item_specifications"];

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    let q = supabase.from("packets").select("*").eq("id", params.id);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q.single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ packet: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const body = await req.json();
    const supabase = await createTenantSupabaseClient(tenantId);

    const updates: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in body) updates[field] = body[field];
    }

    // Determine if we need to fetch the current record:
    // - status side-effect check (ready zap transition guard)
    // - balance recalculation needs previous charges/deposit
    // - business rule: intake trigger fields need current status
    // - workshop_needs_valuation auto-set needs current total_charges
    const intakeTriggerPresent = INTAKE_TRIGGER_FIELDS.some((f) => f in body);
    const needsCurrent =
      body.status === "ready" ||
      body.status === "to_be_valued" ||
      updates.total_charges !== undefined ||
      updates.deposit !== undefined ||
      intakeTriggerPresent ||
      updates.workshop_step_index !== undefined ||
      updates.assigned_to !== undefined ||
      updates.workshop_subcontractor_name !== undefined ||
      updates.workshop_valuer !== undefined;

    let current: {
      status?: string | null;
      total_charges?: number | null;
      deposit?: number | null;
      workshop_needs_valuation?: boolean | null;
      workshop_valuer?: string | null;
      assigned_to?: string | null;
      workshop_subcontractor_name?: string | null;
      workshop_step_index?: number | null;
    } | null = null;

    if (needsCurrent) {
      const { data } = await supabase
        .from("packets")
        .select("status, total_charges, deposit, workshop_needs_valuation, workshop_valuer, assigned_to, workshop_subcontractor_name, workshop_step_index")
        .eq("id", params.id)
        .single();
      current = data;
    }

    // Business rule: if any intake-trigger field is present and packet is NOT currently in 'intake',
    // force it back to intake / pre_check
    if (intakeTriggerPresent && current?.status && current.status !== "intake") {
      updates.status = "intake";
      updates.workshop_intake_substatus = "pre_check";
      updates.status_updated_at = new Date().toISOString();
    }

    // Status side-effects (only set if status is changing via body or the rule above)
    const incomingStatus = (updates.status ?? body.status) as string | undefined;
    if (body.status !== undefined || (intakeTriggerPresent && current?.status !== "intake")) {
      if (!updates.status_updated_at) {
        updates.status_updated_at = new Date().toISOString();
      }
      if (incomingStatus === "ready") {
        // Valuation gate: job must have passed through 'to_be_valued' if it requires valuation
        const needsVal = updates.workshop_needs_valuation !== undefined
          ? updates.workshop_needs_valuation
          : current?.workshop_needs_valuation;
        if (needsVal && current?.status !== "to_be_valued") {
          return NextResponse.json({
            error: "Valuation required. This job must be moved through the Valuation stage before being marked Ready for Collection.",
          }, { status: 422 });
        }
        updates.collection_notified_at = new Date().toISOString();
      }
      if (incomingStatus === "collected") updates.collected_at = new Date().toISOString();
      // Clear blocked state when status changes (DB trigger also does this; belt-and-suspenders)
      if (incomingStatus && incomingStatus !== current?.status) {
        if (!("blocked_reason" in updates)) updates.blocked_reason = null;
        if (!("blocked_note"   in updates)) updates.blocked_note   = null;
        if (!("blocked_at"     in updates)) updates.blocked_at     = null;
      }
    }

    // Auto-set workshop_needs_valuation when total_charges >= 3000
    // Apply after we know the resolved charges value
    if (updates.total_charges !== undefined || updates.deposit !== undefined) {
      const charges = Number(updates.total_charges ?? current?.total_charges ?? 0);
      const deposit = Number(updates.deposit ?? current?.deposit ?? 0);
      updates.balance = Math.max(0, charges - deposit);

      // Auto-set needs valuation based on resolved charges
      if (updates.total_charges !== undefined) {
        if (charges >= 3000) {
          updates.workshop_needs_valuation = true;
        }
      }
    }

    let q = supabase.from("packets").update(updates).eq("id", params.id);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q.select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Activity logging for notable field changes
    if (current) {
      const activityLogs: Record<string, unknown>[] = [];

      if (updates.workshop_step_index !== undefined &&
          Number(updates.workshop_step_index) !== Number(current.workshop_step_index)) {
        activityLogs.push({
          packet_id: params.id,
          tenant_id: tenantId || null,
          event_type: "step_advanced",
          old_value: { step_index: current.workshop_step_index ?? 0 },
          new_value: { step_index: updates.workshop_step_index },
        });
      }

      const assigneeChanged =
        (updates.assigned_to !== undefined && updates.assigned_to !== current.assigned_to) ||
        (updates.workshop_subcontractor_name !== undefined && updates.workshop_subcontractor_name !== current.workshop_subcontractor_name);
      if (assigneeChanged) {
        activityLogs.push({
          packet_id: params.id,
          tenant_id: tenantId || null,
          event_type: "assignment_changed",
          old_value: { assigned_to: current.assigned_to, subcontractor: current.workshop_subcontractor_name },
          new_value: { assigned_to: updates.assigned_to, subcontractor: updates.workshop_subcontractor_name },
        });
      }

      if (updates.workshop_valuer !== undefined && updates.workshop_valuer !== current.workshop_valuer) {
        activityLogs.push({
          packet_id: params.id,
          tenant_id: tenantId || null,
          event_type: "valuation_assigned",
          old_value: { valuer: current.workshop_valuer },
          new_value: { valuer: updates.workshop_valuer },
        });
      }

      if (activityLogs.length > 0) {
        await supabase.from("packet_activity_log").insert(activityLogs);
      }
    }

    // Zap 2 — Ready for Pickup SMS: only when transitioning TO 'ready'
    if (
      (body.status === "ready" || incomingStatus === "ready") &&
      current?.status !== "ready" &&
      data
    ) {
      fireReadyForPickupZap(data);
    }

    return NextResponse.json({ packet: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    let q = supabase.from("packets").delete().eq("id", params.id);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
