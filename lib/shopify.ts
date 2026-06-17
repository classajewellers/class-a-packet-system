import { createHmac, timingSafeEqual } from "crypto";

// ── Shopify payload types ─────────────────────────────────────────────────────

export interface ShopifyAddress {
  address1: string | null;
  city: string | null;
  province_code: string | null;
  zip: string | null;
}

export interface ShopifyLineItem {
  title: string;
  variant_title: string | null;
  quantity: number;
  price: string; // decimal string e.g. "450.00"
}

export interface ShopifyShippingLine {
  title: string;
}

export interface ShopifyCustomer {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ShopifyOrder {
  id: number;
  name: string; // e.g. "#1234"
  email: string | null;
  phone: string | null;
  note: string | null;
  total_price: string; // decimal string
  customer: ShopifyCustomer | null;
  shipping_address: ShopifyAddress | null;
  billing_address: ShopifyAddress | null;
  line_items: ShopifyLineItem[];
  shipping_lines: ShopifyShippingLine[];
}

// ── Webhook HMAC verification ─────────────────────────────────────────────────

/**
 * Verifies the Shopify webhook HMAC-SHA256 signature.
 * rawBody must be the original UTF-8 request body string (not parsed).
 */
export function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string | null
): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret || !hmacHeader) return false;

  const computed = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    return timingSafeEqual(
      Buffer.from(computed, "utf8"),
      Buffer.from(hmacHeader, "utf8")
    );
  } catch {
    return false;
  }
}

// ── Line item formatting ──────────────────────────────────────────────────────

/**
 * Formats Shopify line items into a human-readable string for the articles field.
 * e.g. "2x Diamond Ring - Size 7 — $450.00"
 */
export function formatShopifyLineItems(lineItems: ShopifyLineItem[]): string {
  return lineItems
    .map((li) => {
      const variant = li.variant_title ? ` - ${li.variant_title}` : "";
      const price = parseFloat(li.price);
      const priceStr = isNaN(price) ? li.price : `$${Number(price).toFixed(2)}`;
      return `${li.quantity}x ${li.title}${variant} — ${priceStr}`;
    })
    .join("\n");
}

// ── Shopify Admin API: customer search ────────────────────────────────────────

export interface ShopifyCustomerResult {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  street: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
}

/**
 * Looks up a Shopify customer by email using the Admin REST API.
 * Returns the most recently used shipping address fields or null if not found.
 * Server-side only — uses SHOPIFY_ADMIN_API_TOKEN.
 */
export async function lookupShopifyCustomerByEmail(
  email: string
): Promise<ShopifyCustomerResult | null> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN;
  if (!domain || !token) return null;

  const url = `https://${domain}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}&limit=1&fields=first_name,last_name,phone,default_address`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const json = (await res.json()) as {
    customers: Array<{
      first_name?: string;
      last_name?: string;
      phone?: string;
      default_address?: {
        address1?: string;
        city?: string;
        province_code?: string;
        zip?: string;
      };
    }>;
  };

  const customers = json.customers ?? [];
  if (customers.length === 0) return null;

  const c = customers[0];
  const addr = c.default_address;

  return {
    first_name: c.first_name ?? null,
    last_name: c.last_name ?? null,
    phone: c.phone ?? null,
    street: addr?.address1 ?? null,
    suburb: addr?.city ?? null,
    state: addr?.province_code ?? null,
    postcode: addr?.zip ?? null,
  };
}
