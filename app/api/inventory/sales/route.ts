import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { markPieceSold, MarkPieceSoldInput } from "@/lib/markPieceSold";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/inventory/sales
// Body: { piece_id, sold_price, discount_amount?, staff_id?, customer_id?, payment_method?, notes? }
// The inventory "Mark as Sold" button. Implementation lives in lib/markPieceSold
// so POS cash payment runs the same inventory_sales + piece-status path.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  let body: MarkPieceSoldInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = await createTenantSupabaseClient(tenantId);
  const result = await markPieceSold(supabase, tenantId, body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    sale: result.sale,
    packet: result.packet,
    gross_profit: result.gross_profit,
    gross_profit_note: result.gross_profit_note,
  });
}
