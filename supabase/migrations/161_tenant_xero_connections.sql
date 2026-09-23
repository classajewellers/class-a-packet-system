-- Per-tenant Xero OAuth connections — one row per connected tenant,
-- mirroring tenant_shopify_connections (migration 078) exactly. One shared
-- Vault-owned Xero OAuth app (XERO_CLIENT_ID/XERO_CLIENT_SECRET, platform
-- env vars — never stored per-tenant), each tenant authorizes their own
-- Xero organization.
--
-- Unlike Shopify's Partner-app tokens (long-lived, no refresh needed),
-- Xero access tokens expire after 30 minutes and require a refresh_token
-- exchange — access_token_expires_at lets a shared getValidXeroAccessToken()
-- helper decide when to refresh before a call, rather than only reacting to
-- a 401.
--
-- xero_tenant_id/xero_tenant_name are Xero's own organisation identifiers
-- (from Xero's /connections endpoint after token exchange) — named
-- distinctly from Vault's own tenant_id to avoid confusion between the two
-- systems' unrelated "tenant" concepts.

CREATE TABLE IF NOT EXISTS public.tenant_xero_connections (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  xero_tenant_id          TEXT        NOT NULL,
  xero_tenant_name        TEXT,
  access_token            TEXT        NOT NULL,
  refresh_token           TEXT        NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  scopes                  TEXT        NOT NULL,
  connected_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_xero_connections_tenant_unique UNIQUE (tenant_id)
);

ALTER TABLE public.tenant_xero_connections DISABLE ROW LEVEL SECURITY;
