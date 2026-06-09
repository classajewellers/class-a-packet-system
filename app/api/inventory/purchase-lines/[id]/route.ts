import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const update: Record<string, unknown> = {}
    if (body.variant_id !== undefined) update.variant_id = body.variant_id || null
    if (body.description !== undefined) update.description = body.description
    if (body.component_type !== undefined) update.component_type = body.component_type || null
    if (body.quantity !== undefined) update.quantity = body.quantity
    if (body.unit_cost !== undefined) update.unit_cost = body.unit_cost
    if (body.is_faulty !== undefined) update.is_faulty = body.is_faulty
    if (body.faulty_notes !== undefined) update.faulty_notes = body.faulty_notes || null
    const { data, error } = await supabase
      .from('inventory_purchase_lines')
      .update(update)
      .eq('id', params.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ line: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const { error } = await supabase.from('inventory_purchase_lines').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
