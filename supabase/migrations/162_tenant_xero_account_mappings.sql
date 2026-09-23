-- Per-tenant GL account mapping for Xero purchase-order sync — lets each
-- tenant map Vault's fixed, generic PO line-item categories to their own
-- real Xero Chart of Accounts entries (fetched live via GET /api/xero/accounts,
-- never typed in or hardcoded). category_key is a Vault-defined taxonomy,
-- confirmed with Josh 2026-09-23: diamonds_gemstones, metal,
-- findings_components, labour, freight_shipping, other.
--
-- xero_account_id is the source of truth (Xero's own AccountID, stable
-- across renames); code/name are denormalised purely for display without
-- an extra API round-trip — always re-fetched fresh alongside the mapping
-- so a rename in Xero is visible, not silently stale.

CREATE TABLE IF NOT EXISTS public.tenant_xero_account_mappings (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_key       text        NOT NULL,
  xero_account_id    uuid        NOT NULL,
  xero_account_code  text        NOT NULL,
  xero_account_name  text        NOT NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_xero_account_mappings_unique UNIQUE (tenant_id, category_key)
);

ALTER TABLE public.tenant_xero_account_mappings DISABLE ROW LEVEL SECURITY;
