import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PIECE_SELECT = `
  id, sku, title, metal_type, metal_karat, metal_colour, finger_size,
  cost_price, retail_price, created_at,
  status:inventory_statuses(id, name, colour),
  location:inventory_locations(id, name)
`.trim();

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const [productRes, piecesRes] = await Promise.all([
    supabase
      .from("inventory_products")
      .select(`*, category:inventory_categories(id, name)`)
      .eq("id", params.id)
      .eq("tenant_id", tenantId)
      .single(),
    supabase
      .from("inventory_pieces")
      .select(PIECE_SELECT)
      .eq("product_id", params.id)
      .eq("tenant_id", tenantId)
      .order("created_at"),
  ]);

  if (productRes.error || !productRes.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    product: productRes.data,
    pieces: piecesRes.data ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);
    const body = await req.json();

    const { data, error } = await supabase
      .from("inventory_products")
      .update({
        name:                  body.name,
        category_id:           body.category_id           ?? null,
        collection:            body.collection            ?? null,
        design:                body.design                ?? null,
        style:                 body.style                 ?? null,
        setting_type:          body.setting_type          ?? null,
        marketing_description: body.marketing_description ?? null,
        website_description:   body.website_description   ?? null,
        seo_title:             body.seo_title             ?? null,
        seo_description:       body.seo_description       ?? null,
        care_instructions:     body.care_instructions     ?? null,
      })
      .eq("id", params.id)
      .eq("tenant_id", tenantId)
      .select(`*, category:inventory_categories(id, name)`)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ product: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const { count } = await supabase
      .from("inventory_pieces")
      .select("id", { count: "exact", head: true })
      .eq("product_id", params.id);

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `Cannot delete — ${count} piece(s) still linked to this product` },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("inventory_products")
      .delete()
      .eq("id", params.id)
      .eq("tenant_id", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
