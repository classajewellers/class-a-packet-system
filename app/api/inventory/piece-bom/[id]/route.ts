import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)

    // Fetch existing to support partial updates while always recomputing locked_cost
    const { data: existing, error: fetchErr } = await supabase
      .from('inventory_piece_bom')
      .select('quantity, unit_cost')
      .eq('id', params.id)
      .single()
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    const quantity = body.quantity != null && body.quantity !== ''
      ? Number(body.quantity)
      : Number(existing.quantity)
    const unit_cost = body.unit_cost != null && body.unit_cost !== ''
      ? Number(body.unit_cost)
      : Number(existing.unit_cost)
    const locked_cost = Math.round(quantity * unit_cost * 100) / 100

    const update: Record<string, unknown> = {
      quantity,
      unit_cost,
      locked_cost,
    }
    if (body.component_type !== undefined) update.component_type = body.component_type
    if (body.description !== undefined) update.description = String(body.description).trim()
    if (body.unit !== undefined) update.unit = body.unit || null
    if (body.supplier_id !== undefined) update.supplier_id = body.supplier_id || null
    if (body.notes !== undefined) update.notes = body.notes || null

    const { data, error } = await supabase
      .from('inventory_piece_bom')
      .update(update)
      .eq('id', params.id)
      .select(`*, supplier:inventory_suppliers(id, name)`)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const { error } = await supabase.from('inventory_piece_bom').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
