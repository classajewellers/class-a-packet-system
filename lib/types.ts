// ─────────────────────────────────────────────
// Packet types
// ─────────────────────────────────────────────
export type PacketType = "repair" | "custom_order" | "layby" | "client_intake" | "online_order";

// ─────────────────────────────────────────────
// Form state (client-side)
// ─────────────────────────────────────────────
export interface PacketFormData {
  packet_type: PacketType | "";

  // Customer
  customer_first_name: string;
  customer_last_name: string;
  customer_street: string;
  customer_suburb: string;
  customer_state: string;
  customer_postcode: string;
  customer_phone: string;
  customer_email: string;
  customer_number: string;
  stock_number: string;

  // Value & Contact
  valuation_required: boolean;
  contact_preference: string[];

  // Articles & Instructions
  articles: string;
  instructions: string;

  // Pricing
  total_charges: string;
  deposit: string;

  // Dates
  in_date: string;
  due_date: string;

  // Referral & Staff
  referral_source: string;
  occasion: string;
  staff_member: string;

  // Repair / Custom Order
  from_date: string;

  // Layby
  layby_schedule: string;
  number_of_payments: string;
  terms_accepted: boolean;

  // Client Intake
  budget_range: string;
  jewellery_interests: string[];
  consent_to_marketing: boolean;

  // Online Order
  order_number: string;
  shipping_method: string;
  shipping_address_same: boolean;
  shipping_street: string;
  shipping_suburb: string;
  shipping_state: string;
  shipping_postcode: string;
  items_ordered: string;
  order_notes: string;
  tracking_number: string;
  order_source: string;
}

export const defaultFormData: PacketFormData = {
  packet_type: "",
  customer_first_name: "",
  customer_last_name: "",
  customer_street: "",
  customer_suburb: "",
  customer_state: "",
  customer_postcode: "",
  customer_phone: "",
  customer_email: "",
  customer_number: "",
  stock_number: "",
  valuation_required: false,
  contact_preference: [],
  articles: "",
  instructions: "",
  total_charges: "",
  deposit: "",
  in_date: new Date().toISOString().split("T")[0],
  due_date: "",
  referral_source: "",
  occasion: "",
  staff_member: "",
  from_date: new Date().toISOString().split("T")[0],
  layby_schedule: "",
  number_of_payments: "",
  terms_accepted: false,
  budget_range: "",
  jewellery_interests: [],
  consent_to_marketing: false,
  order_number: "",
  shipping_method: "",
  shipping_address_same: true,
  shipping_street: "",
  shipping_suburb: "",
  shipping_state: "",
  shipping_postcode: "",
  items_ordered: "",
  order_notes: "",
  tracking_number: "",
  order_source: "",
};

// ─────────────────────────────────────────────
// Database row shape
// ─────────────────────────────────────────────
export interface Packet {
  id: string;
  created_at: string;
  reference_number: string;
  packet_type: PacketType;

  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_street: string | null;
  customer_suburb: string | null;
  customer_state: string | null;
  customer_postcode: string | null;
  customer_number: string | null;
  stock_number: string | null;

  valuation_required: boolean;
  contact_preference: string[] | null;

  articles: string | null;
  instructions: string | null;

  total_charges: number | null;
  deposit: number | null;
  balance: number | null;

  in_date: string | null;
  due_date: string | null;

  referral_source: string | null;
  occasion: string | null;
  staff_member: string | null;

  repair_tracker_number: string | null;
  from_date: string | null;

  collected_date: string | null;
  signed_by: string | null;

  klaviyo_synced: boolean;
  email_sent: boolean;
  sms_sent: boolean;
  label_printed: boolean;
  sheets_logged: boolean;

  // Online order fields
  order_number: string | null;
  shipping_method: string | null;
  shipping_address_same: boolean | null;
  shipping_street: string | null;
  shipping_suburb: string | null;
  shipping_state: string | null;
  shipping_postcode: string | null;
  items_ordered: string | null;
  order_notes: string | null;
  tracking_number: string | null;
  order_source: string | null;

  packet_data: Record<string, unknown> | null;
}

// ─────────────────────────────────────────────
// API payloads
// ─────────────────────────────────────────────
export interface SubmitPayload {
  formData: PacketFormData;
}

export type OutputStatus = "success" | "failed" | "pending";

export interface SubmissionResults {
  supabase: OutputStatus;
  label: OutputStatus;
  klaviyo: OutputStatus;
  email: OutputStatus;
  sms: OutputStatus;
  sheets: OutputStatus;
}

export interface SubmitResponse {
  packet: Packet;
  results: Omit<SubmissionResults, "label">; // label handled client-side
  errors: Record<string, string>;
}

export interface RetryPayload {
  packetId: string;
  output: "klaviyo" | "email" | "sms" | "sheets" | "label";
}

export interface RetryResponse {
  success: boolean;
  error?: string;
}

// ─────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────
export interface AdminPacketsQuery {
  search?: string;
  type?: PacketType | "all";
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}
