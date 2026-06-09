import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("vault_admin_stores")
      .select(`*, tenant:tenants(id, name, slug, subscription_status)`)
      .eq("id", params.id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ store: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = await req.json();

    const allowed = [
      "plan", "billing_status", "monthly_fee_aud",
      "contact_name", "contact_email", "contact_phone",
      "store_city", "store_state", "website_url", "notes",
      "onboarding_dns_connected", "onboarding_staff_loaded",
      "onboarding_first_order", "onboarding_training_done",
      "onboarding_billing_active",
      "next_billing_date", "billing_start_date",
    ];

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("vault_admin_stores")
      .update(updates)
      .eq("id", params.id)
      .select(`*, tenant:tenants(id, name, slug, subscription_status)`)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Sync billing_status → tenants.subscription_status
    if ("billing_status" in body && data?.tenant?.id) {
      const statusMap: Record<string, string> = {
        active:    "active",
        trial:     "active",
        overdue:   "active",
        suspended: "inactive",
        cancelled: "inactive",
      };
      const tenantStatus = statusMap[body.billing_status] ?? "active";
      await supabase
        .from("tenants")
        .update({ subscription_status: tenantStatus })
        .eq("id", data.tenant.id);
    }

    return NextResponse.json({ store: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
