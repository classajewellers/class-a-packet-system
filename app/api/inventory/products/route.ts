import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const { data, error } = await supabase
      .from("inventory_products")
      .select(`
        id, name, collection, category_id, design, style, created_at,
        category:inventory_categories(id, name),
        _pieces:inventory_pieces(id)
      `)
      .eq("tenant_id", tenantId)
      .order("name");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const products = (data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      collection: p.collection,
      category_id: p.category_id,
      design: p.design,
      style: p.style,
      created_at: p.created_at,
      category: p.category,
      piece_count: (p._pieces as any[])?.length ?? 0,
    }));

    return NextResponse.json({ products });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);
    const body = await req.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("inventory_products")
      .insert({
        tenant_id:             tenantId,
        name:                  body.name.trim(),
        category_id:           body.category_id           || null,
        collection:            body.collection            || null,
        design:                body.design                || null,
        style:                 body.style                 || null,
        setting_type:          body.setting_type          || null,
        marketing_description: body.marketing_description || null,
        website_description:   body.website_description   || null,
        seo_title:             body.seo_title             || null,
        seo_description:       body.seo_description       || null,
        care_instructions:     body.care_instructions     || null,
      })
      .select(`*, category:inventory_categories(id, name)`)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ product: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
