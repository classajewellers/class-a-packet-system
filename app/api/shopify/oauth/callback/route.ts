import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createHmac, timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://jewelleryvault.com.au";
const WEBHOOK_ENDPOINT = `${APP_URL}/api/shopify/webhook`;

// Verify and decode the state parameter created by the install route.
function decodeState(state: string): { tenantId: string; shopDomain: string } | null {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) return null;

  const lastDot = state.lastIndexOf(".");
  if (lastDot === -1) return null;

  const payload = state.slice(0, lastDot);
  const sig     = state.slice(lastDot + 1);

  const expected    = createHmac("sha256", secret).update(payload).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf   = Buffer.from(sig);
  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return null;
  }

  let data: { tenantId: string; shopDomain: string; nonce: string; exp: number };
  try {
    const json = Buffer.from(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    data = JSON.parse(json);
  } catch {
    return null;
  }

  if (data.exp < Date.now()) return null; // expired
  if (!data.tenantId || !data.shopDomain) return null;
  return { tenantId: data.tenantId, shopDomain: data.shopDomain };
}

function errorRedirect(reason: string): NextResponse {
  return NextResponse.redirect(`${APP_URL}/settings?shopify_error=${encodeURIComponent(reason)}`);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const code   = searchParams.get("code")  ?? "";
  const state  = searchParams.get("state") ?? "";
  const shop   = searchParams.get("shop")  ?? "";

  if (!code || !state || !shop) {
    return errorRedirect("missing_params");
  }

  // ── 1. Verify state, recover tenant_id + shop_domain ───────────────────────
  const decoded = decodeState(state);
  if (!decoded) {
    return errorRedirect("invalid_state");
  }
  const { tenantId, shopDomain } = decoded;

  // Sanity-check: shop in query must match what we signed
  if (shop.toLowerCase() !== shopDomain.toLowerCase()) {
    return errorRedirect("shop_mismatch");
  }

  const clientId     = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return errorRedirect("oauth_not_configured");
  }

  // ── 2. Exchange code for access token ───────────────────────────────────────
  let accessToken: string;
  let grantedScopes: string;
  try {
    const tokenRes = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id:     clientId,
        client_secret: clientSecret,
        code,
      }),
      cache: "no-store",
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("[shopify/oauth/callback] token exchange failed:", tokenRes.status, body.slice(0, 300));
      return errorRedirect("token_exchange_failed");
    }

    const json = await tokenRes.json() as { access_token?: string; scope?: string };
    if (!json.access_token) {
      return errorRedirect("no_access_token");
    }
    accessToken    = json.access_token;
    grantedScopes  = json.scope ?? "";
  } catch (err) {
    console.error("[shopify/oauth/callback] token exchange threw:", err);
    return errorRedirect("token_exchange_error");
  }

  // ── 3. Upsert connection into tenant_shopify_connections ────────────────────
  const supabase = createServerSupabaseClient();
  const { error: upsertError } = await supabase
    .from("tenant_shopify_connections")
    .upsert(
      {
        tenant_id:          tenantId,
        shop_domain:        shopDomain,
        access_token:       accessToken,
        scopes:             grantedScopes,
        connected_at:       new Date().toISOString(),
        webhook_registered: false,
      },
      { onConflict: "tenant_id" }
    );

  if (upsertError) {
    console.error("[shopify/oauth/callback] upsert failed:", upsertError.message);
    return errorRedirect("db_error");
  }

  // ── 4. Register orders/create webhook pointing at the existing endpoint ──────
  // Shopify signs webhooks with the client secret for Partner apps — no
  // per-tenant secret is needed. Tenant is identified on receipt via shop_domain.
  let webhookRegistered = false;
  try {
    const whRes = await fetch(
      `https://${shopDomain}/admin/api/2024-01/webhooks.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          webhook: {
            topic:   "orders/create",
            address: WEBHOOK_ENDPOINT,
            format:  "json",
          },
        }),
      }
    );

    if (whRes.ok) {
      webhookRegistered = true;
      await supabase
        .from("tenant_shopify_connections")
        .update({ webhook_registered: true })
        .eq("tenant_id", tenantId);
    } else {
      const body = await whRes.text();
      console.warn("[shopify/oauth/callback] webhook registration failed:", whRes.status, body.slice(0, 300));
    }
  } catch (err) {
    console.warn("[shopify/oauth/callback] webhook registration threw:", err);
  }

  // Success — redirect back to settings
  const successUrl = new URL(`${APP_URL}/settings`);
  successUrl.searchParams.set("shopify_connected", "1");
  if (!webhookRegistered) {
    successUrl.searchParams.set("webhook_warning", "1");
  }
  return NextResponse.redirect(successUrl.toString());
}
