// Date: YYYY-MM-DD → DD/MM/YYYY
export function formatDateAU(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

// Currency: number → $X,XXX.00
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "$0.00";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(value);
}

// Parse a currency string input to a number
export function parseCurrency(value: string): number {
  const n = parseFloat(value.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

// Compute balance
export function computeBalance(totalCharges: string, deposit: string): number {
  const total = parseCurrency(totalCharges);
  const dep = parseCurrency(deposit);
  return Math.max(0, total - dep);
}

// Packet type → human label
export function packetTypeLabel(type: string): string {
  const map: Record<string, string> = {
    repair: "Repair Job",
    custom_order: "Custom Order",
    layby: "Layby",
    client_intake: "Client Intake",
    online_order: "Online Order",
  };
  return map[type] ?? type;
}

// Today as YYYY-MM-DD
export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// Format phone for display
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/(\+61)(\d{1})(\d{4})(\d{4})/, "$1 $2 $3 $4");
}
