import { NextRequest, NextResponse } from "next/server";
import { getNivodaToken, clearNivodaTokenCache, getNivodaEndpoint } from "@/lib/nivoda-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/nivoda/auth          — return cached token status (first 20 chars for debug)
// GET /api/nivoda/auth?fresh=1  — clear cache and fetch fresh token
export async function GET(req: NextRequest): Promise<NextResponse> {
  const fresh = new URL(req.url).searchParams.has("fresh");

  try {
    if (fresh) clearNivodaTokenCache();
    const token = await getNivodaToken(fresh);
    return NextResponse.json({
      ok:       true,
      source:   fresh ? "fresh" : "cache_or_fresh",
      token:    token.slice(0, 20) + "…",
      endpoint: getNivodaEndpoint(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[nivoda/auth] GET failed:", message);
    return NextResponse.json(
      { ok: false, error: message, endpoint: getNivodaEndpoint() },
      { status: 500 }
    );
  }
}
