import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') ?? ''
  const supabase = await createTenantSupabaseClient(tenantId)
  const { data, error } = await supabase
    .from('inventory_products')
    .select(`*, inventory_variants(*)`)
    .eq('id', params.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ product: data })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json()
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const { data, error } = await supabase
      .from('inventory_products')
      .update({
        name: body.name,
        description: body.description ?? null,
        category: body.category ?? null,
        department: body.department ?? null,
        notes: body.notes ?? null,
      })
      .eq('id', params.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ product: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)
    const { error } = await supabase.from('inventory_products').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
