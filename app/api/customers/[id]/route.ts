import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  // id is URL-encoded customer email
  const email = decodeURIComponent(params.id).toLowerCase().trim();

  if (!email) {
    return NextResponse.json({ error: "Missing customer email" }, { status: 400 });
  }

  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const customerIdParam = req.nextUrl.searchParams.get("customer_id");
    const supabase = await createTenantSupabaseClient(tenantId);

    const pkQ = supabase.from("packets").select("*").ilike("customer_email", email).order("created_at", { ascending: false });
    const qtQ = supabase.from("quotes").select("*").ilike("customer_email", email).is("converted_to_packet_id", null).order("created_at", { ascending: false });
    const CUST_COLS = "notes, id, maiden_name, wishlist_notes, customer_followup_notes, first_name, last_name, phone, address, suburb, state, postcode";
    // Prefer UUID lookup (immune to email being cleared) over email lookup
    const custQ = customerIdParam
      ? supabase.from("customers").select(CUST_COLS).eq("id", customerIdParam)
      : supabase.from("customers").select(CUST_COLS).ilike("email", email);

    const [packetsResult, quotesResult, notesResult] = await Promise.all([
      (tenantId ? pkQ.eq("tenant_id", tenantId) : pkQ),
      (tenantId ? qtQ.eq("tenant_id", tenantId) : qtQ),
      (tenantId ? custQ.eq("tenant_id", tenantId) : custQ).maybeSingle(),
    ]);

    const packets = packetsResult.data ?? [];
    const quotes  = quotesResult.data  ?? [];
    const cust                    = notesResult.data;
    const notes                   = cust?.notes ?? null;
    const customerId              = cust?.id ?? null;
    const maiden_name             = cust?.maiden_name ?? null;
    const wishlist_notes          = cust?.wishlist_notes ?? null;
    const customer_followup_notes = cust?.customer_followup_notes ?? null;

    // If a customers row exists, it is the source of truth — use its values even if null
    // (a null value means the user explicitly cleared it; don't fall back to packet data).
    // Only fall back to packet/quote data when no customers row exists yet.
    const latest = packets[0] ?? quotes[0] ?? null;
    const customer = {
      email,
      phone:      cust ? cust.phone      : (latest?.customer_phone      ?? null),
      first_name: cust ? cust.first_name : (latest?.customer_first_name ?? null),
      last_name:  cust ? cust.last_name  : (latest?.customer_last_name  ?? null),
      street:     cust ? cust.address    : (latest?.customer_street     ?? null),
      suburb:     cust ? cust.suburb     : (latest?.customer_suburb     ?? null),
      state:      cust ? cust.state      : (latest?.customer_state      ?? null),
      postcode:   cust ? cust.postcode   : (latest?.customer_postcode   ?? null),
      notes,
      maiden_name,
      wishlist_notes,
      customer_followup_notes,
      customer_id: customerId,
      // Stats
      total_orders: packets.length,
      total_quotes: quotes.length,
      total_spend:  packets.reduce((s, p) => s + (typeof p.total_charges === "number" ? p.total_charges : 0), 0),
      first_seen:   [...packets, ...quotes].reduce(
        (min, r) => (r.created_at < min ? r.created_at : min),
        (packets[0] ?? quotes[0])?.created_at ?? new Date().toISOString()
      ),
      last_visit:   [...packets, ...quotes].reduce(
        (max, r) => (r.created_at > max ? r.created_at : max),
        (packets[0] ?? quotes[0])?.created_at ?? new Date().toISOString()
      ),
    };

    return NextResponse.json({ customer, packets, quotes });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) {
    console.error("[PUT /customers] missing x-tenant-id");
    return NextResponse.json({ success: false, error: "x-tenant-id required" }, { status: 400 });
  }

  const oldEmail = decodeURIComponent(params.id).toLowerCase().trim();
  console.log("[PUT /customers] tenantId:", tenantId, "oldEmail:", oldEmail);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  // customer_id (UUID) passed from frontend when the customers row already exists
  const customerId = typeof body.customer_id === "string" && body.customer_id ? body.customer_id : null;
  const rawEmail   = typeof body.email       === "string" ? body.email.toLowerCase().trim() : "";
  const newEmail   = rawEmail || oldEmail;
  const firstName  = typeof body.first_name  === "string" ? body.first_name.trim()  || null : null;
  const lastName   = typeof body.last_name   === "string" ? body.last_name.trim()   || null : null;
  const phone      = typeof body.phone       === "string" ? body.phone.trim()       || null : null;
  const address    = typeof body.street      === "string" ? body.street.trim()      || null : null;
  const suburb     = typeof body.suburb      === "string" ? body.suburb.trim()      || null : null;
  const state      = typeof body.state       === "string" ? body.state.trim()       || null : null;
  const postcode   = typeof body.postcode    === "string" ? body.postcode.trim()    || null : null;

  console.log("[PUT /customers] customerId:", customerId, "newEmail:", newEmail);

  const fields = { email: newEmail, first_name: firstName, last_name: lastName, phone, address, suburb, state, postcode };
  const RETURN_COLS = "id, email, first_name, last_name, phone, address, suburb, state, postcode";

  try {
    const supabase = await createTenantSupabaseClient(tenantId);
    let row: Record<string, unknown> | null = null;

    if (customerId) {
      // Row already exists — update directly by UUID (UUID came from tenant-scoped GET so ownership is implicit)
      console.log("[PUT /customers] updating by UUID");
      const { data, error } = await supabase
        .from("customers")
        .update(fields)
        .eq("id", customerId)
        .eq("tenant_id", tenantId)
        .select(RETURN_COLS)
        .maybeSingle();
      if (error) {
        console.error("[PUT /customers] update error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      if (!data) {
        console.error("[PUT /customers] update matched 0 rows — UUID/tenant mismatch");
        return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 });
      }
      row = data as Record<string, unknown>;
    } else {
      // No customers row yet (customer exists only in packets/quotes) — upsert by email
      console.log("[PUT /customers] no UUID, upserting by email");
      const { data, error } = await supabase
        .from("customers")
        .upsert({ ...fields, tenant_id: tenantId }, { onConflict: "email" })
        .select(RETURN_COLS)
        .single();
      if (error) {
        console.error("[PUT /customers] upsert error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      row = data as Record<string, unknown>;
    }

    console.log("[PUT /customers] success, row:", row);
    return NextResponse.json({
      success: true,
      customer: { ...row, street: row.address },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[PUT /customers] unexpected error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const email = decodeURIComponent(params.id).toLowerCase().trim();

  try {
    const body = await req.json();
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId);

    // Build update object from provided fields only
    const updateFields: Record<string, unknown> = { email, tenant_id: tenantId };
    const allowedFields = ["notes", "maiden_name", "wishlist_notes", "customer_followup_notes"] as const;
    for (const field of allowedFields) {
      if (field in body) updateFields[field] = body[field];
    }

    // Upsert into customers table
    const { error } = await supabase
      .from("customers")
      .upsert(updateFields, { onConflict: "email" });

    if (error) {
      // If table doesn't exist, silently succeed
      if (error.code === "42P01") return NextResponse.json({ ok: true });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
