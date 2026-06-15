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
  "/vault-admin/login",
]);

// Prefix-based public paths (trailing-slash and query-string safe)
const PUBLIC_PREFIXES = ["/claim/", "/api/shopify/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Completely public — return immediately, no Supabase client created
  if (
    PUBLIC_ROUTES.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  // 2. Vault operator admin — cookie-based auth, no Supabase session needed
  if (pathname.startsWith("/vault-admin")) {
    const operatorAuth = request.cookies.get("vault_operator_auth")?.value;
    if (operatorAuth !== "1") {
      return NextResponse.redirect(new URL("/vault-admin/login", request.url));
    }
    return NextResponse.next();
  }

  // 3. API routes — pass through (service-role key used server-side)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // 4. All other routes — require a valid Supabase session
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
