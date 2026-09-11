import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { verifyStaffPin } from "@/lib/verifyStaffPin";
import { phoneMatchKey } from "@/lib/normalizePhone";
import { LEAD_SOURCE_VALUES, LEAD_STATUSES, Lead } from "@/lib/leads";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CustomerMatch {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

/** Lightweight lookup of same-tenant customers matching the lead's email or
 *  phone. Returns the distinct set of candidate customers. Matching is done in
 *  JS so AU country-code / trunk-zero formatting differences still match. */
async function matchCustomers(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  tenantId: string,
  email: string | null,
  phone: string | null
): Promise<CustomerMatch[]> {
  const byId = new Map<string, CustomerMatch>();

  if (email) {
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name, email, phone")
      .eq("tenant_id", tenantId)
      .ilike("email", email.trim());
    for (const c of (data ?? []) as CustomerMatch[]) byId.set(c.id, c);
  }

  if (phone) {
    const key = phoneMatchKey(phone);
    // Cheap prefilter on the last 4 digits (survives most formatting), then
    // refine in JS on the full 9-digit subscriber key.
    const last4 = key.slice(-4);
    if (last4.length === 4) {
      const { data } = await supabase
        .from("customers")
        .select("id, first_name, last_name, email, phone")
        .eq("tenant_id", tenantId)
        .not("phone", "is", null)
        .ilike("phone", `%${last4}%`);
      for (const c of (data ?? []) as CustomerMatch[]) {
        if (phoneMatchKey(c.phone) === key) byId.set(c.id, c);
      }
    }
  }

  return Array.from(byId.values());
}

// ── GET /api/leads?status=new — list, optionally filtered by status ──────────
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    let query = supabase
      .from("leads")
      .select("*")
      .order("next_action_date", { ascending: true });
    if (tenantId) query = query.eq("tenant_id", tenantId);

    const statusFilter = req.nextUrl.searchParams.get("status");
    if (statusFilter && LEAD_STATUSES.includes(statusFilter as never)) {
      query = query.eq("status", statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[leads] GET error:", error.message);
      return NextResponse.json({ leads: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json(
      { leads: (data ?? []) as Lead[] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[leads] GET fatal:", err);
    return NextResponse.json({ leads: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}

// ── POST /api/leads — create a lead (PIN-gated) ──────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    interested_in?: string;
    source?: string;
    next_action_date?: string;
    pinName?: string;
    pin?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  const name = body.name?.trim();
  const phone = body.phone?.trim() || null;
  const email = body.email?.trim() || null;
  const interested_in = body.interested_in?.trim();
  const source = body.source?.trim();
  const next_action_date = body.next_action_date?.trim();

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!phone && !email)
    return NextResponse.json({ error: "At least one contact method (phone or email) is required" }, { status: 400 });
  if (!interested_in)
    return NextResponse.json({ error: "Interested in is required" }, { status: 400 });
  if (!source || !LEAD_SOURCE_VALUES.includes(source as never))
    return NextResponse.json({ error: "A valid source is required" }, { status: 400 });
  if (!next_action_date || !/^\d{4}-\d{2}-\d{2}$/.test(next_action_date))
    return NextResponse.json({ error: "A next action date (YYYY-MM-DD) is required" }, { status: 400 });

  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  // ── PIN gate + attribution (server-enforced) ───────────────────────────────
  const pinResult = await verifyStaffPin(supabase, tenantId, body.pinName, body.pin);
  if (!pinResult.ok) {
    return NextResponse.json({ error: pinResult.error }, { status: pinResult.status });
  }

  // ── Background customer matching (never auto-link on ambiguity) ─────────────
  const matches = await matchCustomers(supabase, tenantId, email, phone);
  const linked_customer_id = matches.length === 1 ? matches[0].id : null;

  const { data, error } = await supabase
    .from("leads")
    .insert({
      tenant_id: tenantId,
      name,
      phone,
      email: email ? email.toLowerCase() : null,
      interested_in,
      source,
      next_action_date,
      status: "new",
      linked_customer_id,
      created_by_staff_id: pinResult.staff.id,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[leads] POST insert failed:", error?.message);
    return NextResponse.json({ error: error?.message ?? "Failed to create lead" }, { status: 500 });
  }

  return NextResponse.json({
    lead: data as Lead,
    // If >1 customer matched we leave the link null and let staff confirm.
    possible_matches: matches.length > 1 ? matches : [],
  });
}
