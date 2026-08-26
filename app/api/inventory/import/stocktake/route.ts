import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// ── GET — returns all designs + reference data for the review table ───────────
// No per_page cap — the stocktake template may reference hundreds of distinct designs.
export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  const db = await createTenantSupabaseClient(tenantId);

  const [designsRes, statusesRes, locationsRes, categoriesRes] = await Promise.all([
    db.from("inventory_products")
      .select("id, name, category, collection")
      .eq("tenant_id", tenantId)
      .order("name"),
    db.from("inventory_statuses")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order"),
    db.from("inventory_locations")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order"),
    db.from("inventory_categories")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  if (designsRes.error) {
    return NextResponse.json({ error: designsRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    designs:    designsRes.data   ?? [],
    statuses:   statusesRes.data  ?? [],
    locations:  locationsRes.data ?? [],
    categories: categoriesRes.data ?? [],
  });
}

// ── POST — run the import for reviewed + confirmed rows ───────────────────────

// SKU helpers — same logic as /api/inventory/pieces/route.ts
const CATEGORY_PREFIXES: [string, string][] = [
  ["engagement", "ER"], ["wedding",  "WB"], ["ring",     "RG"],
  ["earring",    "EA"], ["necklace", "NK"], ["bracelet", "BR"],
  ["pendant",    "PN"], ["loose",    "LS"], ["stone",    "LS"],
];

function categoryPrefix(name?: string | null): string {
  if (!name) return "XX";
  const lower = name.toLowerCase();
  for (const [kw, pfx] of CATEGORY_PREFIXES) {
    if (lower.includes(kw)) return pfx;
  }
  return "XX";
}

async function generateSku(
  db: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  prefix: string,
): Promise<string> {
  const { data } = await db
    .from("inventory_pieces")
    .select("sku")
    .ilike("sku", `${prefix}-%`)
    .order("sku", { ascending: false })
    .limit(20);
  let maxSeq = 0;
  for (const row of data ?? []) {
    const seq = parseInt((row.sku as string).split("-").pop() ?? "0", 10);
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}-${String(maxSeq + 1).padStart(4, "0")}`;
}

// Map free-text Stone Type to the inventory_pieces diamond_type constraint values.
// The constraint only accepts 'Natural', 'Lab Grown', 'None' (or null).
function toDiamondType(stoneType: string): string | null {
  const s = stoneType.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("lab")) return "Lab Grown";
  return "Natural";
}

// Build title the same way as buildTitle() in pieces/new/page.tsx
function buildTitle(
  designName: string,
  metalKarat: string,
  metalColour: string,
  diamondType: string | null,
  diamondCarat: number | null,
  stoneShape: string | null,
): string {
  const metal = `${metalKarat} ${metalColour}`;
  if (!diamondType) return `${designName} – ${metal}`;
  const parts: string[] = [];
  if (diamondCarat) parts.push(`${diamondCarat}ct`);
  if (stoneShape)   parts.push(stoneShape);
  parts.push(diamondType);
  return `${designName} – ${metal} – ${parts.join(" ")}`;
}

interface RawRow {
  rowIndex: number;
  raw: Record<string, string>;
}

interface RowResult {
  rowIndex: number;
  sku:      string;
  pieceId:  string;
}

interface SkipResult {
  rowIndex: number;
  reason:   string;
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  let body: { rows: RawRow[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rows: RawRow[] = body.rows ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }

  const db = await createTenantSupabaseClient(tenantId);

  // ── Load reference data once ────────────────────────────────────────────────
  const [designsRes, statusesRes, locationsRes, categoriesRes] = await Promise.all([
    db.from("inventory_products").select("id, name, category, category_id, collection").eq("tenant_id", tenantId).order("name"),
    db.from("inventory_statuses").select("id, name").eq("is_active", true),
    db.from("inventory_locations").select("id, name").eq("is_active", true),
    db.from("inventory_categories").select("id, name").eq("is_active", true),
  ]);

  if (designsRes.error) {
    return NextResponse.json({ error: `Failed to load designs: ${designsRes.error.message}` }, { status: 500 });
  }

  // Mutable maps built up as the import runs, so newly created designs/variants
  // are immediately available to subsequent rows in the same batch.
  const designsByName = new Map<string, { id: string; name: string; category: string | null; category_id: string | null; collection: string | null }>(
    (designsRes.data ?? []).map(d => [d.name.toLowerCase(), d])
  );
  const statusesByName = new Map<string, string>(
    (statusesRes.data ?? []).map(s => [s.name.toLowerCase(), s.id])
  );
  const locationsByName = new Map<string, string>(
    (locationsRes.data ?? []).map(l => [l.name.toLowerCase(), l.id])
  );
  const categoriesByName = new Map<string, { id: string; name: string }>(
    (categoriesRes.data ?? []).map(c => [c.name.toLowerCase(), c])
  );

  // ── Process rows ────────────────────────────────────────────────────────────

  const created: RowResult[]  = [];
  const skipped: SkipResult[] = [];
  const newDesigns:  string[] = [];
  let   newVariants            = 0;

  for (const { rowIndex, raw } of rows) {
    try {
      const designName  = raw["Design Name"]?.trim()    ?? "";
      const metalKarat  = raw["Metal Karat"]?.trim()    ?? "";
      const metalColour = raw["Metal Colour"]?.trim()   ?? "";
      const bandWidthRaw = raw["Band Width (mm)"]?.trim();
      const bandWidthMm  = bandWidthRaw ? Number(bandWidthRaw) : null;

      // ── 1. Find or create design ──────────────────────────────────────────

      let design = designsByName.get(designName.toLowerCase());
      if (!design) {
        const categoryText    = raw["Category"]?.trim()   || null;
        const collectionText  = raw["Collection"]?.trim() || null;
        const catEntry = categoryText ? categoriesByName.get(categoryText.toLowerCase()) : null;

        const { data: newDesign, error: designErr } = await db
          .from("inventory_products")
          .insert({
            tenant_id:   tenantId,
            name:        designName,
            category:    categoryText,
            category_id: catEntry?.id ?? null,
            collection:  collectionText,
          })
          .select("id, name, category, category_id, collection")
          .single();

        if (designErr) {
          skipped.push({ rowIndex, reason: `Could not create design "${designName}": ${designErr.message}` });
          continue;
        }

        design = newDesign as unknown as typeof design;
        designsByName.set(designName.toLowerCase(), design!);
        newDesigns.push(designName);
      }

      // ── 2. Find or create variant ─────────────────────────────────────────

      let query = db
        .from("inventory_product_variants")
        .select("id, metal_karat, metal_colour, band_width_mm")
        .eq("tenant_id", tenantId)
        .eq("design_id", design!.id)
        .eq("metal_karat", metalKarat)
        .eq("metal_colour", metalColour)
        .eq("is_active", true);

      // Only match on band_width_mm if the row specifies one — avoids
      // rejecting existing variants that don't carry a width.
      if (bandWidthMm !== null) {
        query = query.eq("band_width_mm", bandWidthMm);
      } else {
        query = query.is("band_width_mm", null);
      }

      const { data: existingVariants } = await query.limit(1);
      let variantId: string;

      if (existingVariants && existingVariants.length > 0) {
        variantId = existingVariants[0].id;
      } else {
        const autoName = [
          metalKarat,
          metalColour !== "N/A" ? metalColour : "",
          "Gold",
          bandWidthMm ? `${bandWidthMm}mm` : null,
        ].filter(Boolean).join(" ");

        const { data: newVariant, error: variantErr } = await db
          .from("inventory_product_variants")
          .insert({
            tenant_id:    tenantId,
            design_id:    design!.id,
            metal_karat:  metalKarat,
            metal_colour: metalColour,
            band_width_mm: bandWidthMm,
            name:         autoName,
            is_active:    true,
          })
          .select("id")
          .single();

        if (variantErr) {
          // 23505 = unique violation: variant already exists with this combo
          if (variantErr.code === "23505") {
            // Race or off-by-null mismatch — retry without band_width_mm filter
            const { data: fallback } = await db
              .from("inventory_product_variants")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("design_id", design!.id)
              .eq("metal_karat", metalKarat)
              .eq("metal_colour", metalColour)
              .eq("is_active", true)
              .limit(1);

            if (fallback && fallback.length > 0) {
              variantId = fallback[0].id;
            } else {
              skipped.push({ rowIndex, reason: `Could not create or find variant for "${designName}" (${metalKarat} ${metalColour})` });
              continue;
            }
          } else {
            skipped.push({ rowIndex, reason: `Variant error for "${designName}": ${variantErr.message}` });
            continue;
          }
        } else {
          variantId = newVariant!.id;
          newVariants++;
        }
      }

      // ── 3. Resolve reference IDs from names ───────────────────────────────

      const statusName   = raw["Status"]?.trim();
      const locationName = raw["Location"]?.trim();
      const statusId     = statusName   ? (statusesByName.get(statusName.toLowerCase())   ?? null) : null;
      const locationId   = locationName ? (locationsByName.get(locationName.toLowerCase()) ?? null) : null;

      // Category: prefer piece's own category column, else inherit from design
      const categoryText = raw["Category"]?.trim() || design!.category;
      const categoryEntry = categoryText ? categoriesByName.get(categoryText.toLowerCase()) : null;
      const categoryId   = categoryEntry?.id ?? design!.category_id ?? null;
      const categoryName = categoryEntry?.name ?? categoryText ?? null;

      // ── 4. Map numeric / text fields ──────────────────────────────────────

      const toNum = (val: string | undefined) => {
        const n = Number(val?.trim());
        return val?.trim() && !isNaN(n) ? n : null;
      };

      const weightG      = toNum(raw["Actual Weight (g)"]);
      const stoneCarat   = toNum(raw["Stone Carat"]);
      const stoneWholesale = toNum(raw["Stone Wholesale Cost"]);
      const actualCost   = toNum(raw["Actual Cost Paid"]);
      const retailPrice  = toNum(raw["Retail Price"]);
      const stoneType    = raw["Stone Type"]?.trim()         || null;
      const stoneShape   = raw["Stone Shape"]?.trim()        || null;
      const stoneColour  = raw["Stone Colour"]?.trim()       || null;
      const stoneClarity = raw["Stone Clarity"]?.trim()      || null;
      const certNum      = raw["Certificate Number"]?.trim() || null;
      const fingerSize   = raw["Finger Size"]?.trim()        || null;

      const diamondType   = toDiamondType(stoneType ?? "");
      const diamondCarat  = stoneCarat;
      const diamondColour = stoneColour;
      const diamondClarity = stoneClarity;

      // Combine "Old ARMS Stock #" and Notes into a single notes field.
      // No dedicated column exists for old stock numbers yet.
      const armsNo   = raw["Old ARMS Stock #"]?.trim() || null;
      const notesRaw = raw["Notes"]?.trim()            || null;
      const notes    = [armsNo ? `ARMS: ${armsNo}` : null, notesRaw]
        .filter(Boolean)
        .join("\n") || null;

      // ── 5. Generate SKU and create piece ──────────────────────────────────

      const prefix = categoryPrefix(categoryName);
      const sku    = await generateSku(db, prefix);

      const title = buildTitle(
        designName,
        metalKarat,
        metalColour,
        diamondType,
        diamondCarat,
        stoneShape,
      );

      const { data: newPiece, error: pieceErr } = await db
        .from("inventory_pieces")
        .insert({
          tenant_id:         tenantId,
          sku,
          title,
          product_id:        design!.id,
          variant_id:        variantId,
          category_id:       categoryId,
          metal_karat:       metalKarat,
          metal_colour:      metalColour,
          // Weight — written to both columns for display + pricing compatibility
          gram_weight:       weightG,
          metal_weight_grams: weightG,
          // Stone
          diamond_type:      diamondType,
          diamond_carat:     diamondCarat,
          diamond_colour:    diamondColour,
          diamond_clarity:   diamondClarity,
          stone_cost:        stoneWholesale,
          stone_shape:       stoneShape,
          certificate_number: certNum,
          // Physical / logistics
          finger_size:       fingerSize,
          status_id:         statusId,
          location_id:       locationId,
          notes,
          // Costs
          actual_cost:       actualCost,
          retail_price:      retailPrice,
        })
        .select("id, sku")
        .single();

      if (pieceErr) {
        skipped.push({ rowIndex, reason: `Piece insert failed: ${pieceErr.message}` });
        continue;
      }

      created.push({ rowIndex, sku: newPiece!.sku, pieceId: newPiece!.id });
    } catch (err) {
      skipped.push({ rowIndex, reason: `Unexpected error: ${String(err)}` });
    }
  }

  // De-duplicate new designs list (same design name can appear many times in template)
  const uniqueNewDesigns = Array.from(new Set(newDesigns));

  return NextResponse.json({
    summary: {
      created:         created.length,
      skipped:         skipped.length,
      newDesigns:      uniqueNewDesigns,
      newDesignsCount: uniqueNewDesigns.length,
      newVariantsCount: newVariants,
      createdPieces:   created,
      skippedDetails:  skipped,
    },
  });
}
