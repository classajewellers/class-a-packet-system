/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateReferenceNumber } from "@/lib/referenceNumber";
import { todayISO } from "@/lib/formatters";

export const dynamic = "force-dynamic";

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
  shippingFirstName?: string;    // shipping address name — may contain full name
  shippingAddress1?: string;
  shippingCity?: string;
  shippingProvinceCode?: string; // full province name e.g. "South Australia"
  shippingPostalCode?: string;
  shippingPhone?: string;
  lineItems?: unknown;           // array OR raw text blob
  shippingLines?: unknown;       // array OR raw text blob
  orderNote?: string;
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

    // Extract variantTitle — append if meaningful (not "Default Title" / "None")
    const variantMatch = block.match(/^variantTitle:\s*(.+)$/m);
    const variantRaw   = variantMatch?.[1]?.trim() ?? "";
    const isDefaultVariant =
      !variantRaw ||
      variantRaw.toLowerCase() === "default title" ||
      variantRaw.toLowerCase() === "none" ||
      variantRaw.toLowerCase() === "null";
    const displayName = isDefaultVariant ? name : `${name} - ${variantRaw}`;

    // Skip free gifts and product add-ons (zero-price add-ons)
    if (name.toLowerCase().includes("free gift")) continue;

    // Extract price from discountedTotalSet amount — skip zero-price items
    const priceMatch = block.match(/discountedTotalSet:.*?'amount':\s*'([\d.]+)'/);
    const price = parseFloat(priceMatch?.[1] || "0");
    if (price === 0) continue;

    // Extract quantity
    const qtyMatch = block.match(/^quantity:\s*(\d+)$/m);
    const qty = qtyMatch?.[1] || "1";

    // Extract customAttributes — exec loop covers all personalisation fields.
    // Use [^']* (not [^']+) so keys/values with unusual spacing still match.
    // Values trimmed of surrounding whitespace including newlines
    // (Zapier can send values like '\n\n Yellow Gold\n\n').
    const meaningfulKeys = [
      "metal", "carat", "karat", "gold", "colour", "color",
      "stone", "gem", "diamond", "sapphire", "ruby", "emerald",
      "size", "ring size", "engraving", "personalisation", "personalization",
      "chain", "initial", "birthstone",
      "pendant", "pendant 1", "pendant 2", "pendant 3", "pendant 4", "pendant 5", "pendant 6",
      "number", "font", "text", "message", "name",
      "finish", "width", "length", "weight", "alloy", "plating",
      "rhodium", "confirmation", "style", "design",
    ];

    const attrMatches: RegExpExecArray[] = [];
    const attrRe = /'key':\s*'([^']*)',\s*'value':\s*'([^']*)'/g;
    let attrM: RegExpExecArray | null;
    while ((attrM = attrRe.exec(block)) !== null) attrMatches.push(attrM);

    console.log('[webhook] customAttributes found:', attrMatches.length);

    const attrs = attrMatches
      .filter((m) => {
        const key = m[1].toLowerCase().trim();
        const val = m[2].trim();
        // Skip empty values
        if (!val) return false;
        // Skip internal / tracking keys (Shopify internal fields start with _)
        if (key.startsWith("_") || key.startsWith("cl_")) return false;
        // Must match a meaningful product attribute key (case-insensitive)
        return meaningfulKeys.some((k) => key.includes(k.toLowerCase()));
      })
      .map((m) => `  ${m[1]}: ${m[2].trim()}`)
      .join("\n");

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

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Parse body ─────────────────────────────────────────────────────────
  let body: ZapierFlatOrder;
  try {
    body = (await req.json()) as ZapierFlatOrder;
  } catch {
    console.error("[shopify/webhook] Failed to parse JSON body");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log("[shopify/webhook] Received:", JSON.stringify(body));
  console.log("[shopify/webhook] lineItems type:", typeof body.lineItems);
  console.log("[shopify/webhook] lineItems raw:", JSON.stringify(body.lineItems));

  // ── 2. Generate ON-YYYYMMDD-XXXX reference number ────────────────────────
  let referenceNumber: string;
  try {
    referenceNumber = await generateReferenceNumber(new Date(), "online_order");
    console.log("[shopify/webhook] Reference:", referenceNumber);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[shopify/webhook] Reference generation failed:", msg);
    return NextResponse.json({ ok: false, error: "Reference generation failed" });
  }

  // ── 3. Parse line items and shipping ─────────────────────────────────────
  const articles       = parseLineItems(body.lineItems);
  const shippingMethod = extractShippingMethod(body.shippingLines);
  const dispatchDate   = extractDispatchDate(body.lineItems);

  console.log("[shopify/webhook] articles:", articles);
  console.log("[shopify/webhook] shippingMethod:", shippingMethod);
  console.log("[shopify/webhook] dispatchDate:", dispatchDate);

  // ── 4. Map fields ─────────────────────────────────────────────────────────
  const { firstName, lastName } = resolveName(body);
  const email    = body.customerEmail      ?? null;
  const phone    = body.shippingPhone      ?? body.customerPhone ?? null;
  const street   = body.shippingAddress1   ?? null;
  const suburb   = body.shippingCity       ?? null;
  const state    = body.shippingProvinceCode ?? null;
  const postcode = body.shippingPostalCode ?? null;
  const orderNum = body.orderNumber        ?? null;
  const total    = parseFloat(String(body.totalPrice ?? "0")) || 0;
  const note     = body.orderNote          || null;

  console.log("[shopify/webhook] Resolved name:", { firstName, lastName });
  console.log("[shopify/webhook] Mapped fields:", {
    orderNumber: orderNum, email, phone, firstName, lastName,
    total, articlesLength: articles.length, shippingMethod, dispatchDate,
  });

  // ── 5. Build insert payload ───────────────────────────────────────────────
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
    total_charges:         total    || null,
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
    packet_data:           body as unknown as Record<string, unknown>,
  };

  // ── 6. Insert into Supabase ───────────────────────────────────────────────
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("packets")
    .insert(insertData)
    .select("reference_number, id")
    .single();

  if (error) {
    console.error("[shopify/webhook] Supabase insert failed:", JSON.stringify(error));
    return NextResponse.json({ ok: false, error: error.message, details: error });
  }

  console.log("[shopify/webhook] Packet saved:", data?.reference_number);
  return NextResponse.json({ ok: true, reference: data?.reference_number });
}
