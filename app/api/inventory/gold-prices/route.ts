import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get(\'x-tenant-id\') ?? \'\'
    const supabase = await createTenantSupabaseClient(tenantId)
    const { data, error } = await supabase
      .from('inventory_gold_prices')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const all = data ?? []
    const latestByKarat: Record<string, unknown> = {}
    for (const row of all as Array<{ karat: string }>) {
      if (!latestByKarat[row.karat]) latestByKarat[row.karat] = row
    }
    return NextResponse.json({ prices: all, latest: latestByKarat })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const tenantId = req.headers.get(\'x-tenant-id\') ?? \'\'
    const supabase = await createTenantSupabaseClient(tenantId)
    const { data, error } = await supabase
      .from('inventory_gold_prices')
      .insert({
        karat: body.karat,
        price_per_gram: body.price_per_gram,
        supplier_id: body.supplier_id || null,
        effective_date: body.effective_date || new Date().toISOString().slice(0, 10),
        notes: body.notes || null,
        created_by: body.created_by || null,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ price: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
