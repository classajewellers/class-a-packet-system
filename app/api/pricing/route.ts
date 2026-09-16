import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// PostgREST caps any unranged select() at its server-side max-rows default
// (1000) regardless of how many rows actually exist — a melee price list can
// legitimately be several thousand rows, so an unranged select silently
// truncates it (this is the confirmed cause of the Settings→Melee page
// under-reporting the real row count). Page through with .range() until a
// page comes back short of a full page.
async function selectAllRows<T = Record<string, unknown>>(
  supabase: SupabaseClient, table: string
): Promise<T[]> {
  const PAGE = 1000
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (error) throw error
    const page = (data ?? []) as T[]
    all.push(...page)
    if (page.length < PAGE) break
    from += PAGE
  }
  return all
}

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const [metalRates, fixedCosts, marginBrackets, meleeStones, meleeQualityMap, templates] = await Promise.all([
      supabase.from('pricing_metal_rates').select('*'),
      supabase.from('pricing_fixed_costs').select('*'),
      supabase.from('pricing_margin_brackets').select('*').order('cost_min', { ascending: true }),
      // Melee price lists can legitimately exceed 1000 rows — paginate fully.
      selectAllRows(supabase, 'pricing_melee_stones'),
      // quality map — lets the quote builder offer valid colour_group + clarity
      // options per origin (quality is resolved server-side at pricing).
      supabase.from('pricing_melee_quality_map').select('id, supplier_id, colour_group, clarity, quality'),
      supabase.from('quote_templates').select('*').order('sort_order', { ascending: true }),
    ])
    return NextResponse.json({
      metalRates: metalRates.data ?? [],
      fixedCosts: fixedCosts.data ?? [],
      marginBrackets: marginBrackets.data ?? [],
      meleeStones,
      meleeQualityMap: meleeQualityMap.data ?? [],
      templates: templates.data ?? [],
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
