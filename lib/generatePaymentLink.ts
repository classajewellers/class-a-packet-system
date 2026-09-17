import Stripe from "stripe";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { Quote } from "@/lib/types";
import { outboundBlock, logSuppressedOutbound } from "@/lib/outbound-guard";

type TenantSupabaseClient = Awaited<ReturnType<typeof createTenantSupabaseClient>>;

/**
 * Price source: for a multi-option quote where the customer has accepted a
 * specific stone option, use THAT option's own quoted_price rather than the
 * single top-level quoted_price/total (which reflects whichever option was
 * first/default). Falls back to the original single-price behaviour for
 * single-option and legacy quotes (accepted_option null).
 *
 * NOTE: inherits an existing limitation in how accepted_option is modeled -
 * it is a single integer with no accompanying item index, so it only
 * resolves correctly for a quote's first/primary builder item. Multi-item
 * quotes with independently-selectable options per item aren't supported by
 * the current data model; not something this expands or narrows.
 */
export function resolveQuotedPrice(quote: Quote): number | null {
  const qbd = quote.quote_builder_data as { builder_items?: Array<Record<string, unknown>> } | null | undefined;
  const builderItems = qbd && Array.isArray(qbd.builder_items) ? qbd.builder_items : null;
  if (builderItems && builderItems.length > 0 && quote.accepted_option != null) {
    const item = builderItems[0];
    const stoneOpts = Array.isArray(item.stone_options) ? (item.stone_options as Array<Record<string, unknown>>) : [];
    const opt = stoneOpts[quote.accepted_option];
    if (opt && typeof opt.quoted_price === "number") return opt.quoted_price;
  }
  return quote.quoted_price ?? quote.total ?? null;
}

export interface GeneratePaymentLinkResult {
  payment_link_url: string | null;
  deposit_amount: number | null;
  error?: string;
  status?: number;
  suppressed?: boolean;
}

/**
 * Creates (or returns the existing) Stripe payment link for a quote's
 * deposit. Shared by the staff-triggered payment-link route and the
 * customer-facing order page, so the price/deposit/Stripe logic lives in
 * exactly one place.
 *
 * Idempotent: if the quote already has a payment link, returns it instead
 * of creating a second Stripe product/price/link - closes a pre-existing
 * gap where a double-click on "Generate Payment Link" (or a retried order
 * submission) would have created duplicate Stripe objects.
 */
export async function generatePaymentLink(
  supabase: TenantSupabaseClient,
  quote: Quote,
  tenantId: string,
  overrideAmount?: number
): Promise<GeneratePaymentLinkResult> {
  if (quote.stripe_payment_link_url) {
    return { payment_link_url: quote.stripe_payment_link_url, deposit_amount: quote.deposit_amount ?? null };
  }

  const quotedPrice = resolveQuotedPrice(quote);
  if (!quotedPrice || quotedPrice <= 0) {
    return {
      error: "Quote has no price — set a quoted price before generating a payment link",
      status: 400,
      payment_link_url: null,
      deposit_amount: null,
    };
  }

  // Deposit percentage is a per-tenant setting (Settings -> Deposit
  // Settings), defaulting to 30% for any tenant that hasn't set one.
  let depositPercentage = 30;
  if (tenantId) {
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("deposit_percentage")
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantRow?.deposit_percentage != null) depositPercentage = Number(tenantRow.deposit_percentage);
  }

  const defaultDeposit = Math.round(quotedPrice * (depositPercentage / 100));
  let depositAmount = defaultDeposit;

  // Manual override — any non-negative amount is allowed (minimum $0), no
  // longer gated to the calculated default. Staff judgement call, not
  // enforced here.
  if (typeof overrideAmount === "number") {
    if (overrideAmount < 0) {
      return { error: "Override amount cannot be negative", status: 400, payment_link_url: null, deposit_amount: null };
    }
    depositAmount = Math.round(overrideAmount);
  }

  // Outbound suppression — test tenant only: never create a real Stripe object.
  const block = outboundBlock("stripe", tenantId);
  if (block) {
    logSuppressedOutbound("stripe:payment_link", tenantId, { quote: quote.id, amount: depositAmount }, block);
    return { payment_link_url: null, deposit_amount: depositAmount, suppressed: true };
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return { error: "STRIPE_SECRET_KEY is not configured", status: 500, payment_link_url: null, deposit_amount: null };
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
        url: `https://www.jewelleryvault.com.au/payment-success?quote_id=${quote.id}`,
      },
    },
    metadata: {
      quote_id: quote.id,
      tenant_id: tenantId,
      quote_reference: quote.reference_number ?? "",
    },
  });

  // Save to quote — status moves to "awaiting_payment" now that a real
  // payment link exists; the Stripe webhook moves it on to "paid" once the
  // customer actually completes checkout.
  const upd = supabase.from("quotes").update({
    stripe_payment_link_id: paymentLink.id,
    stripe_payment_link_url: paymentLink.url,
    deposit_amount: depositAmount,
    status: "awaiting_payment",
  }).eq("id", quote.id);
  await (tenantId ? upd.eq("tenant_id", tenantId) : upd);

  return { payment_link_url: paymentLink.url, deposit_amount: depositAmount };
}
