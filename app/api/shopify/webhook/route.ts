/* eslint-disable @typescript-eslint/no-explicit-any */
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
  shippingFirstName?: string;      // full name — split on first space
  shippingAddress1?: string;
  shippingCity?: string;
  shippingProvinceCode?: string;   // full province name e.g. "South Australia"
  shippingPostalCode?: string;
  shippingPhone?: string;
  lineItems?: unknown;             // array OR raw text blob
  shippingLines?: unknown;         // array OR raw text blob
  orderNote?: string;
  [key: string]: unknown;
}

// ── Line items → formatted articles string ────────────────────────────────────

const MEANINGFUL_ATTR_KEYS = [
  "metal", "stone", "size", "colour", "color", "engraving", "pendant",
  "birthstone", "initial", "personalisation", "personalization", "chain",
  "finish", "font", "number of pendants", "estimated dispatch",
];

function parseLineItems(lineItems: any): string {
  if (!lineItems) return "";

  // ── Case 1: already an array of objects ───────────────────────────────────
  if (Array.isArray(lineItems)) {
    return lineItems
      .filter((item: any) => {
        const price = parseFloat(
          item.price ??
          item.originalUnitPriceSet?.shopMoney?.amount ??
          "0"
        );
        const title: string = item.title ?? item.name ?? "";
        return price > 0 && !title.toLowerCase().includes("free gift");
      })
      .map((item: any) => {
        const qty: number   = item.quantity ?? 1;
        const title: string = item.title ?? item.name ?? "";
        const attrs: any[]  = item.customAttributes ?? item.properties ?? [];

        const attrLines = attrs
          .filter((a: any) => {
            const key: string = (a.key ?? a.name ?? "").toLowerCase();
            return MEANINGFUL_ATTR_KEYS.some((k) => key.includes(k));
          })
          .map((a: any) => `  ${a.key ?? a.name}: ${a.value}`)
          .join("\n");

        return `${qty}x ${title}${attrLines ? "\n" + attrLines : ""}`;
      })
      .join("\n");
  }

  // ── Case 2: string — try JSON first ───────────────────────────────────────
  if (typeof lineItems === "string") {
    const s = lineItems.trim();
    if (!s) return "";

    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parseLineItems(parsed);
    } catch { /* fall through to text parsing */ }

    // ── Case 3: raw text blob — extract title/quantity via regex ─────────────
    const items: string[] = [];

    // Collect all title and quantity matches using exec loops (no matchAll)
    const titleMatches: string[] = [];
    const qtyMatches: string[] = [];
    const nameMatches: string[] = [];

    let m: RegExpExecArray | null;
    const rTitle = /title:\s*([^\n]+)/gi;
    while ((m = rTitle.exec(s)) !== null) titleMatches.push(m[1].trim());
    const rQty = /quantity:\s*(\d+)/gi;
    while ((m = rQty.exec(s)) !== null) qtyMatches.push(m[1]);
    const rName = /name:\s*([^\n]+)/gi;
    while ((m = rName.exec(s)) !== null) nameMatches.push(m[1].trim());

    for (let i = 0; i < titleMatches.length; i++) {
      const title = titleMatches[i];
      if (title.toLowerCase().includes("free gift")) continue;
      const qty = qtyMatches[i] ?? "1";
      items.push(`${qty}x ${title}`);
    }

    // Fallback: if title matching found nothing, try name
    if (items.length === 0) {
      for (const name of nameMatches) {
        if (!name.toLowerCase().includes("free gift")) {
          items.push(`1x ${name}`);
        }
      }
    }

    return items.join("\n");
  }

  return "";
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

// ── Dispatch date extraction and parsing ──────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2,  april: 3,  may: 4,      june: 5,
  july: 6,    august: 7,   september: 8, october: 9, november: 10, december: 11,
};

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
  if (new Date(year, month, day) < now) year += 1;
  return new Date(year, month, day).toISOString().split("T")[0];
}

/** Scan raw lineItems (array or text) for an "Estimated Dispatch" attribute. */
function extractDispatchDate(lineItems: unknown): string | null {
  if (!lineItems) return null;

  if (Array.isArray(lineItems)) {
    for (const item of lineItems as any[]) {
      const attrs: any[] = item.customAttributes ?? item.properties ?? [];
      for (const attr of attrs) {
        const key = String(attr.key ?? attr.name ?? "").toLowerCase();
        if (key.includes("estimated dispatch") || key.includes("dispatch")) {
          const date = parseDispatchDate(String(attr.value ?? ""));
          if (date) return date;
        }
      }
    }
    return null;
  }

  if (typeof lineItems === "string") {
    try {
      const parsed = JSON.parse(lineItems);
      return extractDispatchDate(parsed);
    } catch { /* fall through */ }
    const match = lineItems.match(/[Ee]stimated\s+[Dd]ispatch[^:]*:\s*([^\n]+)/);
    if (match) return parseDispatchDate(match[1].trim());
  }

  return null;
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
  console.log("lineItems raw:", JSON.stringify(body.lineItems));
  console.log("lineItems type:", typeof body.lineItems);

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
  const firstName = (body.shippingFirstName ?? "").split(" ")[0] || null;
  const lastName  = (body.shippingFirstName ?? "").split(" ").slice(1).join(" ") || null;
  const email     = body.customerEmail   ?? null;
  const phone     = body.shippingPhone   ?? body.customerPhone ?? null;
  const street    = body.shippingAddress1   ?? null;
  const suburb    = body.shippingCity       ?? null;
  const state     = body.shippingProvinceCode ?? null;
  const postcode  = body.shippingPostalCode ?? null;
  const orderNum  = body.orderNumber    ?? null;
  const total     = parseFloat(String(body.totalPrice ?? "0")) || 0;
  const note      = body.orderNote      || null;

  console.log("[shopify/webhook] Parsed:", {
    orderNumber: orderNum, customerEmail: email,
    firstName, lastName, total,
    articlesLength: articles.length,
    shippingMethod, dispatchDate,
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
