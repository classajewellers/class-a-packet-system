// Grace ATP feature — quote-lifecycle reservation wiring.
//
// IMPORTANT: this deliberately does NOT touch inventory_pieces.status_id or
// call the "resolve a Reserved status + update the piece" logic that
// app/api/inventory/reservations/route.ts uses, because that logic is
// currently broken against live staging — confirmed 2026-09-23,
// inventory_pieces.status_id does not exist as a column at all, and even if
// it did, 'reserved' is not a valid value in inventory_pieces' own `status`
// text CHECK constraint (in_stock|on_order|sold|workshop|consignment|repair
// — migration 030). This looks like a pre-existing bug in the manual
// Reserve button (app/inventory/[id]/page.tsx) unrelated to Grace — flagged
// separately, not fixed here, since it needs its own investigation/decision.
//
// Grace's own ATP math only needs the inventory_reservations rows
// themselves (committed = active reservations), so this only creates/
// releases those rows — it does not attempt to flip the piece's visible
// status or log an inventory_movements row.
//
// A stock piece attached to a quote is identified by
// quote_builder_data.builder_items[].linked_piece_id (the v2 quote builder
// schema — app/quotes/builder/new/page.tsx). Older/legacy quote shapes
// (line_items jsonb, repair quotes) carry no linked_piece_id and are
// correctly skipped — there is nothing to reserve for a bespoke/repair line.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAny = any;

interface QuoteBuilderItem {
  linked_piece_id?: string | null;
}

function extractLinkedPieceIds(quoteBuilderData: unknown): string[] {
  if (!quoteBuilderData || typeof quoteBuilderData !== "object") return [];
  const items = (quoteBuilderData as { builder_items?: QuoteBuilderItem[] }).builder_items;
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => i.linked_piece_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

// Auto-creates an active reservation for every stock piece attached to a
// won quote, unless that piece already has one (the one-active-per-piece
// unique index — see migration 081 — is the source of truth; a 23505 here
// just means someone/something else already holds it, which is reported,
// not treated as a fatal error for the quote status update).
export async function autoReserveQuoteItems(
  supabase: SupabaseAny,
  tenantId: string,
  quote: { id: string; quote_builder_data?: unknown; customer_id?: string | null }
): Promise<{ reserved: string[]; skipped: Array<{ pieceId: string; reason: string }> }> {
  const pieceIds = extractLinkedPieceIds(quote.quote_builder_data);
  const reserved: string[] = [];
  const skipped: Array<{ pieceId: string; reason: string }> = [];
  if (pieceIds.length === 0) return { reserved, skipped };

  for (const pieceId of pieceIds) {
    const { data: piece } = await supabase
      .from("inventory_pieces")
      .select("id")
      .eq("id", pieceId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!piece) {
      skipped.push({ pieceId, reason: "Piece not found for this tenant" });
      continue;
    }

    const { data: existing } = await supabase
      .from("inventory_reservations")
      .select("id, quote_id")
      .eq("piece_id", pieceId)
      .eq("status", "active")
      .maybeSingle();
    if (existing) {
      skipped.push({
        pieceId,
        reason: existing.quote_id === quote.id
          ? "Already reserved for this quote"
          : "Already has an active reservation from elsewhere",
      });
      continue;
    }

    const { error: insertErr } = await supabase.from("inventory_reservations").insert({
      tenant_id: tenantId,
      piece_id: pieceId,
      customer_id: quote.customer_id ?? null,
      reason: "Auto-reserved — quote won",
      quote_id: quote.id,
      status: "active",
    });
    if (insertErr) {
      skipped.push({ pieceId, reason: insertErr.code === "23505" ? "Reserved concurrently by another process" : insertErr.message });
      continue;
    }

    reserved.push(pieceId);
  }

  return { reserved, skipped };
}

// Releases every active reservation tied to a quote that was just marked lost.
export async function autoReleaseQuoteReservations(
  supabase: SupabaseAny,
  tenantId: string,
  quoteId: string
): Promise<{ released: string[] }> {
  const { data: activeReservations } = await supabase
    .from("inventory_reservations")
    .select("id, piece_id")
    .eq("tenant_id", tenantId)
    .eq("quote_id", quoteId)
    .eq("status", "active");

  const released: string[] = [];
  const now = new Date().toISOString();
  for (const r of activeReservations ?? []) {
    await supabase
      .from("inventory_reservations")
      .update({ status: "released", released_at: now, release_reason: "Auto-released — quote lost" })
      .eq("id", r.id);
    released.push(r.piece_id);
  }
  return { released };
}
