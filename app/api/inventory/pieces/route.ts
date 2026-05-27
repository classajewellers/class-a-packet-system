import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function buildPieceInsert(body: Record<string, unknown>) {
  return {
    design_id: body.design_id,
    sku: body.sku,
    metal_karat: body.metal_karat || null,
    metal_colour: body.metal_colour || null,
    metal_weight_grams: body.metal_weight_grams != null && body.metal_weight_grams !== '' ? Number(body.metal_weight_grams) : null,
    diamond_carat: body.diamond_carat != null && body.diamond_carat !== '' ? Number(body.diamond_carat) : null,
    diamond_colour: body.diamond_colour || null,
    diamond_clarity: body.diamond_clarity || null,
    diamond_type: body.diamond_type || null,
    finger_size: body.finger_size || null,
    other_specs: body.other_specs || null,
    location_id: body.location_id || null,
    cost_price: body.cost_price != null && body.cost_price !== '' ? Number(body.cost_price) : null,
    retail_price: body.retail_price != null && body.retail_price !== '' ? Number(body.retail_price) : null,
    status: body.status || 'in_stock',
    notes: body.notes || null,
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const designId = searchParams.get('design_id')
    const supabase = createServerSupabaseClient()
    let query = supabase
      .from('inventory_pieces')
      .select(`*, location:inventory_locations(id, name, parent_id)`)
      .order('created_at', { ascending: true })
    if (designId) {
      query = query.eq('design_id', designId)
    }
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ pieces: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.design_id) return NextResponse.json({ error: 'design_id is required' }, { status: 400 })
    if (!body.sku || typeof body.sku !== 'string' || !body.sku.trim()) {
      return NextResponse.json({ error: 'sku is required' }, { status: 400 })
    }
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('inventory_pieces')
      .insert(buildPieceInsert(body))
      .select(`*, location:inventory_locations(id, name, parent_id)`)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ piece: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
