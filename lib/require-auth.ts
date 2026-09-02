/**
 * require-auth.ts
 * Server-side session + role guard for API routes.
 *
 * Derives the caller's identity from the Supabase SESSION COOKIE and looks up
 * their tenant_id and role from the profiles table (service-role). The tenant
 * is taken from the verified profile — NEVER from a client-supplied
 * `x-tenant-id` header. Modelled on the correct pattern already present in
 * app/api/shopify/oauth/install/route.ts and app/api/sapphire/sync/route.ts.
 *
 * This is the reusable version of that pattern (audit remediation "Fix 2").
 * Use it in new routes so they are not added to the header-trust vulnerable set.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export interface AuthContext {
  userId:   string;
  tenantId: string;
  role:     string;
}

export type AuthResult =
  | { ok: true;  ctx: AuthContext }
  | { ok: false; response: NextResponse };

/** Verify a Supabase session and require the caller be a manager or admin.
 *  On success returns the server-derived tenantId/role; on failure returns a
 *  ready-to-send 401/403/503 response. */
export async function requireManager(req: NextRequest): Promise<AuthResult> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, response: NextResponse.json({ error: "Auth is not configured" }, { status: 503 }) };
  }

  // Read-only session client backed by the request cookies.
  const sessionClient = createServerClient(url, anon, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll() { /* route handlers cannot set cookies */ },
    },
  });

  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // Service-role lookup of the caller's own profile (bypasses RLS).
  const supabase = createServerSupabaseClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (error || !profile?.tenant_id) {
    return { ok: false, response: NextResponse.json({ error: "No tenant associated with this account" }, { status: 403 }) };
  }
  if (profile.role !== "manager" && profile.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden — manager or admin only" }, { status: 403 }) };
  }

  return { ok: true, ctx: { userId: user.id, tenantId: String(profile.tenant_id), role: String(profile.role) } };
}
