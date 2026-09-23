import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const { searchParams } = new URL(req.url);
    const search  = searchParams.get("search")   ?? "";
    const perPage = Math.min(100, parseInt(searchParams.get("per_page") ?? "50", 10));

    let query = supabase
      .from("inventory_products")
      .select(`
        id, name, collection, category, category_id, design, style, created_at,
        _pieces:inventory_pieces(id)
      `)
      .eq("tenant_id", tenantId)
      .order("name")
      .limit(perPage);

    if (search) query = query.ilike("name", `%${search}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const productIds = (data ?? []).map((p: { id: string }) => p.id);

    // ── Grace ATP — bulk-computed for the list, not per-row, to avoid N+1 ──────
    // Same rules as the product detail route (app/api/inventory/products/[id]):
    // in_stock = quantity summed for pieces with status='in_stock' in a
    // sellable location (display/storage); committed = active reservations
    // for those pieces; available = in_stock - committed.
    const SELLABLE_LOCATION_TYPES = ["display", "storage"];
    let atpByProduct: Record<string, { in_stock: number; committed: number; available_to_sell_today: number }> = {};
    if (productIds.length > 0) {
      const [piecesRes, reservationsRes] = await Promise.all([
        supabase
          .from("inventory_pieces")
          .select("id, product_id, quantity, status, location:inventory_locations(type)")
          .in("product_id", productIds)
          .eq("tenant_id", tenantId),
        supabase
          .from("inventory_reservations")
          .select("piece_id")
          .eq("tenant_id", tenantId)
          .eq("status", "active"),
      ]);

      const reservedPieceIds = new Set((reservationsRes.data ?? []).map((r: { piece_id: string }) => r.piece_id));
      const inStockByProduct: Record<string, number> = {};
      const committedByProduct: Record<string, number> = {};

      for (const p of piecesRes.data ?? []) {
        const loc = Array.isArray(p.location) ? p.location[0] : p.location;
        const isSellableLocation = !!loc && SELLABLE_LOCATION_TYPES.includes(loc.type ?? "");
        const isStockStatus = p.status === "in_stock";
        if (isSellableLocation && isStockStatus) {
          inStockByProduct[p.product_id] = (inStockByProduct[p.product_id] ?? 0) + (p.quantity ?? 1);
        }
        if (reservedPieceIds.has(p.id)) {
          committedByProduct[p.product_id] = (committedByProduct[p.product_id] ?? 0) + 1;
        }
      }

      atpByProduct = Object.fromEntries(
        productIds.map((id: string) => {
          const inStock = inStockByProduct[id] ?? 0;
          const committed = committedByProduct[id] ?? 0;
          return [id, { in_stock: inStock, committed, available_to_sell_today: Math.max(0, inStock - committed) }];
        })
      );
    }

    const products = (data ?? []).map((p: any) => ({
      id:          p.id,
      name:        p.name,
      collection:  p.collection,
      category:    p.category,
      category_id: p.category_id,
      design:      p.design,
      style:       p.style,
      created_at:  p.created_at,
      piece_count: (p._pieces as any[])?.length ?? 0,
      atp:         atpByProduct[p.id] ?? { in_stock: 0, committed: 0, available_to_sell_today: 0 },
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
        category:              body.category              || null,
        category_id:           body.category_id           || null,
        collection:            body.collection            || null,
        labour_cost:           body.labour_cost  != null ? Number(body.labour_cost)  : null,
        setting_cost:          body.setting_cost != null ? Number(body.setting_cost) : null,
        melee_included:        body.melee_included === true,
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
