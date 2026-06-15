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
        id, title, collection, description, is_active, created_at,
        category:inventory_categories(id, name),
        _variants:inventory_variants(id),
        _pieces:inventory_pieces(id)
      `)
      .eq("tenant_id", tenantId)
      .order("title");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const products = (data ?? []).map((p: any) => ({
      id: p.id,
      title: p.title,
      collection: p.collection,
      description: p.description,
      is_active: p.is_active,
      created_at: p.created_at,
      category: p.category,
      variant_count: (p._variants as any[])?.length ?? 0,
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

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("inventory_products")
      .insert({
        tenant_id: tenantId,
        title: body.title.trim(),
        category_id: body.category_id || null,
        collection: body.collection || null,
        description: body.description || null,
        notes: body.notes || null,
      })
      .select(`*, category:inventory_categories(id, name)`)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ product: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
