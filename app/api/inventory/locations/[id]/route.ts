import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'
import { tenantScoped } from '@/lib/tenantScoped'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    if (!tenantId) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 })
    const supabase = await createTenantSupabaseClient(tenantId)
    const activeOnly = typeof body.active === 'boolean' && body.name == null && body.type == null
    const patch: Record<string, unknown> = activeOnly
      ? { active: body.active }
      : {
          name: body.name,
          type: body.type,
          bin_code_format: body.bin_code_format ?? null,
          shopify_visible: body.shopify_visible ?? false,
          parent_id: body.parent_id || null,
        }
    if (!activeOnly && typeof body.active === 'boolean') patch.active = body.active
    const { data, error } = await tenantScoped(supabase, tenantId)
      .from('inventory_locations')
      .update(patch)
      .eq('id', params.id)
      .select()
      .single()
    if (error?.code === 'PGRST116') return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ location: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    if (!tenantId) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 })
    const supabase = await createTenantSupabaseClient(tenantId)
    const { error } = await tenantScoped(supabase, tenantId).from('inventory_locations').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
