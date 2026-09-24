// Shared helper for calling Xero's API on behalf of a tenant. Xero access
// tokens expire after 30 minutes (unlike Shopify's long-lived Partner-app
// tokens — see tenant_xero_connections' migration comment), so every real
// call needs to check expiry and refresh proactively first, rather than
// only reacting to a 401. This is the one place that logic lives — every
// route that talks to Xero on a tenant's behalf should go through
// getValidXeroAccessToken() rather than reading access_token directly.

import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// One list, used by the install redirect and by the "please reconnect"
// check. offline_access is required for a refresh_token (access tokens
// last 30 minutes). accounting.settings.read is Chart of Accounts.
// accounting.contacts and accounting.attachments are requested now so a
// later bill/contact feature does not need another surprise reconnect.
// accounting.transactions is not a valid scope for this app (created after
// Xero's March 2026 granular-scope cutoff).
export const XERO_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.invoices",
  "accounting.contacts",
  "accounting.settings.read",
  "accounting.attachments",
].join(" ");

// A stored connection must have these or Settings asks the user to reconnect.
// accounting.settings (broader) satisfies accounting.settings.read.
export const XERO_REQUIRED_CONNECTION_SCOPES = [
  "offline_access",
  "accounting.invoices",
  "accounting.contacts",
  "accounting.settings.read",
  "accounting.attachments",
] as const;

const SCOPE_SATISFIED_BY: Record<string, readonly string[]> = {
  "accounting.settings.read": ["accounting.settings.read", "accounting.settings"],
};

export function missingXeroScopes(granted: string | null | undefined, required: readonly string[]): string[] {
  const have = new Set((granted ?? "").split(/[\s,]+/).filter(Boolean));
  return required.filter(scope => {
    const accepted = SCOPE_SATISFIED_BY[scope] ?? [scope];
    return !accepted.some(name => have.has(name));
  });
}

export class XeroNotConnectedError extends Error {
  constructor() { super("Xero is not connected for this tenant"); }
}

export class XeroReconnectRequiredError extends Error {
  constructor(message = "Xero connection expired or was revoked. Reconnect Xero in Settings → Integrations.") {
    super(message);
    this.name = "XeroReconnectRequiredError";
  }
}

const PRODUCTION_APP_URL = "https://jewelleryvault.com.au";

// OAuth redirect_uri must be the site the browser is actually on.
// Preview deployments are a different host every branch; NEXT_PUBLIC_APP_URL
// is the production site, so using it here sends the Xero callback (and the
// token write) to production. Production keeps using NEXT_PUBLIC_APP_URL.
export function oauthAppUrl(req: NextRequest): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? PRODUCTION_APP_URL).replace(/\/$/, "");
  if (process.env.VERCEL_ENV !== "preview") return configured;

  const rawHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const host = rawHost.split(",")[0].trim().toLowerCase();
  if (!/^[a-z0-9.-]+(?::\d+)?$/.test(host)) return configured;
  const hostname = host.split(":")[0];
  if (!hostname.endsWith(".vercel.app")) return configured;

  const rawProto = (req.headers.get("x-forwarded-proto") ?? "https").split(",")[0].trim().toLowerCase();
  const proto = rawProto === "http" ? "http" : "https";
  return `${proto}://${host}`;
}

// Returns a valid (non-expired) access token for the tenant, refreshing via
// Xero's token endpoint first if the stored one has expired or is within 60
// seconds of expiring. Persists the new access_token/refresh_token/expiry
// back to tenant_xero_connections on refresh — Xero rotates refresh_token
// on every use, so the old one must not be reused.
export async function getValidXeroAccessToken(tenantId: string): Promise<{ accessToken: string; xeroTenantId: string; scopes: string }> {
  const supabase = createServerSupabaseClient();
  const { data: conn, error } = await supabase
    .from("tenant_xero_connections")
    .select("access_token, refresh_token, access_token_expires_at, xero_tenant_id, scopes")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !conn) throw new XeroNotConnectedError();

  const expiresAt = new Date(conn.access_token_expires_at).getTime();
  const stillValid = expiresAt - Date.now() > 60_000; // 60s buffer
  if (stillValid) {
    return { accessToken: conn.access_token, xeroTenantId: conn.xero_tenant_id, scopes: conn.scopes ?? "" };
  }

  const clientId     = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Xero OAuth is not configured");

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type:    "refresh_token",
      refresh_token: conn.refresh_token,
    }),
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("[xero] token refresh failed:", tokenRes.status, body.slice(0, 300));
    throw new XeroReconnectRequiredError();
  }

  const json = await tokenRes.json() as {
    access_token?: string; refresh_token?: string; expires_in?: number;
  };
  if (!json.access_token || !json.refresh_token) {
    throw new XeroReconnectRequiredError("Xero token refresh returned no tokens. Reconnect Xero in Settings → Integrations.");
  }

  // Xero rotates refresh_token on every use. If this write fails, the old
  // token is already dead and the new one is only in memory — the user must
  // reconnect. Do not report success.
  const { data: saved, error: updateError } = await supabase
    .from("tenant_xero_connections")
    .update({
      access_token:            json.access_token,
      refresh_token:           json.refresh_token,
      access_token_expires_at: new Date(Date.now() + (json.expires_in ?? 1800) * 1000).toISOString(),
    })
    .eq("tenant_id", tenantId)
    .select("tenant_id");

  if (updateError || !saved?.length) {
    console.error("[xero] failed to persist refreshed tokens:", updateError?.message ?? "no row updated");
    throw new XeroReconnectRequiredError(
      "Xero refreshed the connection but Vault could not save the new token. Reconnect Xero in Settings → Integrations."
    );
  }

  return { accessToken: json.access_token, xeroTenantId: conn.xero_tenant_id, scopes: conn.scopes ?? "" };
}
