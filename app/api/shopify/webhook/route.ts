// Shopify webhook — accepts BOTH native Shopify format AND legacy Zapier flat format.
// Auto-detects which format is being received and routes to the appropriate parser.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateReferenceNumber } from "@/lib/referenceNumber";
import { todayISO } from "@/lib/formatters";
import { fileVaultBrainSystemReport } from "@/lib/vaultBrainSystemReport";
import {
  buildArticles,
  parseLineItems,
  isNativeShopifyFormat,
} from "@/lib/shopify-articles";

// Fallback tenant for legacy Zapier webhooks that have no X-Shopify-Shop-Domain header.
// Native Shopify webhooks (registered via OAuth) are identified by shop_domain lookup.
const CLASSA_TENANT_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Resolve the tenant_id for an incoming webhook.
 * Native Shopify webhooks carry X-Shopify-Shop-Domain — look it up in
 * tenant_shopify_connections. Zapier webhooks don't have this header,
 * so fall back to the Class A hardcode.
 *
 * `fallbackUsed` is recorded on the webhook_events row (see migration 136) —
 * previously this fallback was completely invisible; now it's at least
 * queryable, since a wrong-tenant misroute would otherwise look identical
 * to "order missing" from the affected tenant's point of view.
 */
async function resolveTenantId(shopDomain: string | null): Promise<{ tenantId: string; fallbackUsed: boolean }> {
  if (!shopDomain) return { tenantId: CLASSA_TENANT_ID, fallbackUsed: true };
  try {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
      .from("tenant_shopify_connections")
      .select("tenant_id")
      .eq("shop_domain", shopDomain.toLowerCase())
      .maybeSingle();
    if (data?.tenant_id) return { tenantId: data.tenant_id, fallbackUsed: false };
  } catch (err) {
    console.warn("[shopify/webhook] tenant lookup failed, falling back to Class A:", err);
  }
  return { tenantId: CLASSA_TENANT_ID, fallbackUsed: true };
}

// ── webhook_events helpers ────────────────────────────────────────────────────
// Best-effort status updates on the durable staging row created in POST().
// These must never throw into the caller — a failure to update the audit
// row is logged but must not prevent (or appear to prevent) real processing.
async function markWebhookEvent(
  webhookEventId: string,
  fields: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("webhook_events").update(fields).eq("id", webhookEventId);
    if (error) console.error("[shopify/webhook] failed to update webhook_events row:", webhookEventId, error.message);
  } catch (err) {
    console.error("[shopify/webhook] unexpected error updating webhook_events row:", webhookEventId, err instanceof Error ? err.message : err);
  }
}

// Best-effort order label for report titles/logging — works before format-
// specific parsing runs, and tolerates either payload shape.
function orderLabelFromRawBody(rawBody: Record<string, unknown>): string | null {
  const label = (rawBody as any).name ?? (rawBody as any).orderNumber ?? null;
  return label ? String(label) : null;
}

async function markFailed(webhookEventId: string, tenantId: string, orderLabel: string | null, errorMessage: string): Promise<void> {
  await markWebhookEvent(webhookEventId, { status: "failed", error_message: errorMessage, processed_at: new Date().toISOString() });
  await fileVaultBrainSystemReport({
    tenantId,
    title: `Shopify order sync failed${orderLabel ? ` — ${orderLabel}` : ""}`,
    summary: errorMessage,
    area: "Orders",
    priority: "Critical",
    tags: ["shopify", "webhook", "auto-filed"],
    source: "system:shopify-webhook",
  });
}

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "shopify webhook" }, { status: 200 });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── TYPES ─────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ── Native Shopify webhook payload ────────────────────────────────────────────

interface ShopifyProperty {
  name: string;
  value: string;
}

interface ShopifyLineItem {
  title: string;
  variant_title?: string | null;
  quantity: number;
  price: string;
  properties?: ShopifyProperty[];
}

interface ShopifyAddress {
  first_name?: string;
  last_name?: string;
  name?: string;          // billing_address uses name rather than first/last
  address1?: string;
  city?: string;
  province_code?: string;
  zip?: string;
  phone?: string;
}

