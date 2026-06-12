/**
 * Nivoda token management.
 *
 * Production endpoint: https://integrations.nivoda.net/api/diamonds
 *
 * GET /api/nivoda/auth          — return cached token (or fetch fresh if expired)
 * GET /api/nivoda/auth?fresh=1  — bypass cache, always fetch fresh (for debugging)
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NIVODA_ENDPOINT = "https://integrations.nivoda.net/api/diamonds";

// In-memory token cache — survives across requests within the same serverless instance.
let cache: { token: string; expiresAt: number } | null = null;

async function fetchNewToken(): Promise<string> {
  const email    = process.env.NIVODA_EMAIL;
  const password = process.env.NIVODA_PASSWORD;

  if (!email || !password) {
    throw new Error("NIVODA_EMAIL or NIVODA_PASSWORD environment variable not set");
  }

  // ── Log request details ────────────────────────────────────────────────────
  console.log("[nivoda/auth] Endpoint :", NIVODA_ENDPOINT);
  console.log("[nivoda/auth] Username :", email);

  const query = `{
    authenticate {
      username_and_password(
        username: "${email}",
        password: "${password}"
      ) {
        token
      }
    }
  }`;

  const res = await fetch(NIVODA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  // ── Read body as text first so we can always log it ───────────────────────
  const rawBody = await res.text();

  console.log("[nivoda/auth] Response status :", res.status, res.statusText);
  console.log("[nivoda/auth] Response body   :", rawBody);

  if (!res.ok) {
    console.error("[nivoda/auth] Non-2xx from Nivoda — full body above");
    throw new Error(`Nivoda auth HTTP ${res.status} ${res.statusText}: ${rawBody}`);
  }

  // ── Parse JSON ────────────────────────────────────────────────────────────
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    console.error("[nivoda/auth] Response is not valid JSON");
    throw new Error(`Nivoda auth: non-JSON response (HTTP ${res.status}): ${rawBody.slice(0, 500)}`);
  }

  const j = json as {
    errors?: Array<{ message: string; [k: string]: unknown }>;
    data?: {
      authenticate?: {
        username_and_password?: { token?: string };
      };
    };
  };

  if (j.errors?.length) {
    console.error("[nivoda/auth] GraphQL errors:", JSON.stringify(j.errors, null, 2));
    throw new Error(`Nivoda auth GraphQL error: ${j.errors[0].message}`);
  }

  const token: string | undefined = j.data?.authenticate?.username_and_password?.token;

  if (!token) {
    console.error("[nivoda/auth] No token in response — full JSON:", JSON.stringify(j, null, 2));
    throw new Error(`Nivoda auth: no token in response — ${JSON.stringify(j)}`);
  }

  return token;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const fresh = new URL(req.url).searchParams.has("fresh");

  try {
    const now         = Date.now();
    const TEN_MINUTES = 10 * 60 * 1000;
    const SIX_HOURS   =  6 * 60 * 60 * 1000;

    // Return cached token unless ?fresh=1 is passed or it's about to expire.
    if (!fresh && cache && cache.expiresAt - now > TEN_MINUTES) {
      const remainingMin = Math.round((cache.expiresAt - now) / 60_000);
      console.log(`[nivoda/auth] Returning cached token (${remainingMin}m remaining)`);
      return NextResponse.json({
        source:    "cache",
        token:     cache.token,
        expiresIn: `${remainingMin}m`,
        endpoint:  NIVODA_ENDPOINT,
      });
    }

    if (fresh) {
      console.log("[nivoda/auth] ?fresh=1 — bypassing cache");
    }

    console.log("[nivoda/auth] Fetching new token from Nivoda…");
    const token = await fetchNewToken();
    cache = { token, expiresAt: now + SIX_HOURS };
    console.log("[nivoda/auth] Token cached for 6h");

    return NextResponse.json({
      source:   "fresh",
      token,
      endpoint: NIVODA_ENDPOINT,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[nivoda/auth] GET failed:", message);

    return NextResponse.json(
      {
        error:    message,
        endpoint: NIVODA_ENDPOINT,
        email:    process.env.NIVODA_EMAIL ?? "(not set)",
      },
      { status: 500 }
    );
  }
}
