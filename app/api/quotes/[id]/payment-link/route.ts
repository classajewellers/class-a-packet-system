// Required Vercel environment variables:
//   STRIPE_SECRET_KEY          — Stripe dashboard → Developers → API Keys → Secret key
//   STRIPE_WEBHOOK_SECRET      — Stripe dashboard → Webhooks → signing secret
//   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — Stripe publishable key

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { Quote } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  // Fetch the quote
  const q = supabase.from("quotes").select("*").eq("id", params.id);
  const { data, error } = await (tenantId ? q.eq("tenant_id", tenantId) : q).single();

  if (error || !data) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const quote = data as Quote;

  const quotedPrice = quote.quoted_price ?? quote.total ?? null;
  if (!quotedPrice || quotedPrice <= 0) {
    return NextResponse.json(
      { error: "Quote has no price — set a quoted price before generating a payment link" },
      { status: 400 }
    );
  }

  // Parse optional amount override from body
  let body: { amount?: number } = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

  const minimumDeposit = Math.round(quotedPrice * 0.3);
  let depositAmount = minimumDeposit;

  if (typeof body.amount === "number" && body.amount > 0) {
    if (body.amount < minimumDeposit) {
      return NextResponse.json(
        { error: `Minimum deposit is $${minimumDeposit} (30% of quoted price)` },
        { status: 400 }
      );
    }
    depositAmount = body.amount;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY is not configured" }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2026-05-27.dahlia" });

  // Create a one-time product + price + payment link for this deposit
  const product = await stripe.products.create({
    name: `Deposit — ${quote.reference_number} — Class A Jewellers`,
    ...(quote.ai_description ? { description: quote.ai_description } : {}),
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: Math.round(depositAmount * 100), // cents
    currency: "aud",
  });

  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    after_completion: {
      type: "redirect",
      redirect: {
        url: `https://www.jewelleryvault.com.au/payment-success?quote_id=${params.id}`,
      },
    },
    metadata: {
      quote_id: params.id,
      tenant_id: tenantId,
      quote_reference: quote.reference_number ?? "",
    },
  });

  // Save to quote
  const upd = supabase.from("quotes").update({
    stripe_payment_link_id: paymentLink.id,
    stripe_payment_link_url: paymentLink.url,
    deposit_amount: depositAmount,
  }).eq("id", params.id);
  await (tenantId ? upd.eq("tenant_id", tenantId) : upd);

  return NextResponse.json({
    payment_link_url: paymentLink.url,
    deposit_amount: depositAmount,
  });
}
