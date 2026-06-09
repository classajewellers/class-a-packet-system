-- ============================================================
-- 036_set_tenant_config.sql
-- RPC helper to set the current tenant context for a session.
-- Called by createTenantSupabaseClient() in lib/supabase-server.ts
-- ============================================================

CREATE OR REPLACE FUNCTION set_tenant_config(tenant_id UUID)
RETURNS void AS $$
  SELECT set_config('app.tenant_id', tenant_id::text, true);
$$ LANGUAGE sql;
