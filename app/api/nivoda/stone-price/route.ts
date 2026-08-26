import { NextRequest, NextResponse } from "next/server";
import { getNivodaToken, clearNivodaTokenCache, getNivodaEndpoint } from "@/lib/nivoda-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// If preferred_currency is silently ignored by Nivoda and this returns raw USD cents
// instead of AUD, the value comes back ~28% smaller than the AUD estimate (1 / ~1.39
// observed rate). Anything outside this band around 1.0 is treated as unconfirmed rather
// than trusted — see the `confident` flag below.
const CONFIDENCE_BAND = { min: 0.85, max: 1.15 };

// Exact-price lookup at the moment a stone is selected into a quote — used instead of
// the converted estimate from /api/nivoda/search because this number becomes the real
// wholesale cost basis for a customer-facing quote, not a browsing estimate.
//
// get_diamond_by_id(diamond_id: ID!, preferred_currency: PreferredCurrency): DiamondItem!
// — confirmed to exist in the schema explorer. The `AUD` enum literal below is assumed
// to match max_price's `currency: AUD` usage in /api/nivoda/search/route.ts (same API,
// same currency concept) but was not independently confirmed against PreferredCurrency's
// actual enum values — if this 400s, check that enum in the GraphiQL schema explorer.
async function runLookup(token: string, diamondId: string, estimatedPriceAud: number | undefined): Promise<NextResponse> {
  const query = `
    query NivodaStonePrice($token: String!, $id: ID!) {
      as(token: $token) {
        get_diamond_by_id(diamond_id: $id, preferred_currency: AUD) {
          price
        }
      }
    }
  `;

  const res = await fetch(getNivodaEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { token, id: diamondId } }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Nivoda API error ${res.status}` }, { status: 502 });
  }

  const json = await res.json() as {
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
    data?: { as?: { get_diamond_by_id?: { price?: number } } };
  };

  if (json.errors?.length) {
    const isAuthError = json.errors.some(e =>
      /auth|token|unauthori[sz]ed|forbidden/i.test(e.message) || e.extensions?.code === "UNAUTHENTICATED"
    );
    if (isAuthError) {
      throw Object.assign(new Error(json.errors[0].message), { isAuthError: true });
    }
    return NextResponse.json({ error: json.errors[0].message }, { status: 502 });
  }

  const price = json.data?.as?.get_diamond_by_id?.price;
  if (price == null) {
    return NextResponse.json({ error: "No price in Nivoda response" }, { status: 502 });
  }

  // Cross-check against the already-known AUD estimate to catch preferred_currency being
  // silently ignored (which would return raw USD cents instead) — see CONFIDENCE_BAND.
  let confident = true;
  if (estimatedPriceAud && estimatedPriceAud > 0) {
    const ratio = price / estimatedPriceAud;
    confident = ratio >= CONFIDENCE_BAND.min && ratio <= CONFIDENCE_BAND.max;
    if (!confident) {
      console.warn(`[nivoda/stone-price] price/estimate ratio ${ratio.toFixed(3)} outside confidence band — preferred_currency may not be honoured`);
    }
  }

  return NextResponse.json({ price, confident });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { diamond_id?: string; estimated_price_aud?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.diamond_id) {
    return NextResponse.json({ error: "diamond_id required" }, { status: 400 });
  }

  try {
    const token = await getNivodaToken();
    try {
      return await runLookup(token, body.diamond_id, body.estimated_price_aud);
    } catch (err) {
      if ((err as { isAuthError?: boolean }).isAuthError) {
        clearNivodaTokenCache();
        const freshToken = await getNivodaToken(true);
        return await runLookup(freshToken, body.diamond_id, body.estimated_price_aud);
      }
      throw err;
    }
  } catch (err) {
    console.error("[nivoda/stone-price] Fatal error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
