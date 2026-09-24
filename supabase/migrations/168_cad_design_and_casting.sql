-- 168_cad_design_and_casting.sql
-- PART D. HOLD — do not apply from the app. Vault DB applies this after the tip is READY.
--
-- Extends the existing workshop stage system. Does not add a second stage table.
--   workshop_stages keys (intake_substatus NULL), slotted immediately after Pre-Check
--   in the same category as that stage:
--     cad_design     CAD Design
--     casting        Casting
--     polish_finish  Polish/Finish
--     polish_set     Polish/Set
--   workshop_pathways row per tenant, name "CAD Design & Casting", steps JSON
--   (existing pathway step arrays are not rewritten, so workshop_step_index stays put):
--     CAD Design inhouse → Casting external → Polish/Finish inhouse → Polish/Set inhouse
--
-- Casting reuses packets.workshop_supplier (069). These columns are new because
-- they are not in any earlier migration (lib/types.ts already named the three dates):
--   packets.workshop_supplier_sent_date          date
--   packets.workshop_supplier_expected_return    date
--   packets.workshop_supplier_returned           boolean NOT NULL DEFAULT false
--   packets.workshop_casting_cad_version_id      uuid → workshop_cad_versions.id
-- Overdue: status = 'casting'
--   AND workshop_supplier_expected_return < current_date
--   AND workshop_supplier_returned = false.
-- Only the version id in workshop_casting_cad_version_id drives the casting order.
-- That pointer is set when a version is approved, and only while that row stays approved.
--
-- New table workshop_cad_versions. RLS matches workshop_roles (167):
--   ENABLE + FORCE, policy tenant_isolation FOR ALL
--   USING and WITH CHECK (tenant_id = public.current_tenant_id()).
--
-- Seeds every tenant. No Class A tenant id. New tenants get the same rows
-- from trg_seed_cad_stages_for_tenant.

CREATE TABLE IF NOT EXISTS public.workshop_cad_versions (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,
  packet_id            uuid        NOT NULL REFERENCES public.packets(id) ON DELETE CASCADE,
  version_number       integer     NOT NULL,
  render_attachment_id uuid        REFERENCES public.attachments(id) ON DELETE SET NULL,
  source_attachment_id uuid        REFERENCES public.attachments(id) ON DELETE SET NULL,
  render_storage_path  text,
  render_filename      text,
  source_storage_path  text,
  source_filename      text,
  status               text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'changes_requested', 'rejected')),
  note                 text,
  decision_note        text,
  created_by           uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by           uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (packet_id, version_number)
);

CREATE INDEX IF NOT EXISTS workshop_cad_versions_packet_idx
  ON public.workshop_cad_versions (tenant_id, packet_id, version_number DESC);

ALTER TABLE public.workshop_cad_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_cad_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.workshop_cad_versions;
CREATE POLICY tenant_isolation ON public.workshop_cad_versions
  FOR ALL
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

ALTER TABLE public.packets
  ADD COLUMN IF NOT EXISTS workshop_supplier_sent_date date,
  ADD COLUMN IF NOT EXISTS workshop_supplier_expected_return date,
  ADD COLUMN IF NOT EXISTS workshop_supplier_returned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS workshop_casting_cad_version_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'packets_workshop_casting_cad_version_id_fkey'
  ) THEN
    ALTER TABLE public.packets
      ADD CONSTRAINT packets_workshop_casting_cad_version_id_fkey
      FOREIGN KEY (workshop_casting_cad_version_id)
      REFERENCES public.workshop_cad_versions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.packets.workshop_supplier_sent_date IS
  'Date the job was sent to the external casting supplier.';
COMMENT ON COLUMN public.packets.workshop_supplier_expected_return IS
  'Expected return from the external caster. Overdue when this is before today, status is casting, and workshop_supplier_returned is false.';
COMMENT ON COLUMN public.packets.workshop_supplier_returned IS
  'True once the casting is back in the workshop.';
COMMENT ON COLUMN public.packets.workshop_casting_cad_version_id IS
  'Approved workshop_cad_versions row that drives the casting order.';

CREATE OR REPLACE FUNCTION public.seed_cad_stages_for_tenant(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat uuid;
  v_pre integer;
  v_base integer;
BEGIN
  SELECT id INTO v_cat
  FROM public.workshop_stage_categories
  WHERE tenant_id = p_tenant AND name = 'Intake'
  ORDER BY sort_order
  LIMIT 1;

  IF v_cat IS NULL THEN
    SELECT category_id INTO v_cat
    FROM public.workshop_stages
    WHERE tenant_id = p_tenant
      AND key = 'intake'
      AND intake_substatus = 'pre_check'
    LIMIT 1;
  END IF;

  IF v_cat IS NULL THEN
    INSERT INTO public.workshop_stage_categories (tenant_id, name, color, sort_order, default_collapsed)
    VALUES (p_tenant, 'Intake', 'blue', 0, false)
    RETURNING id INTO v_cat;
  END IF;

  SELECT sort_order INTO v_pre
  FROM public.workshop_stages
  WHERE tenant_id = p_tenant
    AND key = 'intake'
    AND intake_substatus = 'pre_check'
  ORDER BY sort_order
  LIMIT 1;

  IF v_pre IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workshop_stages
    WHERE tenant_id = p_tenant AND key = 'cad_design' AND intake_substatus IS NULL
  ) THEN
    UPDATE public.workshop_stages
    SET sort_order = sort_order + 4
    WHERE tenant_id = p_tenant
      AND category_id = v_cat
      AND sort_order > v_pre;
    v_base := v_pre;
  ELSE
    SELECT COALESCE(MAX(sort_order), 0) INTO v_base
    FROM public.workshop_stages
    WHERE tenant_id = p_tenant AND category_id = v_cat;
  END IF;

  INSERT INTO public.workshop_stages (tenant_id, category_id, key, label, intake_substatus, sort_order, is_locked)
  SELECT p_tenant, v_cat, s.key, s.label, NULL, v_base + s.ord, false
  FROM (
    VALUES
      ('cad_design',    'CAD Design',    1),
      ('casting',       'Casting',       2),
      ('polish_finish', 'Polish/Finish', 3),
      ('polish_set',    'Polish/Set',    4)
  ) AS s(key, label, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.workshop_stages ws
    WHERE ws.tenant_id = p_tenant
      AND ws.key = s.key
      AND ws.intake_substatus IS NULL
  );

  INSERT INTO public.workshop_pathways (tenant_id, name, steps)
  SELECT p_tenant,
         'CAD Design & Casting',
         '[
            {"name":"CAD Design","location":"inhouse"},
            {"name":"Casting","location":"external"},
            {"name":"Polish/Finish","location":"inhouse"},
            {"name":"Polish/Set","location":"inhouse"}
          ]'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM public.workshop_pathways p
    WHERE p.tenant_id = p_tenant AND p.name = 'CAD Design & Casting'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_cad_stages_for_tenant(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_cad_stages_for_tenant(uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_seed_cad_stages_for_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_cad_stages_for_tenant(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_seed_cad_stages_for_tenant() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_seed_cad_stages_for_tenant() FROM anon, authenticated;

DROP TRIGGER IF EXISTS tenants_seed_cad_stages ON public.tenants;
CREATE TRIGGER tenants_seed_cad_stages
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_cad_stages_for_tenant();

SELECT public.seed_cad_stages_for_tenant(id) FROM public.tenants;
