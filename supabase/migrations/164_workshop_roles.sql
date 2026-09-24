-- 164_workshop_roles.sql
-- Superseded. This file does not create a catalog.
--
-- The Part C schema Vault DB applies is 165_workshop_role_tags.sql:
--   workshop_role_tags (tenant_id, key, label, active, sort)
--   profile_workshop_roles
--   seed jeweller + cad_designer
--   policy tenant_isolation
--
-- A fresh staging database is not assumed to have either table. Do not
-- invent a workshop_roles / slug / name / sort_order draft for them to apply.

DO $$
BEGIN
  RAISE NOTICE '164_workshop_roles is superseded by 165_workshop_role_tags; no draft catalog is created';
END $$;
