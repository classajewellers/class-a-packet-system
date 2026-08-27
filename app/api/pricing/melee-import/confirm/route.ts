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

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const body = await req.json();
    const { supplier_id, origin, rows } = body as {
      supplier_id: string;
      origin: "natural" | "lab";
      rows: MeleeRow[];
    };

    if (!supplier_id) {
      return NextResponse.json({ error: "supplier_id is required" }, { status: 400 });
    }
    if (!origin || !["natural", "lab"].includes(origin)) {
      return NextResponse.json({ error: "origin must be 'natural' or 'lab'" }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "rows array is required and must not be empty" }, { status: 400 });
    }

    // Confirm supplier belongs to this tenant
    const { data: supplier, error: supplierErr } = await supabase
      .from("inventory_suppliers")
      .select("id, name")
      .eq("id", supplier_id)
      .single();

    if (supplierErr || !supplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    // DELETE all existing rows for this tenant + supplier — scoped overwrite only
    const { error: deleteErr } = await supabase
      .from("pricing_melee_stones")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplier_id);

    if (deleteErr) {
      return NextResponse.json(
        { error: `Failed to clear existing rows: ${deleteErr.message}` },
        { status: 500 }
      );
    }

    // Build insert payload
    const inserts = rows.map((r) => ({
      tenant_id:      tenantId,
      supplier_id,
      origin,
      shape:          r.shape.toLowerCase().trim(),
      size_type:      r.size_type,
      size_label:     r.size_label,
      size_from:      r.size_from ?? null,
      size_to:        r.size_to ?? null,
      quality:        r.quality && r.quality.trim() ? r.quality.trim() : "unspecified",
      price_per_carat: Number(r.price_per_carat),
      // Legacy columns — keep populated for backward compat with existing UI/calculate_price()
      stone_type:     origin === "lab" ? "Lab Grown" : "Natural",
      price_per_stone: 0,
      updated_at:     new Date().toISOString(),
    }));

    const { error: insertErr } = await supabase
      .from("pricing_melee_stones")
      .insert(inserts);

    if (insertErr) {
      return NextResponse.json(
        { error: `Insert failed: ${insertErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imported:      inserts.length,
      supplier_name: supplier.name,
      supplier_id,
      origin,
      imported_at:   new Date().toISOString(),
    });
  } catch (err) {
    console.error("[melee-import/confirm]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
