import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  console.log('[DELETE /api/admin/packets/[id]] id:', params.id)
  try {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase
      .from('packets')
      .delete()
      .eq('id', params.id)
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
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('packets')
    .select('*')
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packet: data }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient()
  const body = await request.json()
  const { data, error } = await supabase
    .from('packets')
    .update(body)
    .eq('id', params.id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packet: data, success: true })
}
