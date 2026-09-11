import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { verifyStaffPin } from "@/lib/verifyStaffPin";
import { LEAD_SOURCE_VALUES, LEAD_STATUSES, Lead } from "@/lib/leads";

export const dynamic = "force-dynamic";

// ── PATCH /api/leads/[id] — update status / next_action_date / link / fields ──
// A status change (e.g. "mark contacted") is PIN-gated. Non-status housekeeping
// edits (next action date, manual customer link, corrections) are allowed for
// any authenticated staff on the shared session.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  let body: {
    status?: string;
    next_action_date?: string | null;
    linked_customer_id?: string | null;
    name?: string;
    phone?: string | null;
    email?: string | null;
    interested_in?: string;
    source?: string;
    pinName?: string;
    pin?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const updates: Record<string, unknown> = {};

  // ── Status change — validated + PIN-gated ──────────────────────────────────
  if (body.status !== undefined) {
    if (!LEAD_STATUSES.includes(body.status as never)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const pinResult = await verifyStaffPin(supabase, tenantId, body.pinName, body.pin);
    if (!pinResult.ok) {
      return NextResponse.json({ error: pinResult.error }, { status: pinResult.status });
    }
    updates.status = body.status;
  }

  // ── Non-status edits ───────────────────────────────────────────────────────
  if ("next_action_date" in body) {
    const d = body.next_action_date?.trim();
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return NextResponse.json({ error: "next_action_date must be YYYY-MM-DD" }, { status: 400 });
    }
    updates.next_action_date = d;
  }
  if ("linked_customer_id" in body) {
    updates.linked_customer_id = body.linked_customer_id || null;
  }
  if (body.name !== undefined) {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    updates.name = n;
  }
  if ("phone" in body) updates.phone = body.phone?.trim() || null;
  if ("email" in body) updates.email = body.email?.trim().toLowerCase() || null;
  if (body.interested_in !== undefined) {
    const v = body.interested_in.trim();
    if (!v) return NextResponse.json({ error: "Interested in cannot be empty" }, { status: 400 });
    updates.interested_in = v;
  }
  if (body.source !== undefined) {
    if (!LEAD_SOURCE_VALUES.includes(body.source as never)) {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }
    updates.source = body.source;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();

  const q = supabase.from("leads").update(updates).eq("id", params.id);
  const { data, error } = await (tenantId ? q.eq("tenant_id", tenantId) : q).select().single();

  if (error || !data) {
    // The phone-or-email CHECK constraint surfaces here if both are cleared.
    console.error("[leads/[id]] PATCH failed:", error?.message);
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ lead: data as Lead });
}
