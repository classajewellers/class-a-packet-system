import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const tenantId = req.headers.get(\'x-tenant-id\') ?? \'\'
    const supabase = await createTenantSupabaseClient(tenantId)
    const update: Record<string, unknown> = {}
    if (body.component_type !== undefined) update.component_type = body.component_type
    if (body.description !== undefined) update.description = body.description
    if (body.quantity !== undefined) update.quantity = body.quantity
    if (body.unit !== undefined) update.unit = body.unit || null
    if (body.unit_cost !== undefined) update.unit_cost = body.unit_cost
    if (body.supplier_id !== undefined) update.supplier_id = body.supplier_id || null
    if (body.purchase_invoice_id !== undefined) update.purchase_invoice_id = body.purchase_invoice_id || null
    if (body.notes !== undefined) update.notes = body.notes || null
    const { data, error } = await supabase
      .from('inventory_bom')
      .update(update)
      .eq('id', params.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = req.headers.get(\'x-tenant-id\') ?? \'\'
    const supabase = await createTenantSupabaseClient(tenantId)
    const { error } = await supabase.from('inventory_bom').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
