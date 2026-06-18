import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  const db = createServerSupabaseClient();

  const { data, error } = await db
    .from("pricing_product_variants")
    .select(`
      *,
      pricing_build_components ( id, total_cost ),
      pricing_supplier_costs ( * )
    `)
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    product_id?:         string;
    name?:               string;
    metal_type?:         string;
    metal_grams?:        number;
    diamond_type?:       string;
    pricing_mode?:       string;
    last_direct_cost?:   number;
    notes?:              string;
    melee_quantity?:     number;
    melee_carat_weight?: number;
    melee_colour_group?: string;
    melee_clarity?:      string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.product_id) return NextResponse.json({ error: "product_id is required" }, { status: 400 });
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const db = createServerSupabaseClient();
  const { data, error } = await db
    .from("pricing_product_variants")
    .insert({
      product_id:               body.product_id,
      name:                     body.name.trim(),
      metal_type:               body.metal_type         ?? null,
      metal_grams:              body.metal_grams         ?? null,
      diamond_type:             body.diamond_type        ?? "none",
      pricing_mode:             body.pricing_mode        ?? "our_build",
      last_direct_cost:         body.last_direct_cost    ?? null,
      active_pricing_mode:      body.pricing_mode        ?? "build",
      target_margin_multiplier: 2.5,
      notes:                    body.notes               ?? null,
      melee_quantity:           body.melee_quantity      ?? null,
      melee_carat_weight:       body.melee_carat_weight  ?? null,
      melee_colour_group:       body.melee_colour_group  ?? null,
      melee_clarity:            body.melee_clarity       ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
