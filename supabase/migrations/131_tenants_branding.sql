-- -----------------------------------------------------------------------------
-- 131: brand_logo_url / brand_primary_colour as per-tenant settings (A2)
--
-- Replaces Vault's hardcoded purple (#635BFF) and logo on customer-facing
-- quote surfaces (lib/quoteGenerator.ts, components/QuoteDocument.tsx,
-- app/quote/page.tsx) with per-tenant values, falling back to Vault's
-- current look when a tenant hasn't configured their own.
--
-- Same additive, plain-column-on-tenants pattern as deposit_percentage (128)
-- and terms_and_conditions (129) - a single per-tenant value each, no
-- sub-structure needed.
--
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).
-- -----------------------------------------------------------------------------

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_logo_url text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_primary_colour text;
