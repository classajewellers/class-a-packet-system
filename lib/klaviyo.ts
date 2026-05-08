import { Packet, PacketType } from "./types";
import { formatDateAU, formatCurrency, packetTypeLabel } from "./formatters";

const BASE_URL = "https://a.klaviyo.com/api";

function headers() {
  return {
    accept: "application/json",
    revision: "2024-06-15",
    "content-type": "application/json",
    Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_API_KEY}`,
  };
}

// ─── Upsert profile ──────────────────────────────────────────────────────────
export async function upsertKlaviyoProfile(packet: Packet): Promise<void> {
  const addressLine = [
    packet.customer_street,
    packet.customer_suburb,
    packet.customer_state,
  ]
    .filter(Boolean)
    .join(", ");

  const body = {
    data: {
      type: "profile",
      attributes: {
        email: packet.customer_email,
        first_name: packet.customer_first_name,
        last_name: packet.customer_last_name,
        phone_number: packet.customer_phone,
        location: {
          address1: addressLine,
          zip: packet.customer_postcode,
        },
        properties: {
          last_packet_type: packet.packet_type,
          last_reference_number: packet.reference_number,
          last_visit_date: packet.in_date,
          last_articles: packet.articles,
          last_due_date: packet.due_date,
          referral_source: packet.referral_source,
          contact_preference: packet.contact_preference,
          valuation_required: packet.valuation_required,
          occasion: packet.occasion,
          consent_to_marketing:
            packet.packet_data?.consent_to_marketing ?? false,
        },
      },
    },
  };

  const res = await fetch(`${BASE_URL}/profiles/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  // 409 = profile already exists, which is fine (Klaviyo returns the existing profile)
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`Klaviyo upsert profile failed (${res.status}): ${text}`);
  }
}

// ─── Fire event ───────────────────────────────────────────────────────────────
const eventNameMap: Record<PacketType, string> = {
  repair: "Repair Job Submitted",
  custom_order: "Custom Order Submitted",
  layby: "Layby Created",
  client_intake: "Client Intake Completed",
  online_order: "Online Order Created",
};

export async function fireKlaviyoEvent(packet: Packet): Promise<void> {
  const eventName = eventNameMap[packet.packet_type] ?? "Packet Submitted";

  const body = {
    data: {
      type: "event",
      attributes: {
        metric: { data: { type: "metric", attributes: { name: eventName } } },
        profile: { data: { type: "profile", attributes: { email: packet.customer_email } } },
        properties: {
          reference_number: packet.reference_number,
          packet_type: packet.packet_type,
          articles: packet.articles,
          instructions: packet.instructions,
          total_charges: packet.total_charges,
          deposit: packet.deposit,
          balance: packet.balance,
          in_date: packet.in_date,
          due_date: packet.due_date,
          staff_member: packet.staff_member,
          referral_source: packet.referral_source,
          occasion: packet.occasion,
          valuation_required: packet.valuation_required,
          contact_preference: packet.contact_preference,
          repair_tracker_number: packet.repair_tracker_number,
          order_number: packet.order_number,
          shipping_method: packet.shipping_method,
          order_source: packet.order_source,
          ...packet.packet_data,
        },
      },
    },
  };

  const res = await fetch(`${BASE_URL}/events/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Klaviyo fire event failed (${res.status}): ${text}`);
  }
}

// ─── Confirmation email event ─────────────────────────────────────────────────
export async function sendKlaviyoConfirmationEmail(packet: Packet): Promise<void> {
  const customerName = [packet.customer_first_name, packet.customer_last_name]
    .filter(Boolean)
    .join(" ");

  const addressLine = [
    packet.customer_street,
    packet.customer_suburb,
    packet.customer_state,
    packet.customer_postcode,
  ]
    .filter(Boolean)
    .join(", ");

  const fullSummary = [
    `Reference: ${packet.reference_number}`,
    `Type: ${packetTypeLabel(packet.packet_type)}`,
    `Customer: ${customerName}`,
    `Phone: ${packet.customer_phone ?? ""}`,
    `Email: ${packet.customer_email ?? ""}`,
    `Address: ${addressLine}`,
    `Articles: ${packet.articles ?? ""}`,
    `Instructions: ${packet.instructions ?? ""}`,
    `In Date: ${formatDateAU(packet.in_date)}`,
    `Due Date: ${formatDateAU(packet.due_date)}`,
    `Total Charges: ${formatCurrency(packet.total_charges)}`,
    `Deposit: ${formatCurrency(packet.deposit)}`,
    `Balance: ${formatCurrency(packet.balance)}`,
    `Staff: ${packet.staff_member ?? ""}`,
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    data: {
      type: "event",
      attributes: {
        metric: {
          data: {
            type: "metric",
            attributes: { name: "Packet Confirmation Email" },
          },
        },
        profile: {
          data: {
            type: "profile",
            attributes: { email: packet.customer_email },
          },
        },
        properties: {
          customer_name: customerName,
          customer_email: packet.customer_email,
          reference_number: packet.reference_number,
          packet_type: packetTypeLabel(packet.packet_type),
          articles: packet.articles,
          instructions: packet.instructions,
          in_date: formatDateAU(packet.in_date),
          due_date: formatDateAU(packet.due_date),
          total_charges: formatCurrency(packet.total_charges),
          deposit: formatCurrency(packet.deposit),
          balance: formatCurrency(packet.balance),
          staff_member: packet.staff_member,
          store_name: "Class A Jewellers",
          store_phone: "+61 8 8344 7722",
          store_email: "customercare@classa.com.au",
          store_address: "40 North East Road, Walkerville SA 5081",
          disclaimer:
            "This confirmation records the details of your item(s) as provided at time of drop-off. Please contact us within 24 hours if any details are incorrect. This store is not responsible for articles left over 30 days. No article can be picked up without your receipt.",
          full_summary: fullSummary,
        },
      },
    },
  };

  const res = await fetch(`${BASE_URL}/events/`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Klaviyo confirmation email failed (${res.status}): ${text}`);
  }
}
