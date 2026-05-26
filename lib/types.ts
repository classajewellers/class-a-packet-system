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

  // Quote conversion
  from_quote_id?: string;

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

  // Gift & Delivery (repair / custom_order)
  gift_wrapping: boolean;
  delivery_method: string;
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
  gift_wrapping: false,
  delivery_method: "Pickup",
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

  // Staff notes — internal only, not printed on labels
  internal_notes: string | null;

  // Gift & Delivery
  gift_wrapping: boolean | null;
  delivery_method: string | null;

  // Valuation
  item_specifications: Record<string, unknown> | null;
  valuation_status: string | null;
  valuation_approved_at: string | null;
  valuation_approved_by: string | null;
  estimated_replacement_value: number | null;
  valuation_certificate_number: string | null;

  // Claim slip tracking
  claim_slip_sent?: boolean | null;
  claim_slip_url?: string | null;
  claim_slip_sent_at?: string | null;
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
  label?: OutputStatus;
  klaviyo?: OutputStatus;
  email?: OutputStatus;
  sms?: OutputStatus;
  sheets?: OutputStatus;
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

// ─────────────────────────────────────────────
// Quotes
// ─────────────────────────────────────────────
export type QuoteType = "repair" | "custom_order";

export interface LineItem {
  design: string;
  stone: string;
  /** Retail price — what the customer pays. Shown on quotes and PDFs. */
  price: string;
  /** Cost price — what we pay. Manager/admin only. Never on customer documents. */
  cost_price?: string;
}

export interface Quote {
  id: string;
  created_at: string;
  reference_number: string;
  quote_type: QuoteType;
  status: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  item_description: string | null;
  line_items: LineItem[] | null;
  notes: string | null;
  repair_description: string | null;
  design_brief: string | null;
  metal_type: string | null;
  stone_details: string | null;
  estimated_turnaround: string | null;
  staff_member: string | null;
  converted_to_packet_id: string | null;
  converted_at: string | null;
  packet_reference: string | null;
  // CRM pipeline fields
  assigned_to: string | null;
  follow_up_date: string | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
  pending_at: string | null;
  follow_up_1_at: string | null;
  follow_up_2_at: string | null;
  job_won_at: string | null;
  job_lost_at: string | null;
  // legacy compat — may be null on new quotes
  total?: number | null;
  // Quote builder fields
  quote_builder_data?: Record<string, unknown> | null;
  quoted_price?: number | null;
}

// ─────────────────────────────────────────────
// Workshop
// ─────────────────────────────────────────────
export interface ComponentItem {
  id: string;
  name: string;
  quantity: string;
  status: "ordered" | "arrived" | "checked";
  notes?: string;
}

export interface WorkshopJob {
  id: string;
  created_at: string;
  packet_id: string | null;
  reference_number: string | null;
  customer_surname: string | null;
  description: string | null;
  category: string;
  complexity: string;
  stage: string;
  assigned_jeweller: string | null;
  due_date: string | null;
  instructions: string | null;
  is_subcontractor: boolean;
  subcontractor_name: string | null;
  subcontractor_due_date: string | null;
  subcontractor_instructions: string | null;
  subcontractor_status: string | null;
  job_type: string;
  notes: string | null;
  stage_changed_at: string;
  components: ComponentItem[];
}

// ─────────────────────────────────────────────
// Valuation
// ─────────────────────────────────────────────
export interface StoneSpec {
  id: string;
  stone_type: string;
  certificate_lab: string;
  certificate_number: string;
  shape: string;
  carat_weight: string;
  colour_grade: string;
  clarity_grade: string;
  cut_grade: string;
  polish: string;
  symmetry: string;
  fluorescence: string;
  measurements: string;
  setting_type: string;
}

export interface ItemSpecifications {
  metal_type: string;
  metal_weight: string;
  hallmark: string;
  finish: string;
  stones: StoneSpec[];
  accent_description: string;
  accent_carat_weight: string;
  item_type: string;
  ring_size: string;
  item_description: string;
}

export interface QuoteFormData {
  quote_type: QuoteType | "";
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  customer_phone: string;
  line_items: LineItem[];
  notes: string;
  staff_member: string;
  assigned_to?: string;
  follow_up_date: string;
  from_quote_id?: string;
}
