import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { tenantScoped } from "@/lib/tenantScoped";
import { resolvePieceSellPrice } from "@/lib/pieceSellPrice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PieceRow = Record<string, unknown> & {
  id: string;
  sku?: string | null;
  barcode?: string | null;
  status?: string | null;
  status_id?: string | null;
  quantity?: number | null;
  retail_price?: number | null;
  product_id?: string | null;
  metal_karat?: string | null;
  metal_colour?: string | null;
  product?: { id: string; name: string } | { id: string; name: string }[] | null;
};

function productOf(piece: PieceRow): { id: string; name: string } | null {
  const product = piece.product;
  if (!product) return null;
  return Array.isArray(product) ? product[0] ?? null : product;
}

function sellable(piece: PieceRow, soldStatusIds: Set<string>): boolean {
  if (piece.status_id && soldStatusIds.has(String(piece.status_id))) return false;
  if (String(piece.status ?? "").toLowerCase().includes("sold")) return false;
  if (piece.quantity != null && Number(piece.quantity) <= 0) return false;
  return true;
}

// GET /api/pos/pieces?q= — in-stock pieces by SKU, barcode, or product name.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().replace(/[%_\\]/g, "");
  if (!q) return NextResponse.json({ pieces: [] });

  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const db = tenantScoped(supabase, auth.ctx.tenantId);
  const pattern = `%${q}%`;
  const select = "*, product:inventory_products(id,name)";

  const [skuRes, barcodeRes, productRes, statusRes] = await Promise.all([
    db.from("inventory_pieces").select(select).ilike("sku", pattern).limit(12),
    db.from("inventory_pieces").select(select).ilike("barcode", pattern).limit(12),
    db.from("inventory_products").select("id, name").ilike("name", pattern).limit(12),
    db.from("inventory_statuses").select("id, name").ilike("name", "%sold%"),
  ]);

  if (skuRes.error) return NextResponse.json({ error: skuRes.error.message }, { status: 500 });

  const byId = new Map<string, PieceRow>();
  for (const row of (skuRes.data ?? []) as PieceRow[]) byId.set(row.id, row);

  if (!barcodeRes.error) {
    for (const row of (barcodeRes.data ?? []) as PieceRow[]) byId.set(row.id, row);
  }

  const productIds = ((productRes.data ?? []) as { id: string }[]).map(p => p.id);
  if (productIds.length > 0) {
    const linked = await db
      .from("inventory_pieces")
      .select(select)
      .in("product_id", productIds)
      .limit(12);
    if (!linked.error) {
      for (const row of (linked.data ?? []) as PieceRow[]) byId.set(row.id, row);
    }
  }

  const soldStatusIds = new Set(
    ((statusRes.data ?? []) as { id: string }[]).map(s => s.id)
  );

  const matches = Array.from(byId.values()).filter(p => sellable(p, soldStatusIds)).slice(0, 12);
  const needle = q.toLowerCase();

  const pieces = await Promise.all(matches.map(async (piece) => {
    const sell = await resolvePieceSellPrice(supabase, auth.ctx.tenantId, piece);
    const product = productOf(piece);
    const sku = piece.sku ?? "";
    const barcode = piece.barcode ?? null;
    const exact = needle === String(sku).toLowerCase() || (barcode != null && needle === String(barcode).toLowerCase());
    const available = piece.quantity != null ? Number(piece.quantity) : 1;
    return {
      id: piece.id,
      sku,
      barcode,
      name: product?.name || sku,
      product_id: piece.product_id ?? product?.id ?? null,
      metal_karat: piece.metal_karat ?? null,
      metal_colour: piece.metal_colour ?? null,
      status: piece.status ?? null,
      available: Number.isNaN(available) || available < 1 ? 1 : available,
      retail_price: piece.retail_price != null ? Number(piece.retail_price) : null,
      sell_price: sell.price,
      price_source: sell.source,
      exact,
    };
  }));

  return NextResponse.json({ pieces });
}
