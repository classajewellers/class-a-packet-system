// Shopify webhook — accepts BOTH native Shopify format AND legacy Zapier flat format.
// Auto-detects which format is being received and routes to the appropriate parser.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// No user session — hardcode Class A tenant ID
const CLASSA_TENANT_ID = "00000000-0000-0000-0000-000000000001";
import { generateReferenceNumber } from "@/lib/referenceNumber";
import { todayISO } from "@/lib/formatters";

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

function isNativeShopifyFormat(body: Record<string, unknown>): boolean {
  return (
    body.line_items !== undefined ||
    !!(body.id && body.name && body.shipping_address)
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── SHARED UTILITIES ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const meaningfulKeys = [
  "metal", "carat", "carat", "gold", "colour", "color",
  "stone", "gem", "diamond", "sapphire", "ruby", "emerald",
  "size", "ring size", "engraving", "personalisation", "personalization",
  "chain", "initial", "birthstone",
  // Pendants — numbered and un-numbered
  "pendant", "pendant 1", "pendant 2", "pendant 3", "pendant 4", "pendant 5", "pendant 6",
  // Charms — PCN products often use "Charm 1/2/3" not "Pendant 1/2/3"
  "charm", "charm 1", "charm 2", "charm 3", "charm 4", "charm 5", "charm 6",
  "number", "font", "text", "message", "name",
  "finish", "width", "length", "weight", "alloy",
  // Metal/material specifics
  "material", "plating", "rhodium", "silver", "platinum",
  "confirmation", "style", "design",
  // Explicit compound keys often used on PCN/necklace products
  "carat weight", "metal colour", "metal color", "gold colour", "gold color",
  "metal type", "gold type", "chain type", "chain metal", "chain colour",
  // Abbreviations
  "ct", "kt",
];

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

function buildArticles(lineItems: ShopifyLineItem[]): string {
  const results: string[] = [];

  for (const item of lineItems) {
    const name = item.title?.trim() || "";
    if (!name) continue;

    if (name.toLowerCase().includes("free gift")) continue;

    const price = parseFloat(item.price || "0");
    const qty   = item.quantity || 1;

    const variantRaw = item.variant_title?.trim() ?? "";
    const isDefaultVariant =
      !variantRaw ||
      variantRaw.toLowerCase() === "default title" ||
      variantRaw.toLowerCase() === "none" ||
      variantRaw.toLowerCase() === "null";
    const variantAlreadyInName = name.toLowerCase().includes(variantRaw.toLowerCase());
    const shouldAppendVariant  = !isDefaultVariant && !variantAlreadyInName;
    const displayName = shouldAppendVariant ? `${name} - ${variantRaw}` : name;

    // Attribute parsing runs BEFORE the price=0 guard so $0 add-on line items
    // (e.g. "Pendant 1") are retained when they carry meaningful attributes.
    const props = item.properties ?? [];
    const attrs = props
      .filter((p) => {
        const key = p.name?.toLowerCase().trim() ?? "";
        const val = p.value?.trim() ?? "";
        if (!val) return false;
        if (key.startsWith("_") || key.startsWith("cl_")) return false;
        return meaningfulKeys.some((k) => key.includes(k));
      })
      .map((p) => `  ${p.name}: ${p.value.trim()}`)
      .join("\n");

    if (price === 0 && !attrs) continue;

    console.log(
      "[webhook] line item:",
      name,
      "price:", price,
      "variantTitle:", variantRaw || "(none)",
      "appendVariant:", shouldAppendVariant,
      "attrs kept:", attrs ? attrs.split("\n").length : 0
    );

    results.push(`${qty}x ${displayName}${attrs ? "\n" + attrs : ""}`);
  }

  return results.join("\n");
}

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

function parseLineItems(raw: any): string {
  if (!raw || typeof raw !== "string") return "";

  const blocks = raw.split(/\n\n+/);
  const results: string[] = [];

  for (const block of blocks) {
    const nameMatch = block.match(/^name:\s*(.+)$/m);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    const variantMatch = block.match(/^variantTitle:\s*(.+)$/m);
    const variantRaw   = variantMatch?.[1]?.trim() ?? "";
    const isDefaultVariant =
      !variantRaw ||
      variantRaw.toLowerCase() === "default title" ||
      variantRaw.toLowerCase() === "none" ||
      variantRaw.toLowerCase() === "null";
    const variantAlreadyInName = name.toLowerCase().includes(variantRaw.toLowerCase());
    const shouldAppendVariant  = !isDefaultVariant && !variantAlreadyInName;
    const displayName = shouldAppendVariant ? `${name} - ${variantRaw}` : name;

    if (name.toLowerCase().includes("free gift")) continue;

    const priceMatch = block.match(/discountedTotalSet:.*?'amount':\s*'([\d.]+)'/);
    const price = parseFloat(priceMatch?.[1] || "0");

    const qtyMatch = block.match(/^quantity:\s*(\d+)$/m);
    const qty = qtyMatch?.[1] || "1";

    const attrMatches: RegExpExecArray[] = [];
    const attrRe = /'key':\s*'([^']*)',\s*'value':\s*'([^']*)'/g;
    let attrM: RegExpExecArray | null;
    while ((attrM = attrRe.exec(block)) !== null) attrMatches.push(attrM);

    // BUG FIX (Bug 1): attribute parsing runs BEFORE the price=0 guard so
    // pendant add-on line items (Pendant 1 as a $0 add-on) are retained.
    const attrs = attrMatches
      .filter((m) => {
        const key = m[1].toLowerCase().trim();
        const val = m[2].trim();
        if (!val) return false;
        if (key.startsWith("_") || key.startsWith("cl_")) return false;
        return meaningfulKeys.some((k) => key.includes(k.toLowerCase()));
      })
      .map((m) => `  ${m[1]}: ${m[2].trim()}`)
      .join("\n");

    if (price === 0 && !attrs) continue;

    console.log(
      "[webhook] line item:",
      name,
      "price:", price,
      "variantTitle:", variantRaw || "(none)",
      "appendVariant:", shouldAppendVariant,
      "attrs found:", attrMatches.length,
      "attrs kept:", attrs ? attrs.split("\n").length : 0
    );

    results.push(`${qty}x ${displayName}${attrs ? "\n" + attrs : ""}`);
  }

  return results.join("\n");
}

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

async function processOrder(rawBody: Record<string, unknown>): Promise<void> {
  console.log("[shopify/webhook] processOrder started");
  try {
  // ── A. Generate reference number ──────────────────────────────────────────
  let referenceNumber: string;
  try {
    referenceNumber = await generateReferenceNumber(new Date(), "online_order");
    console.log("[shopify/webhook] Reference:", referenceNumber);
  } catch (err) {
    console.error("[shopify/webhook] Reference generation failed:", err instanceof Error ? err.message : err);
    console.error("[shopify/webhook] Reference generation stack:", err instanceof Error ? err.stack : String(err));
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

  const insertData = {
    reference_number:      referenceNumber,
    packet_type:           "online_order",
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
    delivery_method:       null,
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
  console.log("[shopify/webhook] calling supabase.from(packets).insert — tenant_id:", CLASSA_TENANT_ID);

  const { data, error } = await supabase
    .from("packets")
    .insert({ ...insertData, tenant_id: CLASSA_TENANT_ID })
    .select("reference_number, id")
    .single();

  console.log("[shopify/webhook] insert result — data:", JSON.stringify(data));
  console.log("[shopify/webhook] insert result — error:", JSON.stringify(error));

  if (error) {
    console.error("[shopify/webhook] INSERT FAILED — code:", error.code, "| message:", error.message, "| details:", error.details, "| hint:", error.hint);
    return;
  }

  console.log("[shopify/webhook] Packet saved successfully:", data?.reference_number, "id:", data?.id);

  } catch (unexpectedErr) {
    console.error("[shopify/webhook] UNEXPECTED ERROR in processOrder:", unexpectedErr instanceof Error ? unexpectedErr.message : String(unexpectedErr));
    console.error("[shopify/webhook] UNEXPECTED ERROR stack:", unexpectedErr instanceof Error ? unexpectedErr.stack : "(no stack)");
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

  // Parse body first — the request stream can only be read once, and we must
  // do it before handing off to waitUntil.
  let rawBody: Record<string, unknown>;
  try {
    rawBody = (await req.json()) as Record<string, unknown>;
  } catch {
    // Return 200 even on parse failure so Shopify/Zapier doesn't mark the hook as broken.
    console.error("[shopify/webhook] Failed to parse JSON body — returning 200 to prevent retry loop");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  console.log("[shopify/webhook] body keys:", Object.keys(rawBody));
  console.log("[shopify/webhook] orderNumber:", rawBody.name ?? rawBody.orderNumber);

  // Register background processing — runs after response is sent.
  waitUntil(
    processOrder(rawBody).catch((err) =>
      console.error("[shopify/webhook] processOrder threw:", err)
    )
  );

  // Return 200 immediately so Shopify/Zapier doesn't timeout.
  return NextResponse.json({ received: true }, { status: 200 });
}
