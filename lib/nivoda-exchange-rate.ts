// Nivoda exchange rate utility.
//
// diamonds_by_query's `price` field is permanently USD ("The delivered price (price you
// pay Nivoda) in cents in USD" — confirmed in the GraphiQL schema explorer, no currency
// argument exists on that field). This module fetches Nivoda's own get_exchange_rates
// and caches the USD->AUD rate so search results can be converted before they ever reach
// the UI, the same way lib/nivoda-auth.ts caches the bearer token.
//
// ExchangeRate's real fields (confirmed via the schema explorer): id, name, to_USD.
// `to_USD` converts 1 unit of the row's currency INTO USD (1 AUD = to_USD USD) — since
// AUD is worth less than USD, the AUD row's to_USD is a fraction under 1 (~0.718). We
// need the opposite direction (USD cents -> AUD cents), so we DIVIDE by to_USD, not
// multiply. Sanity-checked against two known ratios from real stones today
// (373.89/268.37 = 1.3933, 145.63/104.53 = 1.3934): 1 / 0.718 ≈ 1.393 — matches both.
// Callers treat a fetch failure here as "conversion unavailable", not as a reason to show
// an unconverted USD number labelled as AUD — see getNivodaAudRate.

import { getNivodaToken, getNivodaEndpoint } from "@/lib/nivoda-auth";

const RATE_TTL_MS      = 6 * 60 * 60 * 1000; // 6 hours — mirrors the auth token cache
const REFRESH_BUFFER_MS = 10 * 60 * 1000;     // refresh 10 min before expiry

let cache: { rate: number; expiresAt: number } | null = null;

export function clearNivodaRateCache(): void {
  cache = null;
}

async function fetchFreshAudRate(): Promise<number> {
  const token = await getNivodaToken();
  const endpoint = getNivodaEndpoint();

  const query = `
    query NivodaExchangeRates($token: String!) {
      as(token: $token) {
        get_exchange_rates(apply_markup: true) {
          id
          name
          to_USD
        }
      }
    }
  `;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { token } }),
  });

  if (!res.ok) {
    throw new Error(`Nivoda exchange rate HTTP ${res.status}`);
  }

  const json = await res.json() as {
    errors?: Array<{ message: string }>;
    data?: { as?: { get_exchange_rates?: Array<{ id?: string; name?: string; to_USD?: number }> } };
  };

  if (json.errors?.length) {
    throw new Error(`Nivoda exchange rate GraphQL error: ${json.errors[0].message}`);
  }

  const rates = json.data?.as?.get_exchange_rates ?? [];
  const audRow = rates.find(r => r.name === "AUD");

  if (!audRow || !audRow.to_USD || audRow.to_USD <= 0) {
    throw new Error(`Nivoda exchange rate: no AUD row (matched on name==="AUD") among: ${rates.map(r => r.name).join(", ")}`);
  }

  // to_USD converts AUD -> USD (1 AUD = to_USD USD); we need the inverse, USD -> AUD.
  return 1 / audRow.to_USD;
}

/**
 * Returns the current USD->AUD multiplier, using the in-memory cache when possible.
 * Throws on failure — callers must decide how to degrade (never fall back to treating
 * the raw USD price as AUD).
 */
export async function getNivodaAudRate(skipCache = false): Promise<number> {
  const now = Date.now();

  if (!skipCache && cache && cache.expiresAt - now > REFRESH_BUFFER_MS) {
    return cache.rate;
  }

  const rate = await fetchFreshAudRate();
  cache = { rate, expiresAt: now + RATE_TTL_MS };
  return rate;
}
