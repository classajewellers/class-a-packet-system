import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * POS-YYYYMMDD-XXXX, same daily_counters shape as CA- / QT- / ON- numbers.
 * The date is the UTC day, matching generateReferenceNumber.
 * If the counter RPC is missing, fall back to a timestamp suffix so the sale
 * can still finish; receipt_number is UNIQUE so a collision retries once.
 */
export async function generatePosReceiptNumber(tenantId: string, date?: Date): Promise<string> {
  const d = date ?? new Date();
  const isoDate = d.toISOString().split("T")[0];
  const dateCompact = isoDate.replace(/-/g, "");

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("increment_pos_receipt_counter", {
    input_date: isoDate,
    input_tenant_id: tenantId,
  });

  if (error || data == null) {
    console.warn("[pos] increment_pos_receipt_counter failed, using timestamp suffix:", error?.message);
    return `POS-${dateCompact}-${String(Date.now()).slice(-6)}`;
  }

  return `POS-${dateCompact}-${String(data).padStart(4, "0")}`;
}
