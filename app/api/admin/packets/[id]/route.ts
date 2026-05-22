import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('packets')
      .update(body)
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Packet update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ packet: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabaseClient()
    console.log('[delete] Deleting packet:', params.id)

    // Use .select() so Supabase returns the deleted rows — if data is empty the
    // row was never removed (silent RLS block or wrong ID) and we must NOT tell
    // the client the delete succeeded.
    const { data: deleted, error } = await supabase
      .from('packets')
      .delete()
      .eq('id', params.id)
      .select('id')

    if (error) {
      console.error('[delete] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!deleted || deleted.length === 0) {
      console.error('[delete] Row not deleted — not found or blocked:', params.id)
      return NextResponse.json({ error: 'Row not found or delete was blocked by the database' }, { status: 404 })
    }

    console.log('[delete] Successfully deleted:', params.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[delete] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('packets')
      .select('*')
      .eq('id', params.id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ packet: data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
