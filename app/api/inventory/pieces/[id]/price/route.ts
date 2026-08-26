import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { mapDiamondTypeToStoneOrigin } from "@/lib/inventoryPricing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "x-tenant-id required" }, { status: 400 });

  const supabase = await createTenantSupabaseClient(tenantId);

  // Read piece's stone inputs so calculate_price() gets the right stone wholesale cost.
  const { data: pieceRow } = await supabase
    .from("inventory_pieces")
    .select("stone_cost, diamond_carat, diamond_type")
    .eq("id", params.id)
    .eq("tenant_id", tenantId)
    .single();

  const stoneOrigin = mapDiamondTypeToStoneOrigin(pieceRow?.diamond_type);

  const { data, error } = await supabase.rpc("calculate_price", {
    p_tenant_id:       tenantId,
    p_piece_id:        params.id,
    p_stone_wholesale: pieceRow?.stone_cost     ?? null,
    p_stone_carat:     pieceRow?.diamond_carat  ?? null,
    p_stone_origin:    stoneOrigin,
  });

  if (error) {
    console.error("[GET /api/inventory/pieces/[id]/price]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // data is the parsed JSONB object from calculate_price()
  return NextResponse.json({ calc: data });
}
