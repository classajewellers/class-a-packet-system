import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { generateReferenceNumber } from "@/lib/referenceNumber";
import {
  verifyShopifyWebhook,
  formatShopifyLineItems,
  ShopifyOrder,
} from "@/lib/shopify";
import { todayISO } from "@/lib/formatters";

// Force dynamic so Next.js never caches this route
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Read raw body first (needed for HMAC verification) ─────────────────
  const rawBody = await req.text();

  // ── 2. Verify Shopify webhook signature ───────────────────────────────────
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  if (!verifyShopifyWebhook(rawBody, hmacHeader)) {
    console.warn("Shopify webhook: invalid HMAC signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 3. Check topic — only handle orders/create ────────────────────────────
  const topic = req.headers.get("x-shopify-topic");
  if (topic !== "orders/create") {
    // Respond 200 so Shopify stops retrying other topics
    return NextResponse.json({ ok: true, skipped: true });
  }

  // ── 4. Parse Shopify order payload ────────────────────────────────────────
  let order: ShopifyOrder;
  try {
    order = JSON.parse(rawBody) as ShopifyOrder;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── 5. Generate ON-YYYYMMDD-XXXX reference number ─────────────────────────
  let referenceNumber: string;
  try {
    referenceNumber = await generateReferenceNumber(new Date(), "online_order");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Shopify webhook: reference generation failed:", msg);
    // Return 200 to prevent Shopify retry storms — log internally
    return NextResponse.json({ ok: false, error: "Reference generation failed" });
  }

  // ── 6. Map Shopify order → packet fields ──────────────────────────────────
  const customer = order.customer;
  const shipping = order.shipping_address ?? order.billing_address;
  const articles = formatShopifyLineItems(order.line_items ?? []);
  const totalCharges = parseFloat(order.total_price);
  const shippingMethod = order.shipping_lines?.[0]?.title ?? null;

  const insertData = {
    reference_number: referenceNumber,
    packet_type: "online_order",
    customer_first_name: customer?.first_name ?? null,
    customer_last_name: customer?.last_name ?? null,
    customer_email: order.email ?? customer?.email ?? null,
    customer_phone: order.phone ?? customer?.phone ?? null,
    customer_street: shipping?.address1 ?? null,
    customer_suburb: shipping?.city ?? null,
    customer_state: shipping?.province_code ?? null,
    customer_postcode: shipping?.zip ?? null,
    articles: articles || null,
    instructions: order.note || null,
    total_charges: isNaN(totalCharges) ? null : totalCharges,
    deposit: null,
    balance: null,
    in_date: todayISO(),
    due_date: null,
    staff_member: "Online Store",
    order_number: order.name ?? null,
    shipping_method: shippingMethod,
    shipping_address_same: true,
    shipping_street: null,
    shipping_suburb: null,
    shipping_state: null,
    shipping_postcode: null,
    items_ordered: order.line_items ? JSON.stringify(order.line_items) : null,
    order_source: "Website",
    // Store full raw Shopify order for staff reference
    packet_data: order as unknown as Record<string, unknown>,
  };

  // ── 7. Insert into Supabase ────────────────────────────────────────────────
  const supabase = createServerClient();
  const { error: insertError } = await supabase
    .from("packets")
    .insert(insertData);

  if (insertError) {
    console.error("Shopify webhook: Supabase insert error:", insertError.message);
    // Return 200 to prevent Shopify from retrying indefinitely
    return NextResponse.json({ ok: false, error: insertError.message });
  }

  return NextResponse.json({ ok: true, reference: referenceNumber });
}
