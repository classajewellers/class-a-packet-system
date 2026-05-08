import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateReferenceNumber } from "@/lib/referenceNumber";
import { todayISO } from "@/lib/formatters";

export const dynamic = "force-dynamic";

// ── Zapier flat-field payload ─────────────────────────────────────────────────
// Zapier sends Shopify order data as a flat object with camelCase keys.
// No HMAC verification needed — Zapier authenticates with Shopify on its end.

interface ZapierFlatOrder {
  id?: string;
  createdAt?: string;
  orderNumber?: string;
  customerEmail?: string;
  customerPhone?: string;
  totalPrice?: number | string;
  shippingFirstName?: string;  // full name — split on first space for first/last
  shippingAddress1?: string;
  shippingCity?: string;
  shippingProvinceCode?: string;  // full province name e.g. "South Australia"
  shippingPostalCode?: string;
  shippingPhone?: string;
  lineItems?: string;       // raw text blob
  shippingLines?: string;   // raw text blob
  orderNote?: string;
  [key: string]: unknown;   // allow extra fields without TS errors
}

// ── Custom attribute helpers ──────────────────────────────────────────────────

type AttrMap = Record<string, string>;

/**
 * Parse Shopify customAttributes / properties from various formats:
 *   - JSON array: [{"key":"Metal","value":"Gold"}, ...]
 *   - JSON array: [{"name":"Metal","value":"Gold"}, ...]  (Shopify properties)
 *   - Text pairs: "Metal: Gold, Personalisation: John"
 */
function parseAttrs(raw: string | null | undefined): AttrMap {
  if (!raw) return {};
  const s = raw.trim();
  if (!s) return {};

  // Try JSON array
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) {
      return Object.fromEntries(
        arr
          .filter((a) => (a.key || a.name) && a.value != null)
          .map((a) => [String(a.key ?? a.name).trim(), String(a.value).trim()])
      );
    }
  } catch { /* fall through */ }

  // Text: "Key: Value, Key2: Value2" or "Key: Value\nKey2: Value2"
  const map: AttrMap = {};
  const regex = /([^:,\n]+):\s*([^,\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(s)) !== null) {
    map[m[1].trim()] = m[2].trim();
  }
  return map;
}

// ── Line item parsing ─────────────────────────────────────────────────────────

interface ParsedLineItem {
  title: string;
  quantity: number;
  price: number;
  attrs: AttrMap;
}

/**
 * Parse the lineItems text blob Zapier sends.
 * Attempts JSON first, then falls back to line-by-line key:value parsing.
 * Shopify line items have either `customAttributes` or `properties` for extras.
 */
function parseLineItems(raw: string | undefined): ParsedLineItem[] {
  if (!raw) return [];
  const s = raw.trim();
  if (!s) return [];

  // ── JSON array ──
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) {
      return arr.map((item) => ({
        title:    String(item.title ?? "").trim(),
        quantity: Number(item.quantity ?? 1),
        price:    parseFloat(String(item.price ?? "0")),
        attrs:    parseAttrs(
          item.customAttributes
            ? JSON.stringify(item.customAttributes)
            : item.properties
            ? JSON.stringify(item.properties)
            : null
        ),
      }));
    }
  } catch { /* fall through */ }

  // ── Text block parsing ──
  // Split blocks on blank lines or "---" separators
  const blocks = s.split(/\n\s*\n|---+/).filter((b) => b.trim());

  return blocks.map((block) => {
    const get = (key: string) =>
      block.match(new RegExp(`${key}:\\s*(.+)`, "i"))?.[1]?.trim() ?? "";

    const title    = get("title");
    const quantity = parseInt(get("quantity") || "1") || 1;
    const price    = parseFloat(get("price") || "0") || 0;

    // Look for customAttributes or properties line
    const attrsRaw =
      block.match(/customAttributes:\s*(.+)/i)?.[1] ??
      block.match(/properties:\s*(.+)/i)?.[1] ??
      null;

    return { title, quantity, price, attrs: parseAttrs(attrsRaw) };
  }).filter((i) => i.title);
}

// ── Format articles string for the label/admin ────────────────────────────────

const MEANINGFUL_ATTR_KEYS = [
  "metal", "stone", "size", "colour", "color", "engraving", "personalisation",
  "personalization", "number of pendants", "font", "chain length", "finish",
];

