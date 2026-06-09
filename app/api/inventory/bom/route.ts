import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const variant_id = searchParams.get('variant_id') ?? ''
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    let query = supabase
      .from('inventory_bom')
      .select(`*, supplier:inventory_suppliers(*)`)
      .order('created_at', { ascending: true })
    if (variant_id) query = query.eq('variant_id', variant_id)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const { data, error } = await supabase
      .from('inventory_bom')
      .insert({
        variant_id: body.variant_id,
        component_type: body.component_type,
        description: body.description,
        quantity: body.quantity ?? 1,
        unit: body.unit || null,
        unit_cost: body.unit_cost ?? 0,
        supplier_id: body.supplier_id || null,
        purchase_invoice_id: body.purchase_invoice_id || null,
        notes: body.notes || null,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
