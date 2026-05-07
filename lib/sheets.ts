import { google } from "googleapis";
import { Packet } from "./types";
import { formatDateAU, formatCurrency, packetTypeLabel } from "./formatters";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !privateKey) {
    throw new Error("Google service account credentials not configured");
  }

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export async function appendToSheet(packet: Packet): Promise<void> {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  if (!sheetId) throw new Error("GOOGLE_SHEETS_ID not configured");

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const customerName = [packet.customer_first_name, packet.customer_last_name]
    .filter(Boolean)
    .join(" ");

  // Base columns: Timestamp | Reference No. | Packet Type | Customer Name | Phone |
  // Email | Articles | Instructions | Total Charges | Deposit | Balance |
  // Due Date | Staff Member | Referral Source | ARMS Entered | Notes
  const row = [
    new Date().toISOString(),
    packet.reference_number,
    packetTypeLabel(packet.packet_type),
    customerName,
    packet.customer_phone ?? "",
    packet.customer_email ?? "",
    packet.articles ?? "",
    packet.instructions ?? "",
    formatCurrency(packet.total_charges),
    formatCurrency(packet.deposit),
    formatCurrency(packet.balance),
    formatDateAU(packet.due_date),
    packet.staff_member ?? "",
    packet.referral_source ?? "",
    "", // ARMS Entered — staff tick manually
    "", // Notes
    // Online order extra columns (empty for non-online orders)
    packet.order_number ?? "",
    packet.shipping_method ?? "",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "Sheet1!A:R",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}
