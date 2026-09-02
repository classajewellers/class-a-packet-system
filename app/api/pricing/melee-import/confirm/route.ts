import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// UNIT NOTE: size_from/size_to in pricing_melee_stones are NOT a single uniform unit.
//   carat_range rows → carats       (e.g. 0.025–0.03)
//   mm_range rows    → millimetres  (e.g. 0.90–1.20)
//   pieces_per_carat → piece count  (e.g. 200–150, inverse: more pieces = smaller stone)
// Points labels ('pt'/'pts') are converted ÷100 to carats and stored as carat_range.
// Any size-based lookup — calculate_price(), Stage 3 band pricing, or any future
// "find the matching row" query — MUST branch on size_type before comparing values.
// Never assume all rows are directly comparable as carats.
function parseSizeLabel(label: string): {
  size_type: "carat_range" | "pieces_per_carat" | "mm_range";
  size_from: number | null;
  size_to: number | null;
} {
  const s = label.trim().toLowerCase();
  const nums = (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const rawFrom = nums[0] ?? null;
  const rawTo = nums.length > 1 ? nums[nums.length - 1] : rawFrom;

  if (/\d\s*pts?\b/.test(s)) {
    // Points: 1pt = 0.01 carat. Convert to carats and store as carat_range.
    return {
      size_type: "carat_range",
      size_from: rawFrom != null ? rawFrom / 100 : null,
      size_to:   rawTo   != null ? rawTo   / 100 : null,
    };
  }
  if (/\d\s*mm\b/.test(s)) {
    // Millimetres — stored as raw mm values (NOT converted to carats).
    return { size_type: "mm_range", size_from: rawFrom, size_to: rawTo };
  }
  if (/\d\s*pcs?\b/.test(s)) {
    // Pieces per carat — stored as raw piece counts (inverse: more = smaller stone).
    return { size_type: "pieces_per_carat", size_from: rawFrom, size_to: rawTo };
  }
  // Default: carat range (label ends in "ct"/"carat", or no unit).
  return { size_type: "carat_range", size_from: rawFrom, size_to: rawTo };
}

interface MeleeRow {
  shape: string;
  size_type?: string; // AI hint — classification is overridden by parseSizeLabel()
  size_label: string;
  size_from: number | null;
  size_to: number | null;
  quality: string;
  price_per_carat: number;
  flagged: boolean;
  flag_reason?: string;
}

interface GroupPayload {
  supplier_id: string;
  origin: "natural" | "lab";
  rows: MeleeRow[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const body = await req.json();
    const { groups } = body as { groups: GroupPayload[] };

    if (!Array.isArray(groups) || groups.length === 0) {
      return NextResponse.json(
        { error: "groups array is required and must not be empty" },
        { status: 400 }
      );
    }

    for (const g of groups) {
      if (!g.supplier_id) {
        return NextResponse.json(
          { error: "All groups must have a supplier_id" },
          { status: 400 }
        );
      }
      if (!g.origin || !["natural", "lab"].includes(g.origin)) {
        return NextResponse.json(
          { error: "Each group's origin must be 'natural' or 'lab'" },
          { status: 400 }
        );
      }
      if (!Array.isArray(g.rows) || g.rows.length === 0) {
        return NextResponse.json(
          { error: `Group for supplier ${g.supplier_id} has no rows` },
          { status: 400 }
        );
      }
    }

    const groupResults = [];
    let totalImported = 0;

    for (const group of groups) {
      const { supplier_id, origin, rows } = group;

      // Verify supplier belongs to this tenant
      const { data: supplier, error: supplierErr } = await supabase
        .from("inventory_suppliers")
        .select("id, name")
        .eq("id", supplier_id)
        .single();

      if (supplierErr || !supplier) {
        return NextResponse.json(
          { error: `Supplier ${supplier_id} not found` },
          { status: 404 }
        );
      }

      // DELETE all existing rows for this tenant + supplier — scoped overwrite
      const { error: deleteErr } = await supabase
        .from("pricing_melee_stones")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("supplier_id", supplier_id);

      if (deleteErr) {
        return NextResponse.json(
          { error: `Failed to clear existing rows for ${supplier.name}: ${deleteErr.message}` },
          { status: 500 }
        );
      }

      const priceableRows = rows.filter((r) => !r.flagged);
      const excludedCount = rows.length - priceableRows.length;

      const inserts = priceableRows.map((r) => {
        // Classify and convert using the label text — AI's size_type is ignored.
        const parsed = parseSizeLabel(r.size_label);

        return {
          tenant_id: tenantId,
          supplier_id,
          origin,
          shape: r.shape.toLowerCase().trim(),
          size_type: parsed.size_type,
          size_label: r.size_label,
          size_from: parsed.size_from,
          size_to: parsed.size_to,
          quality: r.quality && r.quality.trim() ? r.quality.trim() : "unspecified",
          price_per_carat: Number(r.price_per_carat),
          // Legacy columns — kept for backward compat with existing UI/calculate_price()
          stone_type: origin === "lab" ? "Lab Grown" : "Natural",
          price_per_stone: 0,
          updated_at: new Date().toISOString(),
        };
      });

      // DEBUG — remove after parseSizeLabel classification confirmed correct
      if (inserts[0]) {
        console.log("[melee-confirm] PRE-INSERT first row:", JSON.stringify({
          size_label: inserts[0].size_label,
          size_type: inserts[0].size_type,
          size_from: inserts[0].size_from,
          size_to: inserts[0].size_to,
        }));
      }

      const { data: insertedRows, error: insertErr } = await supabase
        .from("pricing_melee_stones")
        .insert(inserts)
        .select("id, size_label, size_from, size_to");

      // DEBUG — remove after confirmed
      if (insertedRows?.[0]) {
        console.log("[melee-confirm] POST-INSERT first row back:", JSON.stringify(insertedRows[0]));
      } else {
        console.log("[melee-confirm] POST-INSERT returned no rows (insertedRows:", JSON.stringify(insertedRows), ")");
      }

      if (insertErr) {
        return NextResponse.json(
          { error: `Insert failed for ${supplier.name}: ${insertErr.message}` },
          { status: 500 }
        );
      }

      groupResults.push({
        imported: inserts.length,
        excluded_flagged: excludedCount,
        supplier_name: supplier.name,
        supplier_id,
        origin,
      });
      totalImported += inserts.length;
    }

    // Debug: first row received — remove after size_from/size_to confirmed non-null in DB
    const firstGroup = groups[0];
    const firstRow = firstGroup?.rows?.[0];
    const debugFirstRow = firstRow ? {
      size_from_received: firstRow.size_from,
      size_to_received:   firstRow.size_to,
      size_from_type:     typeof firstRow.size_from,
      size_to_type:       typeof firstRow.size_to,
      flagged:            firstRow.flagged,
      size_label:         firstRow.size_label,
    } : null;

    return NextResponse.json({
      total_imported: totalImported,
      groups: groupResults,
      imported_at: new Date().toISOString(),
      _debug_first_row: debugFirstRow,
    });
  } catch (err) {
    console.error("[melee-import/confirm]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
