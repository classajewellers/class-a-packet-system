// Stripe webhook — receives deposit payment confirmations.
// Required Vercel environment variables:
//   STRIPE_SECRET_KEY      — Stripe secret key
//   STRIPE_WEBHOOK_SECRET  — from Stripe dashboard → Webhooks → signing secret
//
// Register this endpoint in Stripe dashboard:
//   URL: https://jewelleryvault.com.au/api/stripe/webhook
//   Events: checkout.session.completed, payment_intent.succeeded

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;


export async function POST(req: NextRequest): Promise<NextResponse> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !webhookSecret) {
    console.error("[stripe/webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2026-05-27.dahlia" });

  // Read the raw body for signature verification
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log("[stripe/webhook] Event received:", event.type, event.id);

  if (
    event.type === "checkout.session.completed" ||
    event.type === "payment_intent.succeeded"
  ) {
    const obj = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent;

    // Extract metadata — both session and payment_intent carry it
    const metadata = obj.metadata ?? {};
    const quoteId = metadata.quote_id;
    const tenantId = metadata.tenant_id;

    if (!quoteId) {
      console.warn("[stripe/webhook] No quote_id in metadata — skipping");
      return NextResponse.json({ received: true });
    }

    // Amount in dollars
    const amountPaid =
      "amount_total" in obj && obj.amount_total != null
        ? obj.amount_total / 100
        : "amount" in obj && obj.amount != null
        ? obj.amount / 100
        : null;

    const supabase = createServerSupabaseClient();
    const now = new Date().toISOString();

    // Mark deposit as paid on the quote
    const { data: updatedQuote, error: updateErr } = await supabase
      .from("quotes")
      .update({
        deposit_paid: true,
        deposit_paid_at: now,
        ...(amountPaid != null ? { deposit_amount: amountPaid } : {}),
        status: "job_won",
        job_won_at: now,
        status_changed_at: now,
      })
      .eq("id", quoteId)
      .select("id, reference_number, assigned_to, customer_first_name, customer_last_name")
      .single();

    if (updateErr) {
      console.error("[stripe/webhook] Failed to update quote:", updateErr);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }

    console.log("[stripe/webhook] Deposit paid for quote:", updatedQuote?.reference_number);

    // Create in-app notification for the assigned staff member
    const customerName = [
      updatedQuote?.customer_first_name,
      updatedQuote?.customer_last_name,
    ]
      .filter(Boolean)
      .join(" ");
    const amountStr = amountPaid != null
      ? `$${amountPaid.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "a deposit";

    // Look up the assigned staff member's profile ID (if any)
    let userId: string | null = null;
    if (updatedQuote?.assigned_to) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("full_name", updatedQuote.assigned_to)
        .single();
      userId = profile?.id ?? null;
    }

    // Resolve tenant_id: prefer metadata, otherwise look it up from quote's tenant context
    const resolvedTenantId = tenantId || null;

    if (resolvedTenantId) {
      const { error: notifErr } = await supabase.from("notifications").insert({
        tenant_id: resolvedTenantId,
        user_id: userId,
        type: "deposit_paid",
        title: `Deposit received — ${updatedQuote?.reference_number ?? "quote"}`,
        message: `${customerName ? customerName + " has" : "A customer has"} paid ${amountStr} deposit. Convert to an order to begin work.`,
        quote_id: quoteId,
        read: false,
        created_at: now,
      });

      if (notifErr) {
        console.error("[stripe/webhook] Failed to create notification:", notifErr);
      } else {
        console.log("[stripe/webhook] Notification created for", updatedQuote?.assigned_to ?? "unassigned");
      }
    } else {
      console.warn("[stripe/webhook] No tenant_id in metadata — notification skipped");
    }
  }

  return NextResponse.json({ received: true });
}
