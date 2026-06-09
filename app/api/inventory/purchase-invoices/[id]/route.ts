import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId)
  const { data, error } = await supabase
    .from('inventory_purchase_invoices')
    .select(`*, supplier:inventory_suppliers(*), lines:inventory_purchase_lines(*, variant:inventory_variants(sku, metal_type, metal_karat))`)
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ invoice: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const update: Record<string, unknown> = {}
    if (body.invoice_number !== undefined) update.invoice_number = body.invoice_number
    if (body.supplier_id !== undefined) update.supplier_id = body.supplier_id || null
    if (body.invoice_date !== undefined) update.invoice_date = body.invoice_date || null
    if (body.total_amount !== undefined) update.total_amount = body.total_amount
    if (body.status !== undefined) update.status = body.status
    if (body.notes !== undefined) update.notes = body.notes || null
    const { data, error } = await supabase
      .from('inventory_purchase_invoices')
      .update(update)
      .eq('id', params.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ invoice: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
