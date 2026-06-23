import { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Fixed-window rate limiter backed by Supabase.
 * Distributed — consistent across all Vercel serverless instances.
 * Fails open on DB errors so rate limit infrastructure never blocks legitimate traffic.
 *
 * `limit` = max requests allowed in the window.
 * Count=limit on the last allowed request (remaining=0).
 * Count>limit → not allowed.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const resetAt = new Date(windowStart.getTime() + windowMs);

  try {
    const { data, error } = await supabase.rpc("increment_rate_limit", {
      p_key: key,
      p_window_key: windowStart.toISOString(),
      p_expires_at: resetAt.toISOString(),
    });

    if (error) throw error;

    const count = data as number;
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch (err) {
    console.error("[rate-limit] DB error, failing open:", err);
    return { allowed: true, remaining: limit, resetAt };
  }
}

/** Extracts the real client IP from Vercel/Next.js request headers. */
export function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Returns a 429 NextResponse with standard rate-limit headers. */
export function rateLimitedResponse(resetAt: Date, message?: string): NextResponse {
  const retryAfter = Math.ceil((resetAt.getTime() - Date.now()) / 1000);
  return NextResponse.json(
    { error: message ?? "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Reset": resetAt.toISOString(),
      },
    }
  );
}
