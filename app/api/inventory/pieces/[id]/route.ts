import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('inventory_pieces')
      .select(`*, location:inventory_locations(id, name, parent_id)`)
      .eq('id', params.id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ piece: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const update: Record<string, unknown> = {}
    const set = (key: string, val: unknown) => { update[key] = val }
    const num = (v: unknown) => (v == null || v === '' ? null : Number(v))

    if (body.sku !== undefined) set('sku', body.sku)
    if (body.metal_karat !== undefined) set('metal_karat', body.metal_karat || null)
    if (body.metal_colour !== undefined) set('metal_colour', body.metal_colour || null)
    if (body.metal_weight_grams !== undefined) set('metal_weight_grams', num(body.metal_weight_grams))
    if (body.diamond_carat !== undefined) set('diamond_carat', num(body.diamond_carat))
    if (body.diamond_colour !== undefined) set('diamond_colour', body.diamond_colour || null)
    if (body.diamond_clarity !== undefined) set('diamond_clarity', body.diamond_clarity || null)
    if (body.diamond_type !== undefined) set('diamond_type', body.diamond_type || null)
    if (body.finger_size !== undefined) set('finger_size', body.finger_size || null)
    if (body.other_specs !== undefined) set('other_specs', body.other_specs || null)
    if (body.location_id !== undefined) set('location_id', body.location_id || null)
    if (body.cost_price !== undefined) set('cost_price', num(body.cost_price))
    if (body.retail_price !== undefined) set('retail_price', num(body.retail_price))
    if (body.status !== undefined) set('status', body.status || 'in_stock')
    if (body.notes !== undefined) set('notes', body.notes || null)

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('inventory_pieces')
      .update(update)
      .eq('id', params.id)
      .select(`*, location:inventory_locations(id, name, parent_id)`)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ piece: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.from('inventory_pieces').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