function formatArticles(items: ParsedLineItem[]): string {
  const lines: string[] = [];

  for (const item of items) {
    // Skip free gifts and zero-price items
    if (
      item.title.toLowerCase().includes("free gift") ||
      item.price === 0
    ) continue;

    lines.push(`${item.quantity}x ${item.title}`);

    // Append meaningful custom attributes indented below
    for (const [key, value] of Object.entries(item.attrs)) {
      if (!value || key.toLowerCase() === "estimated dispatch") continue;
      const keyLower = key.toLowerCase();
      if (MEANINGFUL_ATTR_KEYS.some((k) => keyLower.includes(k))) {
        lines.push(`  ${key}: ${value}`);
      }
    }
  }

  return lines.join("\n");
}

// ── Shipping method extraction ────────────────────────────────────────────────

function extractShippingMethod(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // Try JSON array first
  try {
    const arr = JSON.parse(s);
    if (Array.isArray(arr) && arr.length > 0) return arr[0]?.title ?? null;
    if (arr?.title) return String(arr.title);
  } catch { /* fall through */ }

  // Look for "title: ..." in text
  const match = s.match(/title:\s*(.+?)(?:\n|$)/i);
  return match?.[1]?.trim() ?? (s.length < 120 ? s : null);
}

// ── Dispatch date parsing ─────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/**
 * Parse "Wednesday, May 13th" or "May 13" into YYYY-MM-DD.
 * Infers the current year; advances to next year if the date has already passed.
 */
function parseDispatchDate(text: string | null | undefined): string | null {
  if (!text) return null;

  const match = text.match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?/);
  if (!match) return null;

  const month = MONTH_MAP[match[1].toLowerCase()];
  if (month === undefined) return null;

  const day = parseInt(match[2]);
  if (isNaN(day) || day < 1 || day > 31) return null;

  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, month, day);

  // If the date is in the past, assume next year
  if (candidate < now) year += 1;

  const d = new Date(year, month, day);
  return d.toISOString().split("T")[0];
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

  console.log("Shopify webhook received:", JSON.stringify(body));

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

  // ── 3. Parse line items ───────────────────────────────────────────────────
  const lineItems     = parseLineItems(body.lineItems);
  const articles      = formatArticles(lineItems);
  const shippingMethod = extractShippingMethod(body.shippingLines);

  // Extract Estimated Dispatch from any line item's customAttributes
  let dispatchDate: string | null = null;
  for (const item of lineItems) {
    const dispatch =
      item.attrs["Estimated Dispatch"] ??
      item.attrs["estimated dispatch"] ??
      item.attrs["Estimated dispatch"] ??
      null;
    if (dispatch) {
      dispatchDate = parseDispatchDate(dispatch);
      if (dispatchDate) break;
    }
  }

  // ── 4. Map fields ────────────────────────────────────────────────────────
  // shippingFirstName holds the full name — split on the first space
  const firstName = (body.shippingFirstName ?? "").split(" ")[0] || null;
  const lastName  = (body.shippingFirstName ?? "").split(" ").slice(1).join(" ") || null;

  const email       = body.customerEmail ?? null;
  const phone       = body.shippingPhone ?? body.customerPhone ?? null;
  const street      = body.shippingAddress1 ?? null;
  const suburb      = body.shippingCity ?? null;
  const state       = body.shippingProvinceCode ?? null;
  const postcode    = body.shippingPostalCode ?? null;
  const orderNum    = body.orderNumber ?? null;
  const total       = parseFloat(String(body.totalPrice ?? "0")) || 0;
  const note        = body.orderNote || null;

  console.log("[shopify/webhook] Parsed:", {
    orderNumber:    orderNum,
    customerEmail:  email,
    firstName,
    lastName,
    total,
    lineItemCount:  lineItems.length,
    shippingMethod,
    dispatchDate,
  });

  // ── 5. Build insert payload ───────────────────────────────────────────────
  const insertData = {
    reference_number:    referenceNumber,
    packet_type:         "online_order",
    customer_first_name: firstName,
    customer_last_name:  lastName,
    customer_email:      email,
    customer_phone:      phone,
    customer_street:     street,
    customer_suburb:     suburb,
    customer_state:      state,
    customer_postcode:   postcode,
    articles:            articles  || null,
    items_ordered:       articles  || null,
    instructions:        note,
    total_charges:       total     || null,
    deposit:             null,
    balance:             null,
    in_date:             todayISO(),
    due_date:            dispatchDate,
    staff_member:        "Online Store",
    order_number:        orderNum,
    shipping_method:     shippingMethod,
    shipping_address_same: true,
    shipping_street:     null,
    shipping_suburb:     null,
    shipping_state:      null,
    shipping_postcode:   null,
    order_source:        "Shopify",
    packet_data:         body as unknown as Record<string, unknown>,
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
