import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const invoice_id = searchParams.get('invoice_id') ?? ''
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    let query = supabase
      .from('inventory_purchase_lines')
      .select(`*, variant:inventory_variants(sku, metal_type, metal_karat)`)
      .order('created_at', { ascending: true })
    if (invoice_id) query = query.eq('invoice_id', invoice_id)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ lines: data ?? [] })
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
      .from('inventory_purchase_lines')
      .insert({
        invoice_id: body.invoice_id,
        variant_id: body.variant_id || null,
        description: body.description,
        component_type: body.component_type || null,
        quantity: body.quantity ?? 1,
        unit_cost: body.unit_cost ?? null,
        is_faulty: body.is_faulty ?? false,
        faulty_notes: body.faulty_notes || null,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ line: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
