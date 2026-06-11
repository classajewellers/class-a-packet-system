/**
 * Nivoda token management.
 *
 * STAGING  endpoint: https://intg-customer-staging.nivodaapi.net/api/diamonds
 * PRODUCTION endpoint: https://integrations.nivoda.net/api/diamonds
 *
 * To switch to production:
 *  1. Update NIVODA_EMAIL and NIVODA_PASSWORD in Vercel environment variables
 *     to the real Nivoda account credentials.
 *  2. Update NIVODA_ENDPOINT below to the production URL.
 *  3. Re-deploy.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NIVODA_ENDPOINT = "https://intg-customer-staging.nivodaapi.net/api/diamonds";

// In-memory token cache — survives across requests within the same serverless instance.
let cache: { token: string; expiresAt: number } | null = null;

async function fetchNewToken(): Promise<string> {
  const email = process.env.NIVODA_EMAIL;
  const password = process.env.NIVODA_PASSWORD;

  if (!email || !password) {
    throw new Error("NIVODA_EMAIL or NIVODA_PASSWORD environment variable not set");
  }

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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nivoda auth HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();

  if (json.errors?.length) {
    throw new Error(`Nivoda auth GraphQL error: ${json.errors[0].message}`);
  }

  const token: string | undefined = json.data?.authenticate?.username_and_password?.token;
  if (!token) {
    throw new Error(`Nivoda auth: no token in response — ${JSON.stringify(json).slice(0, 300)}`);
  }

  return token;
}

export async function GET(): Promise<NextResponse> {
  try {
    const now = Date.now();
    const TEN_MINUTES = 10 * 60 * 1000;
    const SIX_HOURS   =  6 * 60 * 60 * 1000;

    // Return cached token if it has more than 10 minutes remaining.
    if (cache && cache.expiresAt - now > TEN_MINUTES) {
      return NextResponse.json({ token: cache.token });
    }

    console.log("[nivoda/auth] Fetching new token from Nivoda");
    const token = await fetchNewToken();
    cache = { token, expiresAt: now + SIX_HOURS };
    console.log("[nivoda/auth] Token cached, expires in 6h");

    return NextResponse.json({ token });
  } catch (err) {
    console.error("[nivoda/auth] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
