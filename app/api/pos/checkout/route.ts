import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { tenantScoped } from "@/lib/tenantScoped";
import { markPieceSold } from "@/lib/markPieceSold";
import { resolvePieceSellPrice } from "@/lib/pieceSellPrice";
import { generatePosReceiptNumber } from "@/lib/posReceiptNumber";
import { gstFromInclusive, roundMoney, toCents } from "@/lib/posMoney";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CheckoutLine {
  piece_id?: string;
  quantity?: number;
  custom_price_override?: boolean;
  unit_price?: number;
  notes?: string | null;
}

// POST /api/pos/checkout — cash only. Other payment methods are refused.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: {
    session_id?: string;
    customer_id?: string | null;
    cash_tendered?: number;
    lines?: CheckoutLine[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.session_id) return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) return NextResponse.json({ error: "Add at least one piece" }, { status: 400 });

  const seen = new Set<string>();
  for (const line of lines) {
    if (!line.piece_id) return NextResponse.json({ error: "Each line needs a piece" }, { status: 400 });
    if (seen.has(line.piece_id)) {
      return NextResponse.json({ error: "The same piece is in the cart twice" }, { status: 400 });
    }
    seen.add(line.piece_id);
    if (!Number.isInteger(line.quantity) || (line.quantity ?? 0) < 1) {
      return NextResponse.json({ error: "Quantity must be a whole number of at least 1" }, { status: 400 });
    }
  }

  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const db = tenantScoped(supabase, auth.ctx.tenantId);

  const { data: session, error: sessionErr } = await db
    .from("pos_sessions")
    .select("id, closed_at, staff_id")
    .eq("id", body.session_id)
    .maybeSingle();

  if (sessionErr) return NextResponse.json({ error: sessionErr.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.closed_at) return NextResponse.json({ error: "This session is closed" }, { status: 409 });

  const pieceIds = lines.map(l => l.piece_id as string);
  const [pieceRes, soldStatusRes] = await Promise.all([
    db.from("inventory_pieces").select("*, product:inventory_products(id,name)").in("id", pieceIds),
    db.from("inventory_statuses").select("id, name").ilike("name", "%sold%"),
  ]);

  if (pieceRes.error) return NextResponse.json({ error: pieceRes.error.message }, { status: 500 });

  type CheckoutPiece = {
    id: string;
    sku?: string | null;
    status?: string | null;
    status_id?: string | null;
    quantity?: number | null;
    retail_price?: number | null;
    stone_cost?: number | null;
    diamond_carat?: number | null;
    diamond_type?: string | null;
    product_id?: string | null;
    product?: { name?: string } | { name?: string }[] | null;
  };

  const pieces = new Map<string, CheckoutPiece>(
    ((pieceRes.data ?? []) as CheckoutPiece[]).map((p) => [String(p.id), p])
  );
  const soldStatusIds = new Set(((soldStatusRes.data ?? []) as { id: string }[]).map(s => s.id));

  const priced: {
    piece_id: string;
    product_id: string | null;
    name: string;
    sku: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    custom_price_override: boolean;
    notes: string | null;
  }[] = [];

  for (const line of lines) {
    const piece = pieces.get(line.piece_id as string);
    if (!piece) return NextResponse.json({ error: "A piece in the cart was not found" }, { status: 404 });

    const status = String(piece.status ?? "").toLowerCase();
    const statusId = piece.status_id ? String(piece.status_id) : null;
    if (status.includes("sold") || (statusId != null && soldStatusIds.has(statusId))) {
      return NextResponse.json({ error: `${piece.sku ?? "Piece"} is already sold` }, { status: 409 });
    }

    const available = piece.quantity != null ? Number(piece.quantity) : 1;
    const quantity = line.quantity as number;
    if (quantity > available) {
      return NextResponse.json({ error: `Only ${available} available for ${piece.sku ?? "this piece"}` }, { status: 409 });
    }

    const sell = await resolvePieceSellPrice(supabase, auth.ctx.tenantId, {
      id: String(piece.id),
      retail_price: piece.retail_price as number | null,
      stone_cost: piece.stone_cost as number | null,
      diamond_carat: piece.diamond_carat as number | null,
      diamond_type: piece.diamond_type as string | null,
    });

    const override = line.custom_price_override === true;
    let unitPrice: number;
    if (override) {
      unitPrice = Number(line.unit_price);
      if (Number.isNaN(unitPrice) || unitPrice < 0) {
        return NextResponse.json({ error: "Custom price must be zero or more" }, { status: 400 });
      }
      unitPrice = roundMoney(unitPrice);
    } else if (sell.price == null) {
      return NextResponse.json({
        error: `${piece.sku ?? "Piece"} has no retail price. Enter a custom price.`,
      }, { status: 422 });
    } else {
      unitPrice = sell.price;
    }

    const product = piece.product as { name?: string } | { name?: string }[] | null;
    const productName = Array.isArray(product) ? product[0]?.name : product?.name;

    priced.push({
      piece_id: String(piece.id),
      product_id: (piece.product_id as string | null) ?? null,
      name: productName || String(piece.sku ?? "Piece"),
      sku: String(piece.sku ?? ""),
      quantity,
      unit_price: unitPrice,
      line_total: roundMoney(unitPrice * quantity),
      custom_price_override: override,
      notes: typeof line.notes === "string" && line.notes.trim() ? line.notes.trim() : null,
    });
  }

  const subtotal = roundMoney(priced.reduce((sum, line) => sum + line.line_total, 0));
  const discount = 0;
  const total = roundMoney(subtotal - discount);
  if (toCents(total) <= 0) {
    return NextResponse.json({ error: "Sale total must be greater than zero" }, { status: 400 });
  }

  const tendered = Number(body.cash_tendered);
  if (body.cash_tendered == null || Number.isNaN(tendered) || toCents(tendered) < toCents(total)) {
    return NextResponse.json({ error: "Cash tendered must cover the total" }, { status: 400 });
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("gst_registered")
    .eq("id", auth.ctx.tenantId)
    .maybeSingle();
  const gstRegistered = (tenant as { gst_registered?: boolean } | null)?.gst_registered !== false;
  const tax = gstFromInclusive(total, gstRegistered);

  let customer: { id: string; name: string } | null = null;
  if (body.customer_id) {
    const { data: customerRow } = await db
      .from("customers")
      .select("id, first_name, last_name")
      .eq("id", body.customer_id)
      .maybeSingle();
    if (!customerRow) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    const row = customerRow as { id: string; first_name: string | null; last_name: string | null };
    customer = {
      id: row.id,
      name: `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Customer",
    };
  }

  const receiptNumber = await generatePosReceiptNumber(auth.ctx.tenantId);
  const soldIds: string[] = [];

  for (const line of priced) {
    const sold = await markPieceSold(supabase, auth.ctx.tenantId, {
      piece_id: line.piece_id,
      sold_price: line.line_total,
      discount_amount: 0,
      staff_id: auth.ctx.userId,
      customer_id: customer?.id ?? null,
      payment_method: "cash",
      notes: `POS ${receiptNumber}`,
      moved_by: auth.ctx.userId,
      quantity: line.quantity,
      order_reference: receiptNumber,
    });
    if (!sold.ok) {
      const partial = soldIds.length > 0
        ? ` ${soldIds.length} piece(s) were already marked sold before this stopped, and no receipt was saved.`
        : "";
      return NextResponse.json({
        error: `${sold.error}${partial}`,
        receipt_number: receiptNumber,
        already_sold_piece_ids: soldIds,
      }, { status: sold.status });
    }
    soldIds.push(line.piece_id);
  }

  const { data: txn, error: txnErr } = await db
    .from("pos_transactions")
    .insert({
      pos_session_id: session.id,
      customer_id: customer?.id ?? null,
      subtotal,
      discount,
      tax,
      total,
      payment_method: "cash",
      payment_status: "paid",
      receipt_number: receiptNumber,
    })
    .select("*")
    .single();

  if (txnErr || !txn) {
    return NextResponse.json({
      error: `Stock was marked sold but the receipt failed to save: ${txnErr?.message ?? "Unknown error"}`,
      receipt_number: receiptNumber,
      already_sold_piece_ids: soldIds,
    }, { status: 500 });
  }

  const { error: itemErr } = await db.from("pos_transaction_items").insert(
    priced.map(line => ({
      pos_transaction_id: txn.id,
      piece_id: line.piece_id,
      product_id: line.product_id,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: line.line_total,
      custom_price_override: line.custom_price_override,
      notes: line.notes,
    }))
  );

  if (itemErr) {
    return NextResponse.json({
      error: `Receipt ${receiptNumber} was saved but the lines failed: ${itemErr.message}`,
      receipt_number: receiptNumber,
    }, { status: 500 });
  }

  const change = roundMoney(tendered - total);

  return NextResponse.json({
    receipt: {
      id: txn.id,
      receipt_number: receiptNumber,
      created_at: txn.created_at,
      subtotal,
      discount,
      tax,
      total,
      payment_method: "cash",
      payment_status: "paid",
      cash_tendered: roundMoney(tendered),
      change,
      customer,
      gst_registered: gstRegistered,
      items: priced.map(line => ({
        piece_id: line.piece_id,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_total: line.line_total,
        custom_price_override: line.custom_price_override,
      })),
    },
  });
}
