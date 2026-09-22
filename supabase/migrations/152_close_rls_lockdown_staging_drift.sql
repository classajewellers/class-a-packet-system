-- 152: close staging drift on migration 093's RLS lockdown + fix the
-- security-definer view flagged by Supabase's own database linter
-- (staging scan, 2026-09-22)
--
-- SAME DRIFT PATTERN as everything else found this session: migration 093
-- (093_lockdown_rls.sql) already contains the exact fix for all 32 tables
-- the linter just flagged as "RLS Disabled in Public" — but it evidently
-- never fully applied to staging. Likely cause: 093 also targets tables
-- like workshop_settings that didn't exist on staging at the time (closed
-- much later by migration 148 in this same session) — a single failing
-- ALTER TABLE mid-file would abort the whole migration's transaction,
-- taking every other statement in it down with it, exactly like migration
-- 072/079/084's total-non-application found earlier this session.
--
-- This migration re-applies ENABLE ROW LEVEL SECURITY (already idempotent —
-- safe to re-run, no-op if already enabled) for exactly the 32 tables the
-- linter reported live against staging right now — not all ~70 tables in
-- 093, since only these 32 were confirmed still disabled. No policies are
-- added, matching 093's own stated intent: the service-role key (used by
-- all app code, per CLAUDE.md) bypasses RLS unconditionally regardless of
-- its enabled state, so this only closes off direct anon/authenticated
-- access via PostgREST — zero effect on the app itself. Same safe pattern
-- already used and verified for migrations 144/146/148/150 this session.
--
-- The security_definer_view finding on inventory_low_stock (migration 138,
-- extended by 141) is unrelated to RLS lockdown — Postgres views default to
-- security_invoker = false (Postgres 15+) unless told otherwise, which
-- Supabase's linter flags as a permission-bypass risk regardless of RLS
-- state on the underlying tables. Fixed by setting security_invoker = true
-- so the view enforces the QUERYING user's permissions, not the view
-- creator's — a one-line ALTER, no need to redefine the view's query.

ALTER VIEW public.inventory_low_stock SET (security_invoker = true);

ALTER TABLE public.stone_base_prices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_fixed_costs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_margin_brackets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_admin_activity        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_admin_stores          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sapphire_stock              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_features             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_build_components    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rate_cards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_supplier_costs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_gold_prices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_labour_rates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rapaport_prices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rapaport_parcels            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_partners           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_product_variants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charm_components            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charm_necklace_configs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charm_purchase_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_tier_config             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_appointments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_margin_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stone_colour_adjustments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stone_clarity_adjustments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stone_carat_multipliers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.natural_diamond_prices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_pins                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_melee_stones        ENABLE ROW LEVEL SECURITY;
