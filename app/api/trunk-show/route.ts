import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()

    const { data: sales, error } = await supabase
      .from('trunk_show_sales')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Resolve staff names from profiles table
    const allIds = (sales ?? []).map((s) => s.created_by).filter(Boolean) as string[]
    const createdByIds = allIds.filter((id, i) => allIds.indexOf(id) === i)
    const profileMap: Record<string, string> = {}
    if (createdByIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', createdByIds)
      for (const p of profiles ?? []) {
        profileMap[p.id] = p.full_name ?? '—'
      }
    }

    const enriched = (sales ?? []).map((s) => ({
      ...s,
      staff_name: s.created_by ? (profileMap[s.created_by] ?? '—') : '—',
    }))

    return NextResponse.json({ sales: enriched })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = createServerSupabaseClient()

    if (!body.customer_name || !body.item_description || body.payment_amount == null) {
      return NextResponse.json(
        { error: 'customer_name, item_description and payment_amount are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('trunk_show_sales')
      .insert({
        customer_name:    body.customer_name,
        customer_phone:   body.customer_phone   || null,
        customer_email:   body.customer_email   || null,
        sku:              body.sku              || null,
        item_description: body.item_description,
        sale_type:        body.sale_type        ?? 'full_sale',
        payment_method:   body.payment_method   || null,
        payment_amount:   body.payment_amount,
        balance_owing:    body.balance_owing    ?? 0,
        notes:            body.notes            || null,
        created_by:       body.created_by       || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ sale: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
