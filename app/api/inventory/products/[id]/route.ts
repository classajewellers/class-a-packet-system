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

// Grace ATP (Available to Promise) — stock/catalogue items only (this route
// is keyed on inventory_products, which is what the live data and this page
// actually use — see session notes for why inventory_designs is NOT used).
//
// "In stock": inventory_pieces.quantity summed for pieces whose location is
// a sellable type (display, storage — confirmed 2026-09-23; consignment
// deliberately excluded for now, no consignment locations exist in real
// data yet; workshop/transit excluded, not customer-facing stock) and whose
// status is 'in_stock' (the piece's own text status column — NOT
// status_id/inventory_statuses, which inventory_pieces does not have a
// column for on live staging).
const SELLABLE_LOCATION_TYPES = ["display", "storage"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientAny = any;

async function computeATP(supabase: SupabaseClientAny, tenantId: string, productId: string) {
  const [piecesRes, reservationsRes, jobsRes] = await Promise.all([
    supabase
      .from("inventory_pieces")
      .select("id, quantity, status, location:inventory_locations(id, name, type)")
      .eq("product_id", productId)
      .eq("tenant_id", tenantId),
    supabase
      .from("inventory_reservations")
      .select("id, piece_id, quote_id, order_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    supabase
      .from("workshop_jobs")
      .select("id, packet_id, stage, due_date")
      .eq("product_id", productId)
      .neq("stage", "completed"),
  ]);

  const pieces = piecesRes.data ?? [];
  const pieceIds = new Set(pieces.map((p: { id: string }) => p.id));

  const inStock = pieces.reduce((sum: number, p: { quantity?: number | null; status?: string | null; location?: { type?: string } | { type?: string }[] | null }) => {
    const loc = Array.isArray(p.location) ? p.location[0] : p.location;
    const isSellableLocation = !!loc && SELLABLE_LOCATION_TYPES.includes(loc.type ?? "");
    const isStockStatus = p.status === "in_stock";
    if (!isSellableLocation || !isStockStatus) return sum;
    return sum + (p.quantity ?? 1);
  }, 0);

  // Committed = active reservations for pieces belonging to this product.
  // Each reservation is one physical piece (piece_id is a single-unit FK),
  // so committed counts reservation rows, not summed quantity — a
  // quantity-tracked piece row being partially reserved is out of scope
  // for this first version (inventory_reservations.piece_id has no
  // quantity field of its own).
  const committed = (reservationsRes.data ?? []).filter((r: { piece_id: string }) => pieceIds.has(r.piece_id)).length;

  const inProduction = (jobsRes.data ?? []).map((j: { id: string; packet_id: string | null; stage: string; due_date: string | null }) => ({
    job_id: j.id,
    packet_id: j.packet_id,
    stage: j.stage,
    due_date: j.due_date,
    workshop_link: `/workshop/board?job=${j.id}`,
  }));

  return {
    in_stock: inStock,
    committed,
    available_to_sell_today: Math.max(0, inStock - committed),
    in_production: inProduction,
  };
}

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

  const atp = await computeATP(supabase, tenantId, params.id);

  return NextResponse.json({
    product: productRes.data,
    pieces: piecesRes.data ?? [],
    atp,
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
