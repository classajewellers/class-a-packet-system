-- 078_tenant_shopify_connections.sql
-- Per-tenant Shopify OAuth connections — one row per connected tenant.

CREATE TABLE IF NOT EXISTS tenant_shopify_connections (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shop_domain     TEXT        NOT NULL,  -- e.g. classajewellers.myshopify.com
  access_token    TEXT        NOT NULL,
  scopes          TEXT        NOT NULL,
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  webhook_registered  BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT tenant_shopify_connections_tenant_unique UNIQUE (tenant_id)
);

-- Index for the webhook route's hot path: identify tenant by incoming shop_domain
CREATE INDEX IF NOT EXISTS idx_tenant_shopify_connections_shop_domain
  ON tenant_shopify_connections (shop_domain);

ALTER TABLE tenant_shopify_connections DISABLE ROW LEVEL SECURITY;