interface ShopifyShippingLine {
  title: string;
}

interface ShopifyNoteAttribute {
  name: string;
  value: string;
}

interface ShopifyOrder {
  id?: number | string;
  name?: string;                         // order number e.g. "#3299"
  created_at?: string;
  email?: string | null;
  phone?: string | null;
  subtotal_price?: string | number;      // after discounts, before shipping/tax — preferred
  total_price?: string | number;
  note?: string | null;
  note_attributes?: ShopifyNoteAttribute[];
  shipping_lines?: ShopifyShippingLine[];
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  line_items?: ShopifyLineItem[];
}

// ── Zapier flat-field payload ─────────────────────────────────────────────────
// Zapier sends Shopify order data as a flat object with camelCase keys.
//
// Zapier field mapping:
//   orderNumber          → Shopify order number
//   customerEmail        → Customer email
//   customerPhone        → Customer phone
//   customerFirstName    → Customer first name (required for click & collect)
//   customerLastName     → Customer last name  (required for click & collect)
//   billingName          → Billing address full name (last-resort fallback)
//   totalPrice           → Order total (numeric)
//   subtotalPrice        → Shopify "Subtotal Price" (preferred for total_charges)
//   totalLineItemsPrice  → Shopify "Total Line Items Price" (fallback)
//   shippingFirstName    → Shipping address name (may be full name)
//   shippingAddress1     → Shipping street
//   shippingCity         → Shipping suburb/city
//   shippingProvinceCode → Shipping state
//   shippingPostalCode   → Shipping postcode
//   shippingPhone        → Shipping phone
//   lineItems            → Line items blob (Zapier raw text format)
//   shippingLines        → Shipping lines blob (Zapier raw text format)
//   orderNote            → Order notes
//   noteAttributes       → [{name: 'Gift Wrapping', value: 'Yes'}, ...]
// ─────────────────────────────────────────────────────────────────────────────

