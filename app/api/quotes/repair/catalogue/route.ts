import { NextRequest, NextResponse } from 'next/server';
import { createTenantSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  const [
    settingsRes,
    repairActionsRes,
    serviceActionsRes,
    partsRes,
    bracketsRes,
    discountTiersRes,
    fittingFeeRes,
  ] = await Promise.all([
    supabase.from('quoting_settings').select('*').eq('tenant_id', tenantId).single(),
    supabase.from('repair_actions').select('*').eq('tenant_id', tenantId).eq('active', true).order('sort_order'),
    supabase.from('service_actions').select('*').eq('tenant_id', tenantId).eq('active', true).order('sort_order'),
    supabase.from('parts_catalogue').select('*').eq('tenant_id', tenantId).eq('active', true).order('category').order('name'),
    supabase.from('pricing_brackets').select('*').eq('tenant_id', tenantId).order('bracket_type').order('cost_lower_bound'),
    supabase.from('discount_tiers').select('*').eq('tenant_id', tenantId).order('sort_order'),
    supabase.from('fitting_fee_config').select('*').eq('tenant_id', tenantId).single(),
  ]);

  return NextResponse.json({
    settings: settingsRes.data ?? {
      ownership_label_yes: 'Purchased From Us',
      ownership_label_no: 'Not Purchased From Us',
      ownership_label_unknown: 'Unknown',
      labour_rate_per_minute: 1.00,
      labour_increment_minutes: 5,
    },
    repairActions: repairActionsRes.data ?? [],
    serviceActions: serviceActionsRes.data ?? [],
    parts: partsRes.data ?? [],
    brackets: bracketsRes.data ?? [],
    discountTiers: discountTiersRes.data ?? [],
    fittingFeeConfig: fittingFeeRes.data ?? { fee_per_end: 35 },
  });
}
