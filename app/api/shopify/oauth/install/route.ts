import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createHmac, randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const SCOPES = "read_orders,read_customers,write_fulfillments";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://jewelleryvault.com.au";

// Encode { tenantId, shopDomain, nonce, exp } signed with SHOPIFY_CLIENT_SECRET.
// Stateless — no DB storage needed.
function buildState(tenantId: string, shopDomain: string): string {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) throw new Error("SHOPIFY_CLIENT_SECRET is not set");

  const nonce = randomBytes(16).toString("hex");
  const exp   = Date.now() + 10 * 60 * 1000; // 10 minutes
  const payload = Buffer.from(JSON.stringify({ tenantId, shopDomain, nonce, exp }))
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Shopify OAuth is not configured — SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET missing" },
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
  if (profile.role !== "manager" && profile.role !== "admin") {
    return NextResponse.json({ error: "Only managers and admins can connect Shopify" }, { status: 403 });
  }

  // ── 3. Validate the shop domain query param ─────────────────────────────────
  const { searchParams } = new URL(req.url);
  const shop = (searchParams.get("shop") ?? "").trim().toLowerCase();

  if (!shop) {
    return NextResponse.json({ error: "Missing ?shop= parameter" }, { status: 400 });
  }
  // Ensure it ends in .myshopify.com and has no path/protocol injected
  const shopDomain = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shopDomain)) {
    return NextResponse.json({ error: "Invalid shop domain format" }, { status: 400 });
  }

  // ── 4. Build signed state and redirect to Shopify OAuth ─────────────────────
  const state       = buildState(profile.tenant_id, shopDomain);
  const redirectUri = `${APP_URL}/api/shopify/oauth/callback`;
  const authUrl     = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  authUrl.searchParams.set("client_id",    clientId);
  authUrl.searchParams.set("scope",        SCOPES);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state",        state);

  return NextResponse.redirect(authUrl.toString());
}
