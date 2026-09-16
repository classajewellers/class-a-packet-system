import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const [metalRates, fixedCosts, marginBrackets, meleeStones, meleeQualityMap, templates] = await Promise.all([
      supabase.from('pricing_metal_rates').select('*'),
      supabase.from('pricing_fixed_costs').select('*'),
      supabase.from('pricing_margin_brackets').select('*').order('cost_min', { ascending: true }),
      supabase.from('pricing_melee_stones').select('*'),
      // quality map — lets the quote builder offer valid colour_group + clarity
      // options per supplier/origin (quality is resolved server-side at pricing).
      supabase.from('pricing_melee_quality_map').select('id, supplier_id, colour_group, clarity, quality'),
      supabase.from('quote_templates').select('*').order('sort_order', { ascending: true }),
    ])
    return NextResponse.json({
      metalRates: metalRates.data ?? [],
      fixedCosts: fixedCosts.data ?? [],
      marginBrackets: marginBrackets.data ?? [],
      meleeStones: meleeStones.data ?? [],
      meleeQualityMap: meleeQualityMap.data ?? [],
      templates: templates.data ?? [],
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
