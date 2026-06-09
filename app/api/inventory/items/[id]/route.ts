import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId)
  const { data, error } = await supabase
    .from('inventory_items')
    .select(`*, supplier:inventory_suppliers(*), location:inventory_locations(*), inventory_stock(quantity, location_id, inventory_locations(name))`)
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ item: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const { data, error } = await supabase
      .from('inventory_items')
      .update({
        sku: body.sku,
        name: body.name,
        description: body.description ?? null,
        item_type: body.item_type,
        category: body.category ?? null,
        department: body.department ?? null,
        supplier_id: body.supplier_id ?? null,
        supplier_code: body.supplier_code ?? null,
        cost_price: body.cost_price ?? null,
        retail_price: body.retail_price ?? null,
        packaging_cost: body.packaging_cost ?? null,
        landed_cost: body.landed_cost ?? null,
        reorder_point: body.reorder_point ?? null,
        metal_type: body.metal_type ?? null,
        metal_weight_grams: body.metal_weight_grams ?? null,
        location_id: body.location_id ?? null,
        shopify_synced: body.shopify_synced ?? false,
        notes: body.notes ?? null,
      })
      .eq('id', params.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const { error } = await supabase.from('inventory_items').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
