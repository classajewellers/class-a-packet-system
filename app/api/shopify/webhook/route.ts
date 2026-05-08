import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateReferenceNumber } from "@/lib/referenceNumber";
import { todayISO } from "@/lib/formatters";

export const dynamic = "force-dynamic";

// ── Zapier payload types ───────────────────────────────────────────────────────
// Zapier sends Shopify order data directly — no HMAC verification needed as
// Zapier handles the Shopify authentication on their end.

interface ZapierShippingAddress {
  first_name?: string | null;
  last_name?: string | null;
  address1?: string | null;
  city?: string | null;
  province_code?: string | null;
  zip?: string | null;
  phone?: string | null;
}

interface ZapierLineItem {
  title: string;
  variant_title?: string | null;
  quantity: number;
  price: string;
}

interface ZapierShippingLine {
  title: string;
}

interface ZapierOrder {
  id: string;
  name: string;           // e.g. "#1234"
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
  note?: string | null;
  total_price: string;
  shipping_address?: ZapierShippingAddress | null;
  line_items?: ZapierLineItem[];
  shipping_lines?: ZapierShippingLine[];
}

// ── Line item formatter ────────────────────────────────────────────────────────

function formatLineItems(lineItems: ZapierLineItem[]): string {
  return lineItems
    .map((li) => {
      const variant = li.variant_title ? ` - ${li.variant_title}` : "";
      return `${li.quantity}x ${li.title}${variant}`;
    })
    .join("\n");
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  console.log("[shopify/webhook] Zapier webhook received");

  // ── 1. Parse body ─────────────────────────────────────────────────────────
  let order: ZapierOrder;
  try {
    order = (await req.json()) as ZapierOrder;
  } catch {
    console.error("[shopify/webhook] Failed to parse JSON body");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  console.log("[shopify/webhook] Order:", order.name, "| Email:", order.email);

  // ── 2. Generate ON-YYYYMMDD-XXXX reference number ────────────────────────
  let referenceNumber: string;
  try {
    referenceNumber = await generateReferenceNumber(new Date(), "online_order");
    console.log("[shopify/webhook] Reference:", referenceNumber);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[shopify/webhook] Reference generation failed:", msg);
    // Return 200 so Zapier doesn't retry endlessly — error is logged above
    return NextResponse.json({ ok: false, error: "Reference generation failed" });
  }

  // ── 3. Map Zapier payload → packet fields ─────────────────────────────────
  const shipping = order.shipping_address ?? {};
  const lineItems = order.line_items ?? [];
  const articles = formatLineItems(lineItems);
  const totalCharges = parseFloat(order.total_price);
  const shippingMethod = order.shipping_lines?.[0]?.title ?? null;

  const insertData = {
    reference_number:    referenceNumber,
    packet_type:         "online_order",
    customer_first_name: shipping.first_name  ?? null,
    customer_last_name:  shipping.last_name   ?? null,
    customer_email:      order.email          ?? null,
    customer_phone:      shipping.phone       ?? order.phone ?? null,
    customer_street:     shipping.address1    ?? null,
    customer_suburb:     shipping.city        ?? null,
    customer_state:      shipping.province_code ?? null,
    customer_postcode:   shipping.zip         ?? null,
    articles:            articles             || null,
    items_ordered:       articles             || null,   // label reads items_ordered for online orders
    instructions:        order.note           || null,
    total_charges:       isNaN(totalCharges)  ? null : totalCharges,
    deposit:             null,
    balance:             null,
    in_date:             todayISO(),
    due_date:            null,
    staff_member:        "Online Store",
    order_number:        order.name           ?? null,
    shipping_method:     shippingMethod,
    shipping_address_same: true,
    shipping_street:     null,
    shipping_suburb:     null,
    shipping_state:      null,
    shipping_postcode:   null,
    order_source:        "Shopify",
    // Store full raw payload for reference
    packet_data:         order as unknown as Record<string, unknown>,
  };

  console.log("[shopify/webhook] Inserting packet:", {
    reference_number: insertData.reference_number,
    order_number:     insertData.order_number,
    customer_email:   insertData.customer_email,
    total_charges:    insertData.total_charges,
  });

  // ── 4. Insert into Supabase ────────────────────────────────────────────────
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("packets")
    .insert(insertData)
    .select("reference_number, id")
    .single();

  if (error) {
    console.error("[shopify/webhook] Supabase insert failed:", JSON.stringify(error));
    // Return 200 so Zapier doesn't retry — error is logged
    return NextResponse.json({ ok: false, error: error.message, details: error });
  }

  console.log("[shopify/webhook] Packet saved:", data?.reference_number);
  return NextResponse.json({ ok: true, reference: data?.reference_number });
}
