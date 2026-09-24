import { NextRequest, NextResponse } from 'next/server'
import { createTenantSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Case-insensitive aliases for each Vault supplier field.
// Xero ContactName / EmailAddress / PhoneNumber are included explicitly.
// First alias that matches a CSV header wins; extras are ignored.
const FIELD_ALIASES: Record<string, string[]> = {
  name:           ['name', 'supplier_name', 'supplier', 'contactname', 'company', 'business_name', 'organisation'],
  email:          ['email', 'emailaddress', 'email_address'],
  phone:          ['phone', 'phonenumber', 'phone_number', 'telephone', 'tel', 'mobile'],
  contact_name:   ['contact_name', 'contact', 'account_manager', 'first name', 'firstname'],
  notes:          ['notes', 'note'],
  lead_time_days: ['lead_time_days', 'lead_time'],
  avg_lead_time_days: ['avg_lead_time_days', 'average_lead_time_days', 'avg_lead_time', 'average_lead_time'],
  max_lead_time_days: ['max_lead_time_days', 'maximum_lead_time_days', 'max_lead_time', 'maximum_lead_time'],
}

// Strip BOM, leading non-alphanumeric chars (e.g. Xero's "*ContactName"),
// surrounding whitespace, then lowercase — applied to CSV headers before lookup.
function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, '')       // UTF-8 BOM on first column
    .trim()
    .replace(/^[^a-zA-Z0-9]+/, '') // leading *, #, quotes, etc.
    .toLowerCase()
}

// Build a flat normalised-alias → vault-field map once.
function buildAliasMap(): Map<string, string> {
  const m = new Map<string, string>()
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      m.set(alias.toLowerCase(), field)
    }
  }
  return m
}

const ALIAS_MAP = buildAliasMap()

type MappedRow = {
  name:           string | null
  email:          string | null
  phone:          string | null
  contact_name:   string | null
  notes:          string | null
  lead_time_days: number | null
  avg_lead_time_days: number | null
  max_lead_time_days: number | null
}

function mapRow(rawRow: Record<string, string>): MappedRow {
  const out: Record<string, string | null> = {}
  for (const [rawKey, rawVal] of Object.entries(rawRow)) {
    const field = ALIAS_MAP.get(normalizeHeader(rawKey))
    if (field && !(field in out)) {
      out[field] = rawVal.trim() || null
    }
  }
  const days = (raw: string | null | undefined): number | null => {
    if (!raw) return null
    const n = parseInt(raw, 10)
    return !isNaN(n) && n >= 0 ? n : null
  }
  const legacy = days(out.lead_time_days)
  const avg = days(out.avg_lead_time_days) ?? legacy
  const max = days(out.max_lead_time_days)
  return {
    name:           out.name ?? null,
    email:          out.email ?? null,
    phone:          out.phone ?? null,
    contact_name:   out.contact_name ?? null,
    notes:          out.notes ?? null,
    lead_time_days: avg,
    avg_lead_time_days: avg,
    max_lead_time_days: max,
  }
}

// POST /api/inventory/suppliers/import
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rows: Array<Record<string, string>> = Array.isArray(body?.rows) ? body.rows : []
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
    }

    const tenantId = req.headers.get('x-tenant-id') ?? ''
    const supabase = await createTenantSupabaseClient(tenantId)

    // Load all existing supplier names for this tenant to detect duplicates.
    const { data: existing, error: existingErr } = await supabase
      .from('inventory_suppliers')
      .select('name')
      .eq('tenant_id', tenantId)
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 })

    const existingNames = new Set(
      (existing ?? []).map((s) => String(s.name).toLowerCase().trim())
    )

    const skipped: Array<{ row: number; name: string; reason: string }> = []
    const errors:  Array<{ row: number; reason: string }> = []
    let created = 0
    let failed  = 0

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2  // CSV row number: +1 for 1-index, +1 for header row
      const mapped = mapRow(rows[i])

      if (!mapped.name) {
        errors.push({ row: rowNumber, reason: 'Supplier name is blank or could not be mapped from any recognised column' })
        failed++
        continue
      }

      // Duplicate check — case-insensitive, includes names created earlier in this same import
      if (existingNames.has(mapped.name.toLowerCase())) {
        skipped.push({ row: rowNumber, name: mapped.name, reason: 'Supplier with this name already exists' })
        continue
      }

      const { error: insertErr } = await supabase
        .from('inventory_suppliers')
        .insert({
          tenant_id:      tenantId,
          name:           mapped.name,
          email:          mapped.email,
          phone:          mapped.phone,
          contact_name:   mapped.contact_name,
          notes:          mapped.notes,
          lead_time_days: mapped.lead_time_days,
          avg_lead_time_days: mapped.avg_lead_time_days,
          max_lead_time_days: mapped.max_lead_time_days,
        })

      if (insertErr) {
        errors.push({ row: rowNumber, reason: insertErr.message })
        failed++
        continue
      }

      // Track within this import so duplicates later in the same file are caught too
      existingNames.add(mapped.name.toLowerCase())
      created++
    }

    return NextResponse.json({ created, skipped, errors, failed })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
