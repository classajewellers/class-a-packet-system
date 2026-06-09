import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId)
  const { data, error } = await supabase
    .from('inventory_suppliers')
    .select('*')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ suppliers: data ?? [] })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const { data, error } = await supabase
      .from('inventory_suppliers')
      .insert({
        name: body.name,
        contact_name: body.contact_name || null,
        email: body.email || null,
        phone: body.phone || null,
        lead_time_days: body.lead_time_days ?? null,
        notes: body.notes || null,
        tenant_id: tenantId,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ supplier: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
