-- Production Supabase linter WARN findings, closed against confirmed live
-- production signatures (2026-09-23) — smaller drift than staging had.
-- Signatures for all 4 ALTER targets were confirmed via a read-only pg_proc
-- query against production itself (no overloads found, matching staging's
-- shapes exactly), NOT assumed from staging or migration files.
--
-- handle_new_user and increment_rate_limit already have search_path=public
-- on production per that same confirmation — only their grants need fixing
-- here.
--
-- cleanup_rate_limits and test_phase1_probe are deliberately NOT touched:
-- production's linter scan did not flag either, so — unlike staging — there
-- is no confirmed evidence they exist or are misconfigured on production.
-- Do not assume production mirrors staging beyond what was actually checked.

-- ── Pin search_path (bodies untouched — ALTER FUNCTION only) ───────────────
ALTER FUNCTION public.move_stock(uuid, uuid, uuid, uuid, integer) SET search_path = public;
ALTER FUNCTION public.receive_quantity_stock(uuid, uuid, uuid, integer, numeric, uuid) SET search_path = public;
ALTER FUNCTION public.vault_verify_rfid_tag(uuid, uuid, text, uuid, text, text) SET search_path = public;
ALTER FUNCTION public.normalize_melee_mm(text) SET search_path = public;

-- ── Grant corrections ────────────────────────────────────────────────────
-- PUBLIC-grant gotcha (confirmed via pglite on staging): PostgreSQL grants
-- EXECUTE to the PUBLIC pseudo-role by default on function creation, and
-- anon/authenticated inherit through it. Revoking from anon/authenticated
-- alone leaves them able to execute. PUBLIC must be revoked explicitly first.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, text, timestamptz) FROM anon, authenticated;
