import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface MeleeRow {
  shape: string;
  size_type: "carat_range" | "pieces_per_carat";
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

      const inserts = priceableRows.map((r) => ({
        tenant_id: tenantId,
        supplier_id,
        origin,
        shape: r.shape.toLowerCase().trim(),
        size_type: r.size_type,
        size_label: r.size_label,
        size_from: r.size_from ?? null,
        size_to: r.size_to ?? null,
        quality: r.quality && r.quality.trim() ? r.quality.trim() : "unspecified",
        price_per_carat: Number(r.price_per_carat),
        // Legacy columns — kept for backward compat with existing UI/calculate_price()
        stone_type: origin === "lab" ? "Lab Grown" : "Natural",
        price_per_stone: 0,
        updated_at: new Date().toISOString(),
      }));

      // DEBUG — remove after size_from/size_to confirmed non-null in DB
      if (inserts[0]) {
        console.log("[melee-confirm] PRE-INSERT first row size_from:", inserts[0].size_from, typeof inserts[0].size_from, "size_to:", inserts[0].size_to, typeof inserts[0].size_to, "label:", inserts[0].size_label);
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
