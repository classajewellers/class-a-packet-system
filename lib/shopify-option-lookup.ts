// Resolve Shopify product-option NAMES for an order line item.
//
// orders/create (REST) sends variant_title as values only:
//   "9ct Yellow Gold / Lab Grown Diamond / Blue Topaz"
// The cut is the option name on the product ("Pear Gemstone",
// "Emerald Gemstone"). The Vault Shopify app is scoped to
// read_orders, read_customers, write_fulfillments — not read_products —
// so this uses the public storefront product JSON on the shop's
// *.myshopify.com host instead of the Admin API.
//
// Failure is non-fatal: the packet is still created from variant_title.

import {
  extractOptionPairs,
  pairVariantWithProductOptions,
  type NamedOption,
  type ShopifyLineItem,
} from "@/lib/shopify-articles";

export interface StorefrontProductOption {
  name: string;
  position?: number;
  values?: string[];
}

const FETCH_TIMEOUT_MS = 8000;

function storefrontOrigin(shopDomain: string | null): string | null {
  const raw = (shopDomain || process.env.SHOPIFY_STORE_DOMAIN || "").trim().toLowerCase();
  const host = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(host)) return null;
  return `https://${host}`;
}

function productIdOf(item: ShopifyLineItem): string {
  const id = item.product_id;
  if (id == null || id === "") return "";
  return String(id);
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "VaultPacketSystem/1.0",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn("[shopify/options] fetch failed", res.status, url);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(
      "[shopify/options] fetch error",
      url,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function lookupProductOptions(
  origin: string,
  productId: string,
  title: string,
): Promise<StorefrontProductOption[] | null> {
  const query = title.trim();
  if (!query) return null;

  const suggestUrl =
    `${origin}/search/suggest.json?q=${encodeURIComponent(query)}` +
    `&resources[type]=product&resources[limit]=10`;
  const suggest = await fetchJson(suggestUrl);
  const products = (suggest as {
    resources?: { results?: { products?: { id?: number | string; handle?: string }[] } };
  } | null)?.resources?.results?.products ?? [];

  const match = products.find((p) => p.handle && String(p.id) === productId);
  if (!match?.handle) {
    console.warn("[shopify/options] no storefront product for", productId, JSON.stringify(query));
    return null;
  }

  const product = await fetchJson(`${origin}/products/${encodeURIComponent(match.handle)}.js`);
  const rec = product as { id?: number | string; options?: StorefrontProductOption[] } | null;
  if (!rec || String(rec.id) !== productId || !Array.isArray(rec.options)) {
    console.warn("[shopify/options] product.js id mismatch for", productId, match.handle);
    return null;
  }
  return rec.options;
}

/**
 * Copy line items, adding options_with_values when the storefront product
 * lists option names. Items that already carry option pairs are left as-is.
 * Does not mutate the webhook body (packet_data stays the raw payload).
 */
export async function attachProductOptionNames<T extends ShopifyLineItem>(
  lineItems: T[],
  shopDomain: string | null,
): Promise<T[]> {
  const origin = storefrontOrigin(shopDomain);
  if (!origin || lineItems.length === 0) return lineItems;

  const needsLookup = lineItems.some(
    (item) => productIdOf(item) && extractOptionPairs(item).length === 0 && !!item.variant_title,
  );
  if (!needsLookup) return lineItems;

  const ids: string[] = [];
  for (const item of lineItems) {
    const id = productIdOf(item);
    if (id && ids.indexOf(id) === -1) ids.push(id);
  }
  const cache = new Map<string, StorefrontProductOption[] | null>();
  await Promise.all(ids.map(async (id) => {
    const sample = lineItems.find((item) => productIdOf(item) === id);
    cache.set(id, await lookupProductOptions(origin, id, sample?.title ?? ""));
  }));

  return lineItems.map((item) => {
    if (extractOptionPairs(item).length > 0) return item;
    const options = cache.get(productIdOf(item));
    const variant = item.variant_title?.trim() ?? "";
    if (!options?.length || !variant) return item;
    const pairs: NamedOption[] = pairVariantWithProductOptions(variant, options);
    if (!pairs.length) return item;
    console.log(
      "[shopify/options] attached",
      productIdOf(item),
      pairs.map((p) => `${p.name}=${p.value}`).join(" | "),
    );
    return { ...item, options_with_values: pairs };
  });
}
