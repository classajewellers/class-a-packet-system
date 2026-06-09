import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const supplier_id = searchParams.get('supplier_id') ?? ''
    const status = searchParams.get('status') ?? ''
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    let query = supabase
      .from('inventory_purchase_invoices')
      .select(`*, supplier:inventory_suppliers(*)`)
      .order('created_at', { ascending: false })
    if (supplier_id) query = query.eq('supplier_id', supplier_id)
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ invoices: data ?? [] })
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
      .from('inventory_purchase_invoices')
      .insert({
        invoice_number: body.invoice_number,
        supplier_id: body.supplier_id || null,
        invoice_date: body.invoice_date || null,
        total_amount: body.total_amount ?? null,
        status: body.status || 'pending',
        notes: body.notes || null,
        created_by: body.created_by || null,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ invoice: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
