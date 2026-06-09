import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const product_id = searchParams.get('product_id') ?? ''
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    let query = supabase
      .from('inventory_variants')
      .select(`*, inventory_variant_stock(quantity)`)
      .order('created_at', { ascending: false })
    if (product_id) query = query.eq('product_id', product_id)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const variants = (data ?? []).map((v: Record<string, unknown>) => {
      const stockRows = (v.inventory_variant_stock as { quantity: number }[] | null) ?? []
      const total_stock = stockRows.reduce((sum, r) => sum + (r.quantity ?? 0), 0)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { inventory_variant_stock: _s, ...rest } = v
      return { ...rest, total_stock }
    })
    return NextResponse.json({ variants })
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
      .from('inventory_variants')
      .insert({
        product_id: body.product_id,
        sku: body.sku,
        metal_type: body.metal_type || null,
        metal_karat: body.metal_karat || null,
        metal_colour: body.metal_colour || null,
        metal_weight_grams: body.metal_weight_grams ?? null,
        diamond_carat: body.diamond_carat ?? null,
        diamond_colour: body.diamond_colour || null,
        diamond_clarity: body.diamond_clarity || null,
        diamond_type: body.diamond_type || null,
        finger_size: body.finger_size || null,
        other_specs: body.other_specs || null,
        cost_price: body.cost_price ?? null,
        retail_price: body.retail_price ?? null,
        is_active: body.is_active ?? true,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ variant: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
