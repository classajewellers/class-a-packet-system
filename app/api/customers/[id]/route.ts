import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  // id is URL-encoded customer email
  const email = decodeURIComponent(params.id).toLowerCase().trim();

  if (!email) {
    return NextResponse.json({ error: "Missing customer email" }, { status: 400 });
  }

  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId);

    const [packetsResult, quotesResult, notesResult] = await Promise.all([
      supabase
        .from("packets")
        .select("*")
        .ilike("customer_email", email)
        .order("created_at", { ascending: false }),

      supabase
        .from("quotes")
        .select("*")
        .ilike("customer_email", email)
        .order("created_at", { ascending: false }),

      // Fetch notes from customers table (may not exist — handle gracefully)
      supabase
        .from("customers")
        .select("notes, id")
        .ilike("email", email)
        .maybeSingle(),
    ]);

    const packets = packetsResult.data ?? [];
    const quotes  = quotesResult.data  ?? [];
    const notes   = notesResult.data?.notes ?? null;
    const customerId = notesResult.data?.id ?? null;

    // Derive customer header from most recent packet
    const latest = packets[0] ?? quotes[0] ?? null;
    const customer = {
      email,
      phone:      latest?.customer_phone      ?? null,
      first_name: latest?.customer_first_name ?? null,
      last_name:  latest?.customer_last_name  ?? null,
      street:     latest?.customer_street     ?? null,
      suburb:     latest?.customer_suburb     ?? null,
      state:      latest?.customer_state      ?? null,
      postcode:   latest?.customer_postcode   ?? null,
      notes,
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const email = decodeURIComponent(params.id).toLowerCase().trim();

  try {
    const body = await req.json();
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId);

    // Upsert notes by email into customers table
    const { error } = await supabase
      .from("customers")
      .upsert({ email, notes: body.notes }, { onConflict: "email" });

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
