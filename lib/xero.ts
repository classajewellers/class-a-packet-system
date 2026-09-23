// Shared helper for calling Xero's API on behalf of a tenant. Xero access
// tokens expire after 30 minutes (unlike Shopify's long-lived Partner-app
// tokens — see tenant_xero_connections' migration comment), so every real
// call needs to check expiry and refresh proactively first, rather than
// only reacting to a 401. This is the one place that logic lives — every
// route that talks to Xero on a tenant's behalf should go through
// getValidXeroAccessToken() rather than reading access_token directly.

import { createServerSupabaseClient } from "@/lib/supabase-server";

export class XeroNotConnectedError extends Error {
  constructor() { super("Xero is not connected for this tenant"); }
}

// Returns a valid (non-expired) access token for the tenant, refreshing via
// Xero's token endpoint first if the stored one has expired or is within 60
// seconds of expiring. Persists the new access_token/refresh_token/expiry
// back to tenant_xero_connections on refresh — Xero rotates refresh_token
// on every use, so the old one must not be reused.
export async function getValidXeroAccessToken(tenantId: string): Promise<{ accessToken: string; xeroTenantId: string }> {
  const supabase = createServerSupabaseClient();
  const { data: conn, error } = await supabase
    .from("tenant_xero_connections")
    .select("access_token, refresh_token, access_token_expires_at, xero_tenant_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !conn) throw new XeroNotConnectedError();

  const expiresAt = new Date(conn.access_token_expires_at).getTime();
  const stillValid = expiresAt - Date.now() > 60_000; // 60s buffer
  if (stillValid) {
    return { accessToken: conn.access_token, xeroTenantId: conn.xero_tenant_id };
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
    throw new Error(`Xero token refresh failed: ${tokenRes.status} ${body.slice(0, 300)}`);
  }

  const json = await tokenRes.json() as {
    access_token?: string; refresh_token?: string; expires_in?: number;
  };
  if (!json.access_token || !json.refresh_token) {
    throw new Error("Xero token refresh returned no tokens");
  }

  await supabase
    .from("tenant_xero_connections")
    .update({
      access_token:            json.access_token,
      refresh_token:           json.refresh_token,
      access_token_expires_at: new Date(Date.now() + (json.expires_in ?? 1800) * 1000).toISOString(),
    })
    .eq("tenant_id", tenantId);

  return { accessToken: json.access_token, xeroTenantId: conn.xero_tenant_id };
}
