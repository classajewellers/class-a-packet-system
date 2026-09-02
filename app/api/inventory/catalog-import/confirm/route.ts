import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface ConfirmedRow {
  item_code:      string;
  design_id:      string;
  metal_karat:    string;
  metal_colour:   string;
  stone_origin:   string | null;
  stone_shape:    string | null;
  stone_carat:    number | null;
  stone_quantity: number | null;
  unit_cost:      number;
  supplier_id:    string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const body = await req.json();
    const { supplier_id, rows } = body as { supplier_id: string; rows: ConfirmedRow[] };

    if (!supplier_id) return NextResponse.json({ error: "supplier_id is required" }, { status: 400 });
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows array is required and must not be empty" }, { status: 400 });
    }

    // Verify supplier belongs to this tenant
    const { data: supplier, error: supErr } = await supabase
      .from("inventory_suppliers")
      .select("id, name")
      .eq("id", supplier_id)
      .single();

    if (supErr || !supplier) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

    const results = { updated: 0, inserted: 0, skipped: [] as { item_code: string; reason: string }[] };

    for (const row of rows) {
      if (!row.design_id || !row.metal_karat || !row.metal_colour) {
        results.skipped.push({ item_code: row.item_code, reason: "Missing design_id, metal_karat, or metal_colour" });
        continue;
      }

      // Look up existing variants for this design + metal combination.
      // The DB unique key is (design_id, metal_karat, metal_colour, band_width_mm) — band_width_mm
      // is not present in the supplier spreadsheet, so we match on the three known columns only.
      const { data: existing, error: lookupErr } = await supabase
        .from("inventory_product_variants")
        .select("id, band_width_mm")
        .eq("tenant_id", tenantId)
        .eq("design_id", row.design_id)
        .eq("metal_karat", row.metal_karat)
        .eq("metal_colour", row.metal_colour);

      if (lookupErr) {
        results.skipped.push({ item_code: row.item_code, reason: lookupErr.message });
        continue;
      }

      const supplierFields = {
        supplier_item_code: row.item_code,
        supplier_cost:      row.unit_cost,
        stone_origin:       row.stone_origin,
        stone_shape:        row.stone_shape,
        stone_carat:        row.stone_carat,
        stone_quantity:     row.stone_quantity,
        updated_at:         new Date().toISOString(),
      };

      if (!existing || existing.length === 0) {
        // No variant exists — create one. band_width_mm left null until real data available.
        const { error: insertErr } = await supabase
          .from("inventory_product_variants")
          .insert({
            tenant_id:    tenantId,
            design_id:    row.design_id,
            metal_karat:  row.metal_karat,
            metal_colour: row.metal_colour,
            is_active:    true,
            ...supplierFields,
          });

        if (insertErr) {
          results.skipped.push({ item_code: row.item_code, reason: insertErr.message });
        } else {
          results.inserted++;
        }

      } else if (existing.length === 1) {
        // Exactly one variant — update it.
        const { error: updateErr } = await supabase
          .from("inventory_product_variants")
          .update(supplierFields)
          .eq("id", existing[0].id);

        if (updateErr) {
          results.skipped.push({ item_code: row.item_code, reason: updateErr.message });
        } else {
          results.updated++;
        }

      } else {
        // Multiple variants with different band widths — can't determine which to update.
        results.skipped.push({
          item_code: row.item_code,
          reason: `${existing.length} variants exist for this design+metal combination with different band widths — update manually`,
        });
      }
    }

    return NextResponse.json({
      supplier_name:  supplier.name,
      total_rows:     rows.length,
      updated:        results.updated,
      inserted:       results.inserted,
      skipped:        results.skipped,
      skipped_count:  results.skipped.length,
      imported_at:    new Date().toISOString(),
    });

  } catch (err) {
    console.error("[catalog-import/confirm]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed" }, { status: 500 });
  }
}
