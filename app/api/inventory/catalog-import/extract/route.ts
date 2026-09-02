import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// ── Config types ────────────────────────────────────────────────────────────

interface MetalCode { karat: string; colour: string; }
interface CatalogImportConfig {
  version: number;
  sku_parse: {
    segment_separator: string;
    metal_codes: Record<string, MetalCode>;
    origin_from_grade: Record<string, string>;
  };
  description_parse: {
    source_field: string;
    stone_shape_in_parentheses: boolean;
    stone_carat_notation: string;
    stone_carat_stores: string;
  };
  sources: {
    price_file:  { identify_by_columns: string[]; column_map: Record<string, string> };
    design_list: { identify_by_columns: string[]; column_map: Record<string, string> };
  };
  join: { price_file_key: string; design_list_key: string };
}

// ── Row types ────────────────────────────────────────────────────────────────

export interface CatalogExtractRow {
  item_code:           string;
  unit_cost:           number;
  base_code:           string;
  metal_karat:         string | null;
  metal_colour:        string | null;
  grade_code:          string | null;
  stone_origin:        string | null;
  class_a_reference:   string | null;
  design_name_raw:     string | null;
  stone_shape:         string | null;
  stone_carat:         number | null;
  stone_quantity:      number | null;
  matched_design_id:   string | null;
  matched_design_name: string | null;
  match_confidence:    "exact" | "fuzzy" | "none";
  flagged:             boolean;
  flag_reasons:        string[];
}

// ── xlsx helpers ─────────────────────────────────────────────────────────────

function parseXlsx(buffer: ArrayBuffer): Record<string, string>[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
}

function headersOf(rows: Record<string, string>[]): Set<string> {
  if (rows.length === 0) return new Set();
  return new Set(Object.keys(rows[0]));
}

function detectSource(
  rows: Record<string, string>[],
  config: CatalogImportConfig
): "price_file" | "design_list" | null {
  const hdrs = headersOf(rows);
  const priceMatch = config.sources.price_file.identify_by_columns.every(c => hdrs.has(c));
  if (priceMatch) return "price_file";
  const designMatch = config.sources.design_list.identify_by_columns.every(c => hdrs.has(c));
  if (designMatch) return "design_list";
  return null;
}

// ── SKU parsing (fully config-driven) ────────────────────────────────────────

interface SkuParseOk {
  ok:           true;
  base_code:    string;
  metal_karat:  string;
  metal_colour: string;
  grade_code:   string;
  stone_origin: string | null;
}
interface SkuParseErr { ok: false; error: string; }
type SkuParseResult = SkuParseOk | SkuParseErr;

function parseSku(sku: string, config: CatalogImportConfig): SkuParseResult {
  const sep = config.sku_parse.segment_separator;
  const segments = sku.split(sep);
  if (segments.length < 3) return { ok: false, error: `SKU "${sku}" has fewer than 3 dash-separated segments` };

  const gradeDigit = segments[segments.length - 1];

  // Scan left-to-right for first segment beginning with a known metal code.
  // Sort longest-first so "18Y" is matched before a hypothetical "9Y" overlap.
  const metalCodes = Object.keys(config.sku_parse.metal_codes).sort((a, b) => b.length - a.length);

  let metalSegIdx = -1;
  let matchedMetal = "";
  let gradePrefix = "";

  outer: for (let i = 0; i < segments.length - 1; i++) {
    for (const mc of metalCodes) {
      if (segments[i].startsWith(mc)) {
        metalSegIdx = i;
        matchedMetal = mc;
        gradePrefix = segments[i].slice(mc.length);
        break outer;
      }
    }
  }

  if (metalSegIdx === -1) return { ok: false, error: `No known metal code in SKU "${sku}"` };

  const baseCode   = segments.slice(0, metalSegIdx).join(sep);
  const gradeCode  = gradePrefix + gradeDigit;
  const metalInfo  = config.sku_parse.metal_codes[matchedMetal];
  const stoneOrigin = config.sku_parse.origin_from_grade[gradeCode] ?? null;

  return {
    ok:           true,
    base_code:    baseCode,
    metal_karat:  metalInfo.karat,
    metal_colour: metalInfo.colour,
    grade_code:   gradeCode,
    stone_origin: stoneOrigin,
  };
}

// ── Description / Class A Reference parsing ──────────────────────────────────

