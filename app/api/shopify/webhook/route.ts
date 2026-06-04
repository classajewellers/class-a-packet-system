/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateReferenceNumber } from "@/lib/referenceNumber";
import { todayISO } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "shopify webhook" }, { status: 200 });
}

// ── Zapier flat-field payload ─────────────────────────────────────────────────
// Zapier sends Shopify order data as a flat object with camelCase keys.
// No HMAC verification needed — Zapier authenticates with Shopify on its end.
//
// ── Zapier field mapping (update in your Zapier zap) ─────────────────────────
// Map these Shopify fields in the Zapier "Code by Zapier" or "Webhooks by Zapier"
// action that POSTs to this endpoint:
//
//   orderNumber       → Shopify order number (e.g. 1234)
//   customerEmail     → Customer email
//   customerPhone     → Customer phone
//   customerFirstName → Customer first name  ← REQUIRED for click & collect
//   customerLastName  → Customer last name   ← REQUIRED for click & collect
//   billingName       → Billing address full name (fallback)
//   totalPrice        → Order total (numeric)
//   shippingFirstName → Shipping address first name (full name — split on first space)
//   shippingAddress1  → Shipping street address
//   shippingCity      → Shipping suburb/city
//   shippingProvinceCode → Shipping state (e.g. "South Australia")
//   shippingPostalCode   → Shipping postcode
//   shippingPhone     → Shipping phone
//   lineItems         → Line items blob (Zapier raw text format)
//   shippingLines     → Shipping lines blob (Zapier raw text format)
//   orderNote         → Order notes / customer instructions
//   noteAttributes    → Note Attributes array  ← REQUIRED for gift wrapping detection
//                        (in Zapier: map Shopify "Note Attributes" field here)
//                        Format: [{name: 'Gift Wrapping', value: 'Yes'}, ...]
//   subtotalPrice     → Shopify "Subtotal Price"  ← REQUIRED for original price
//   totalLineItemsPrice → Shopify "Total Line Items Price"  ← fallback original price
//                        (totalPrice = after discounts; these fields = before discounts)
// ─────────────────────────────────────────────────────────────────────────────

interface ZapierFlatOrder {
  id?: string;
  createdAt?: string;
  orderNumber?: string;
  customerEmail?: string;
  customerPhone?: string;
  // Customer name fields — required for click & collect (shippingFirstName is blank)
  customerFirstName?: string;
  customerLastName?: string;
  billingName?: string;          // billing address full name (last-resort fallback)
  totalPrice?: number | string;
  subtotalPrice?: number | string;       // pre-discount subtotal (preferred for total_charges)
  totalLineItemsPrice?: number | string; // sum of line item original prices (fallback)
  shippingFirstName?: string;    // shipping address name — may contain full name
  shippingAddress1?: string;
  shippingCity?: string;
  shippingProvinceCode?: string; // full province name e.g. "South Australia"
  shippingPostalCode?: string;
  shippingPhone?: string;
  lineItems?: unknown;           // array OR raw text blob
  shippingLines?: unknown;       // array OR raw text blob
  orderNote?: string;
  noteAttributes?: unknown;      // [{name: 'Gift Wrapping', value: 'Yes'}, ...] or [{key, value}]
  note_attributes?: unknown;     // snake_case alias from some Zapier setups
  [key: string]: unknown;
}

// ── Customer name resolution ──────────────────────────────────────────────────
// Priority: shippingFirstName → customerFirstName + customerLastName → billingName → "Online Customer"
// Click & collect orders have no shippingFirstName — falls through to customerFirstName/LastName.

