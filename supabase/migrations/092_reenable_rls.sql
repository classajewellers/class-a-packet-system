-- 092_reenable_rls.sql
--
-- Re-enables Row Level Security on three tables that had it disabled by
-- earlier column-addition migrations (088, 089, 084).
--
-- All data access goes through Next.js API routes using the Supabase service
-- role key. The service role bypasses RLS, so re-enabling it does not change
-- any application behaviour. It does prevent an authenticated browser client
-- from querying these tables directly via PostgREST.
--
-- profiles          — existing policies from migrations 019/035 re-activate.
-- inventory_pieces  — no policies; deny-all for non-service-role (correct).
-- inventory_po_lines — no policies; deny-all for non-service-role (correct).

ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_pieces  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_po_lines ENABLE ROW LEVEL SECURITY;
