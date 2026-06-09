import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') ?? ''
    const tenantId = req.headers.get(\'x-tenant-id\') ?? \'\'
    const supabase = await createTenantSupabaseClient(tenantId)
    let query = supabase
      .from('inventory_products')
      .select(`*, inventory_variants(*, inventory_variant_stock(quantity))`)
      .order('name', { ascending: true })
    if (search) {
      query = query.or(`name.ilike.%${search}%,category.ilike.%${search}%`)
    }
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const products = (data ?? []).map((p: Record<string, unknown>) => {
      const rawVariants = (p.inventory_variants as Record<string, unknown>[]) ?? []
      const variants = rawVariants.map((v) => {
        const stockRows = (v.inventory_variant_stock as { quantity: number }[] | null) ?? []
        const total_stock = stockRows.reduce((sum, r) => sum + (r.quantity ?? 0), 0)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { inventory_variant_stock: _s, ...rest } = v
        return { ...rest, total_stock }
      })
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { inventory_variants: _v, ...rest } = p
      return { ...rest, variants }
    })
    return NextResponse.json({ products })
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
      .from('inventory_products')
      .insert({
        name: body.name,
        description: body.description || null,
        category: body.category || null,
        department: body.department || null,
        notes: body.notes || null,
      })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ product: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
