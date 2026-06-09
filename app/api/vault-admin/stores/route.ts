import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("vault_admin_stores")
      .select(`
        *,
        tenant:tenants(id, name, slug, subscription_status)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[vault-admin/stores GET]", error.message);
      return NextResponse.json({ stores: [], error: error.message }, { status: 500 });
    }

    return NextResponse.json({ stores: data ?? [] });
  } catch (err) {
    return NextResponse.json({ stores: [], error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const {
      storeName, slug, contactName, contactEmail, contactPhone,
      storeCity, storeState, plan, monthlyFee,
    } = body as {
      storeName: string; slug: string; contactName?: string; contactEmail?: string;
      contactPhone?: string; storeCity?: string; storeState?: string;
      plan?: string; monthlyFee?: number;
    };

    if (!storeName?.trim() || !slug?.trim()) {
      return NextResponse.json({ error: "storeName and slug are required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // 1. Create the tenant
    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .insert({ name: storeName.trim(), slug: slug.trim().toLowerCase(), subscription_status: "active" })
      .select()
      .single();

    if (tenantErr) {
      if (tenantErr.code === "23505") {
        return NextResponse.json({ error: "A store with that slug already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: tenantErr.message }, { status: 500 });
    }

    // 2. Create the CRM record
    const { data: store, error: storeErr } = await supabase
      .from("vault_admin_stores")
      .insert({
        tenant_id:       tenant.id,
        plan:            plan ?? "trial",
        billing_status:  "trial",
        monthly_fee_aud: monthlyFee ?? 0,
        contact_name:    contactName  || null,
        contact_email:   contactEmail || null,
        contact_phone:   contactPhone || null,
        store_city:      storeCity    || null,
        store_state:     storeState   || null,
      })
      .select()
      .single();

    if (storeErr) {
      // Clean up tenant if CRM record fails
      await supabase.from("tenants").delete().eq("id", tenant.id);
      return NextResponse.json({ error: storeErr.message }, { status: 500 });
    }

    return NextResponse.json({ store, tenant }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
