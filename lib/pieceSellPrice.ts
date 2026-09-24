import { SupabaseClient } from "@supabase/supabase-js";
import { mapDiamondTypeToStoneOrigin } from "@/lib/inventoryPricing";
import { roundMoney } from "@/lib/posMoney";

export type SellPriceSource = "retail_price" | "calculate_price";

export interface SellPrice {
  price: number | null;
  source: SellPriceSource | null;
}

function unavailable(piece: { id: string; sku?: string | null }, reason: string): SellPrice {
  console.warn("[pos] Price unavailable", {
    piece_id: piece.id,
    sku: piece.sku ?? null,
    reason,
  });
  return { price: null, source: null };
}

/**
 * Counter price for a piece.
 * Ticket `retail_price` is the Mark as Sold prefill when it is a real amount.
 * Otherwise use calculate_price().total_retail, the same RPC as
 * GET /api/inventory/pieces/[id]/price. A missing, failed, or zero result is
 * not a price — callers show "Price unavailable" instead of $0.00.
 */
export async function resolvePieceSellPrice(
  supabase: SupabaseClient,
  tenantId: string,
  piece: {
    id: string;
    sku?: string | null;
    retail_price?: number | string | null;
    stone_cost?: number | null;
    diamond_carat?: number | null;
    diamond_type?: string | null;
  }
): Promise<SellPrice> {
  if (piece.retail_price != null && piece.retail_price !== "") {
    const ticket = Number(piece.retail_price);
    if (!Number.isNaN(ticket) && ticket > 0) {
      return { price: roundMoney(ticket), source: "retail_price" };
    }
  }

  const stoneOrigin = mapDiamondTypeToStoneOrigin(piece.diamond_type);
  const { data, error } = await supabase.rpc("calculate_price", {
    p_tenant_id: tenantId,
    p_piece_id: piece.id,
    p_stone_wholesale: piece.stone_cost ?? null,
    p_stone_carat: piece.diamond_carat ?? null,
    p_stone_origin: stoneOrigin,
  });

  if (error) return unavailable(piece, error.message || "calculate_price failed");
  if (data == null) return unavailable(piece, "calculate_price returned null");

  const calc = data as { total_retail?: number | string | null; error?: string };
  if (calc.error) return unavailable(piece, `calculate_price error: ${calc.error}`);
  if (calc.total_retail == null || calc.total_retail === "") {
    return unavailable(piece, "calculate_price total_retail is null");
  }

  const live = Number(calc.total_retail);
  if (Number.isNaN(live)) return unavailable(piece, "calculate_price total_retail is not a number");
  if (live <= 0) return unavailable(piece, `calculate_price total_retail=${live}`);
  return { price: roundMoney(live), source: "calculate_price" };
}