interface ZapierFlatOrder {
  id?: string;
  createdAt?: string;
  orderNumber?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerFirstName?: string;
  customerLastName?: string;
  billingName?: string;
  totalPrice?: number | string;
  subtotalPrice?: number | string;
  totalLineItemsPrice?: number | string;
  shippingFirstName?: string;
  shippingAddress1?: string;
  shippingCity?: string;
  shippingProvinceCode?: string;
  shippingPostalCode?: string;
  shippingPhone?: string;
  lineItems?: unknown;
  shippingLines?: unknown;
  orderNote?: string;
  noteAttributes?: unknown;
  note_attributes?: unknown;
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── FORMAT DETECTION ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// isNativeShopifyFormat is imported from @/lib/shopify-articles (shared with the
// complimentary-item backfill so both route stored payloads identically).

// Returns 'pickup' when the shipping method title indicates local/in-store pickup,
// 'shipping' otherwise. Checks for "pickup", "pick up", and "collect" keywords.
//
// Fixed 2026-09-24 (recurring bug: real pickup orders printed as shipping
// labels): when Shopify sends no shipping_lines at all, this now defaults
// to 'pickup', not 'shipping'. Empty shipping_lines is the normal signature
// of a genuine local-pickup order (no shipping rate was purchased) —
// confirmed a real shipping order's shipping_lines entry survives a free-
// shipping discount (the discount zeroes the price, it doesn't remove the
// line), so this default no longer risks misreading a real $0-shipping
// order. The only other realistic empty-shipping_lines case is a fully
// virtual/digital order (e.g. a gift card) needing no physical fulfillment
// at all — this codebase has no gift-card handling either way, so no label
// gets printed for that case regardless of which value is stored here.
function detectDeliveryMethod(shippingMethod: string | null): "pickup" | "shipping" {
  if (!shippingMethod) return "pickup";
  const lower = shippingMethod.toLowerCase();
  return lower.includes("pickup") || lower.includes("pick up") || lower.includes("collect")
    ? "pickup"
    : "shipping";
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── SHARED UTILITIES ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// meaningfulKeys lives in @/lib/shopify-articles (shared with the backfill).

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

/**
 * Shared date string parser — used by both native and Zapier dispatch date
 * extractors after each has pulled the raw string from its own source.
 */
function parseDateStr(dateStr: string): string | null {
  console.log(`[shopify/webhook] extractDispatchDate raw value: "${dateStr}"`);

  // Explicit same-day check — leave due_date null so staff sets the real date.
  if (/same.?day/i.test(dateStr)) {
    console.log(`[shopify/webhook] extractDispatchDate: same-day — returning null`);
    return null;
  }

  // Strip "Dispatch on " prefix then strip leading weekday name.
  let cleaned = dateStr.replace(/^dispatch\s+on\s+/i, "").trim();
  cleaned = cleaned.replace(/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*/i, "").trim();

  const hasMonth = MONTH_NAMES.some((m) => cleaned.toLowerCase().includes(m));
  const hasDay   = /\d{1,2}/.test(cleaned);
  if (!hasMonth || !hasDay) {
    console.log(`[shopify/webhook] extractDispatchDate: "${cleaned}" is not a parseable date — returning null`);
    return null;
  }

  try {
    const datePart = cleaned.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
    const year     = new Date().getFullYear();
    const parsed   = new Date(`${datePart} ${year}`);
    if (isNaN(parsed.getTime())) {
      console.log(`[shopify/webhook] extractDispatchDate: new Date("${datePart} ${year}") returned NaN`);
      return null;
    }
    if (parsed < new Date()) parsed.setFullYear(year + 1);
    const result = parsed.toISOString().split("T")[0];
    console.log(`[shopify/webhook] extractDispatchDate: "${dateStr}" → ${result}`);
    return result;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── NATIVE SHOPIFY PARSERS ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Priority: shipping_address first/last → shipping_address name →
//           billing_address name → "Online Customer"
function resolveNameNative(order: ShopifyOrder): { firstName: string; lastName: string } {
  const sa = order.shipping_address;
  const ba = order.billing_address;

  if (sa?.first_name || sa?.last_name) {
    return {
      firstName: sa.first_name?.trim() || "Online",
      lastName:  sa.last_name?.trim()  || "Customer",
    };
  }

  const fullName = (sa?.name || ba?.name || "").trim();
  if (fullName) {
    const parts = fullName.split(" ");
    return {
      firstName: parts[0] || "Online",
      lastName:  parts.slice(1).join(" ") || "Customer",
    };
  }

  return { firstName: "Online", lastName: "Customer" };
}

// buildArticles is imported from @/lib/shopify-articles — the shared builder now
// KEEPS complimentary / free-gift line items and flags them " — COMPLIMENTARY".

function extractShippingMethodNative(shippingLines: ShopifyShippingLine[] | undefined): string | null {
  if (!shippingLines || shippingLines.length === 0) return null;
  return shippingLines[0]?.title ?? null;
}

// Searches all line items' properties for one whose name contains "dispatch".
function extractDispatchDateNative(lineItems: ShopifyLineItem[] | undefined): string | null {
  if (!lineItems || lineItems.length === 0) return null;

  let rawValue: string | null = null;
  outer: for (const item of lineItems) {
    for (const prop of (item.properties ?? [])) {
      if (prop.name?.toLowerCase().includes("dispatch")) {
        rawValue = prop.value?.trim() ?? null;
        if (rawValue) break outer;
      }
    }
  }

  return rawValue ? parseDateStr(rawValue) : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── ZAPIER FLAT-FIELD PARSERS ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Priority: shippingFirstName → customerFirstName + customerLastName →
//           billingName → "Online Customer"
function resolveNameZapier(body: ZapierFlatOrder): { firstName: string; lastName: string } {
  const fullName = (
    body.shippingFirstName ||
    `${body.customerFirstName || ""} ${body.customerLastName || ""}`.trim() ||
    body.billingName ||
    ""
  ).trim();

  const firstName = fullName.split(" ")[0] || "Online";
  const lastName  = fullName.split(" ").slice(1).join(" ") || "Customer";

  return { firstName, lastName };
}

// parseLineItems is imported from @/lib/shopify-articles — the shared parser now
// KEEPS complimentary / free-gift line items and flags them " — COMPLIMENTARY".

function extractShippingMethodZapier(raw: unknown): string | null {
  if (!raw) return null;

  if (Array.isArray(raw) && raw.length > 0) return raw[0]?.title ?? null;

  if (typeof raw === "string") {
    const s = raw.trim();
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed[0]?.title ?? null;
      if (parsed?.title) return String(parsed.title);
    } catch { /* fall through */ }
    const match = s.match(/title:\s*(.+?)(?:\n|$)/i);
    return match?.[1]?.trim() ?? (s.length < 120 ? s : null);
  }

  return null;
}

// Reads dispatch date from the Zapier line items text blob.
function extractDispatchDateZapier(raw: any): string | null {
  if (!raw || typeof raw !== "string") return null;

  const match = raw.match(/'key':\s*'Estimated Dispatch',\s*'value':\s*'([^']+)'/);
  if (!match) return null;

  return parseDateStr(match[1].trim());
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── BACKGROUND PROCESSING ─────────────────────────────────────════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// Called via waitUntil() so the 200 is already sent before any DB work begins.

async function processOrder(rawBody: Record<string, unknown>, tenantId: string, webhookEventId: string): Promise<void> {
  console.log("[shopify/webhook] processOrder started — tenant_id:", tenantId);
  await markWebhookEvent(webhookEventId, { status: "processing" });
  try {
  // ── A. Generate reference number ──────────────────────────────────────────
  let referenceNumber: string;
  try {
    referenceNumber = await generateReferenceNumber(tenantId, new Date(), "online_order");
    console.log("[shopify/webhook] Reference:", referenceNumber);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[shopify/webhook] Reference generation failed:", msg);
    console.error("[shopify/webhook] Reference generation stack:", err instanceof Error ? err.stack : String(err));
    await markFailed(webhookEventId, tenantId, orderLabelFromRawBody(rawBody), `Reference generation failed: ${msg}`);
    return;
  }

  // ── B. Detect format ──────────────────────────────────────────────────────
  const isNative = isNativeShopifyFormat(rawBody);
  console.log("[shopify/webhook] format detected:", isNative ? "native Shopify" : "Zapier flat");
  console.log("[shopify/webhook] body keys:", Object.keys(rawBody));
  console.log("[shopify/webhook] body sample:", JSON.stringify(rawBody).slice(0, 500));

  // ── C. Extract fields from the appropriate format ─────────────────────────

  let articles: string;
  let shippingMethod: string | null;
  let dispatchDate: string | null;
  let hasGiftWrap: boolean;
  let firstName: string, lastName: string;
  let email: string | null, phone: string | null;
  let street: string | null, suburb: string | null, state: string | null, postcode: string | null;
  let orderNum: string | null, note: string | null;
  let originalPrice: number, finalPrice: number, discountAmount: number;

  if (isNative) {
    // ── Native Shopify format ─────────────────────────────────────────────
    const order = rawBody as ShopifyOrder;
    const sa = order.shipping_address;

    const resolved = resolveNameNative(order);
    firstName = resolved.firstName;
    lastName  = resolved.lastName;
    console.log("[shopify/webhook] [native] resolved name:", { firstName, lastName });
    console.log("[shopify/webhook] [native] shipping_address:", JSON.stringify(order.shipping_address ?? null));
    console.log("[shopify/webhook] [native] line_items count:", order.line_items?.length ?? 0);

    articles       = buildArticles(order.line_items ?? []);
    shippingMethod = extractShippingMethodNative(order.shipping_lines);
    dispatchDate   = extractDispatchDateNative(order.line_items);

    email    = order.email       ?? null;
    phone    = sa?.phone         ?? order.phone ?? null;
    street   = sa?.address1      ?? null;
    suburb   = sa?.city          ?? null;
    state    = sa?.province_code ?? null;
    postcode = sa?.zip           ?? null;
    orderNum = order.name        ?? null;   // e.g. "#3299"
    note     = order.note        || null;

    originalPrice  = parseFloat(String(order.subtotal_price ?? "")) ||
                     parseFloat(String(order.total_price    ?? "")) || 0;
    finalPrice     = parseFloat(String(order.total_price    ?? "")) || 0;
    discountAmount = Math.max(0, originalPrice - finalPrice);

    const noteAttributes = order.note_attributes ?? [];
    const giftWrapAttr   = noteAttributes.find((a) => a.name?.toLowerCase().includes("gift"));
    hasGiftWrap =
      giftWrapAttr?.value === "Yes"  ||
      giftWrapAttr?.value === "yes"  ||
      giftWrapAttr?.value === "true" ||
      articles.toLowerCase().includes("gift wrap")     ||
      articles.toLowerCase().includes("gift wrapping") ||
      order.note?.toLowerCase().includes("gift wrap")  ||
      false;

    console.log("[webhook] gift wrap detection:", { noteAttributesCount: noteAttributes.length, giftWrapAttr, hasGiftWrap });

  } else {
    // ── Zapier flat format ────────────────────────────────────────────────
    const body = rawBody as ZapierFlatOrder;

    const resolved = resolveNameZapier(body);
    firstName = resolved.firstName;
    lastName  = resolved.lastName;
    console.log("[shopify/webhook] [zapier] resolved name:", { firstName, lastName });
    console.log("[shopify/webhook] [zapier] orderNumber:", body.orderNumber);
    console.log("[shopify/webhook] [zapier] shippingFirstName:", body.shippingFirstName);
    console.log("[shopify/webhook] [zapier] customerFirstName:", body.customerFirstName, "customerLastName:", body.customerLastName);
    console.log("[shopify/webhook] [zapier] lineItems type:", typeof body.lineItems, "length:", typeof body.lineItems === "string" ? (body.lineItems as string).length : "N/A");

    articles       = parseLineItems(body.lineItems);
    shippingMethod = extractShippingMethodZapier(body.shippingLines);
    dispatchDate   = extractDispatchDateZapier(body.lineItems);

    email    = body.customerEmail        ?? null;
    phone    = body.shippingPhone        ?? body.customerPhone ?? null;
    street   = body.shippingAddress1     ?? null;
    suburb   = body.shippingCity         ?? null;
    state    = body.shippingProvinceCode ?? null;
    postcode = body.shippingPostalCode   ?? null;
    orderNum = body.orderNumber          ?? null;
    note     = body.orderNote            || null;

    originalPrice  = parseFloat(String(body.subtotalPrice       ?? "")) ||
                     parseFloat(String(body.totalLineItemsPrice  ?? "")) ||
                     parseFloat(String(body.totalPrice           ?? "")) || 0;
    finalPrice     = parseFloat(String(body.totalPrice ?? "")) || 0;
    discountAmount = Math.max(0, originalPrice - finalPrice);

    const noteAttributesRaw = body.noteAttributes ?? body.note_attributes ?? [];
    const noteAttributes: Array<{ name?: string; key?: string; value?: unknown }> =
      Array.isArray(noteAttributesRaw) ? noteAttributesRaw : [];
    const giftWrapAttr = noteAttributes.find(
      (a) => a.name?.toLowerCase().includes("gift") || a.key?.toLowerCase().includes("gift")
    );
    const lineItemsStr =
      typeof body.lineItems === "string"
        ? body.lineItems
        : JSON.stringify(body.lineItems ?? "");
    hasGiftWrap =
      giftWrapAttr?.value === "Yes" ||
      giftWrapAttr?.value === "yes" ||
      giftWrapAttr?.value === "true" ||
      giftWrapAttr?.value === true  ||
      lineItemsStr.toLowerCase().includes("gift wrap")     ||
      lineItemsStr.toLowerCase().includes("gift wrapping") ||
      body.orderNote?.toLowerCase().includes("gift wrap")  ||
      false;

    console.log("[webhook] gift wrap detection:", { noteAttributesCount: noteAttributes.length, giftWrapAttr, hasGiftWrap });
  }

  // ── D. Insert into Supabase ───────────────────────────────────────────────
  console.log("[shopify/webhook] articles:", articles);
  console.log("[shopify/webhook] shippingMethod:", shippingMethod);
  console.log("[shopify/webhook] dispatchDate:", dispatchDate);
  console.log("[shopify/webhook] pricing:", { originalPrice, finalPrice, discountAmount });

  const shopifyOrderId: string | null = isNative
    ? (String((rawBody as ShopifyOrder).id ?? "") || null)
    : (String((rawBody as ZapierFlatOrder).id ?? "") || null);

  // ── Idempotency guard ──────────────────────────────────────────────────────
  // A retried/duplicated webhook delivery (Shopify sends orders/create,
  // orders/updated, orders/paid as separate events for the same order; a
  // manual replay of a missed delivery would also land here) must never
  // create a second packet. packets_tenant_shopify_order_id_unique (136)
  // backs this at the DB level too — this check just avoids the failed-
  // insert round-trip and lets the duplicate resolve as "processed", not
  // "failed", since nothing actually went wrong.
  if (shopifyOrderId) {
    const supabaseCheck = createServerSupabaseClient();
    const { data: existing } = await supabaseCheck
      .from("packets")
      .select("id, reference_number")
      .eq("tenant_id", tenantId)
      .eq("shopify_order_id", shopifyOrderId)
      .maybeSingle();
    if (existing) {
      console.log("[shopify/webhook] duplicate delivery — packet already exists:", existing.reference_number, "id:", existing.id);
      await markWebhookEvent(webhookEventId, {
        status: "processed",
        packet_id: existing.id,
        processed_at: new Date().toISOString(),
      });
      return;
    }
  }

  const insertData = {
    reference_number:      referenceNumber,
    packet_type:           "online_order",
    job_type:              "online_order",
    delivery_method:       detectDeliveryMethod(shippingMethod),
    shopify_order_id:      shopifyOrderId,
    customer_first_name:   firstName,
    customer_last_name:    lastName,
    customer_email:        email,
    customer_phone:        phone,
    customer_street:       street,
    customer_suburb:       suburb,
    customer_state:        state,
    customer_postcode:     postcode,
    articles:              articles || null,
    items_ordered:         articles || null,
    instructions:          note,
    total_charges:         originalPrice || null,
    deposit:               null,
    balance:               null,
    in_date:               todayISO(),
    due_date:              dispatchDate,
    staff_member:          "Online Store",
    order_number:          orderNum,
    shipping_method:       shippingMethod,
    shipping_address_same: true,
    shipping_street:       null,
    shipping_suburb:       null,
    shipping_state:        null,
    shipping_postcode:     null,
    order_source:          "Shopify",
    gift_wrapping:         hasGiftWrap || null,
    packet_data:           {
      ...rawBody,
      original_price:  originalPrice,
      final_price:     finalPrice,
      discount_amount: discountAmount > 0 ? discountAmount : 0,
    },
  };

  console.log("[shopify/webhook] insertData (pre-insert):", JSON.stringify({ ...insertData, packet_data: "[omitted]" }, null, 2));

  const supabase = createServerSupabaseClient();
  console.log("[shopify/webhook] calling supabase.from(packets).insert — tenant_id:", tenantId);

  const { data, error } = await supabase
    .from("packets")
    .insert({ ...insertData, tenant_id: tenantId })
    .select("reference_number, id")
    .single();

  console.log("[shopify/webhook] insert result — data:", JSON.stringify(data));
  console.log("[shopify/webhook] insert result — error:", JSON.stringify(error));

  if (error) {
    console.error("[shopify/webhook] INSERT FAILED — code:", error.code, "| message:", error.message, "| details:", error.details, "| hint:", error.hint);
    await markFailed(webhookEventId, tenantId, orderNum ?? orderLabelFromRawBody(rawBody), `Packet insert failed: ${error.message}`);
    return;
  }

  console.log("[shopify/webhook] Packet saved successfully:", data?.reference_number, "id:", data?.id);
  await markWebhookEvent(webhookEventId, {
    status: "processed",
    packet_id: data?.id ?? null,
    processed_at: new Date().toISOString(),
  });

  } catch (unexpectedErr) {
    const msg = unexpectedErr instanceof Error ? unexpectedErr.message : String(unexpectedErr);
    console.error("[shopify/webhook] UNEXPECTED ERROR in processOrder:", msg);
    console.error("[shopify/webhook] UNEXPECTED ERROR stack:", unexpectedErr instanceof Error ? unexpectedErr.stack : "(no stack)");
    await markFailed(webhookEventId, tenantId, orderLabelFromRawBody(rawBody), `Unexpected error: ${msg}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── HANDLER ───────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// Returns 200 IMMEDIATELY after parsing the body — before any DB work runs.
// All processing happens in processOrder() via waitUntil(), which keeps the
// Vercel function alive until the insert completes.

export async function POST(req: NextRequest): Promise<NextResponse> {
  console.log("[shopify/webhook] received");

  // Shopify native webhooks send X-Shopify-Shop-Domain on every request.
  // Zapier webhooks do not — they fall back to the Class A hardcoded tenant.
  const shopDomain = req.headers.get("x-shopify-shop-domain") ?? null;
  const topic      = req.headers.get("x-shopify-topic") ?? null;
  console.log("[shopify/webhook] shop domain:", shopDomain ?? "(none — Zapier)");

  // Read the raw text FIRST — the request stream can only be consumed once,
  // and we need the verbatim body even if it turns out not to be valid JSON,
  // so a malformed delivery still leaves a durable trace instead of vanishing.
  const rawText = await req.text();

  let rawBody: Record<string, unknown> | null = null;
  let parseError: string | null = null;
  try {
    rawBody = JSON.parse(rawText) as Record<string, unknown>;
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }

  const { tenantId, fallbackUsed } = await resolveTenantId(shopDomain);
  console.log("[shopify/webhook] resolved tenant_id:", tenantId, "fallback used:", fallbackUsed);

  const externalId = rawBody ? orderLabelFromRawBody(rawBody) : null;

  // ── Durable receipt — the entire point of this rework ─────────────────────
  // Insert the row BEFORE responding to Shopify. This is the one place where
  // returning 200 without having actually recorded anything would be worse
  // than making Shopify retry: if this insert itself fails, we return an
  // error so Shopify retries the delivery, because at that point we have no
  // record of it ever having arrived at all.
  const supabase = createServerSupabaseClient();
  const { data: webhookEvent, error: insertErr } = await supabase
    .from("webhook_events")
    .insert({
      tenant_id: tenantId,
      source: "shopify",
      topic,
      external_id: externalId,
      shop_domain: shopDomain,
      raw_body: rawText,
      status: rawBody ? "received" : "parse_failed",
      error_message: parseError,
      tenant_fallback_used: fallbackUsed,
    })
    .select("id")
    .single();

  if (insertErr || !webhookEvent) {
    console.error("[shopify/webhook] FAILED to durably record incoming webhook — returning 500 so Shopify retries:", insertErr?.message);
    return NextResponse.json({ error: "failed to record webhook" }, { status: 500 });
  }

  if (!rawBody) {
    // Malformed body: durably recorded above as parse_failed. Still return
    // 200 — a genuinely malformed delivery isn't something a Shopify retry
    // would fix, and we no longer need the retry to avoid losing the record.
    console.error("[shopify/webhook] Failed to parse JSON body:", parseError);
    await fileVaultBrainSystemReport({
      tenantId,
      title: "Shopify webhook body could not be parsed",
      summary: parseError ?? "Unknown parse error",
      area: "Orders",
      priority: "Critical",
      tags: ["shopify", "webhook", "auto-filed", "parse-failure"],
      source: "system:shopify-webhook",
    });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  console.log("[shopify/webhook] body keys:", Object.keys(rawBody));
  console.log("[shopify/webhook] orderNumber:", externalId);

  // Register background processing — runs after response is sent. Any
  // exception processOrder() doesn't already catch internally still marks
  // the row failed here, as a last line of defence — but processOrder()
  // itself is expected to own every real status transition.
  waitUntil(
    processOrder(rawBody, tenantId, webhookEvent.id).catch((err) =>
      markFailed(webhookEvent.id, tenantId, externalId, `processOrder threw: ${err instanceof Error ? err.message : String(err)}`)
    )
  );

  // Return 200 immediately — the durable record above is what makes this
  // safe now, not just convenient.
  return NextResponse.json({ received: true }, { status: 200 });
}
