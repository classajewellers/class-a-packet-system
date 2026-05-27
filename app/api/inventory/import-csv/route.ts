import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type CsvRow = {
  design_name?: string
  category?: string
  sku?: string
  metal_karat?: string
  metal_colour?: string
  metal_weight_grams?: string
  diamond_type?: string
  diamond_carat?: string
  diamond_colour?: string
  diamond_clarity?: string
  finger_size?: string
  other_specs?: string
  location_name?: string
  cost_price?: string
  retail_price?: string
  status?: string
  notes?: string
}

const ALLOWED_CATEGORIES = [
  'Engagement Ring', 'Wedding Band', 'Earrings', 'Necklace',
  'Bracelet', 'Pendant', 'Brooch', 'Ring', 'Other',
] as const

const ALLOWED_STATUSES = ['in_stock', 'on_order', 'sold', 'consignment', 'repair'] as const
const ALLOWED_KARATS = ['9K', '14K', '18K', '22K', '24K', 'Platinum', 'Silver', 'Other'] as const
const ALLOWED_COLOURS = ['Yellow', 'White', 'Rose', 'Two-Tone', 'Tri-Colour', 'Other'] as const
const ALLOWED_DIAMOND_TYPES = ['Natural', 'Lab Grown', 'Moissanite', 'None'] as const

function parseNum(v: string | undefined | null): number | null {
  if (v == null) return null
  const trimmed = String(v).trim()
  if (!trimmed) return null
  const n = parseFloat(trimmed)
  return isNaN(n) ? null : n
}

function pickEnum<T extends readonly string[]>(v: string | undefined | null, allowed: T): T[number] | null {
  if (!v) return null
  const trimmed = String(v).trim()
  if (!trimmed) return null
  const match = allowed.find((a) => a.toLowerCase() === trimmed.toLowerCase())
  return (match as T[number]) ?? null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rows: CsvRow[] = Array.isArray(body?.rows) ? body.rows : []
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()

    // Preload designs and locations
    const [designsRes, locationsRes] = await Promise.all([
      supabase.from('inventory_designs').select('id, name'),
      supabase.from('inventory_locations').select('id, name'),
    ])

    if (designsRes.error) {
      return NextResponse.json({ error: designsRes.error.message }, { status: 500 })
    }
    if (locationsRes.error) {
      return NextResponse.json({ error: locationsRes.error.message }, { status: 500 })
    }

    const designByName = new Map<string, string>()
    for (const d of designsRes.data ?? []) {
      designByName.set(String(d.name).toLowerCase(), d.id)
    }
    const locationByName = new Map<string, string>()
    for (const l of locationsRes.data ?? []) {
      locationByName.set(String(l.name).toLowerCase(), l.id)
    }

    const errors: Array<{ row: number; reason: string }> = []
    let designsCreated = 0
    let piecesImported = 0
    let failed = 0

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNumber = i + 1
      try {
        const designName = (row.design_name ?? '').trim()
        const sku = (row.sku ?? '').trim()

        if (!designName) {
          errors.push({ row: rowNumber, reason: 'design_name is required' })
          failed++
          continue
        }
        if (!sku) {
          errors.push({ row: rowNumber, reason: 'sku is required' })
          failed++
          continue
        }

        // Find or create design
        const key = designName.toLowerCase()
        let designId: string | undefined = designByName.get(key)
        if (!designId) {
          const categoryInput = (row.category ?? '').trim()
          let category: string | null = null
          if (categoryInput) {
            const matched = pickEnum(categoryInput, ALLOWED_CATEGORIES)
            if (!matched) {
              errors.push({ row: rowNumber, reason: `Invalid category "${categoryInput}"` })
              failed++
              continue
            }
            category = matched
          }
          const { data: newDesign, error: designErr } = await supabase
            .from('inventory_designs')
            .insert({ name: designName, category })
            .select('id, name')
            .single()
          if (designErr || !newDesign) {
            errors.push({ row: rowNumber, reason: `Failed to create design: ${designErr?.message ?? 'unknown error'}` })
            failed++
            continue
          }
          designId = String(newDesign.id)
          designByName.set(key, designId)
          designsCreated++
        }

        // Resolve location
        const locationNameInput = (row.location_name ?? '').trim()
        const locationId = locationNameInput
          ? locationByName.get(locationNameInput.toLowerCase()) ?? null
          : null

        // Validate status
        const statusInput = (row.status ?? '').trim()
        let status: typeof ALLOWED_STATUSES[number] = 'in_stock'
        if (statusInput) {
          const matched = pickEnum(statusInput, ALLOWED_STATUSES)
          if (!matched) {
            errors.push({ row: rowNumber, reason: `Invalid status "${statusInput}"` })
            failed++
            continue
          }
          status = matched
        }

        // Validate enums
        const karatInput = (row.metal_karat ?? '').trim()
        let metalKarat: string | null = null
        if (karatInput) {
          const matched = pickEnum(karatInput, ALLOWED_KARATS)
          if (!matched) {
            errors.push({ row: rowNumber, reason: `Invalid metal_karat "${karatInput}"` })
            failed++
            continue
          }
          metalKarat = matched
        }

        const colourInput = (row.metal_colour ?? '').trim()
        let metalColour: string | null = null
        if (colourInput) {
          const matched = pickEnum(colourInput, ALLOWED_COLOURS)
          if (!matched) {
            errors.push({ row: rowNumber, reason: `Invalid metal_colour "${colourInput}"` })
            failed++
            continue
          }
          metalColour = matched
        }

        const dTypeInput = (row.diamond_type ?? '').trim()
        let diamondType: string | null = null
        if (dTypeInput) {
          const matched = pickEnum(dTypeInput, ALLOWED_DIAMOND_TYPES)
          if (!matched) {
            errors.push({ row: rowNumber, reason: `Invalid diamond_type "${dTypeInput}"` })
            failed++
            continue
          }
          diamondType = matched
        }

        const insertPayload = {
          design_id: designId,
          sku,
          metal_karat: metalKarat,
          metal_colour: metalColour,
          metal_weight_grams: parseNum(row.metal_weight_grams),
          diamond_type: diamondType,
          diamond_carat: parseNum(row.diamond_carat),
          diamond_colour: (row.diamond_colour ?? '').trim() || null,
          diamond_clarity: (row.diamond_clarity ?? '').trim() || null,
          finger_size: (row.finger_size ?? '').trim() || null,
          other_specs: (row.other_specs ?? '').trim() || null,
          location_id: locationId,
          cost_price: parseNum(row.cost_price),
          retail_price: parseNum(row.retail_price),
          status,
          notes: (row.notes ?? '').trim() || null,
        }

        const { error: pieceErr } = await supabase
          .from('inventory_pieces')
          .insert(insertPayload)

        if (pieceErr) {
          errors.push({ row: rowNumber, reason: `Failed to insert piece: ${pieceErr.message}` })
          failed++
          continue
        }
        piecesImported++
      } catch (err) {
        errors.push({ row: rowNumber, reason: String(err) })
        failed++
      }
    }

    return NextResponse.json({
      designs_created: designsCreated,
      pieces_imported: piecesImported,
      failed,
      errors,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
