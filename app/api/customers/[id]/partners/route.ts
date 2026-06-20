import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const email = decodeURIComponent(params.id).toLowerCase().trim();
  if (!email) return NextResponse.json({ error: "Missing customer email" }, { status: 400 });

  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    // Query both directions using .or()
    const { data: rows, error } = await supabase
      .from("customer_partners")
      .select("id, email_1, email_2")
      .eq("tenant_id", tenantId)
      .or(`email_1.eq.${email},email_2.eq.${email}`);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Resolve the "other" email for each row
    const partnerEmails = (rows ?? []).map((r) => ({
      id: r.id,
      partner_email: r.email_1 === email ? r.email_2 : r.email_1,
    }));

    // For each partner email, get their name from the most recent packet
    const partners = await Promise.all(
      partnerEmails.map(async ({ id, partner_email }) => {
        const { data: pkt } = await supabase
          .from("packets")
          .select("customer_first_name, customer_last_name")
          .eq("tenant_id", tenantId)
          .ilike("customer_email", partner_email)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const first = pkt?.customer_first_name ?? "";
        const last = pkt?.customer_last_name ?? "";
        const partner_name = [first, last].filter(Boolean).join(" ") || null;

        return { id, partner_email, partner_name };
      })
    );

    return NextResponse.json({ partners });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const email = decodeURIComponent(params.id).toLowerCase().trim();
  if (!email) return NextResponse.json({ error: "Missing customer email" }, { status: 400 });

  try {
    const body = await req.json();
    const partnerEmail = (body.partnerEmail ?? "").toLowerCase().trim();
    if (!partnerEmail) return NextResponse.json({ error: "Missing partnerEmail" }, { status: 400 });
    if (partnerEmail === email) return NextResponse.json({ error: "Cannot partner with self" }, { status: 400 });

    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    // Always store with email_1 = min, email_2 = max to avoid duplicates
    const email_1 = email < partnerEmail ? email : partnerEmail;
    const email_2 = email < partnerEmail ? partnerEmail : email;

    const { data, error } = await supabase
      .from("customer_partners")
      .insert({ tenant_id: tenantId, email_1, email_2 })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ partner: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const email = decodeURIComponent(params.id).toLowerCase().trim();
  if (!email) return NextResponse.json({ error: "Missing customer email" }, { status: 400 });

  try {
    const body = await req.json();
    const partnerEmail = (body.partnerEmail ?? "").toLowerCase().trim();
    if (!partnerEmail) return NextResponse.json({ error: "Missing partnerEmail" }, { status: 400 });

    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    // Normalise to the canonical ordering used at insert time
    const email_1 = email < partnerEmail ? email : partnerEmail;
    const email_2 = email < partnerEmail ? partnerEmail : email;

    const { error } = await supabase
      .from("customer_partners")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("email_1", email_1)
      .eq("email_2", email_2);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
