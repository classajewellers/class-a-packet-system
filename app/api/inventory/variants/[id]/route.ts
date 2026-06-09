import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = _req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId)
  const { data, error } = await supabase
    .from('inventory_variants')
    .select(`*, inventory_bom(*)`)
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ variant: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const tenantId = _req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const { data, error } = await supabase
      .from('inventory_variants')
      .update({
        sku: body.sku,
        metal_type: body.metal_type ?? null,
        metal_karat: body.metal_karat ?? null,
        metal_colour: body.metal_colour ?? null,
        metal_weight_grams: body.metal_weight_grams ?? null,
        diamond_carat: body.diamond_carat ?? null,
        diamond_colour: body.diamond_colour ?? null,
        diamond_clarity: body.diamond_clarity ?? null,
        diamond_type: body.diamond_type ?? null,
        finger_size: body.finger_size ?? null,
        other_specs: body.other_specs ?? null,
        cost_price: body.cost_price ?? null,
        retail_price: body.retail_price ?? null,
        is_active: body.is_active ?? true,
      })
      .eq('id', params.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ variant: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = _req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const { error } = await supabase.from('inventory_variants').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
