import { createServiceClient } from "./supabase";
import { PacketType } from "./types";

// CA-YYYYMMDD-XXXX (standard packets) or ON-YYYYMMDD-XXXX (online orders)
export async function generateReferenceNumber(
  date?: Date,
  packetType?: PacketType | ""
): Promise<string> {
  const d = date ?? new Date();
  const isoDate = d.toISOString().split("T")[0];

  const supabase = createServiceClient();
  const isOnline = packetType === "online_order";

  const { data, error } = await supabase.rpc(
    isOnline ? "increment_online_order_counter" : "increment_packet_counter",
    { input_date: isoDate }
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
export async function generateQuoteReferenceNumber(date?: Date): Promise<string> {
  const d = date ?? new Date();
  const isoDate = d.toISOString().split("T")[0];

  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("increment_quote_counter", {
    input_date: isoDate,
  });

  if (error) throw new Error(`Failed to generate quote reference number: ${error.message}`);

  const count = data as number;
  const dateCompact = isoDate.replace(/-/g, "");
  const sequence = String(count).padStart(4, "0");

  return `QT-${dateCompact}-${sequence}`;
}
