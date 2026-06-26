import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Exact paths that bypass all auth checks
const PUBLIC_ROUTES = new Set([
  "/login",
  "/signup",
  "/onboarding",
  "/set-password",
  "/api/auth/callback",
  "/api/auth/confirm",
  "/api/auth/signup",
  "/api/auth/verify-pin",
  "/api/shopify/webhook",
  "/api/shopify/customer",
  "/api/twilio/webhook",
  "/vault-admin/login",
]);

// Prefix-based public paths (trailing-slash and query-string safe)
const PUBLIC_PREFIXES = ["/claim/", "/api/shopify/"];

// Auth routes: 5 requests per 15 minutes per IP
const AUTH_RATE_LIMIT_ROUTES = new Set([
  "/api/auth/callback",
  "/api/auth/confirm",
  "/api/auth/signup",
  "/api/auth/verify-pin",
]);

// Paths excluded from general API rate limiting (server-to-server or high-volume)
const RATE_LIMIT_EXEMPT_PREFIXES = ["/api/shopify/", "/api/twilio/"];

/**
 * Edge-compatible rate limit check via Supabase REST API.
 * Uses fetch (Web API) — no Node.js modules, safe for edge middleware.
 * Fails open on any error so rate limit infra never blocks legitimate traffic.
 * Returns true if the request is allowed, false if it should be rejected.
 */
async function edgeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return true;

  const now        = Date.now();
  const windowMs   = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const resetAt     = new Date(windowStart.getTime() + windowMs);

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/increment_rate_limit`, {
      method: "POST",
      headers: {
        apikey:          serviceKey,
        Authorization:   `Bearer ${serviceKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        p_key:        key,
        p_window_key: windowStart.toISOString(),
        p_expires_at: resetAt.toISOString(),
      }),
    });

    if (!res.ok) return true;
    const count = (await res.json()) as number;
    return count <= limit;
  } catch {
    return true;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Real IP — Vercel sets x-forwarded-for; take the leftmost (client) address
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  // ── Rate limiting ────────────────────────────────────────────────────────────

  // 1. Strict limit on auth routes: 5 per 15 minutes per IP
  if (AUTH_RATE_LIMIT_ROUTES.has(pathname)) {
    const allowed = await edgeRateLimit(`auth:${ip}:${pathname}`, 5, 15 * 60);
    if (!allowed) {
      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Please try again in 15 minutes." }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "900" },
        }
      );
    }
  }

  // 2. General API limit: 100 per 60 seconds per IP (authenticated routes)
  if (
    pathname.startsWith("/api/") &&
    !AUTH_RATE_LIMIT_ROUTES.has(pathname) &&
    !RATE_LIMIT_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    const allowed = await edgeRateLimit(`api:${ip}`, 100, 60);
    if (!allowed) {
      return new NextResponse(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "60" },
        }
      );
    }
  }

  // ── Auth checks ──────────────────────────────────────────────────────────────

  // 3. Completely public — return immediately, no Supabase client created
  if (
    PUBLIC_ROUTES.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // 4. Vault operator admin — cookie-based auth, no Supabase session needed
  if (pathname.startsWith("/vault-admin")) {
    const operatorAuth = request.cookies.get("vault_operator_auth")?.value;
    if (operatorAuth !== "1") {
      return NextResponse.redirect(new URL("/vault-admin/login", request.url));
    }
    return NextResponse.next();
  }

  // 5. API routes — pass through (service-role key used server-side)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // 6. All other routes — require a valid Supabase session
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
