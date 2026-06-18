import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  console.log('[DELETE /api/admin/packets/[id]] id:', params.id)
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)

    // Step 1: Remove foreign key references from quotes table
    const { error: quoteError } = await supabase
      .from('quotes')
      .update({ converted_to_packet_id: null })
      .eq('converted_to_packet_id', params.id)

    if (quoteError) {
      console.error('[DELETE] Error clearing quote references:', quoteError)
      // Continue anyway — the reference may not exist
    }

    // Step 2: Remove foreign key references from workshop_jobs table
    const { error: workshopError } = await supabase
      .from('workshop_jobs')
      .update({ packet_id: null })
      .eq('packet_id', params.id)

    if (workshopError) {
      console.error('[DELETE] Error clearing workshop references:', workshopError)
      // Continue anyway
    }

    // Step 3: Now delete the packet
    const delQ = supabase.from('packets').delete().eq('id', params.id)
    const { error } = await (tenantId ? delQ.eq('tenant_id', tenantId) : delQ)

    if (error) {
      console.error('[DELETE] Supabase error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    console.log('[DELETE] Success')
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE] Exception:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantId = req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId)
  const q = supabase.from('packets').select('*').eq('id', params.id)
  const { data, error } = await (tenantId ? q.eq('tenant_id', tenantId) : q).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packet: data }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantId = req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId)
  const body = await req.json()
  const pq = supabase.from('packets').update(body).eq('id', params.id)
  const { data, error } = await (tenantId ? pq.eq('tenant_id', tenantId) : pq).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packet: data, success: true })
}
