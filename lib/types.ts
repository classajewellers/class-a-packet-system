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
  arms_tracker_number: string;
  cad_required: boolean;

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

  // Jewellery details — PCN and custom orders
  carat_weight: string;
  metal_colour: string;

  // Workshop scheduling
  job_complexity: string;
  manufacture_type: string;
  workshop_due_date: string;
  workshop_due_date_overridden: boolean;
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
  arms_tracker_number: "",
  cad_required: false,
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
  carat_weight: "",
  metal_colour: "",
  job_complexity: "Standard",
  manufacture_type: "Fully Finished",
  workshop_due_date: "",
  workshop_due_date_overridden: false,
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
  product_category: string | null;
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

  // Jewellery details — PCN and custom orders
  carat_weight: number | null;
  metal_colour: string | null;

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

  // Valuation photo (stored as storage path)
  valuation_photo_url?: string | null;

  // Workshop scheduling (added via migration 045+)
  job_complexity: string | null;
  manufacture_type: string | null;
  workshop_due_date: string | null;
  workshop_due_date_overridden: boolean | null;
  workshop_supplier: string | null;
  workshop_supplier_sent_date: string | null;
  workshop_supplier_expected_return: string | null;
  workshop_supplier_returned: boolean | null;

  // Workshop kanban (migration 058)
  status: string | null;
  job_type: string | null;
  assigned_to: string | null;
  status_updated_at: string | null;
  collected_at: string | null;
  collection_notified_at: string | null;
  // Joined from profiles
  assigned_to_name?: string | null;

  // Workshop packet link (migration 060)
  source_order_ref?: string | null;
}

// ─────────────────────────────────────────────
// Attachments
// ─────────────────────────────────────────────
export type AttachmentType =
  | 'photo' | 'certificate' | 'invoice' | 'valuation'
  | 'cad_file' | 'workshop_document' | 'other';

