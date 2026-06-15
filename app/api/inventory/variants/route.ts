import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("product_id") ?? "";
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    let query = supabase
      .from("inventory_variants")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    if (productId) query = query.eq("product_id", productId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ variants: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);
    const body = await req.json();

    if (!body.product_id) {
      return NextResponse.json({ error: "product_id is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("inventory_variants")
      .insert({
        tenant_id: tenantId,
        product_id: body.product_id,
        title: body.title || null,
        metal_type: body.metal_type || null,
        metal_karat: body.metal_karat || null,
        metal_colour: body.metal_colour || null,
        finger_size: body.finger_size || null,
        chain_length: body.chain_length || null,
        diamond_type: body.diamond_type || null,
        diamond_carat: body.diamond_carat ?? null,
        diamond_colour: body.diamond_colour || null,
        diamond_clarity: body.diamond_clarity || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ variant: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
