import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const [metalRates, fixedCosts, marginBrackets, meleeStones, templates] = await Promise.all([
      supabase.from('pricing_metal_rates').select('*'),
      supabase.from('pricing_fixed_costs').select('*'),
      supabase.from('pricing_margin_brackets').select('*').order('cost_min', { ascending: true }),
      supabase.from('pricing_melee_stones').select('*'),
      supabase.from('quote_templates').select('*').order('sort_order', { ascending: true }),
    ])
    return NextResponse.json({
      metalRates: metalRates.data ?? [],
      fixedCosts: fixedCosts.data ?? [],
      marginBrackets: marginBrackets.data ?? [],
      meleeStones: meleeStones.data ?? [],
      templates: templates.data ?? [],
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
