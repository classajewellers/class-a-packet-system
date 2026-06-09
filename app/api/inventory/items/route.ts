import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') ?? ''
    const item_type = searchParams.get('item_type') ?? ''
    const location_id = searchParams.get('location_id') ?? ''
    const supplier_id = searchParams.get('supplier_id') ?? ''
    const department = searchParams.get('department') ?? ''
    const lowstock = searchParams.get('lowstock') === 'true'

    const tenantId = req.headers.get('x-tenant-id') ?? ''

    const supabase = await createTenantSupabaseClient(tenantId)
    let query = supabase
      .from('inventory_items')
      .select(`
        *,
        supplier:inventory_suppliers(*),
        location:inventory_locations(*),
        inventory_stock(quantity)
      `)
      .order('created_at', { ascending: false })

    if (search) {
      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,category.ilike.%${search}%`)
    }
    if (item_type) query = query.eq('item_type', item_type)
    if (location_id) query = query.eq('location_id', location_id)
    if (supplier_id) query = query.eq('supplier_id', supplier_id)
    if (department) query = query.eq('department', department)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Aggregate stock quantity across all locations
    let items = (data ?? []).map((item: Record<string, unknown>) => {
      const stockRows = (item.inventory_stock as { quantity: number }[] | null) ?? []
      const total_stock = stockRows.reduce((sum: number, r: { quantity: number }) => sum + (r.quantity ?? 0), 0)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { inventory_stock: _stock, ...rest } = item
      return { ...rest, total_stock }
    })

    // Low stock filter: total_stock <= reorder_point (reorder_point must be set > 0)
    if (lowstock) {
      items = items.filter((item) => {
        const rp = (item as { reorder_point?: number | null }).reorder_point
        const ts = (item as { total_stock?: number }).total_stock ?? 0
        return rp != null && rp > 0 && ts <= rp
      })
    }

    return NextResponse.json({ items })
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
      .from('inventory_items')
      .insert({
        sku: body.sku,
        name: body.name,
        description: body.description || null,
        item_type: body.item_type ?? 'retail',
        category: body.category || null,
        department: body.department || null,
        supplier_id: body.supplier_id || null,
        supplier_code: body.supplier_code || null,
        cost_price: body.cost_price ?? null,
        retail_price: body.retail_price ?? null,
        packaging_cost: body.packaging_cost ?? null,
        landed_cost: body.landed_cost ?? null,
        reorder_point: body.reorder_point ?? null,
        metal_type: body.metal_type || null,
        metal_weight_grams: body.metal_weight_grams ?? null,
        location_id: body.location_id || null,
        shopify_synced: body.shopify_synced ?? false,
        notes: body.notes || null,
        tenant_id: tenantId,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
