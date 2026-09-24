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
import { tenantScoped } from "@/lib/tenantScoped";
import { createPacket } from "@/lib/createPacket";
import { calculateWorkshopDueDate } from "@/lib/workshopDueDates";
import { sendKlaviyoPendingApprovalEmail } from "@/lib/klaviyo";
import { sendSms } from "@/lib/sendSms";
import { resolveQuotedPrice } from "@/lib/generatePaymentLink";
import { defaultFormData, PacketFormData, Quote } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function stoneSpecs(stones: Array<Record<string, unknown>>): string {
  return stones
    .map(s =>
      [
        s.carat_weight != null ? `${s.carat_weight}ct` : null,
        s.colour ?? s.color,
        s.clarity,
        s.origin,
        s.shape,
      ]
        .filter(Boolean)
        .join(" ")
    )
    .filter(Boolean)
    .join("; ");
}

/**
 * Builds a real PacketFormData for the auto-created order, sourcing every
 * field it can from the quote rather than guessing — same approach staff
 * would use manually via the pre-filled /orders/new form, minus the human
 * in the loop. See lib/workshopDueDates.ts for the due-date calculation
 * (already isomorphic, same function the manual form uses).
 */
function buildOrderFormData(quote: Quote, resolvedPrice: number, depositPaid: number): PacketFormData {
  const qbd = quote.quote_builder_data as { builder_items?: Array<Record<string, unknown>> } | null | undefined;
  const builderItems = qbd && Array.isArray(qbd.builder_items) ? qbd.builder_items : null;
  const item = builderItems && builderItems.length > 0 ? builderItems[0] : null;

  const design = typeof item?.design === "string" ? item.design : "";
  const aiDesc = typeof quote.ai_description === "string" ? quote.ai_description : "";
  const subcat = typeof item?.subcategory === "string" ? item.subcategory : (typeof item?.item_type === "string" ? item.item_type : "");

  const stoneOpts = item && Array.isArray(item.stone_options) ? (item.stone_options as Array<Record<string, unknown>>) : [];
  const acceptedOpt = quote.accepted_option != null ? stoneOpts[quote.accepted_option] : null;
  const specs = acceptedOpt && Array.isArray(acceptedOpt.stones) ? stoneSpecs(acceptedOpt.stones as Array<Record<string, unknown>>) : "";

  const articles = [subcat, design ? `Design: ${design}` : null, specs ? `Stone: ${specs}` : null].filter(Boolean).join("\n");
  const instructions = aiDesc || design || "";

  const todayISO = new Date().toISOString().split("T")[0];
  const manufactureType = "Fully Finished";
  const dueDate = calculateWorkshopDueDate(new Date(), "custom_order", undefined, manufactureType)
    .toISOString()
    .split("T")[0];

  return {
    ...defaultFormData,
    packet_type: "custom_order",
    customer_first_name: quote.customer_first_name ?? "",
    customer_last_name: quote.customer_last_name ?? "",
    customer_email: quote.customer_email ?? "",
    customer_phone: quote.customer_phone ?? "",
    customer_street: quote.customer_street ?? "",
    customer_suburb: quote.customer_suburb ?? "",
    customer_state: quote.customer_state ?? "",
    customer_postcode: quote.customer_postcode ?? "",
    // Confirmed default for auto-created orders — the customer's only
    // interaction was via the order page/email, no real preference data
    // exists anywhere in the system to source this from otherwise.
    contact_preference: ["email"],
    articles,
    instructions,
    total_charges: String(resolvedPrice),
    deposit: String(depositPaid),
    in_date: todayISO,
    due_date: dueDate,
    // The quote's own staff member is a sensible starting value — a plain,
    // freely-reassignable field, same as any manually-created order.
    staff_member: quote.staff_member || quote.assigned_to || "",
    from_quote_id: quote.id,
    manufacture_type: manufactureType,
    workshop_due_date: dueDate,
    workshop_due_date_overridden: false,
  };
}

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

    // Record the deposit only. Job Won (status, job_won_at) is written inside
    // createPacket after the order packet exists. A failed create leaves the
    // quote in its current stage.
    const { data: updatedQuote, error: updateErr } = await supabase
      .from("quotes")
      .update({
        deposit_paid: true,
        deposit_paid_at: now,
        ...(amountPaid != null ? { deposit_amount: amountPaid } : {}),
      })
      .eq("id", quoteId)
      .select("*")
      .single();

    if (updateErr) {
      console.error("[stripe/webhook] Failed to update quote:", updateErr);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }

    console.log("[stripe/webhook] Deposit paid for quote:", updatedQuote?.reference_number);

    const quote = updatedQuote as Quote;
    const customerName = [quote.customer_first_name, quote.customer_last_name].filter(Boolean).join(" ");
    const amountStr = amountPaid != null
      ? `$${amountPaid.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "a deposit";

    const resolvedTenantId = tenantId || quote.tenant_id || null;

    if (!resolvedTenantId) {
      console.warn("[stripe/webhook] No tenant_id available — cannot auto-create packet or notify");
      return NextResponse.json({ received: true });
    }

    // ── Idempotency guard — Stripe may redeliver this event; never create a
    // second packet for the same quote (a partial/failed prior attempt would
    // leave converted_to_packet_id null and be safely retried here).
    if (quote.converted_to_packet_id) {
      console.log("[stripe/webhook] Quote already converted to a packet — skipping auto-creation:", quote.converted_to_packet_id);
      return NextResponse.json({ received: true });
    }

    // ── Auto-create the packet, pending manager approval ────────────────────
    const resolvedPrice = resolveQuotedPrice(quote) ?? quote.quoted_price ?? quote.total ?? 0;
    const orderFormData = buildOrderFormData(quote, resolvedPrice, amountPaid ?? 0);

    const { packet, errors } = await createPacket(orderFormData, resolvedTenantId, supabase, {
      skipClaimSlip: true,
      pendingCustomerApproval: true,
    });

    if (!packet) {
      console.error("[stripe/webhook] Auto packet creation FAILED:", JSON.stringify(errors));
      // Deposit is recorded. The quote is not Job Won and no packet remains.
      // Broadcast (user_id null) — no packet exists yet to assign this to
      // a specific person, and any manager needs to see it and act.
      const failReason = errors.payment ?? errors.quote ?? errors.supabase ?? errors.reference ?? "unknown error";
      const { error: notifErr } = await tenantScoped(supabase, resolvedTenantId)
        .from("notifications")
        .insert({
          user_id: null,
          type: "deposit_paid_packet_failed",
          title: `Deposit received, order creation FAILED — ${quote.reference_number}`,
          message: `${customerName ? customerName + " has" : "A customer has"} paid ${amountStr} deposit, but the order could not be created (${failReason}). The quote was not marked Job Won.`,
          link_type: "quote",
          link_id: quoteId,
        });
      if (notifErr) console.error("[stripe/webhook] Failed to record deposit-failure notification:", notifErr.message);
      return NextResponse.json({ received: true, packetError: true });
    }

    console.log("[stripe/webhook] Auto-created packet:", packet.id, packet.reference_number);

    // Broadcast (user_id null) — same reasoning as above; whichever manager
    // opens Vault next should see this, not just the originally assigned
    // staff member (who may be off, or the quote may be unassigned).
    const { error: pendingNotifErr } = await tenantScoped(supabase, resolvedTenantId)
      .from("notifications")
      .insert({
        user_id: null,
        type: "packet_pending_approval",
        title: `Order auto-created, pending your approval — ${packet.reference_number}`,
        message: `${customerName ? customerName + " has" : "A customer has"} paid ${amountStr} deposit and their order (${packet.reference_number}) was created automatically. Review and approve it before it proceeds through the workshop.`,
        link_type: "packet",
        link_id: packet.id,
      });
    if (pendingNotifErr) console.error("[stripe/webhook] Failed to record pending-approval notification:", pendingNotifErr.message);

    try {
      await sendKlaviyoPendingApprovalEmail(packet);
    } catch (err) {
      console.warn("[stripe/webhook] Pending-approval email failed:", err instanceof Error ? err.message : String(err));
    }

    // SMS confirmation — sent alongside the email, not instead of it (always
    // both, no customer opt-in for auto-created orders per confirmed scope).
    // customer_id was resolved during createPacket()'s customer upsert and
    // stored on the packet row; if it's somehow null (e.g. no email on the
    // quote at all) there's no customers row to attach an SMS to — skip
    // rather than error, same fail-open approach as the email try/catch.
    if (packet.customer_id) {
      try {
        const smsResult = await sendSms(
          supabase,
          resolvedTenantId,
          packet.customer_id,
          `Thanks ${quote.customer_first_name ?? "there"}! We've received your order (${packet.reference_number}) and payment. Our team is reviewing it and will be in touch shortly to confirm everything before work begins.`
        );
        if (!smsResult.success) {
          console.warn("[stripe/webhook] Pending-approval SMS failed:", smsResult.error);
        }
      } catch (err) {
        console.warn("[stripe/webhook] Pending-approval SMS failed:", err instanceof Error ? err.message : String(err));
      }
    } else {
      console.warn("[stripe/webhook] No customer_id on auto-created packet — skipping SMS confirmation");
    }
  }

  return NextResponse.json({ received: true });
}
