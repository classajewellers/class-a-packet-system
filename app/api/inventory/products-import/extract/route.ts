import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { requireManager } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// ── Field detection ──────────────────────────────────────────────────────────
//
// Generic, tenant-agnostic header aliases. These are DETECTION heuristics only
// — no supplier- or catalogue-specific rules are baked in. Only the six core
// classification fields are ever imported. Marketing / website / SEO / care
// columns are deliberately NOT listed here and are ignored even if present.

const FIELD_ALIASES: Record<string, string[]> = {
  name:         ["name", "product name", "product", "design name", "title", "item name", "item"],
  collection:   ["collection", "collection name", "range"],
  category:     ["category", "category name", "group", "type", "product type", "department"],
  design:       ["design", "design code", "design ref", "design reference"],
  style:        ["style", "style name", "style code"],
  setting_type: ["setting type", "setting_type", "setting"],
};

const IMPORTABLE_FIELDS = Object.keys(FIELD_ALIASES) as (keyof typeof FIELD_ALIASES)[];

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// ── Row type ─────────────────────────────────────────────────────────────────

export interface ProductImportRow {
  row_number:            number;
  name:                  string;
  collection:            string | null;
  category_raw:          string | null;
  category_id:           string | null;
  category_matched_name: string | null;
  design:                string | null;
  style:                 string | null;
  setting_type:          string | null;
  dup_confidence:        "exact" | "fuzzy" | "none";
  dup_existing_id:       string | null;
  dup_existing_name:     string | null;
  flagged:               boolean;
  flag_reasons:          string[];
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireManager(req);
  if (!auth.ok) return auth.response;
  const { tenantId } = auth.ctx;

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Upload a CSV or .xlsx file" }, { status: 400 });
    }

    // Parse (SheetJS reads both CSV and xlsx). Array-of-arrays so we can locate
    // the header row even if the sheet has a title/blank preamble.
    const wb  = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: true });

    // Find the header row: the first row (within 15) that contains a name alias.
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(15, aoa.length); i++) {
      const cells = (aoa[i] ?? []).map(norm);
      if (cells.some(c => FIELD_ALIASES.name.includes(c))) { headerRowIdx = i; break; }
    }
    if (headerRowIdx === -1) {
      return NextResponse.json({
        error: "Could not find a product-name column. Expected a header like: name, product name, or design name.",
      }, { status: 422 });
    }

    // Map each importable field to a column index in the header row.
    const headerCells = (aoa[headerRowIdx] ?? []).map(norm);
    const colIndex: Partial<Record<keyof typeof FIELD_ALIASES, number>> = {};
    for (const field of IMPORTABLE_FIELDS) {
      const idx = headerCells.findIndex(c => FIELD_ALIASES[field].includes(c));
      if (idx >= 0) colIndex[field] = idx;
    }
    const nameCol = colIndex.name!; // guaranteed by the header-row check above

    const cell = (row: unknown[], field: keyof typeof FIELD_ALIASES): string | null => {
      const idx = colIndex[field];
      if (idx == null) return null;
      const v = String(row[idx] ?? "").trim();
      return v || null;
    };

    // Load tenant reference data for matching.
    const supabase = createServerSupabaseClient();

    const [{ data: cats, error: catErr }, { data: existing, error: exErr }] = await Promise.all([
      supabase.from("inventory_categories").select("id, name").eq("tenant_id", tenantId).eq("is_active", true),
      supabase.from("inventory_products").select("id, name").eq("tenant_id", tenantId),
    ]);
    if (catErr) return NextResponse.json({ error: catErr.message }, { status: 500 });
    if (exErr)  return NextResponse.json({ error: exErr.message }, { status: 500 });

    const categoryByNorm = new Map<string, { id: string; name: string }>();
    for (const c of cats ?? []) categoryByNorm.set(norm(c.name), { id: c.id, name: c.name });

    const existingList = (existing ?? []).map(p => ({ id: p.id, name: p.name, n: norm(p.name) }));

    // Track names seen within this file to flag in-file duplicates.
    const seenInFile = new Map<string, number>();

    const rows: ProductImportRow[] = [];

    for (let r = headerRowIdx + 1; r < aoa.length; r++) {
      const raw = aoa[r] ?? [];
      const name = String(raw[nameCol] ?? "").trim();
      if (!name) continue; // skip blank rows

      const flags: string[] = [];

      // Category resolution — resolve to category_id; never auto-create.
      const categoryRaw = cell(raw, "category");
      let categoryId: string | null = null;
      let categoryMatchedName: string | null = null;
      if (categoryRaw) {
        const match = categoryByNorm.get(norm(categoryRaw));
        if (match) { categoryId = match.id; categoryMatchedName = match.name; }
        else flags.push(`Category "${categoryRaw}" not found — will import with no category link`);
      }

      // Duplicate detection against existing products (normalised name).
      const nn = norm(name);
      let dupConfidence: ProductImportRow["dup_confidence"] = "none";
      let dupId: string | null = null;
      let dupName: string | null = null;

      const exact = existingList.find(e => e.n === nn);
      if (exact) {
        dupConfidence = "exact"; dupId = exact.id; dupName = exact.name;
        flags.push(`Possible duplicate of existing product "${exact.name}"`);
      } else {
        const fuzzy = existingList.find(e => e.n.length >= 4 && nn.length >= 4 && (e.n.includes(nn) || nn.includes(e.n)));
        if (fuzzy) {
          dupConfidence = "fuzzy"; dupId = fuzzy.id; dupName = fuzzy.name;
          flags.push(`Possible duplicate of existing product "${fuzzy.name}" (partial match)`);
        }
      }

      // In-file duplicate.
      if (seenInFile.has(nn)) flags.push(`Duplicate name within this file (also row ${seenInFile.get(nn)})`);
      else seenInFile.set(nn, r - headerRowIdx); // 1-based data row number

      rows.push({
        row_number:            r - headerRowIdx,
        name,
        collection:            cell(raw, "collection"),
        category_raw:          categoryRaw,
        category_id:           categoryId,
        category_matched_name: categoryMatchedName,
        design:                cell(raw, "design"),
        style:                 cell(raw, "style"),
        setting_type:          cell(raw, "setting_type"),
        dup_confidence:        dupConfidence,
        dup_existing_id:       dupId,
        dup_existing_name:     dupName,
        flagged:               flags.length > 0,
        flag_reasons:          flags,
      });
    }

    return NextResponse.json({
      detected_columns: Object.fromEntries(
        IMPORTABLE_FIELDS.map(f => [f, colIndex[f] != null])
      ),
      total:            rows.length,
      duplicate_count:  rows.filter(r => r.dup_confidence !== "none").length,
      rows,
    });

  } catch (err) {
    console.error("[products-import/extract]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Extraction failed" }, { status: 500 });
  }
}
