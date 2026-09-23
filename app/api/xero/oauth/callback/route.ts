import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createHmac, timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://jewelleryvault.com.au";

// Verify and decode the state parameter created by the install route —
// same pattern as app/api/shopify/oauth/callback/route.ts.
function decodeState(state: string): { tenantId: string } | null {
  const secret = process.env.XERO_CLIENT_SECRET;
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

  let data: { tenantId: string; nonce: string; exp: number };
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
  if (!data.tenantId) return null;
  return { tenantId: data.tenantId };
}

function errorRedirect(reason: string): NextResponse {
  return NextResponse.redirect(`${APP_URL}/settings?xero_error=${encodeURIComponent(reason)}`);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code")  ?? "";
  const state = searchParams.get("state") ?? "";

  if (!code || !state) {
    return errorRedirect("missing_params");
  }

  // ── 1. Verify state, recover tenant_id ───────────────────────────────────────
  const decoded = decodeState(state);
  if (!decoded) {
    return errorRedirect("invalid_state");
  }
  const { tenantId } = decoded;

  const clientId     = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return errorRedirect("oauth_not_configured");
  }

  const redirectUri = `${APP_URL}/api/xero/oauth/callback`;

  // ── 2. Exchange code for access_token + refresh_token ────────────────────────
  // Xero's token endpoint auths via HTTP Basic (client_id:client_secret),
  // unlike Shopify's JSON-body client_id/client_secret.
  let accessToken: string;
  let refreshToken: string;
  let expiresIn: number;
  let grantedScopes: string;
  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        "Content-Type":  "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type:   "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("[xero/oauth/callback] token exchange failed:", tokenRes.status, body.slice(0, 300));
      return errorRedirect("token_exchange_failed");
    }

    const json = await tokenRes.json() as {
      access_token?: string; refresh_token?: string; expires_in?: number; scope?: string;
    };
    if (!json.access_token || !json.refresh_token) {
      return errorRedirect("no_access_token");
    }
    accessToken   = json.access_token;
    refreshToken  = json.refresh_token;
    expiresIn     = json.expires_in ?? 1800;
    grantedScopes = json.scope ?? "";
  } catch (err) {
    console.error("[xero/oauth/callback] token exchange threw:", err);
    return errorRedirect("token_exchange_error");
  }

  // ── 3. Resolve which Xero organisation was authorized ────────────────────────
  // Xero's OAuth doesn't return the org identifier in the token response —
  // it's fetched separately via /connections using the access token just
  // received. A user can authorize more than one org per consent; this
  // integration takes the first, matching the single-org-per-tenant model
  // tenant_xero_connections enforces (UNIQUE tenant_id).
  let xeroTenantId: string;
  let xeroTenantName: string | null = null;
  try {
    const connRes = await fetch("https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!connRes.ok) {
      return errorRedirect("connections_lookup_failed");
    }
    const connections = await connRes.json() as Array<{ tenantId: string; tenantName?: string }>;
    if (!connections.length) {
      return errorRedirect("no_xero_organisation");
    }
    xeroTenantId   = connections[0].tenantId;
    xeroTenantName = connections[0].tenantName ?? null;
  } catch (err) {
    console.error("[xero/oauth/callback] connections lookup threw:", err);
    return errorRedirect("connections_lookup_error");
  }

  // ── 4. Upsert connection into tenant_xero_connections ────────────────────────
  const supabase = createServerSupabaseClient();
  const { error: upsertError } = await supabase
    .from("tenant_xero_connections")
    .upsert(
      {
        tenant_id:               tenantId,
        xero_tenant_id:          xeroTenantId,
        xero_tenant_name:        xeroTenantName,
        access_token:            accessToken,
        refresh_token:           refreshToken,
        access_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        scopes:                  grantedScopes,
        connected_at:            new Date().toISOString(),
      },
      { onConflict: "tenant_id" }
    );

  if (upsertError) {
    console.error("[xero/oauth/callback] upsert failed:", upsertError.message);
    return errorRedirect("db_error");
  }

  // Success — redirect back to settings
  const successUrl = new URL(`${APP_URL}/settings`);
  successUrl.searchParams.set("xero_connected", "1");
  return NextResponse.redirect(successUrl.toString());
}
