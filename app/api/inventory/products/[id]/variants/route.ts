import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: { id: string } };

// GET /api/inventory/products/:id/variants — list all variants for a design
export async function GET(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  const supabase = await createTenantSupabaseClient(tenantId);

  const { data, error } = await supabase
    .from("inventory_product_variants")
    .select("id, name, metal_karat, metal_colour, band_width_mm, claw_config, shopify_variant_id, is_active, created_at")
    .eq("design_id", params.id)
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("metal_karat")
    .order("metal_colour");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ variants: data ?? [] });
}

// POST /api/inventory/products/:id/variants — create a new variant for a design
export async function POST(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  const supabase = await createTenantSupabaseClient(tenantId);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const metal_karat  = (body.metal_karat  ?? "").trim();
  const metal_colour = (body.metal_colour ?? "").trim();
  if (!metal_karat || !metal_colour) {
    return NextResponse.json({ error: "metal_karat and metal_colour are required" }, { status: 400 });
  }

  // Auto-generate name if not provided: e.g. "18K Yellow Gold" or "18K Yellow Gold 2mm"
  const autoName = [
    metal_karat,
    metal_colour === "N/A" ? "" : metal_colour,
    "Gold",
    body.band_width_mm ? `${body.band_width_mm}mm` : null,
  ].filter(Boolean).join(" ");

  const { data, error } = await supabase
    .from("inventory_product_variants")
    .insert({
      tenant_id:          tenantId,
      design_id:          params.id,
      metal_karat,
      metal_colour,
      band_width_mm:      body.band_width_mm  ? Number(body.band_width_mm)  : null,
      claw_config:        body.claw_config    ?? null,
      shopify_variant_id: body.shopify_variant_id ?? null,
      name:               (body.name ?? "").trim() || autoName,
      is_active:          true,
    })
    .select("id, name, metal_karat, metal_colour, band_width_mm, claw_config, shopify_variant_id, is_active, created_at")
    .single();

  if (error) {
    // Unique constraint violation — variant with this metal combination already exists
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A variant with this metal/width combination already exists for this design" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ variant: data }, { status: 201 });
}
