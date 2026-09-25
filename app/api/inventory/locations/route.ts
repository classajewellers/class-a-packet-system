import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'
import { tenantScoped } from '@/lib/tenantScoped'
import { loadLocations } from '@/lib/load-locations'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? ''
  if (!tenantId) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 })
  const supabase = await createTenantSupabaseClient(tenantId)
  try {
    const { locations, columnsReady } = await loadLocations(supabase, tenantId)
    return NextResponse.json({ locations, columnsReady })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not load locations' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const { data, error } = await supabase
      .from('inventory_locations')
      .insert({
        name: body.name,
        type: body.type,
        bin_code_format: body.bin_code_format || null,
        shopify_visible: body.shopify_visible ?? false,
        parent_id: body.parent_id || null,
        tenant_id: tenantId,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ location: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
