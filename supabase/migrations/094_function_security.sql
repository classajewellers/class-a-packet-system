-- 094_function_security.sql
--
-- Fixes two classes of security warnings in the Supabase linter:
--
-- 1. function_search_path_mutable — re-create every flagged function with
--    SET search_path = public so a rogue schema cannot shadow public objects.
--
-- 2. anon/authenticated_security_definer_function_executable — revoke EXECUTE
--    on SECURITY DEFINER functions that should never be callable directly:
--      handle_new_user    — trigger-only; no external caller should invoke it
--      increment_rate_limit — server-side (service role) only

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Pin search_path on all flagged functions
-- ─────────────────────────────────────────────────────────────────────────────

-- handle_new_user (trigger: auth.users → profiles)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- set_tenant_config
CREATE OR REPLACE FUNCTION public.set_tenant_config(tenant_id UUID)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  SELECT set_config('app.tenant_id', tenant_id::text, true);
$$;

-- current_tenant_id
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::UUID;
$$;

-- increment_packet_counter
CREATE OR REPLACE FUNCTION public.increment_packet_counter(input_date date)
RETURNS int
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  new_count int;
BEGIN
  INSERT INTO public.daily_counters (date, tenant_id, packet_count)
  VALUES (input_date, '00000000-0000-0000-0000-000000000001', 1)
  ON CONFLICT (date) DO UPDATE
    SET packet_count = public.daily_counters.packet_count + 1
  RETURNING packet_count INTO new_count;
  RETURN new_count;
END;
$$;

-- increment_online_order_counter
CREATE OR REPLACE FUNCTION public.increment_online_order_counter(input_date date)
RETURNS int
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.daily_counters (date, tenant_id, packet_count, online_order_count)
  VALUES (input_date, '00000000-0000-0000-0000-000000000001', 0, 1)
  ON CONFLICT (date) DO UPDATE
    SET online_order_count = public.daily_counters.online_order_count + 1
  RETURNING public.daily_counters.online_order_count;
$$;

-- increment_quote_counter
CREATE OR REPLACE FUNCTION public.increment_quote_counter(input_date date)
RETURNS int
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.daily_counters (date, tenant_id, packet_count, quote_count)
  VALUES (input_date, '00000000-0000-0000-0000-000000000001', 0, 1)
  ON CONFLICT (date) DO UPDATE
    SET quote_count = public.daily_counters.quote_count + 1
  RETURNING public.daily_counters.quote_count;
$$;

-- increment_valuation_counter
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

-- increment_rate_limit
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

-- clear_blocked_on_status_change (trigger function)
CREATE OR REPLACE FUNCTION public.clear_blocked_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.blocked_reason IS NOT NULL THEN
      INSERT INTO public.packet_activity_log (packet_id, tenant_id, event_type, old_value, new_value)
      VALUES (
        OLD.id,
        OLD.tenant_id,
        'blocked_cleared',
        jsonb_build_object(
          'blocked_reason', OLD.blocked_reason,
          'blocked_note',   OLD.blocked_note,
          'blocked_at',     OLD.blocked_at,
          'status',         OLD.status
        ),
        jsonb_build_object('status', NEW.status)
      );
    END IF;
    INSERT INTO public.packet_activity_log (packet_id, tenant_id, event_type, old_value, new_value)
    VALUES (
      NEW.id,
      NEW.tenant_id,
      'status_change',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
    NEW.blocked_reason := NULL;
    NEW.blocked_note   := NULL;
    NEW.blocked_at     := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Revoke direct invocation of trigger / server-only SECURITY DEFINER functions
-- ─────────────────────────────────────────────────────────────────────────────

-- handle_new_user is fired by the auth.users trigger only.
-- No external role should be able to call it via PostgREST.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;

-- increment_rate_limit is called server-side via service role.
-- Revoking anon prevents unauthenticated abuse; revoking authenticated
-- keeps all rate-limit writes within the server boundary.
REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, text, timestamptz) FROM anon, authenticated;

-- clear_blocked_on_status_change is a trigger-only function.
REVOKE EXECUTE ON FUNCTION public.clear_blocked_on_status_change() FROM anon, authenticated;
