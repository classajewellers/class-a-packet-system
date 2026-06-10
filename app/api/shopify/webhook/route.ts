// Shopify native webhook — accepts direct Shopify POST, not Zapier-mapped payload
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// Shopify sends the webhook directly (no user session) — hardcode Class A tenant ID
const CLASSA_TENANT_ID = "00000000-0000-0000-0000-000000000001";
import { generateReferenceNumber } from "@/lib/referenceNumber";
import { todayISO } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "shopify webhook" }, { status: 200 });
}

// ── Shopify native webhook payload types ──────────────────────────────────────

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
  total_price?: string | number;         // after discounts + shipping + tax
  note?: string | null;
  note_attributes?: ShopifyNoteAttribute[];
  shipping_lines?: ShopifyShippingLine[];
  shipping_address?: ShopifyAddress;
  billing_address?: ShopifyAddress;
  line_items?: ShopifyLineItem[];
}

// ── Customer name resolution ──────────────────────────────────────────────────
// Priority: shipping_address first/last → shipping_address name →
//           billing_address name → "Online Customer"
// Click & collect orders have no shipping_address — falls through to billing.

function resolveName(order: ShopifyOrder): { firstName: string; lastName: string } {
  const sa = order.shipping_address;
  const ba = order.billing_address;

  // Prefer explicit first/last from shipping address
  if (sa?.first_name || sa?.last_name) {
    return {
      firstName: sa.first_name?.trim() || "Online",
      lastName:  sa.last_name?.trim()  || "Customer",
    };
  }

  // Fall back to full name field (shipping then billing)
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

// ── Line items → formatted articles string ────────────────────────────────────

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

function buildArticles(lineItems: ShopifyLineItem[]): string {
  const results: string[] = [];

  for (const item of lineItems) {
    const name = item.title?.trim() || "";
    if (!name) continue;

    // Skip explicit free gifts (e.g. add-on items named "Free Gift …")
    if (name.toLowerCase().includes("free gift")) continue;

    const price = parseFloat(item.price || "0");
    const qty   = item.quantity || 1;

    // Variant — append only if meaningful and not already in the name.
    // Prevents "Ring - 18ct Gold / Pair - 18ct Gold / Pair" duplication.
    const variantRaw = item.variant_title?.trim() ?? "";
    const isDefaultVariant =
      !variantRaw ||
      variantRaw.toLowerCase() === "default title" ||
      variantRaw.toLowerCase() === "none" ||
      variantRaw.toLowerCase() === "null";
    const variantAlreadyInName = name.toLowerCase().includes(variantRaw.toLowerCase());
    const shouldAppendVariant  = !isDefaultVariant && !variantAlreadyInName;
    const displayName = shouldAppendVariant ? `${name} - ${variantRaw}` : name;

    // Properties → meaningful attributes
    // Attribute parsing runs BEFORE the price=0 guard so $0 add-on line items
    // (e.g. "Pendant 1") are retained when they carry meaningful attributes.
    const props = item.properties ?? [];
    const attrs = props
      .filter((p) => {
        const key = p.name?.toLowerCase().trim() ?? "";
        const val = p.value?.trim() ?? "";
        if (!val) return false;
        // Skip internal / tracking keys (Shopify fields starting with _ or cl_)
        if (key.startsWith("_") || key.startsWith("cl_")) return false;
        // Must match a meaningful product attribute key (case-insensitive substring match)
        return meaningfulKeys.some((k) => key.includes(k));
      })
      .map((p) => `  ${p.name}: ${p.value.trim()}`)
      .join("\n");

    // Skip zero-price items ONLY when they have no meaningful attributes to capture
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

// ── Shipping method extraction ────────────────────────────────────────────────

function extractShippingMethod(shippingLines: ShopifyShippingLine[] | undefined): string | null {
  if (!shippingLines || shippingLines.length === 0) return null;
  return shippingLines[0]?.title ?? null;
}

// ── Dispatch date extraction ──────────────────────────────────────────────────
// Searches all line items' properties for one whose name contains "dispatch".
// Returns null for non-date strings like "Same Day Dispatch", "Express", etc.
// Only returns a date if the value contains a recognisable month name + day number.

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

function extractDispatchDate(lineItems: ShopifyLineItem[] | undefined): string | null {
  if (!lineItems || lineItems.length === 0) return null;

  // Search all line items' properties for a dispatch date value
  let rawValue: string | null = null;
  outer: for (const item of lineItems) {
    for (const prop of (item.properties ?? [])) {
      if (prop.name?.toLowerCase().includes("dispatch")) {
        rawValue = prop.value?.trim() ?? null;
        if (rawValue) break outer;
      }
    }
  }

  if (!rawValue) return null;

  const dateStr = rawValue;
  // e.g. "Dispatch on Thursday, June 4th" or "Same Day Dispatch" or "Wednesday, May 13th"
  console.log(`[shopify/webhook] extractDispatchDate raw value: "${dateStr}"`);

  // Explicit same-day check — set due_date to null so label shows "SET DUE DATE"
  // prompting staff to set the correct date after packing.
  if (/same.?day/i.test(dateStr)) {
    console.log(`[shopify/webhook] extractDispatchDate: same-day — returning null`);
    return null;
  }

  // Strip leading "Dispatch on " prefix (e.g. "Dispatch on Thursday, June 4th" → "Thursday, June 4th")
  let cleaned = dateStr.replace(/^dispatch\s+on\s+/i, "").trim();

  // Strip leading weekday name and optional comma/space (e.g. "Thursday, " → "")
  cleaned = cleaned.replace(/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s*/i, "").trim();
  // Now cleaned should be e.g. "June 4th"

  // Require both a month name AND a day number — rejects remaining non-date strings
  const hasMonth = MONTH_NAMES.some((m) => cleaned.toLowerCase().includes(m));
  const hasDay   = /\d{1,2}/.test(cleaned);
  if (!hasMonth || !hasDay) {
    console.log(`[shopify/webhook] extractDispatchDate: "${cleaned}" is not a parseable date — returning null`);
    return null;
  }

  try {
    // Strip ordinal suffixes: "4th" → "4"
    const datePart = cleaned.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
    const year     = new Date().getFullYear();
    const parsed   = new Date(`${datePart} ${year}`);
    if (isNaN(parsed.getTime())) {
      console.log(`[shopify/webhook] extractDispatchDate: new Date("${datePart} ${year}") returned NaN`);
      return null;
    }
    // Roll forward if the date has already passed this year
    if (parsed < new Date()) parsed.setFullYear(year + 1);
    const result = parsed.toISOString().split("T")[0];
    console.log(`[shopify/webhook] extractDispatchDate: "${dateStr}" → ${result}`);
    return result;
  } catch {
    return null;
  }
}

// ── Background processing ─────────────────────────────────────────────────────
// Called via waitUntil() so the 200 is already sent to Shopify before any
// DB work begins. Shopify has a ~5 s response timeout — this ensures we
// never breach it regardless of how long the insert takes.

async function processOrder(order: ShopifyOrder): Promise<void> {
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
  const articles       = buildArticles(order.line_items ?? []);
  const shippingMethod = extractShippingMethod(order.shipping_lines);
  const dispatchDate   = extractDispatchDate(order.line_items);

  console.log("[shopify/webhook] articles:", articles);
  console.log("[shopify/webhook] shippingMethod:", shippingMethod);
  console.log("[shopify/webhook] dispatchDate:", dispatchDate);

  // ── D. Gift wrapping detection ────────────────────────────────────────────
  const noteAttributes = order.note_attributes ?? [];

  const giftWrapAttr = noteAttributes.find(
    (a) => a.name?.toLowerCase().includes("gift")
  );

  const hasGiftWrap =
    giftWrapAttr?.value === "Yes"  ||
    giftWrapAttr?.value === "yes"  ||
    giftWrapAttr?.value === "true" ||
    articles.toLowerCase().includes("gift wrap")     ||
    articles.toLowerCase().includes("gift wrapping") ||
    order.note?.toLowerCase().includes("gift wrap")  ||
    false;

  console.log("[webhook] gift wrap detection:", { noteAttributesCount: noteAttributes.length, giftWrapAttr, hasGiftWrap });

  // ── E. Map fields ─────────────────────────────────────────────────────────
  const { firstName, lastName } = resolveName(order);
  const sa = order.shipping_address;

  const email    = order.email           ?? null;
  const phone    = sa?.phone             ?? order.phone ?? null;
  const street   = sa?.address1          ?? null;
  const suburb   = sa?.city              ?? null;
  const state    = sa?.province_code     ?? null;
  const postcode = sa?.zip               ?? null;
  const orderNum = order.name            ?? null;   // e.g. "#3299"
  const note     = order.note            || null;

  const originalPrice =
    parseFloat(String(order.subtotal_price ?? "")) ||
    parseFloat(String(order.total_price    ?? "")) ||
    0;
  const finalPrice     = parseFloat(String(order.total_price ?? "")) || 0;
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
      ...(order as unknown as Record<string, unknown>),
      original_price:  originalPrice,
      final_price:     finalPrice,
      discount_amount: discountAmount > 0 ? discountAmount : 0,
    },
  };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("packets")
    .insert({ ...insertData, tenant_id: CLASSA_TENANT_ID })
    .select("reference_number, id")
    .single();

  if (error) {
    console.error("[shopify/webhook] Supabase insert failed:", JSON.stringify(error));
    return;
  }

  console.log("[shopify/webhook] Packet saved:", data?.reference_number);
}

// ── Handler ────────────────────────────────────────────────────────────────────
// Returns 200 to Shopify IMMEDIATELY after parsing the body — before any DB
// work runs. All processing happens in processOrder() via waitUntil(), which
// keeps the Vercel function alive until the insert completes.

export async function POST(req: NextRequest): Promise<NextResponse> {
  console.log("[shopify/webhook] received");

  // Parse body first — the request stream can only be read once, and we must
  // do it before handing off to waitUntil.
  let order: ShopifyOrder;
  try {
    order = (await req.json()) as ShopifyOrder;
  } catch {
    // Return 200 even on parse failure so Shopify doesn't mark the hook as broken.
    // Bad payloads will be logged but not retried.
    console.error("[shopify/webhook] Failed to parse JSON body — returning 200 to prevent retry loop");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  console.log("[shopify/webhook] body keys:", Object.keys(order));
  console.log("[shopify/webhook] orderNumber:", order.name);

  // Register background processing — runs after response is sent.
  waitUntil(
    processOrder(order).catch((err) =>
      console.error("[shopify/webhook] processOrder threw:", err)
    )
  );

  // Return 200 immediately so Shopify doesn't timeout.
  return NextResponse.json({ received: true }, { status: 200 });
}
