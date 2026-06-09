import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// ─── stock helpers ─────────────────────────────────────────────────────────────

/** Add delta to stock (or set absolute if isAbsolute=true). Never throws — returns error or null. */
async function updateStock(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  item_id: string,
  location_id: string,
  delta: number,
  isAbsolute = false,
  tenantId = ''
): Promise<string | null> {
  if (isAbsolute) {
    const { error } = await supabase
      .from('inventory_stock')
      .upsert(
        { item_id, location_id, quantity: delta, updated_at: new Date().toISOString(), tenant_id: tenantId },
        { onConflict: 'item_id,location_id' }
      )
    return error?.message ?? null
  }

  // Select existing row
  const { data: existing } = await supabase
    .from('inventory_stock')
    .select('quantity')
    .eq('item_id', item_id)
    .eq('location_id', location_id)
    .single()

  if (existing != null) {
    const { error } = await supabase
      .from('inventory_stock')
      .update({ quantity: existing.quantity + delta, updated_at: new Date().toISOString() })
      .eq('item_id', item_id)
      .eq('location_id', location_id)
    return error?.message ?? null
  } else {
    const { error } = await supabase
      .from('inventory_stock')
      .insert({ item_id, location_id, quantity: delta, updated_at: new Date().toISOString(), tenant_id: tenantId })
    return error?.message ?? null
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const item_id       = searchParams.get('item_id')
    const location_id   = searchParams.get('location_id')
    const movement_type = searchParams.get('movement_type')
    const from_date     = searchParams.get('from_date')
    const to_date       = searchParams.get('to_date')
    const limit         = Math.min(200, parseInt(searchParams.get('limit') ?? '50'))

    const tenantId = req.headers.get('x-tenant-id') ?? ''

    const supabase = await createTenantSupabaseClient(tenantId)

    let query = supabase
      .from('inventory_movements')
      .select(`
        *,
        item:inventory_items(name, sku),
        from_location:inventory_locations!from_location_id(name),
        to_location:inventory_locations!to_location_id(name)
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (item_id)       query = query.eq('item_id', item_id)
    if (movement_type) query = query.eq('movement_type', movement_type)
    if (from_date)     query = query.gte('created_at', from_date)
    if (to_date)       query = query.lte('created_at', to_date + 'T23:59:59Z')
    if (location_id) {
      query = query.or(`from_location_id.eq.${location_id},to_location_id.eq.${location_id}`)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ movements: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      item_id, from_location_id, to_location_id,
      quantity, movement_type, reference, notes,
    } = body

    if (!item_id || !movement_type || quantity == null) {
      return NextResponse.json({ error: 'item_id, movement_type and quantity are required' }, { status: 400 })
    }

    const tenantId = req.headers.get('x-tenant-id') ?? ''

    const supabase = await createTenantSupabaseClient(tenantId)

    // 1. Insert the movement record
    const { data: movement, error: movErr } = await supabase
      .from('inventory_movements')
      .insert({
        item_id,
        from_location_id: from_location_id || null,
        to_location_id:   to_location_id   || null,
        quantity,
        movement_type,
        reference: reference || null,
        notes:     notes     || null,
        tenant_id: tenantId,
      })
      .select()
      .single()

    if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 })

    // 2. Update inventory_stock
    let stockErr: string | null = null
    switch (movement_type) {
      case 'receive':
        stockErr = await updateStock(supabase, item_id, to_location_id, quantity, false, tenantId)
        break
      case 'transfer':
        stockErr = await updateStock(supabase, item_id, from_location_id, -quantity, false, tenantId)
        if (!stockErr) stockErr = await updateStock(supabase, item_id, to_location_id, quantity, false, tenantId)
        break
      case 'sale':
      case 'workshop_in':
        stockErr = await updateStock(supabase, item_id, from_location_id, -quantity, false, tenantId)
        break
      case 'return':
      case 'workshop_out':
        stockErr = await updateStock(supabase, item_id, to_location_id, quantity, false, tenantId)
        break
      case 'adjustment':
      case 'stocktake':
        // Absolute quantity set at to_location
        stockErr = await updateStock(supabase, item_id, to_location_id, quantity, true, tenantId)
        break
    }

    if (stockErr) {
      console.error('[movements POST] stock update failed:', stockErr)
    }

    return NextResponse.json({ movement, stockError: stockErr })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
