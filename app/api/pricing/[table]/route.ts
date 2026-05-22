import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ALLOWED_TABLES = ['pricing_metal_rates', 'pricing_fixed_costs', 'pricing_melee_stones']

export async function PATCH(request: NextRequest, { params }: { params: { table: string } }) {
  try {
    const { table } = params
    if (!ALLOWED_TABLES.includes(table)) {
      return NextResponse.json({ error: 'Table not allowed' }, { status: 400 })
    }
    const body = await request.json()
    const { id, field, value } = body
    if (!id || !field) {
      return NextResponse.json({ error: 'Missing id or field' }, { status: 400 })
    }
    const supabase = createServerSupabaseClient()
    const { error } = await supabase
      .from(table)
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