interface ParsedDescription {
  design_name: string | null;
  stone_shape: string | null;
  stone_carat: number | null;
  stone_quantity: number | null;
}

function parseDescriptionField(
  ref: string,
  config: CatalogImportConfig["description_parse"]
): ParsedDescription {
  if (!ref.trim()) return { design_name: null, stone_shape: null, stone_carat: null, stone_quantity: null };

  let stone_shape: string | null = null;
  let stone_carat: number | null = null;
  let stone_quantity: number | null = null;

  if (config.stone_shape_in_parentheses) {
    const m = ref.match(/\(([^)]+)\)/);
    stone_shape = m?.[1]?.toLowerCase().trim() ?? null;
  }

  if (config.stone_carat_notation === "count=total_ct") {
    const m = ref.match(/(\d+)=(\d+(?:\.\d+)?)ct/i);
    if (m) {
      const count = parseInt(m[1], 10);
      const total = parseFloat(m[2]);
      stone_quantity = count;
      // Per the config, stone_carat stores the per-stone weight (total ÷ count).
      stone_carat = count > 0 ? Math.round((total / count) * 100000) / 100000 : null;
    }
  }

  // Design name: strip the code prefix (everything through the last "- ") then
  // remove parenthetical shape and carat notation from the remainder.
  let name = ref;
  const lastDashSpace = ref.lastIndexOf("- ");
  if (lastDashSpace >= 0) name = ref.slice(lastDashSpace + 2);
  name = name.replace(/\s*\([^)]*\)/g, "").replace(/\s*\d+=\d+(?:\.\d+)?ct/gi, "").trim();

  return { design_name: name || null, stone_shape, stone_carat, stone_quantity };
}

// ── Design fuzzy matching ────────────────────────────────────────────────────

