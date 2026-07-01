import { NextRequest, NextResponse } from "next/server";
import { stripe, PLAN_TO_PRICE_ID } from "@/lib/stripe";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const CLASS_A_TENANT = "00000000-0000-0000-0000-000000000001";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";

  if (tenantId === CLASS_A_TENANT) return NextResponse.json({ ok: true });
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  try {
    const body = await req.json() as { plan: string; email: string; store_name: string };
    const { plan, email, store_name } = body;

    const priceId = PLAN_TO_PRICE_ID[plan];
    if (!priceId) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

    const supabase = await createTenantSupabaseClient(tenantId);

    const { data: tenant } = await supabase
      .from("tenants")
      .select("stripe_customer_id")
      .eq("id", tenantId)
      .maybeSingle();

    let customerId = tenant?.stripe_customer_id as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { tenant_id: tenantId, store_name },
      });
      customerId = customer.id;
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: 14,
    });

    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null;

    await supabase
      .from("tenants")
      .update({
        stripe_customer_id:     customerId,
        stripe_subscription_id: subscription.id,
        subscription_status:    "trialing",
        trial_ends_at:          trialEnd,
        plan,
      })
      .eq("id", tenantId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[billing/create-subscription]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
