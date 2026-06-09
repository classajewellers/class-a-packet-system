import { Packet, PacketType } from "./types";
import { formatDateAU } from "./formatters";

const BASE_URL = "https://api.podium.com/v4";

function buildMessage(packet: Packet): string {
  const firstName = packet.customer_first_name ?? "there";
  const ref = packet.reference_number;
  const due = formatDateAU(packet.due_date);

  switch (packet.packet_type as PacketType) {
    case "repair":
    case "custom_order":
      return `Hi ${firstName}, thanks for visiting Vault! Your job ref is ${ref}. We'll have it ready by ${due}. Any questions, call us on +61 8 8344 7722. - Class A Team`;

    case "layby":
      return `Hi ${firstName}, your layby ref is ${ref}. Next payment due ${due}. Questions? Call +61 8 8344 7722. - Class A Team`;

    case "client_intake":
      return `Hi ${firstName}, thanks for visiting Vault! We've noted your preferences and will be in touch when we find something perfect for you. - Class A Team`;

    case "online_order":
      return `Hi ${firstName}, thanks for your online order with Vault! Your order ref is ${ref}. We'll be in touch shortly with shipping details. Questions? Call +61 8 8344 7722. - Class A Team`;

    default:
      return `Hi ${firstName}, thanks for visiting Vault! Your ref is ${ref}. - Class A Team`;
  }
}

export async function sendPodiumSMS(packet: Packet): Promise<void> {
  const apiKey = process.env.PODIUM_API_KEY;
  const locationId = process.env.PODIUM_LOCATION_ID;

  if (!apiKey || !locationId) {
    throw new Error("Podium API key or location ID not configured");
  }

  if (!packet.customer_phone) {
    throw new Error("No customer phone number provided");
  }

  const message = buildMessage(packet);

  const body = {
    locationUid: locationId,
    phoneNumber: packet.customer_phone,
    body: message,
  };

  const res = await fetch(`${BASE_URL}/messages/send`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Podium SMS failed (${res.status}): ${text}`);
  }
}
