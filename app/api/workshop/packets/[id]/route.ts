import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { fireReadyForPickupZap } from "@/lib/zapier";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = [
  "status", "job_type", "assigned_to", "due_date",
  "articles", "instructions", "internal_notes",
  "total_charges", "deposit", "balance",
  "customer_first_name", "customer_last_name",
  "customer_email", "customer_phone",
  "staff_member", "valuation_required",
];

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

    // Fetch current record when we need previous state
    const needsCurrent =
      body.status === "ready" ||
      updates.total_charges !== undefined ||
      updates.deposit !== undefined;

    let current: { status?: string | null; total_charges?: number | null; deposit?: number | null } | null = null;
    if (needsCurrent) {
      const { data } = await supabase
        .from("packets")
        .select("status, total_charges, deposit")
        .eq("id", params.id)
        .single();
      current = data;
    }

    // Status side-effects
    if (body.status !== undefined) {
      updates.status_updated_at = new Date().toISOString();
      if (body.status === "ready") updates.collection_notified_at = new Date().toISOString();
      if (body.status === "collected") updates.collected_at = new Date().toISOString();
    }

    // Recalculate balance if charges/deposit changed
    if (updates.total_charges !== undefined || updates.deposit !== undefined) {
      const charges = Number(updates.total_charges ?? current?.total_charges ?? 0);
      const deposit = Number(updates.deposit ?? current?.deposit ?? 0);
      updates.balance = Math.max(0, charges - deposit);
    }

    let q = supabase.from("packets").update(updates).eq("id", params.id);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data, error } = await q.select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Zap 2 — Ready for Pickup SMS: only when transitioning TO 'ready'
    if (body.status === "ready" && current?.status !== "ready" && data) {
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
