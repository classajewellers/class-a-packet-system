import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const CLASS_A_TENANT = "00000000-0000-0000-0000-000000000001";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";

  if (tenantId === CLASS_A_TENANT) {
    return NextResponse.json({ url: "https://jewelleryvault.com.au/settings" });
  }
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  try {
    const supabase = await createTenantSupabaseClient(tenantId);

    const { data } = await supabase
      .from("tenants")
      .select("stripe_customer_id")
      .eq("id", tenantId)
      .maybeSingle();

    if (!data?.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account found" }, { status: 404 });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id as string,
      return_url: "https://jewelleryvault.com.au/settings",
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/portal]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
