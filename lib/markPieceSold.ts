import { SupabaseClient } from "@supabase/supabase-js";
import { createPacket } from "@/lib/createPacket";
import { tenantScoped } from "@/lib/tenantScoped";
import { Packet, PacketFormData } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MarkPieceSoldInput {
  piece_id: string;
  sold_price: number;
  discount_amount?: number;
  staff_id?: string | null;
  customer_id?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  moved_by?: string | null;
  /**
   * Units sold. Omit to sell the whole piece (the inventory Mark as Sold button).
   * When set and the remainder is still in stock, status stays as it is and
   * quantity is decremented. Status becomes sold only when nothing is left.
   */
  quantity?: number | null;
  /** Stored on inventory_sales.order_reference (POS receipt number). */
  order_reference?: string | null;
}

export type MarkPieceSoldResult =
  | {
      ok: true;
      sale: Record<string, unknown>;
      packet: Packet;
      gross_profit: number | null;
      gross_profit_note: string | null;
    }
  | { ok: false; status: number; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

/**
 * The Mark as Sold path.
 *
 * Writes inventory_sales, a linked stock_sale packet, and the piece status
 * change. POS cash payment calls this — it does not keep a second sold ledger.
 *
 * Status update follows the piece's real columns (confirmed 2026-09-23):
 * production uses status_id → inventory_statuses; staging has no status_id
 * and uses inventory_pieces.status text ('sold' is in the check constraint).
 * Whichever column is present gets set. This is the same status machine the
 * inventory screen already uses, not a POS-only one.
 */
export async function markPieceSold(
  supabase: SupabaseClient,
  tenantId: string,
  input: MarkPieceSoldInput
): Promise<MarkPieceSoldResult> {
  const {
    piece_id,
    sold_price,
    discount_amount = 0,
    staff_id,
    customer_id,
    payment_method,
    notes,
    moved_by,
    quantity,
    order_reference,
  } = input;

  if (!piece_id) return { ok: false, status: 400, error: "piece_id is required" };
  if (sold_price == null || Number.isNaN(Number(sold_price)) || Number(sold_price) < 0) {
    return { ok: false, status: 400, error: "sold_price is required and must be a positive number" };
  }
  if (quantity != null && (!Number.isInteger(quantity) || quantity < 1)) {
    return { ok: false, status: 400, error: "quantity must be a whole number of at least 1" };
  }

  const db = tenantScoped(supabase, tenantId);

  const { data: piece, error: pieceErr } = await db
    .from("inventory_pieces")
    .select("*")
    .eq("id", piece_id)
    .single();

  if (pieceErr || !piece) {
    return { ok: false, status: 404, error: "Piece not found" };
  }

  const row = piece as Record<string, unknown>;
  const hasStatusId = "status_id" in row;
  const statusText = typeof row.status === "string" ? row.status : "";

  if (statusText.toLowerCase().includes("sold")) {
    return { ok: false, status: 409, error: "This item is already marked as sold" };
  }

  let soldStatusId: string | null = null;
  if (hasStatusId) {
    const { data: statuses, error: statusErr } = await db
      .from("inventory_statuses")
      .select("id, name")
      .ilike("name", "%sold%")
      .limit(5);

    if (statusErr || !statuses?.length) {
      return {
        ok: false,
        status: 422,
        error: "Could not find a 'Sold' status in inventory_statuses. Please create one in Inventory Settings.",
      };
    }

    soldStatusId = String((statuses[0] as { id: string }).id);

    const currentStatusId = row.status_id ? String(row.status_id) : null;
    if (currentStatusId) {
      const { data: currentStatus } = await db
        .from("inventory_statuses")
        .select("id, name")
        .eq("id", currentStatusId)
        .maybeSingle();
      const currentName = String((currentStatus as { name?: string } | null)?.name ?? "");
      if (currentName.toLowerCase().includes("sold")) {
        return { ok: false, status: 409, error: "This item is already marked as sold" };
      }
    }
  }

  const pieceQty = "quantity" in row && row.quantity != null ? Number(row.quantity) : null;
  let exhaustsPiece = true;
  if (quantity != null) {
    const available = pieceQty != null && !Number.isNaN(pieceQty) ? pieceQty : 1;
    if (quantity > available) {
      return { ok: false, status: 409, error: "Not enough quantity on this piece" };
    }
    exhaustsPiece = quantity >= available;
  }

  const { data: activeRes } = await db
    .from("inventory_reservations")
    .select("id, customer_id, customer:customers(first_name, last_name)")
    .eq("piece_id", piece_id)
    .eq("status", "active")
    .maybeSingle();

  if (activeRes) {
    const reservation = activeRes as {
      id: string;
      customer_id: string | null;
      customer: { first_name?: string | null; last_name?: string | null } | { first_name?: string | null; last_name?: string | null }[] | null;
    };
    const resCustomerId = reservation.customer_id ?? null;
    const saleCustomerId = customer_id ?? null;
    if (resCustomerId && saleCustomerId && resCustomerId !== saleCustomerId) {
      const customer = Array.isArray(reservation.customer) ? reservation.customer[0] : reservation.customer;
      const name = customer
        ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
        : "another customer";
      return {
        ok: false,
        status: 409,
        error: `This item is reserved for ${name}. Release the reservation first, or sell to that customer.`,
      };
    }
  }

  const costBasis = (row.actual_cost ?? row.cost_price ?? null) as number | null;
  let grossProfit: number | null = null;
  let grossProfitNote: string | null = null;
  if (!exhaustsPiece) {
    grossProfitNote = "Partial quantity — piece cost stays on the remaining stock until it is fully sold";
  } else if (costBasis != null) {
    grossProfit = Number(sold_price) - Number(discount_amount) - Number(costBasis);
  } else {
    grossProfitNote = "Gross profit could not be calculated — no actual_cost or cost_price recorded on this piece";
  }

  let customerFields = {
    customer_first_name: "",
    customer_last_name: "",
    customer_email: "",
    customer_phone: "",
  };
  if (customer_id) {
    const { data: customerRow } = await db
      .from("customers")
      .select("first_name, last_name, email, phone")
      .eq("id", customer_id)
      .maybeSingle();
    if (customerRow) {
      const customer = customerRow as {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
      };
      customerFields = {
        customer_first_name: customer.first_name ?? "",
        customer_last_name: customer.last_name ?? "",
        customer_email: customer.email ?? "",
        customer_phone: customer.phone ?? "",
      };
    }
  }

  const now = new Date().toISOString();
  const packetFormData: PacketFormData = {
    packet_type: "stock_sale",
    customer_first_name: customerFields.customer_first_name,
    customer_last_name: customerFields.customer_last_name,
    customer_street: "",
    customer_suburb: "",
    customer_state: "",
    customer_postcode: "",
    customer_phone: customerFields.customer_phone,
    customer_email: customerFields.customer_email,
    customer_number: "",
    stock_number: "",
    valuation_required: false,
    contact_preference: [],
    articles: "",
    instructions: notes || "",
    total_charges: String(sold_price),
    deposit: "",
    in_date: now.split("T")[0],
    due_date: "",
    referral_source: "",
    occasion: "",
    staff_member: staff_id || "",
    from_date: "",
    arms_tracker_number: "",
    cad_required: false,
    layby_schedule: "",
    number_of_payments: "",
    terms_accepted: false,
    budget_range: "",
    jewellery_interests: [],
    consent_to_marketing: false,
    order_number: "",
    shipping_method: "",
    shipping_address_same: true,
    shipping_street: "",
    shipping_suburb: "",
    shipping_state: "",
    shipping_postcode: "",
    items_ordered: "",
    order_notes: "",
    tracking_number: "",
    order_source: "",
    gift_wrapping: false,
    delivery_method: "",
    carat_weight: "",
    metal_colour: "",
    job_complexity: "",
    manufacture_type: "",
    workshop_due_date: "",
    workshop_due_date_overridden: false,
  };

  const { packet, errors: packetErrors } = await createPacket(packetFormData, tenantId, supabase, {
    skipClaimSlip: true,
  });

  if (!packet) {
    return {
      ok: false,
      status: 500,
      error: `Failed to create linked packet: ${packetErrors.supabase ?? "Unknown error"}`,
    };
  }

  const saleInsert: Record<string, unknown> = {
    piece_id,
    packet_id: packet.id,
    sold_price: Number(sold_price),
    discount_amount: Number(discount_amount ?? 0),
    staff_id: staff_id || null,
    customer_id: customer_id || null,
    payment_method: payment_method || null,
    notes: notes || null,
    sold_at: now,
  };
  if (order_reference) saleInsert.order_reference = order_reference;

  const { data: sale, error: saleErr } = await db
    .from("inventory_sales")
    .insert(saleInsert)
    .select()
    .single();

  if (saleErr || !sale) {
    return { ok: false, status: 500, error: `Failed to record sale: ${saleErr?.message ?? "Unknown error"}` };
  }

  const saleRow = sale as Record<string, unknown>;
  const prevStatusId = hasStatusId ? (row.status_id ?? null) : null;

  const pieceUpdate: Record<string, unknown> = {};
  if (exhaustsPiece) {
    // Production: status_id → inventory_statuses. Staging: status text.
    // Only write the column that this database actually uses as the status machine.
    if (hasStatusId && soldStatusId) pieceUpdate.status_id = soldStatusId;
    if (!hasStatusId && "status" in row) pieceUpdate.status = "sold";
    if ("date_sold" in row) pieceUpdate.date_sold = now;
    if ("updated_at" in row) pieceUpdate.updated_at = now;
    if (quantity != null && "quantity" in row) pieceUpdate.quantity = 0;
  } else if ("quantity" in row && pieceQty != null && quantity != null) {
    pieceUpdate.quantity = pieceQty - quantity;
    if ("updated_at" in row) pieceUpdate.updated_at = now;
  }

  if (Object.keys(pieceUpdate).length > 0) {
    const { error: pieceUpdateErr } = await db
      .from("inventory_pieces")
      .update(pieceUpdate)
      .eq("id", piece_id);

    if (pieceUpdateErr) {
      return {
        ok: false,
        status: 500,
        error: `Sale recorded but failed to update piece status: ${pieceUpdateErr.message}`,
      };
    }
  }

  const active = asRecord(activeRes);
  if (active && exhaustsPiece) {
    await db
      .from("inventory_reservations")
      .update({
        status: "converted",
        released_at: now,
        converted_sale_id: saleRow.id,
        release_reason: "Converted to sale",
      })
      .eq("id", active.id);
  }

  const qtyNote = quantity != null && !exhaustsPiece ? ` (${quantity} units, stock remains)` : "";
  const movementNotes = `Sold${qtyNote}${saleRow.id ? ` — sale ref ${String(saleRow.id).slice(0, 8)}` : ""}${notes ? `: ${notes}` : ""}`;
  const movedByUuid = moved_by && UUID_RE.test(moved_by) ? moved_by : null;

  const { error: movErr } = await db.from("inventory_movements").insert({
    piece_id,
    from_status_id: exhaustsPiece ? prevStatusId : null,
    to_status_id: exhaustsPiece ? soldStatusId : null,
    from_location_id: null,
    to_location_id: null,
    moved_by: movedByUuid,
    notes: movementNotes,
    moved_at: now,
  });

  if (movErr) {
    console.error("[markPieceSold] movement insert failed:", movErr.message);
  }

  return {
    ok: true,
    sale: saleRow,
    packet,
    gross_profit: grossProfit,
    gross_profit_note: grossProfitNote,
  };
}
