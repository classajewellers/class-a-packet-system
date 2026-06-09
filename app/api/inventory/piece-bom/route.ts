import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const pieceId = searchParams.get('piece_id')
    if (!pieceId) return NextResponse.json({ error: 'piece_id is required' }, { status: 400 })

    const tenantId = req.headers.get('x-tenant-id') ?? ''

    const supabase = await createTenantSupabaseClient(tenantId)
    const { data, error } = await supabase
      .from('inventory_piece_bom')
      .select(`*, supplier:inventory_suppliers(id, name)`)
      .eq('piece_id', pieceId)
      .order('created_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.piece_id) return NextResponse.json({ error: 'piece_id is required' }, { status: 400 })
    if (!body.component_type) return NextResponse.json({ error: 'component_type is required' }, { status: 400 })
    if (!body.description || !String(body.description).trim()) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 })
    }

    const quantity = body.quantity != null && body.quantity !== '' ? Number(body.quantity) : 1
    const unit_cost = body.unit_cost != null && body.unit_cost !== '' ? Number(body.unit_cost) : 0
    const locked_cost = Math.round(quantity * unit_cost * 100) / 100

    const tenantId = req.headers.get('x-tenant-id') ?? ''

    const supabase = await createTenantSupabaseClient(tenantId)
    const { data, error } = await supabase
      .from('inventory_piece_bom')
      .insert({
        piece_id: body.piece_id,
        component_type: body.component_type,
        description: String(body.description).trim(),
        quantity,
        unit: body.unit || null,
        unit_cost,
        locked_cost,
        supplier_id: body.supplier_id || null,
        notes: body.notes || null,
        tenant_id: tenantId,
      })
      .select(`*, supplier:inventory_suppliers(id, name)`)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
