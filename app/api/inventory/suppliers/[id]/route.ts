import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const leadUpdate: {
      lead_time_days?: number | null
      avg_lead_time_days?: number | null
      max_lead_time_days?: number | null
    } = {}
    if ('avg_lead_time_days' in body || 'lead_time_days' in body) {
      const avg = 'avg_lead_time_days' in body ? body.avg_lead_time_days : body.lead_time_days
      leadUpdate.avg_lead_time_days = avg ?? null
      leadUpdate.lead_time_days = avg ?? null
    }
    if ('max_lead_time_days' in body) {
      leadUpdate.max_lead_time_days = body.max_lead_time_days ?? null
    } else if ('lead_time_days' in body && !('avg_lead_time_days' in body)) {
      leadUpdate.max_lead_time_days = body.lead_time_days ?? null
    }
    const { data, error } = await supabase
      .from('inventory_suppliers')
      .update({
        name: body.name,
        contact_name: body.contact_name ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        notes: body.notes ?? null,
        connector_type: body.connector_type || null,
        ...leadUpdate,
      })
      .eq('id', params.id)
      .eq('tenant_id', tenantId)
      .select()
      .single()
    // PGRST116 = no row matched .single() — either the id doesn't exist, or
    // it belongs to a different tenant. Same response either way: a 404, not
    // a raw Postgrest error that could hint at the row existing elsewhere.
    if (error?.code === 'PGRST116') return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ supplier: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const { error } = await supabase
      .from('inventory_suppliers')
      .delete()
      .eq('id', params.id)
      .eq('tenant_id', tenantId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