function resolveName(body: ZapierFlatOrder): { firstName: string; lastName: string } {
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

// ── Line items → formatted articles string ────────────────────────────────────

function parseLineItems(raw: any): string {
  if (!raw || typeof raw !== "string") return "";

  // Split into item blocks by blank line
  const blocks = raw.split(/\n\n+/);
  const results: string[] = [];

  for (const block of blocks) {
    // Extract name
    const nameMatch = block.match(/^name:\s*(.+)$/m);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim();

    // Extract variantTitle — append only if meaningful and not already in the name.
    // Prevents "Ring - 18ct Gold / Pair - 18ct Gold / Pair" duplication when Shopify
    // returns the variant as part of the product name AND as variantTitle.
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

    // Skip explicit free gifts (e.g. add-on items named "Free Gift …")
    if (name.toLowerCase().includes("free gift")) continue;

    // Extract price from discountedTotalSet amount.
    const priceMatch = block.match(/discountedTotalSet:.*?'amount':\s*'([\d.]+)'/);
    const price = parseFloat(priceMatch?.[1] || "0");

    // Extract quantity
    const qtyMatch = block.match(/^quantity:\s*(\d+)$/m);
    const qty = qtyMatch?.[1] || "1";

    // Extract customAttributes — exec loop finds every key/value pair in the block.
    // Use [^']* so keys/values with unusual spacing still match.
    // Values are trimmed of surrounding whitespace (Zapier can send '\n\n Yellow Gold\n\n').
    //
    // BUG FIX (Bug 2 — carat weight / metal colour): added "charm", "charm 1–6",
    // "carat weight", "metal colour", "ct" and other PCN-specific attribute keys
    // that the previous list missed.
    //
    // BUG FIX (Bug 1 — Pendant 1 dropped): attribute parsing now runs BEFORE the
    // price=0 guard so pendant add-on line items (Pendant 1 as a $0 add-on) are
    // retained when they carry meaningful attributes.
    const meaningfulKeys = [
      "metal", "carat", "karat", "gold", "colour", "color",
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

    const attrMatches: RegExpExecArray[] = [];
    const attrRe = /'key':\s*'([^']*)',\s*'value':\s*'([^']*)'/g;
    let attrM: RegExpExecArray | null;
    while ((attrM = attrRe.exec(block)) !== null) attrMatches.push(attrM);

    const attrs = attrMatches
      .filter((m) => {
        const key = m[1].toLowerCase().trim();
        const val = m[2].trim();
        // Skip empty values
        if (!val) return false;
        // Skip internal / tracking keys (Shopify fields starting with _ or cl_)
        if (key.startsWith("_") || key.startsWith("cl_")) return false;
        // Must match a meaningful product attribute key (case-insensitive substring match)
        return meaningfulKeys.some((k) => key.includes(k.toLowerCase()));
      })
      .map((m) => `  ${m[1]}: ${m[2].trim()}`)
      .join("\n");

    // BUG FIX (Bug 1): Skip zero-price items ONLY when they have no meaningful
    // attributes to capture.  Previously this fired unconditionally before attrs
    // were parsed, silently dropping "Pendant 1" add-on line items priced at $0.
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

// ── Shipping method extraction ────────────────────────────────────────────────

function extractShippingMethod(raw: unknown): string | null {
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

// ── Dispatch date extraction ──────────────────────────────────────────────────
// Returns null for non-date strings like "Same Day Dispatch", "Express", etc.
// Only returns a date if the value contains a recognisable month name + day number.

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

function extractDispatchDate(raw: any): string | null {
  if (!raw || typeof raw !== "string") return null;

  const match = raw.match(/'key':\s*'Estimated Dispatch',\s*'value':\s*'([^']+)'/);
  if (!match) return null;

  const dateStr = match[1].trim(); // e.g. "Wednesday, May 13th" or "Same Day Dispatch"

  // Explicit same-day check — set due_date to null so label shows "SET DUE DATE"
  // prompting staff to set the correct date after packing.
  if (/same.?day/i.test(dateStr)) {
    console.log(`[shopify/webhook] extractDispatchDate: "${dateStr}" is same-day — returning null`);
    return null;
  }

  // Require both a month name AND a day number — rejects non-date strings.
  const hasMonth = MONTH_NAMES.some((m) => dateStr.toLowerCase().includes(m));
  const hasDay   = /\d{1,2}/.test(dateStr);
  if (!hasMonth || !hasDay) {
    console.log(`[shopify/webhook] extractDispatchDate: "${dateStr}" is not a date — returning null`);
    return null;
  }

  try {
    // Strip ordinal suffixes: "13th" → "13"
    const cleaned = dateStr.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
    const year    = new Date().getFullYear();
    const parsed  = new Date(`${cleaned} ${year}`);
    if (isNaN(parsed.getTime())) return null;
    // Roll forward if the date has already passed this year
    if (parsed < new Date()) parsed.setFullYear(year + 1);
    return parsed.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

// ── Background processing ─────────────────────────────────────────────────────
// Called via waitUntil() so the 200 is already sent to Zapier before any
// DB work begins. Zapier has a ~10 s response timeout — this ensures we
// never breach it regardless of how long the insert takes.

async function processOrder(body: ZapierFlatOrder): Promise<void> {
  // ── A. Generate reference number ──────────────────────────────────────────
  let referenceNumber: string;
  try {
    referenceNumber = await generateReferenceNumber(new Date(), "online_order");
    console.log("[shopify/webhook] Reference:", referenceNumber);
  } catch (err) {
    console.error("[shopify/webhook] Reference generation failed:", err instanceof Error ? err.message : err);
    return;
  }

  // ── B. Parse line items and shipping ──────────────────────────────────────
  const articles       = parseLineItems(body.lineItems);
  const shippingMethod = extractShippingMethod(body.shippingLines);
  const dispatchDate   = extractDispatchDate(body.lineItems);

  console.log("[shopify/webhook] articles:", articles);
  console.log("[shopify/webhook] shippingMethod:", shippingMethod);
  console.log("[shopify/webhook] dispatchDate:", dispatchDate);

  // ── D. Gift wrapping detection ────────────────────────────────────────────
  const noteAttributesRaw = body.noteAttributes ?? body.note_attributes ?? [];
  const noteAttributes: Array<{ name?: string; key?: string; value?: unknown }> =
    Array.isArray(noteAttributesRaw) ? noteAttributesRaw : [];

  const giftWrapAttr = noteAttributes.find(
    (a) =>
      a.name?.toLowerCase().includes("gift") ||
      a.key?.toLowerCase().includes("gift")
  );

  const lineItemsStr =
    typeof body.lineItems === "string"
      ? body.lineItems
      : JSON.stringify(body.lineItems ?? "");

  const hasGiftWrap =
    giftWrapAttr?.value === "Yes" ||
    giftWrapAttr?.value === "yes" ||
    giftWrapAttr?.value === "true" ||
    giftWrapAttr?.value === true ||
    lineItemsStr.toLowerCase().includes("gift wrap") ||
    lineItemsStr.toLowerCase().includes("gift wrapping") ||
    body.orderNote?.toLowerCase().includes("gift wrap") ||
    false;

  console.log("[webhook] gift wrap detection:", { noteAttributesCount: noteAttributes.length, giftWrapAttr, hasGiftWrap });

  // ── E. Map fields ─────────────────────────────────────────────────────────
  const { firstName, lastName } = resolveName(body);
  const email    = body.customerEmail       ?? null;
  const phone    = body.shippingPhone       ?? body.customerPhone ?? null;
  const street   = body.shippingAddress1    ?? null;
  const suburb   = body.shippingCity        ?? null;
  const state    = body.shippingProvinceCode ?? null;
  const postcode = body.shippingPostalCode  ?? null;
  const orderNum = body.orderNumber         ?? null;
  const note     = body.orderNote           || null;

  const originalPrice =
    parseFloat(String(body.subtotalPrice ?? "")) ||
    parseFloat(String(body.totalLineItemsPrice ?? "")) ||
    parseFloat(String(body.totalPrice ?? "")) ||
    0;
  const finalPrice    = parseFloat(String(body.totalPrice ?? "")) || 0;
  const discountAmount = Math.max(0, originalPrice - finalPrice);

  console.log("[webhook] pricing:", { originalPrice, finalPrice, discountAmount });
  console.log("[shopify/webhook] Resolved name:", { firstName, lastName });

  // ── F. Insert into Supabase ───────────────────────────────────────────────
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
      ...(body as unknown as Record<string, unknown>),
      original_price:  originalPrice,
      final_price:     finalPrice,
      discount_amount: discountAmount > 0 ? discountAmount : 0,
    },
  };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("packets")
    .insert(insertData)
    .select("reference_number, id")
    .single();

  if (error) {
    console.error("[shopify/webhook] Supabase insert failed:", JSON.stringify(error));
    return;
  }

  console.log("[shopify/webhook] Packet saved:", data?.reference_number);
}

// ── Handler ────────────────────────────────────────────────────────────────────
// Returns 200 to Zapier IMMEDIATELY after parsing the body — before any DB
// work runs. All processing happens in processOrder() via waitUntil(), which
// keeps the Vercel function alive until the insert completes.

export async function POST(req: NextRequest): Promise<NextResponse> {
  console.log("[shopify/webhook] received");

  // Parse body first — the request stream can only be read once, and we must
  // do it before handing off to waitUntil.
  let body: ZapierFlatOrder;
  try {
    body = (await req.json()) as ZapierFlatOrder;
  } catch {
    // Return 200 even on parse failure so Zapier doesn't mark the hook as broken.
    // Bad payloads will be logged but not retried.
    console.error("[shopify/webhook] Failed to parse JSON body — returning 200 to prevent Zapier retry loop");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  console.log("[shopify/webhook] body keys:", Object.keys(body));
  console.log("[shopify/webhook] orderNumber:", body.orderNumber);

  // Register background processing — runs after response is sent.
  waitUntil(
    processOrder(body).catch((err) =>
      console.error("[shopify/webhook] processOrder threw:", err)
    )
  );

  // Return 200 immediately so Zapier doesn't timeout.
  return NextResponse.json({ received: true }, { status: 200 });
}