function fuzzyMatch(
  name: string,
  designs: { id: string; name: string }[]
): { design_id: string | null; design_name: string | null; confidence: "exact" | "fuzzy" | "none" } {
  if (!name) return { design_id: null, design_name: null, confidence: "none" };

  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const ns = norm(name);

  const exact = designs.find(d => norm(d.name) === ns);
  if (exact) return { design_id: exact.id, design_name: exact.name, confidence: "exact" };

  const fuzzy = designs.find(d => {
    const nd = norm(d.name);
    return nd.length >= 4 && ns.length >= 4 && (nd.includes(ns) || ns.includes(nd));
  });
  if (fuzzy) return { design_id: fuzzy.id, design_name: fuzzy.name, confidence: "fuzzy" };

  return { design_id: null, design_name: null, confidence: "none" };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const formData = await req.formData();
    const supplierId = formData.get("supplier_id") as string | null;
    const rawFiles  = formData.getAll("file");
    const files = rawFiles.filter((f): f is File => f instanceof File && f.size > 0);

    if (!supplierId) return NextResponse.json({ error: "supplier_id is required" }, { status: 400 });
    if (files.length < 2) return NextResponse.json({ error: "Upload exactly two .xlsx files (price file and design list)" }, { status: 400 });
    if (files.length > 2) return NextResponse.json({ error: "Too many files — upload exactly two .xlsx files" }, { status: 400 });

    // Load supplier + config
    const { data: supplier, error: supErr } = await supabase
      .from("inventory_suppliers")
      .select("id, name, catalog_import_config")
      .eq("id", supplierId)
      .single();

    if (supErr || !supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    if (!supplier.catalog_import_config) {
      return NextResponse.json({ error: `Supplier "${supplier.name}" has no catalog import config. Add catalog_import_config to this supplier record first.` }, { status: 422 });
    }

    const config = supplier.catalog_import_config as CatalogImportConfig;

    // Load all designs for this tenant (for matching)
    const { data: designs, error: designErr } = await supabase
      .from("inventory_products")
      .select("id, name")
      .eq("tenant_id", tenantId);

    if (designErr) return NextResponse.json({ error: designErr.message }, { status: 500 });
    const designList = designs ?? [];

    // Parse both xlsx files and detect which is which
    let priceRows:  Record<string, string>[] | null = null;
    let designRows: Record<string, string>[] | null = null;

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const rows = parseXlsx(buffer);
      const sourceType = detectSource(rows, config);
      if (sourceType === "price_file")  priceRows  = rows;
      if (sourceType === "design_list") designRows = rows;
    }

    if (!priceRows)  return NextResponse.json({ error: "Could not identify a price file — check column headers match config" }, { status: 422 });
    if (!designRows) return NextResponse.json({ error: "Could not identify a design list — check column headers match config" }, { status: 422 });

    // Parse design list → map base_product_code → parsed description
    const pcCol  = config.sources.design_list.column_map["product_code"];
    const refCol = config.sources.design_list.column_map[config.description_parse.source_field] ??
                   config.sources.design_list.column_map["class_a_reference"];

    const designMap = new Map<string, { class_a_reference: string } & ParsedDescription>();
    for (const row of designRows) {
      const productCode = String(row[pcCol] ?? "").trim();
      const ref         = String(row[refCol] ?? "").trim();
      if (!productCode) continue;
      const parsed = parseDescriptionField(ref, config.description_parse);
      designMap.set(productCode, { class_a_reference: ref, ...parsed });
    }

    // Parse price file → build result rows
    const itemCodeCol = config.sources.price_file.column_map["item_code"];
    const unitCostCol = config.sources.price_file.column_map["unit_cost"];

    const result: CatalogExtractRow[] = [];

    for (const row of priceRows) {
      const itemCode = String(row[itemCodeCol] ?? "").trim();
      const unitCostRaw = String(row[unitCostCol] ?? "").trim();

      if (!itemCode) continue; // skip blank rows

      const flagReasons: string[] = [];

      // Parse cost
      const unitCost = parseFloat(unitCostRaw.replace(/[^0-9.-]/g, ""));
      if (isNaN(unitCost) || unitCost <= 0) flagReasons.push(`Unit cost "${unitCostRaw}" is not a positive number`);

      // Parse SKU
      const sku = parseSku(itemCode, config);
      let baseCode:    string      = "";
      let metalKarat:  string|null = null;
      let metalColour: string|null = null;
      let gradeCode:   string|null = null;
      let stoneOrigin: string|null = null;

      if (!sku.ok) {
        flagReasons.push(sku.error);
      } else {
        baseCode    = sku.base_code;
        metalKarat  = sku.metal_karat;
        metalColour = sku.metal_colour;
        gradeCode   = sku.grade_code;
        stoneOrigin = sku.stone_origin;
        if (!stoneOrigin) flagReasons.push(`Grade code "${gradeCode}" has no origin mapping — needs manual review`);
      }

      // Join with design list
      const designData = baseCode ? designMap.get(baseCode) : undefined;
      const classARef      = designData?.class_a_reference ?? null;
      const designNameRaw  = designData?.design_name ?? null;
      const stoneShape     = designData?.stone_shape ?? null;
      const stoneCarat     = designData?.stone_carat ?? null;
      const stoneQuantity  = designData?.stone_quantity ?? null;

      if (!designData) flagReasons.push(`No design list entry for base code "${baseCode}"`);

      // Fuzzy match to inventory_products
      const match = designNameRaw
        ? fuzzyMatch(designNameRaw, designList)
        : { design_id: null, design_name: null, confidence: "none" as const };

      if (match.confidence === "none") flagReasons.push("No matching design found — assign manually");
      if (match.confidence === "fuzzy") flagReasons.push("Fuzzy design match — verify before confirming");

      result.push({
        item_code:           itemCode,
        unit_cost:           isNaN(unitCost) ? 0 : unitCost,
        base_code:           baseCode,
        metal_karat:         metalKarat,
        metal_colour:        metalColour,
        grade_code:          gradeCode,
        stone_origin:        stoneOrigin,
        class_a_reference:   classARef,
        design_name_raw:     designNameRaw,
        stone_shape:         stoneShape,
        stone_carat:         stoneCarat,
        stone_quantity:      stoneQuantity,
        matched_design_id:   match.design_id,
        matched_design_name: match.design_name,
        match_confidence:    match.confidence,
        flagged:             flagReasons.length > 0,
        flag_reasons:        flagReasons,
      });
    }

    return NextResponse.json({
      supplier_id:   supplierId,
      supplier_name: supplier.name,
      rows:          result,
      total:         result.length,
      flagged_count: result.filter(r => r.flagged).length,
    });

  } catch (err) {
    console.error("[catalog-import/extract]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Extraction failed" }, { status: 500 });
  }
}
