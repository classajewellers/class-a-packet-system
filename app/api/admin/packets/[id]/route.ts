import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.from('packets').select('*').eq('id', params.id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packet: data }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const body = await request.json()
  const { data, error } = await supabase.from('packets').update(body).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packet: data, success: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  console.log('[DELETE] Hit — id:', params.id)
  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('packets')
    .delete()
    .eq('id', params.id)
  if (error) {
    console.error('[DELETE] Error:', error)
    return NextResponse.json({ error: error.message, success: false }, { status: 500 })
  }
  console.log('[DELETE] Success — id:', params.id)
  return NextResponse.json({ success: true })
}
