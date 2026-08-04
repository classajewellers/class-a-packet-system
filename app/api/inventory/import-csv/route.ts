import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type CsvRow = {
  sku?: string
  title?: string
  category?: string
  status?: string
  location?: string
  metal_type?: string
  metal_karat?: string
  metal_colour?: string
  metal_weight_grams?: string
  finger_size?: string
  cost_price?: string
  retail_price?: string
  notes?: string
  supplier_code?: string
}

function parseNum(v: string | undefined | null): number | null {
  if (v == null) return null
  const trimmed = String(v).trim()
  if (!trimmed) return null
  const n = parseFloat(trimmed)
  return isNaN(n) ? null : n
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rows: CsvRow[] = Array.isArray(body?.rows) ? body.rows : []
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
    }

    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)

    // Preload all reference tables once
    const [statusRes, locationRes, categoryRes] = await Promise.all([
      supabase.from('inventory_statuses').select('id, name').eq('tenant_id', tenantId).eq('is_active', true),
      supabase.from('inventory_locations').select('id, name').eq('tenant_id', tenantId).eq('is_active', true),
      supabase.from('inventory_categories').select('id, name').eq('tenant_id', tenantId).eq('is_active', true),
    ])

    if (statusRes.error)   return NextResponse.json({ error: statusRes.error.message },   { status: 500 })
    if (locationRes.error) return NextResponse.json({ error: locationRes.error.message }, { status: 500 })
    if (categoryRes.error) return NextResponse.json({ error: categoryRes.error.message }, { status: 500 })

    const statusByName   = new Map<string, string>()
    const locationByName = new Map<string, string>()
    const categoryByName = new Map<string, string>()
    for (const s of statusRes.data   ?? []) statusByName.set(String(s.name).toLowerCase(), s.id)
    for (const l of locationRes.data ?? []) locationByName.set(String(l.name).toLowerCase(), l.id)
    for (const c of categoryRes.data ?? []) categoryByName.set(String(c.name).toLowerCase(), c.id)

    // Default to first "in stock" status if available
    let defaultStatusId: string | null = null
    const statusEntries = Array.from(statusByName.entries())
    for (let si = 0; si < statusEntries.length; si++) {
      const sname = statusEntries[si][0]; const sid = statusEntries[si][1]
      if (sname.includes('in stock') || sname.includes('in_stock')) { defaultStatusId = sid; break }
    }

    const errors: Array<{ row: number; reason: string }> = []
    let piecesImported = 0
    let failed = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNumber = i + 1

      try {
        const sku = (row.sku ?? '').trim()
        if (!sku) {
          errors.push({ row: rowNumber, reason: 'sku is required' })
          failed++
          continue
        }

        // Resolve status_id
        const statusInput = (row.status ?? '').trim()
        let statusId: string | null = statusInput
          ? (statusByName.get(statusInput.toLowerCase()) ?? null)
          : defaultStatusId
        if (statusInput && !statusId) {
          errors.push({ row: rowNumber, reason: `Unknown status "${statusInput}" — check inventory settings` })
          failed++
          continue
        }

        // Resolve location_id (optional)
        const locationInput = (row.location ?? '').trim()
        const locationId = locationInput
          ? (locationByName.get(locationInput.toLowerCase()) ?? null)
          : null

        // Resolve category_id (optional)
        const categoryInput = (row.category ?? '').trim()
        const categoryId = categoryInput
          ? (categoryByName.get(categoryInput.toLowerCase()) ?? null)
          : null

        const { error: pieceErr } = await supabase
          .from('inventory_pieces')
          .insert({
            tenant_id:           tenantId,
            sku,
            title:               (row.title ?? '').trim() || null,
            category_id:         categoryId,
            status_id:           statusId,
            location_id:         locationId,
            metal_type:          (row.metal_type ?? '').trim() || null,
            metal_karat:         (row.metal_karat ?? '').trim() || null,
            metal_colour:        (row.metal_colour ?? '').trim() || null,
            metal_weight_grams:  parseNum(row.metal_weight_grams),
            finger_size:         (row.finger_size ?? '').trim() || null,
            cost_price:          parseNum(row.cost_price),
            retail_price:        parseNum(row.retail_price),
            notes:               (row.notes ?? '').trim() || null,
            supplier_code:       (row.supplier_code ?? '').trim() || null,
          })

        if (pieceErr) {
          errors.push({ row: rowNumber, reason: `Failed to insert: ${pieceErr.message}` })
          failed++
          continue
        }
        piecesImported++
      } catch (err) {
        errors.push({ row: rowNumber, reason: String(err) })
        failed++
      }
    }

    return NextResponse.json({ pieces_imported: piecesImported, failed, errors })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
