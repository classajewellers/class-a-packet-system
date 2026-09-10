import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Exact public PAGE paths that bypass the session redirect. API publics are a
// separate, tighter list (API_PUBLIC_ROUTES) applied in the /api/* branch —
// keep /api/* entries OUT of here so there is one source of truth per surface.
const PUBLIC_ROUTES = new Set([
  "/login",
  "/signup",
  "/onboarding",
  "/set-password",
  "/vault-admin/login",
]);

// Prefix-based public PAGE paths (trailing-slash and query-string safe).
// /claim/<reference> is the customer-facing packet claim page.
const PUBLIC_PREFIXES = ["/claim/"];

// ── API auth allowlist (Fix 1: middleware session guard) ─────────────────────
// These /api/* paths are the ONLY ones that may be reached without a Supabase
// session. Everything else under /api/* requires a verified session + tenant.
// Keep this list tight — each entry is a deliberate hole, justified below.
//
//   Auth flows (pre-session by definition):
//     /api/auth/callback, /api/auth/confirm, /api/auth/signup, /api/auth/verify-pin
//   Inbound webhooks (server-to-server; verify their own signature/HMAC):
//     /api/shopify/webhook, /api/twilio/webhook, /api/stripe/webhook, /api/billing/webhook
//   OAuth redirect (browser redirect from Shopify; verifies HMAC + state itself):
//     /api/shopify/oauth/callback
//   Public store list (pre-auth login store selector; GET-only, non-sensitive):
//     /api/tenants
const API_PUBLIC_ROUTES = new Set([
  "/api/auth/callback",
  "/api/auth/confirm",
  "/api/auth/signup",
  "/api/auth/verify-pin",
  "/api/shopify/webhook",
  "/api/shopify/oauth/callback",
  "/api/twilio/webhook",
  "/api/stripe/webhook",
  "/api/billing/webhook",
  "/api/tenants",
  // pen-test kill-switch status probe — unauthenticated by design (returns only
  // ON/OFF, no secrets) so it can be curl-verified after a redeploy. Temporary;
  // remove with the pen-test tooling.
  "/api/pentest-status",
]);

// Self-authenticating API prefixes: these validate their OWN credential (the
// RFID bridge Bearer token, hashed against rfid_bridge_installations) and are
// called by a headless device that has no Supabase session. They are exempt
// from the session guard but are NOT unauthenticated — the route enforces the
// Bearer token itself.
const API_SELF_AUTH_PREFIXES = ["/api/rfid/bridge/", "/api/rfid/lookup/"];

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

/**
 * Edge-compatible profile lookup via Supabase REST API (service role).
 * Returns the caller's tenant_id + role, or null if none can be resolved.
 * Mirrors the edgeRateLimit fetch pattern (no Node modules).
 *
 * Fails CLOSED (returns null → 403) — unlike rate limiting, we must never grant
 * access when the tenant/role cannot be verified.
 */
async function edgeResolveProfile(
  userId: string
): Promise<{ tenantId: string; role: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=tenant_id,role&limit=1`,
      {
        headers: {
          apikey:        serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { tenant_id: string | null; role: string | null }[];
    const row  = Array.isArray(rows) ? rows[0] : null;
    if (!row?.tenant_id) return null;
    return { tenantId: String(row.tenant_id), role: String(row.role ?? "") };
  } catch {
    return null;
  }
}

/** JSON 401/403 helper for API responses. */
function apiError(message: string, status: number): NextResponse {
  return new NextResponse(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * API auth guard (Fix 1). Requires a verified Supabase session for the request,
 * resolves the caller's tenant_id + role from the profiles table, STRIPS any
 * client-supplied x-tenant-id / x-user-* headers, and injects the trusted
 * server-derived values so downstream route handlers can read them safely.
 *
 * Returns a NextResponse (either the forwarded request with rewritten headers,
 * or a 401/403/503 error). The caller returns this directly.
 */
async function guardApiRequest(request: NextRequest): Promise<NextResponse> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return apiError("Auth is not configured", 503);

  // Verify the session. Collect any refreshed auth cookies to replay onto the
  // response, but derive tenant/role before building the forwarded request.
  const cookiesToSet: { name: string; value: string; options: any }[] = [];
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        list.forEach((c) => cookiesToSet.push(c));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const profile = await edgeResolveProfile(user.id);
  if (!profile) return apiError("No tenant associated with this account", 403);

  // Build the forwarded request headers: start from the originals, remove any
  // client-supplied trust headers (case-insensitive delete covers all casings),
  // then inject the trusted server-derived values.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-tenant-id");
  requestHeaders.delete("x-user-id");
  requestHeaders.delete("x-user-role");
  requestHeaders.set("x-tenant-id", profile.tenantId);
  requestHeaders.set("x-user-id", user.id);
  requestHeaders.set("x-user-role", profile.role);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  cookiesToSet.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options)
  );
  return response;
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

  // ── API auth guard (Fix 1) ─────────────────────────────────────────────────
  // Handle /api/* BEFORE the page-oriented public/allowlist logic so the API
  // rules (JSON errors, header rewrite, bridge/webhook exemptions) apply cleanly.
  if (pathname.startsWith("/api/")) {
    // Self-authenticating device routes (RFID bridge Bearer token) — exempt.
    if (API_SELF_AUTH_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }
    // Explicit public API allowlist (auth flows, signed webhooks, store list).
    if (API_PUBLIC_ROUTES.has(pathname)) {
      return NextResponse.next();
    }
    // Operator admin API — gated on the operator cookie (a separate auth
    // domain, not a Supabase tenant session). This closes the fully-open hole;
    // hardening the operator cookie itself is tracked separately (C4).
    if (pathname.startsWith("/api/vault-admin/")) {
      const operatorAuth = request.cookies.get("vault_operator_auth")?.value;
      if (operatorAuth !== "1") return apiError("Unauthorized", 401);
      return NextResponse.next();
    }
    // Everything else under /api/* — require a verified session + tenant, and
    // inject the trusted x-tenant-id.
    return guardApiRequest(request);
  }

  // ── Auth checks (pages) ─────────────────────────────────────────────────────

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

  // 5. All other routes — require a valid Supabase session
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
