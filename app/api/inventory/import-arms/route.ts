import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type ArmsRow = {
  Type?: string
  Department?: string
  'Parent Stock #'?: string
  'Stock # / SKU'?: string
  'Shopify Title'?: string
  Description?: string
  Supplier?: string
  'Design Name'?: string
  'Days on Hand'?: string
  'Date Added'?: string
  'Total Purchased'?: string
  Cost?: string
  'Retail Price'?: string
  'Ord.'?: string
  Comments?: string
}

type ImportError = {
  row: number
  type: 'piece' | 'bom' | 'orphan'
  sku: string
  reason: string
}

// Allowed values from migration 029
type AllowedCategory =
  | 'Engagement Ring' | 'Wedding Ring' | 'Fine Jewellery' | 'Earrings'
  | 'Bracelet' | 'Necklace' | 'Pendant' | 'Brooch'
  | 'Loose Stone' | 'Component' | 'Other'

type AllowedComponentType = 'casting' | 'diamond' | 'labour' | 'settings' | 'findings' | 'other'

function parseNum(v: string | undefined | null): number | null {
  if (v == null) return null
  const trimmed = String(v).replace(/[$,]/g, '').trim()
  if (!trimmed) return null
  const n = parseFloat(trimmed)
  return isNaN(n) ? null : n
}

function mapDepartmentToCategory(department: string): AllowedCategory {
  const d = (department || '').toLowerCase()
  if (d.includes('diamond ring') || d.includes('engagement')) return 'Engagement Ring'
  if (d.includes('wedding')) return 'Wedding Ring'
  if (d.includes('earring')) return 'Earrings'
  if (d.includes('bracelet')) return 'Bracelet'
  if (d.includes('pendant')) return 'Pendant'
  if (d.includes('necklace') || d.includes('chain')) return 'Necklace'
  if (d.includes('brooch')) return 'Brooch'
  return 'Fine Jewellery'
}

