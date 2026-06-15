/**
 * Nivoda token management — HTTP endpoint.
 *
 * GET /api/nivoda/auth          — return cached token (or fetch fresh if expired)
 * GET /api/nivoda/auth?fresh=1  — bypass cache, always fetch fresh (for debugging)
 *
 * Token logic lives in lib/nivoda-auth.ts and is shared with the search route
 * to avoid internal localhost HTTP calls in production.
 */

import { NextRequest, NextResponse } from "next/server";
import { getNivodaToken, clearNivodaTokenCache, NIVODA_ENDPOINT } from "@/lib/nivoda-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const fresh = new URL(req.url).searchParams.has("fresh");

  try {
    if (fresh) {
      console.log("[nivoda/auth] ?fresh=1 — clearing cache and fetching new token");
      clearNivodaTokenCache();
    }

    const token = await getNivodaToken(fresh);

    return NextResponse.json({
      source:   fresh ? "fresh" : "cache_or_fresh",
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
