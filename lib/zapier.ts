/**
 * Zapier webhook helpers — fire-and-forget, never block responses.
 *
 * Zap 1  Order Confirmation SMS  — fires on new repair / custom_order packet
 * Zap 2  Ready for Pickup SMS    — fires when workshop packet moves to 'ready'
 */

const ZAP_ORDER_CONFIRMATION =
  process.env.ZAPIER_ORDER_CONFIRMATION_WEBHOOK ??
  "https://hooks.zapier.com/hooks/catch/16866217/4yds9xh/";

const ZAP_READY_FOR_PICKUP =
  process.env.ZAPIER_READY_PICKUP_WEBHOOK ??
  "https://hooks.zapier.com/hooks/catch/16866217/4y9iamy/";

/**
 * Formats an Australian phone number to E.164 (+61XXXXXXXXX).
 * Returns null if the result doesn't look like a valid Australian mobile.
 */
export function formatAustralianPhone(phone: string): string | null {
  // Strip whitespace, dashes, parentheses
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, "");

  let e164: string;
  if (cleaned.startsWith("+61"))    e164 = cleaned;
  else if (cleaned.startsWith("61")) e164 = "+" + cleaned;
  else if (cleaned.startsWith("0"))  e164 = "+61" + cleaned.slice(1);
  else                               return null;

  // Australian mobile: +614XXXXXXXX (12 chars total)
  if (!/^\+614\d{8}$/.test(e164)) return null;
  return e164;
}

function send(url: string, payload: Record<string, unknown>): void {
  fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  }).catch((err) => console.warn("[zapier] webhook failed:", err));
}

interface OrderPacket {
  customer_first_name?: string | null;
  customer_last_name?:  string | null;
  customer_phone?:      string | null;
  packet_type:          string;
  reference_number:     string;
  due_date?:            string | null;
}

/**
 * Zap 1 — Order Confirmation SMS.
 * Call immediately after inserting a repair or custom_order packet.
 * Only fires if the customer has a valid Australian mobile number.
 */
export function fireOrderConfirmationZap(packet: OrderPacket): void {
  if (!packet.customer_phone) return;
  const phone = formatAustralianPhone(packet.customer_phone);
  if (!phone) return;

  const customerName = [packet.customer_first_name, packet.customer_last_name]
    .filter(Boolean).join(" ") || "Customer";

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://jewelleryvault.com.au").replace(/\/$/, "");

  // Format due_date as dd/mm/yyyy
  let dueDateFormatted = "";
  if (packet.due_date) {
    const [y, m, d] = packet.due_date.split("T")[0].split("-");
    dueDateFormatted = `${d}/${m}/${y}`;
  }

  const orderType =
    packet.packet_type === "repair"       ? "Repair" :
    packet.packet_type === "custom_order" ? "Custom Order" :
    packet.packet_type;

  send(ZAP_ORDER_CONFIRMATION, {
    customer_name:    customerName,
    order_type:       orderType,
    reference_number: packet.reference_number,
    due_date:         dueDateFormatted,
    claim_slip_url:   `${appUrl}/claim/${packet.reference_number}`,
    phone_number:     phone,
    order_source:     "vault",
  });
}

interface WorkshopPacket {
  customer_first_name?: string | null;
  customer_last_name?:  string | null;
  customer_phone?:      string | null;
  job_type?:            string | null;
  packet_type?:         string | null;
  reference_number:     string;
  articles?:            string | null;
}

/**
 * Zap 2 — Ready for Pickup SMS.
 * Call when a workshop packet's status transitions TO 'ready'.
 * Only fires if the customer has a valid Australian mobile number.
 */
export function fireReadyForPickupZap(packet: WorkshopPacket): void {
  if (!packet.customer_phone) return;
  const phone = formatAustralianPhone(packet.customer_phone);
  if (!phone) return;

  const customerName = [packet.customer_first_name, packet.customer_last_name]
    .filter(Boolean).join(" ") || "Customer";

  const orderType =
    packet.job_type === "repair"        ? "Repair" :
    packet.job_type === "custom_order"  ? "Custom Order" :
    packet.job_type === "online_order"  ? "Online Order" :
    packet.job_type === "stock_work"    ? "Stock Work" :
    packet.packet_type ?? "Order";

  send(ZAP_READY_FOR_PICKUP, {
    customer_name:    customerName,
    order_type:       orderType,
    reference_number: packet.reference_number,
    articles:         packet.articles ?? "",
    phone_number:     phone,
    order_source:     "vault",
  });
}