function mapCommentsToComponentType(comments: string, description: string): AllowedComponentType {
  const text = `${comments} ${description}`.toLowerCase()
  if (text.includes('labour') || text.includes('labor') || text.includes('cad')) return 'labour'
  if (text.includes('setting') && !(text.includes('setting labour') || text.includes('setting labor'))) {
    return 'settings'
  }
  if (text.includes('stone') || text.includes('diamond') || text.includes('sapphire') ||
      text.includes('ruby') || text.includes('emerald')) {
    return 'diamond'
  }
  if (text.includes('casting') || text.includes('gold') || text.includes('platinum')) return 'casting'
  return 'other'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rows: ArmsRow[] = Array.isArray(body?.rows) ? body.rows : []
    if (rows.length === 0) {
      return NextResponse.json({ error: 'rows is required' }, { status: 400 })
    }

    const tenantId = req.headers.get('x-tenant-id') ?? ''

    const supabase = await createTenantSupabaseClient(tenantId)

    // Step 1: Load existing data
    const [designsRes, suppliersRes, locationsRes] = await Promise.all([
      supabase.from('inventory_designs').select('id, name'),
      supabase.from('inventory_suppliers').select('id, name'),
      supabase.from('inventory_locations').select('id, name'),
    ])

    if (designsRes.error) return NextResponse.json({ error: designsRes.error.message }, { status: 500 })
    if (suppliersRes.error) return NextResponse.json({ error: suppliersRes.error.message }, { status: 500 })
    if (locationsRes.error) return NextResponse.json({ error: locationsRes.error.message }, { status: 500 })

    const designMap = new Map<string, string>()
    for (const d of designsRes.data ?? []) designMap.set(d.name.toLowerCase(), d.id)

    const supplierMap = new Map<string, string>()
    for (const s of suppliersRes.data ?? []) supplierMap.set(s.name.toLowerCase(), s.id)

    // locations map kept for future use; not currently assigned by import
    const locationMap = new Map<string, string>()
    for (const l of locationsRes.data ?? []) locationMap.set(l.name.toLowerCase(), l.id)
    void locationMap

    const errors: ImportError[] = []
    let designsCreated = 0
    let piecesCreated = 0
    let bomCreated = 0
    let orphanedComponents = 0
    let failedPieces = 0
    let failedBom = 0

    // Track row index for error reporting (1-based, +1 for header)
    const indexed = rows.map((r, i) => ({ row: r, idx: i + 2 }))

    // Step 2: Process Stock rows
    const skuToPieceId = new Map<string, string>()

    const stockRows = indexed.filter((x) => (x.row.Type || '').trim().toLowerCase() === 'stock')

    for (const { row, idx } of stockRows) {
      const sku = (row['Stock # / SKU'] || '').trim()
      if (!sku) {
        failedPieces++
        errors.push({ row: idx, type: 'piece', sku: '', reason: 'Missing SKU' })
        continue
      }

      // Resolve design name
      let designName = (row['Shopify Title'] || '').trim()
      if (!designName) designName = (row['Design Name'] || '').trim()
      if (!designName) designName = 'Uncategorised'

      const category = mapDepartmentToCategory(row.Department || '')

      // Find or create design (case-insensitive)
      const designKey = designName.toLowerCase()
      let designId = designMap.get(designKey)
      if (!designId) {
        const description = (row.Description || '').trim() || null
        const { data: newDesign, error: designErr } = await supabase
          .from('inventory_designs')
          .insert({
            name: designName,
            category,
            description,
            notes: null,
            tenant_id: tenantId,
          })
          .select('id')
          .single()
        if (designErr || !newDesign?.id) {
          failedPieces++
          errors.push({ row: idx, type: 'piece', sku, reason: `Failed to create design: ${designErr?.message ?? 'unknown'}` })
          continue
        }
        designId = newDesign.id as string
        designMap.set(designKey, designId)
        designsCreated++
      }

      const costPrice = parseNum(row.Cost)
      const retailPrice = parseNum(row['Retail Price'])
      const otherSpecs = (row.Description || '').trim() || null
      const ordNote = (row['Ord.'] || '').trim()
      const dateAdded = (row['Date Added'] || '').trim()
      const noteParts: string[] = []
      if (ordNote) noteParts.push(`Ord: ${ordNote}`)
      if (dateAdded) noteParts.push(`Date Added: ${dateAdded}`)
      const notes = noteParts.length > 0 ? noteParts.join(' · ') : null

      const { data: newPiece, error: pieceErr } = await supabase
        .from('inventory_pieces')
        .insert({
          design_id: designId,
          sku,
          cost_price: costPrice,
          retail_price: retailPrice,
          other_specs: otherSpecs,
          status: 'in_stock',
          notes,
          tenant_id: tenantId,
        })
        .select('id')
        .single()

      if (pieceErr || !newPiece) {
        failedPieces++
        errors.push({ row: idx, type: 'piece', sku, reason: pieceErr?.message ?? 'unknown insert error' })
        continue
      }
      skuToPieceId.set(sku, newPiece.id)
      piecesCreated++
    }

    // Step 3: Process Component rows
    const componentRows = indexed.filter((x) => (x.row.Type || '').trim().toLowerCase() === 'component')

    for (const { row, idx } of componentRows) {
      const parentSku = (row['Parent Stock #'] || '').trim()
      const ownSku = (row['Stock # / SKU'] || '').trim()
      const pieceId = skuToPieceId.get(parentSku)

      if (!pieceId) {
        orphanedComponents++
        errors.push({
          row: idx,
          type: 'orphan',
          sku: ownSku || parentSku,
          reason: `No matching parent stock for "${parentSku}"`,
        })
        continue
      }

      const componentType = mapCommentsToComponentType(row.Comments || '', row.Description || '')
      let description = (row.Description || '').trim()
      if (!description) description = (row.Comments || '').trim()
      if (!description) description = componentType

      const qParsed = parseNum(row['Total Purchased'])
      const quantity = qParsed != null && qParsed > 0 ? qParsed : 1
      const unitCost = parseNum(row.Cost) ?? 0
      const lockedCost = Math.round(quantity * unitCost * 100) / 100

      const supplierName = (row.Supplier || '').trim().toLowerCase()
      const supplierId = supplierName ? (supplierMap.get(supplierName) ?? null) : null

      const { error: bomErr } = await supabase
        .from('inventory_piece_bom')
        .insert({
          piece_id: pieceId,
          component_type: componentType,
          description,
          quantity,
          unit: 'pcs',
          unit_cost: unitCost,
          locked_cost: lockedCost,
          supplier_id: supplierId,
          notes: null,
          tenant_id: tenantId,
        })

      if (bomErr) {
        failedBom++
        errors.push({ row: idx, type: 'bom', sku: ownSku || parentSku, reason: bomErr.message })
        continue
      }
      bomCreated++
    }

    return NextResponse.json({
      designs_created: designsCreated,
      pieces_created: piecesCreated,
      bom_items_created: bomCreated,
      orphaned_components: orphanedComponents,
      failed_pieces: failedPieces,
      failed_bom: failedBom,
      errors,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
