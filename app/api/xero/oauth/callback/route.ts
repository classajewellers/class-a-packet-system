import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createHmac, timingSafeEqual } from "crypto";
import { oauthAppUrl } from "@/lib/xero";

export const dynamic = "force-dynamic";

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

function errorRedirect(appUrl: string, reason: string): NextResponse {
  return NextResponse.redirect(`${appUrl}/settings?xero_error=${encodeURIComponent(reason)}`);
}

interface XeroConnection {
  tenantId: string;
  tenantName?: string;
  authEventId?: string;
  updatedDateUtc?: string;
}

function jwtClaim(token: string, claim: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const value = json?.[claim];
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}

// /connections lists every org this Xero app has been granted, not only the
// one just authorised. Match authentication_event_id from the id_token when
// Xero sends it; otherwise take the most recently updated connection.
function pickXeroOrganisation(connections: XeroConnection[], idToken?: string): XeroConnection | null {
  if (!connections.length) return null;
  const eventId = idToken ? jwtClaim(idToken, "authentication_event_id") : null;
  if (eventId) {
    const match = connections.find(connection => connection.authEventId === eventId);
    if (match) return match;
  }
  return [...connections].sort((a, b) => (b.updatedDateUtc ?? "").localeCompare(a.updatedDateUtc ?? ""))[0];
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const appUrl = oauthAppUrl(req);
  const fail = (reason: string) => errorRedirect(appUrl, reason);
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code")  ?? "";
  const state = searchParams.get("state") ?? "";

  if (!code || !state) {
    return fail("missing_params");
  }

  // ── 1. Verify state, recover tenant_id ───────────────────────────────────────
  const decoded = decodeState(state);
  if (!decoded) {
    return fail("invalid_state");
  }
  const { tenantId } = decoded;

  const clientId     = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return fail("oauth_not_configured");
  }

  const redirectUri = `${appUrl}/api/xero/oauth/callback`;

  // ── 2. Exchange code for access_token + refresh_token ────────────────────────
  // Xero's token endpoint auths via HTTP Basic (client_id:client_secret),
  // unlike Shopify's JSON-body client_id/client_secret.
  let accessToken: string;
  let refreshToken: string;
  let expiresIn: number;
  let grantedScopes: string;
  let idToken: string | undefined;
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
      return fail("token_exchange_failed");
    }

    const json = await tokenRes.json() as {
      access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string;
    };
    if (!json.access_token || !json.refresh_token) {
      return fail("no_access_token");
    }
    accessToken   = json.access_token;
    refreshToken  = json.refresh_token;
    expiresIn     = json.expires_in ?? 1800;
    grantedScopes = json.scope ?? "";
    idToken       = json.id_token;
  } catch (err) {
    console.error("[xero/oauth/callback] token exchange threw:", err);
    return fail("token_exchange_error");
  }

  // ── 3. Resolve which Xero organisation was authorized ────────────────────────
  // Xero's OAuth doesn't return the org identifier in the token response —
  // it's fetched separately via /connections using the access token just
  // received. That list can include older orgs; pickXeroOrganisation
  // matches this consent, then stores one org per Vault tenant
  // (UNIQUE tenant_id).
  let xeroTenantId: string;
  let xeroTenantName: string | null = null;
  try {
    const connRes = await fetch("https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!connRes.ok) {
      return fail("connections_lookup_failed");
    }
    const connections = await connRes.json() as XeroConnection[];
    const chosen = pickXeroOrganisation(Array.isArray(connections) ? connections : [], idToken);
    if (!chosen?.tenantId) {
      return fail("no_xero_organisation");
    }
    xeroTenantId   = chosen.tenantId;
    xeroTenantName = chosen.tenantName ?? null;
  } catch (err) {
    console.error("[xero/oauth/callback] connections lookup threw:", err);
    return fail("connections_lookup_error");
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
    return fail("db_error");
  }

  // Success — redirect back to settings on the same host that started OAuth
  const successUrl = new URL(`${appUrl}/settings`);
  successUrl.searchParams.set("xero_connected", "1");
  return NextResponse.redirect(successUrl.toString());
}
