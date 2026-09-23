-- Closes drift where 094_function_security.sql never fully applied to
-- staging (confirmed 2026-09-23: increment_rate_limit was anon-callable
-- live despite 094's REVOKE for it), plus pins search_path on the
-- remaining functions the 2026-09-23 linter WARN scan flagged that 094
-- never covered at all. Argument signatures for vault_verify_rfid_tag,
-- normalize_melee_mm, move_stock, and receive_quantity_stock were
-- confirmed directly against live staging via RPC calls before writing
-- this file (see session notes) — not assumed from migration files alone.

-- ── Re-affirm 094's intent for the 4 functions it already wrote once ───────
CREATE OR REPLACE FUNCTION public.set_tenant_config(tenant_id UUID)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  SELECT set_config('app.tenant_id', tenant_id::text, true);
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::UUID;
$$;

CREATE OR REPLACE FUNCTION public.increment_valuation_counter(input_date date)
RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE new_count int;
BEGIN
  INSERT INTO public.daily_counters (date, valuation_count)
  VALUES (input_date, 1)
  ON CONFLICT (date) DO UPDATE
    SET valuation_count = public.daily_counters.valuation_count + 1
  RETURNING valuation_count INTO new_count;
  RETURN new_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_key        TEXT,
  p_window_key TEXT,
  p_expires_at TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.rate_limits (key, window_key, count, expires_at)
  VALUES (p_key, p_window_key, 1, p_expires_at)
  ON CONFLICT (key, window_key) DO UPDATE
    SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;
  RETURN v_count;
END;
$$;

-- ── New pins (never written before, per 2026-09-23 linter WARN scan) ───────
ALTER FUNCTION public.vault_verify_rfid_tag(uuid, uuid, text, uuid, text, text) SET search_path = public;
ALTER FUNCTION public.normalize_melee_mm(text) SET search_path = public;
ALTER FUNCTION public.move_stock(uuid, uuid, uuid, uuid, integer) SET search_path = public;
ALTER FUNCTION public.receive_quantity_stock(uuid, uuid, uuid, integer, numeric, uuid) SET search_path = public;

-- ── Grant corrections (confirmed live-anon-callable 2026-09-23; investigated,
-- not guessed — see session notes for call-site analysis of each) ──────────
-- IMPORTANT: PostgreSQL grants EXECUTE to the PUBLIC pseudo-role by default
-- on function creation, and anon/authenticated inherit that PUBLIC grant.
-- REVOKE ... FROM anon, authenticated alone (094's original approach) does
-- NOT remove it — confirmed by pglite: after revoking from anon/authenticated
-- only, has_function_privilege() still returned true for both roles. PUBLIC
-- must be revoked explicitly for the anon/authenticated revoke to take effect.
REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, text, timestamptz) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM anon, authenticated;

-- ── Dead scaffolding (confirmed live via service-role RPC, returns literal
-- "hello"; zero references anywhere in the repo) ───────────────────────────
DROP FUNCTION IF EXISTS public.test_phase1_probe();
