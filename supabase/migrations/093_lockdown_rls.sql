-- 093_lockdown_rls.sql
--
-- Enables Row Level Security on every table that had it explicitly disabled
-- across prior migrations. No policies are added — service role bypasses RLS
-- entirely so all application behaviour is unchanged. Non-service-role access
-- via PostgREST (authenticated or anon) is denied by default when no policy
-- exists, which is the correct posture for a server-side-only API.
--
-- Tables already fixed in 092 (profiles, inventory_pieces, inventory_po_lines)
-- are omitted — idempotent but cleaner to keep migrations non-overlapping.

-- Attachments
ALTER TABLE public.attachments                     ENABLE ROW LEVEL SECURITY;

-- Charm / necklace
ALTER TABLE public.charm_components                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charm_necklace_configs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charm_purchase_orders           ENABLE ROW LEVEL SECURITY;

-- Customer
ALTER TABLE public.customer_appointments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_partners               ENABLE ROW LEVEL SECURITY;

-- Inventory
ALTER TABLE public.inventory_products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_purchase_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receiving_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_sales                 ENABLE ROW LEVEL SECURITY;

-- RFID
ALTER TABLE public.inventory_rfid_tags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfid_bridge_installations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfid_printers                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_jobs                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_rfid_connections         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_rfid_handhelds           ENABLE ROW LEVEL SECURITY;

-- Pricing
ALTER TABLE public.natural_diamond_prices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_brackets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_build_components        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_fixed_costs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_gold_prices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_labour_rates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_margin_brackets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_margin_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_melee_stones            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_metal_rates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_product_variants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_products                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rate_cards              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_supplier_costs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rapaport_parcels                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rapaport_prices                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sapphire_stock                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stone_base_prices               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stone_carat_multipliers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stone_clarity_adjustments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stone_colour_adjustments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_tier_config                 ENABLE ROW LEVEL SECURITY;

-- Quoting / repair catalogue
ALTER TABLE public.claw_rates                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_tiers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitting_fee_config              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts_catalogue                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_lines                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_templates                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quoting_settings                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_actions                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_quoting_metal_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restring_prices                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_actions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setting_tiers                   ENABLE ROW LEVEL SECURITY;

-- Workshop
ALTER TABLE public.packet_activity_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_lead_times             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_locations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_manager_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_pathways               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_settings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_stage_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_stages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_subcontractors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_team_members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_valuers                ENABLE ROW LEVEL SECURITY;

-- Tenant / admin
ALTER TABLE public.rate_limits                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_pins                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_features                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_shopify_connections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_admin_activity            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_admin_stores              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_reports                   ENABLE ROW LEVEL SECURITY;
