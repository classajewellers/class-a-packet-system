export const PO_PDF_MIGRATION = "supabase/migrations/167_po_pdf_redesign.sql";

export const PO_PDF_MIGRATION_HINT =
  "Ask Vault DB to apply supabase/migrations/167_po_pdf_redesign.sql on staging. It adds the ABN, supplier address, payment terms, ship-to address, and line SKU. Nothing else was changed.";

export function poPdfSchemaError(error: { message?: string; code?: string } | null | undefined): string | null {
  const message = error?.message ?? "";
  const missing = error?.code === "42703"
    || error?.code === "PGRST204"
    || /schema cache/i.test(message);
  if (!missing) return null;
  if (!/abn|payment_terms|ship_to_address|\bsku\b|address/.test(message)) return null;
  return PO_PDF_MIGRATION_HINT;
}
