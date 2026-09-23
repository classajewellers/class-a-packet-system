import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createHmac, randomBytes } from "crypto";
import { resolveEffectiveRole, EFFECTIVE_ROLE_COOKIE } from "@/lib/effective-role";

export const dynamic = "force-dynamic";

// offline_access is required to receive a refresh_token — Xero access
// tokens expire after 30 minutes (unlike Shopify's long-lived Partner-app
// tokens), so this integration cannot work without it.
const SCOPES = "openid profile email offline_access accounting.transactions accounting.contacts";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://jewelleryvault.com.au";

// Encode { tenantId, nonce, exp } signed with XERO_CLIENT_SECRET — same
// stateless-state pattern as app/api/shopify/oauth/install/route.ts.
function buildState(tenantId: string): string {
  const secret = process.env.XERO_CLIENT_SECRET;
  if (!secret) throw new Error("XERO_CLIENT_SECRET is not set");

  const nonce = randomBytes(16).toString("hex");
  const exp   = Date.now() + 10 * 60 * 1000; // 10 minutes
  const payload = Buffer.from(JSON.stringify({ tenantId, nonce, exp }))
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Xero OAuth is not configured — XERO_CLIENT_ID or XERO_CLIENT_SECRET missing" },
      { status: 503 }
    );
  }

  // ── 1. Get authenticated user from session cookie ───────────────────────────
  const sessionClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() { /* route handlers cannot set cookies */ },
      },
    }
  );
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Look up the tenant_id from the user's profile ───────────────────────
  const supabase = createServerSupabaseClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json({ error: "No tenant associated with this account" }, { status: 403 });
  }
  const effectiveRole = resolveEffectiveRole(
    user.id,
    profile.role,
    req.cookies.get(EFFECTIVE_ROLE_COOKIE)?.value ?? null
  );
  if (effectiveRole !== "manager" && effectiveRole !== "admin") {
    return NextResponse.json({ error: "Only managers and admins can connect Xero" }, { status: 403 });
  }

  // ── 3. Build signed state and redirect to Xero's hosted consent screen ──────
  const state       = buildState(profile.tenant_id);
  const redirectUri = `${APP_URL}/api/xero/oauth/callback`;
  const authUrl     = new URL("https://login.xero.com/identity/connect/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id",     clientId);
  authUrl.searchParams.set("redirect_uri",  redirectUri);
  authUrl.searchParams.set("scope",         SCOPES);
  authUrl.searchParams.set("state",         state);

  return NextResponse.redirect(authUrl.toString());
}
