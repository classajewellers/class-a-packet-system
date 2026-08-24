import { createServerSupabaseClient } from "./supabase-server";
import { PacketType } from "./types";

// CA-YYYYMMDD-XXXX (standard packets) or ON-YYYYMMDD-XXXX (online orders)
export async function generateReferenceNumber(
  tenantId: string,
  date?: Date,
  packetType?: PacketType | ""
): Promise<string> {
  const d = date ?? new Date();
  const isoDate = d.toISOString().split("T")[0];

  const supabase = createServerSupabaseClient();
  const isOnline = packetType === "online_order";

  const { data, error } = await supabase.rpc(
    isOnline ? "increment_online_order_counter" : "increment_packet_counter",
    { input_date: isoDate, input_tenant_id: tenantId }
  );

  if (error) throw new Error(`Failed to generate reference number: ${error.message}`);

  const count = data as number;
  const dateCompact = isoDate.replace(/-/g, "");
  const sequence = String(count).padStart(4, "0");
  const prefix = isOnline ? "ON" : "CA";

  return `${prefix}-${dateCompact}-${sequence}`;
}

// RT-YYYYMMDD-XXXX (repair tracker, derived from CA reference)
export function generateRepairTrackerNumber(referenceNumber: string): string {
  return referenceNumber.replace(/^CA-/, "RT-");
}

// QT-YYYYMMDD-XXXX (quotes)
// Falls back to a timestamp-based suffix if the RPC doesn't exist yet.
export async function generateQuoteReferenceNumber(tenantId: string, date?: Date): Promise<string> {
  const d = date ?? new Date();
  const isoDate = d.toISOString().split("T")[0];
  const dateCompact = isoDate.replace(/-/g, "");

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("increment_quote_counter", {
    input_date: isoDate,
    input_tenant_id: tenantId,
  });

  if (error) {
    // RPC missing or failed — use a timestamp-based suffix so the quote still saves.
    console.warn(
      "[referenceNumber] increment_quote_counter RPC failed, using timestamp fallback:",
      { code: error.code, message: error.message }
    );
    // Last 6 digits of current ms timestamp → unique within the session
    const suffix = String(Date.now()).slice(-6);
    return `QT-${dateCompact}-${suffix}`;
  }

  const count = data as number;
  const sequence = String(count).padStart(4, "0");
  return `QT-${dateCompact}-${sequence}`;
}
