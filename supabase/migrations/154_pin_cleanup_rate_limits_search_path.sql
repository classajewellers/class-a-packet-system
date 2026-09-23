-- Follow-up to 153: cleanup_rate_limits() had its EXECUTE grants revoked
-- from PUBLIC/anon/authenticated, but its search_path was never pinned —
-- confirmed still flagged as function_search_path_mutable by the linter
-- after 153 was applied to staging (2026-09-23). This is the only change
-- needed to close that finding.
ALTER FUNCTION public.cleanup_rate_limits() SET search_path = public;
