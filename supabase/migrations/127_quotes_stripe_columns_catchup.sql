-- -----------------------------------------------------------------------------
-- 127: quotes table Stripe/acceptance columns catch-up (staging drift)
--
-- Discovered while verifying B1 (quote status model: awaiting_payment/paid
-- driven by real Stripe events) against staging: the Stripe payment-link
-- route (app/api/quotes/[id]/payment-link/route.ts), the Stripe webhook
-- (app/api/stripe/webhook/route.ts), and the quote-acceptance flow
-- (app/quotes/[id]/page.tsx handleAcceptOption/handleConvertToOrder via
-- app/api/quotes/[id]/route.ts) all read/write six columns on quotes that
-- DO NOT EXIST on staging at all:
--   deposit_paid, deposit_paid_at, deposit_amount,
--   stripe_payment_link_id, stripe_payment_link_url, accepted_option
-- Confirmed by querying staging's live schema directly (not inferred from
-- migration files) - none of these appear anywhere in supabase/migrations/
-- either, so this is genuine untracked drift, same class of issue as the
-- pricing_metal_rates gap fixed in migration 125, just discovered on a
-- different table this time. Every one of these code paths would currently
-- fail at runtime on staging with "column does not exist" the moment they
-- actually execute - this blocks not just B1 but the entire B-track
-- (payment links, webhook status updates, and staff option-acceptance are
-- all broken on staging today).
--
-- Types chosen to match this table's existing conventions:
--   deposit_amount numeric(10,2) matches quoted_price (016_quote_builder.sql).
--
-- Safe to re-run (ADD COLUMN IF NOT EXISTS throughout).
-- -----------------------------------------------------------------------------

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_paid boolean NOT NULL DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_amount numeric(10,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS stripe_payment_link_id text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS stripe_payment_link_url text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accepted_option integer;
