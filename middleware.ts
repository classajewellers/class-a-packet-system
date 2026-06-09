import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Always-public routes — no auth required ────────────────────────────────
  if (
    pathname.startsWith("/claim/") ||
    pathname.startsWith("/api/shopify") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/login"
  ) {
    return NextResponse.next();
  }

  // ── API routes: let through — they use the service-role key server-side ────
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // ── PIN session cookie — vault_auth=1 set by the PIN login page ─────────
  const vaultAuth = request.cookies.get("vault_auth")?.value;
  if (vaultAuth === "1") {
    return NextResponse.next();
  }

  // ── All other routes: require a valid Supabase session ────────────────────
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

  // getUser() validates the session token server-side (no local JWT trust)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