export interface Attachment {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
  // extended fields (added migration 083)
  attachment_type?: AttachmentType | null;
  display_name?: string | null;
  notes?: string | null;
  archived?: boolean;
  // client-side: signed URL generated server-side
  signed_url?: string | null;
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

export interface BuilderItem {
  id: string;
  job_type: string;      // 'Engagement Ring' | 'Wedding Ring' | 'Fine Jewellery' | 'Repair' | 'Other'
  description: string;
  retail_price: string;  // numeric string, e.g. "1500"
  cost_price: string;    // numeric string, manager/admin only
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
  /** Job category shown as the heading on customer PDFs (set in quote builder). */
  job_type?: string | null;
  /** Free-text description printed on customer PDFs exactly as typed. */
  job_description?: string | null;
  ai_description?: string | null;
  finger_size?: string | null;
  /** Index of the accepted stone option (set when customer confirms). */
  accepted_option?: number | null;
  stock_sku?: string | null;
  // Stripe payment link fields
  stripe_payment_link_id?: string | null;
  stripe_payment_link_url?: string | null;
  deposit_amount?: number | null;
  deposit_paid?: boolean | null;
  deposit_paid_at?: string | null;
  // Follow-up reminder schedule
  follow_up_7d?: string | null;
  follow_up_14d?: string | null;
  follow_up_1m?: string | null;
  follow_up_3m?: string | null;
  follow_up_6m?: string | null;
  follow_up_notes?: string | null;
}

// ─────────────────────────────────────────────
// Inventory
// ─────────────────────────────────────────────

export interface InventoryStatus {
  id: string;
  tenant_id: string;
  name: string;
  colour: string;
  sort_order: number;
  is_active: boolean;
}

export interface InventoryLocation {
  id: string;
  tenant_id?: string;
  name: string;
  type: "Storage" | "Display" | "Service" | "External" | "Transit" | InventoryLocationType;
  sort_order?: number;
  is_active?: boolean;
  // legacy fields
  bin_code_format?: string | null;
  shopify_visible?: boolean;
  parent_id?: string | null;
  created_at?: string;
}

export interface InventoryCategory {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface InventorySupplier {
  id: string;
  tenant_id?: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_active?: boolean;
  // legacy fields
  lead_time_days?: number | null;
  created_at?: string;
}

export interface InventoryMovement {
  id: string;
  tenant_id?: string;
  // new schema
  piece_id?: string;
  from_status_id?: string | null;
  to_status_id?: string | null;
  moved_by?: string | null;
  moved_at?: string;
  // shared fields
  from_location_id: string | null;
  to_location_id: string | null;
  notes: string | null;
  // legacy schema fields
  item_id?: string;
  quantity?: number;
  movement_type?: InventoryMovementType;
  reference?: string | null;
  created_by?: string | null;
  created_at?: string;
  // joined (legacy)
  item?: { name: string; sku: string } | null;
}

export interface InventoryPiece {
  id: string;
  tenant_id: string;
  sku: string;
  title: string | null;
  category_id: string | null;
  collection: string | null;
  status_id: string | null;
  location_id: string | null;
  assigned_to: string | null;
  supplier_id: string | null;
  metal_type: string | null;
  metal_karat: string | null;
  metal_colour: string | null;
  metal_weight_grams: number | null;
  finger_size: string | null;
  chain_length: string | null;
  dimensions: string | null;
  diamond_type: string | null;
  diamond_carat: number | null;
  diamond_colour: string | null;
  diamond_clarity: string | null;
  diamond_certificate: string | null;
  valuation_number: string | null;
  valuation_amount: number | null;
  cost_price: number | null;
  retail_price: number | null;
  locked_cost: number | null;
  stone_cost: number | null;
  labour_cost: number | null;
  date_received: string | null;
  date_sold: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  // melee stone fields
  melee_quantity?: number | null;
  melee_carat_weight?: number | null;
  melee_colour_group?: string | null;
  melee_clarity?: string | null;
  // product hierarchy
  product_id?: string | null;
  variant_id?: string | null;
  // legacy fields
  design_id?: string | null;
  other_specs?: string | null;
  // joined relations
  status?: InventoryStatus | null;
  location?: InventoryLocation | null;
  category?: InventoryCategory | null;
  supplier?: InventorySupplier | null;
  design?: InventoryDesign | null;
}

export interface InventoryReferenceData {
  statuses: InventoryStatus[];
  locations: InventoryLocation[];
  categories: InventoryCategory[];
  suppliers: InventorySupplier[];
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
  track: string;                          // 'repair' | 'collections' | 'manufacturing'
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
  // Manufacturing WSJB QC pre-check checklist
  wsjb_precheck_complete: boolean | null;
  wsjb_subcontractor_required: boolean | null;
  wsjb_subcontractor_name: string | null;
  wsjb_ready_for_jeweller: boolean | null;
  // Valuation flag — inherited from packet at intake
  valuation_required: boolean | null;
  // Workshop supplier tracking
  workshop_supplier: string | null;
  workshop_supplier_sent_date: string | null;
  workshop_supplier_expected_return: string | null;
  workshop_supplier_returned: boolean | null;
  manufacture_type: string | null;
  workshop_due_date: string | null;
  workshop_due_date_overridden: boolean | null;
}

// ─────────────────────────────────────────────
// Job List (Workshop major/minor job lists)
// ─────────────────────────────────────────────
export interface JobListItem {
  id: string;
  reference_number: string | null;
  in_date: string | null;
  customer_last_name: string | null;
  instructions: string | null;
  articles: string | null;
  product_category: string | null;
  staff_member: string | null;
  assigned_jeweller?: string | null;
  workshop_due_date: string | null;
  workshop_due_date_overridden: boolean | null;
  manufacture_type: string | null;
  job_complexity: string | null;
  workshop_supplier: string | null;
  collected_date: string | null;
  packet_type: string;
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

// ─────────────────────────────────────────────
// Inventory — legacy types (pre-schema-migration)
// ─────────────────────────────────────────────
export type InventoryLocationType = 'display' | 'storage' | 'workshop' | 'transit' | 'consignment';
export type InventoryItemType = 'retail' | 'internal';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  item_type: InventoryItemType;
  category: string | null;
  department: string | null;
  supplier_id: string | null;
  supplier_code: string | null;
  cost_price: number | null;
  retail_price: number | null;
  packaging_cost: number | null;
  landed_cost: number | null;
  reorder_point: number | null;
  metal_type: string | null;
  metal_weight_grams: number | null;
  location_id: string | null;
  shopify_synced: boolean;
  notes: string | null;
  created_at: string;
  // Joined fields (optional)
  supplier?: InventorySupplier | null;
  location?: InventoryLocation | null;
  total_stock?: number | null;
}

export interface InventoryStockRow {
  id: string;
  item_id: string;
  location_id: string;
  quantity: number;
  updated_at: string;
}

export type InventoryMovementType =
  | 'receive' | 'transfer' | 'sale' | 'return'
  | 'adjustment' | 'workshop_in' | 'workshop_out' | 'stocktake';

// ─────────────────────────────────────────────
// Inventory — Products / Variants / BOM / Purchases / Gold pricing
// ─────────────────────────────────────────────
export type MetalCarat = '9K' | '18K' | 'Platinum' | 'Silver' | 'Other';
export type MetalColour = 'Yellow' | 'White' | 'Rose' | 'N/A';
export type DiamondType = 'Natural' | 'Lab Grown' | 'None';
export type BomComponentType = 'casting' | 'diamond' | 'labour' | 'settings' | 'findings' | 'other';
export type InvoiceStatus = 'pending' | 'received' | 'partial' | 'disputed';

export interface InventoryProduct {
  id: string;
  tenant_id?: string;
  name: string;
  category_id?: string | null;
  collection?: string | null;
  design?: string | null;
  style?: string | null;
  setting_type?: string | null;
  marketing_description?: string | null;
  website_description?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  care_instructions?: string | null;
  created_at: string;
  // Computed
  piece_count?: number;
  // Joined
  category?: { id: string; name: string } | string | null;
}

export interface InventoryVariant {
  id: string;
  product_id: string;
  tenant_id?: string;
  // New schema
  title?: string | null;
  chain_length?: string | null;
  updated_at?: string | null;
  // Legacy
  sku?: string;
  other_specs?: string | null;
  cost_price?: number | null;
  retail_price?: number | null;
  // Common
  metal_type?: string | null;
  metal_karat?: string | null;
  metal_colour?: string | null;
  metal_weight_grams?: number | null;
  diamond_carat?: number | null;
  diamond_colour?: string | null;
  diamond_clarity?: string | null;
  diamond_type?: string | null;
  finger_size?: string | null;
  is_active?: boolean;
  created_at: string;
  // Computed
  piece_count?: number;
  pieces?: InventoryPiece[];
  // Joined (legacy)
  product?: InventoryProduct | null;
  total_stock?: number;
}

export interface InventoryBomItem {
  id: string;
  variant_id: string;
  component_type: BomComponentType;
  description: string;
  quantity: number;
  unit: string | null;
  unit_cost: number;
  total_cost: number;
  supplier_id: string | null;
  purchase_invoice_id: string | null;
  notes: string | null;
  created_at: string;
  supplier?: InventorySupplier | null;
}

export interface InventoryGoldPrice {
  id: string;
  carat: string;
  price_per_gram: number;
  supplier_id: string | null;
  effective_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface InventoryPurchaseInvoice {
  id: string;
  invoice_number: string;
  supplier_id: string | null;
  invoice_date: string | null;
  total_amount: number | null;
  status: InvoiceStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  supplier?: InventorySupplier | null;
  lines?: InventoryPurchaseLine[];
}

export interface InventoryPurchaseLine {
  id: string;
  invoice_id: string;
  variant_id: string | null;
  description: string;
  component_type: BomComponentType | null;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  is_faulty: boolean;
  faulty_notes: string | null;
  created_at: string;
  variant?: InventoryVariant | null;
}

// ─────────────────────────────────────────────
// Inventory — Designs / Pieces / Piece BOM
// ─────────────────────────────────────────────
export type DesignCategory =
  | 'Engagement Ring' | 'Wedding Ring' | 'Fine Jewellery' | 'Earrings'
  | 'Bracelet' | 'Necklace' | 'Pendant' | 'Brooch'
  | 'Loose Stone' | 'Component' | 'Other';

export type PieceStatus = 'in_stock' | 'on_order' | 'sold' | 'workshop' | 'consignment';
export type PieceComponentType = 'casting' | 'diamond' | 'labour' | 'settings' | 'findings' | 'other';

export interface InventoryDesign {
  id: string;
  name: string;
  category: DesignCategory | null;
  description: string | null;
  notes: string | null;
  created_at: string;
  // joined
  pieces?: InventoryPiece[];
}

export interface CsvImportResult {
  designs_created: number;
  pieces_imported: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

export interface InventoryPieceBom {
  id: string;
  piece_id: string;
  component_type: PieceComponentType;
  description: string;
  quantity: number;
  unit: string | null;
  unit_cost: number;
  locked_cost: number;
  supplier_id: string | null;
  notes: string | null;
  created_at: string;
  supplier?: InventorySupplier | null;
}
