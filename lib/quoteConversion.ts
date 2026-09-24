/**
 * A quote becomes Job Won only after the deposit is recorded AND the order
 * packet is created. These checks run before any packet insert.
 */

export const QUOTE_PAYMENT_REQUIRED =
  "Payment has not been received. The quote was not marked Job Won and no order was created.";

export const QUOTE_NOT_FOUND =
  "Quote not found. No order was created and the quote was not marked Job Won.";

export const QUOTE_LINK_FAILED =
  "The order could not be saved. The quote was not marked Job Won.";

export const QUOTE_ALREADY_CONVERTED =
  "This quote already has an order. No additional order was created.";

export type QuoteConversionBlock = "missing" | "unpaid" | "already_converted";

export function quoteConversionBlockReason(
  quote: { deposit_paid?: boolean | null; converted_to_packet_id?: string | null } | null
): QuoteConversionBlock | null {
  if (!quote) return "missing";
  if (quote.converted_to_packet_id) return "already_converted";
  if (quote.deposit_paid !== true) return "unpaid";
  return null;
}

export function quoteConversionBlockMessage(reason: QuoteConversionBlock): string {
  if (reason === "missing") return QUOTE_NOT_FOUND;
  if (reason === "already_converted") return QUOTE_ALREADY_CONVERTED;
  return QUOTE_PAYMENT_REQUIRED;
}
