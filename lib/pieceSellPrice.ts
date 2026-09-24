import { SupabaseClient } from "@supabase/supabase-js";
import { mapDiamondTypeToStoneOrigin } from "@/lib/inventoryPricing";
import { roundMoney } from "@/lib/posMoney";

export type SellPriceSource = "retail_price" | "calculate_price";

export interface SellPrice {
  price: number | null;
  source: SellPriceSource | null;
}

/**
 * Counter price for a piece.
 * Ticket `retail_price` wins when it is a real amount — that is what Mark as
 * Sold and the stock list show. When the ticket is blank, fall back to
 * calculate_price().total_retail, the same RPC the piece page uses for live
 * retail. A zero total from a calc with no weight or components is not a
 * price: the counter must ask for a custom price instead of ringing $0.00.
 */
export async function resolvePieceSellPrice(
  supabase: SupabaseClient,
  tenantId: string,
  piece: {
    id: string;
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

  if (error || data == null) return { price: null, source: null };

  const calc = data as { total_retail?: number | string | null; error?: string };
  if (calc.error) return { price: null, source: null };
  if (calc.total_retail == null || calc.total_retail === "") return { price: null, source: null };

  const live = Number(calc.total_retail);
  if (Number.isNaN(live) || live <= 0) return { price: null, source: null };
  return { price: roundMoney(live), source: "calculate_price" };
}
