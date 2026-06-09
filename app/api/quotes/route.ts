import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[quotes] Error:', error)
      return NextResponse.json({ quotes: [] }, {
        headers: { 'Cache-Control': 'no-store' }
      })
    }

    console.log('[quotes] Returning:', data?.length ?? 0, 'quotes')

    return NextResponse.json({ quotes: data ?? [] }, {
      headers: { 'Cache-Control': 'no-store' }
    })
  } catch (err) {
    console.error('[quotes] Fatal error:', err)
    return NextResponse.json({ quotes: [] }, {
      headers: { 'Cache-Control': 'no-store' }
    })
  }
}
