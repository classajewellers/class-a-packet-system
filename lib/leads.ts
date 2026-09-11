// lib/leads.ts
// Shared types, vocabulary and helpers for the Leads / Enquiries module.
// Mirrors the pattern used by lib/pipeline.ts for quotes.

export type LeadSource =
  | "walk_in"
  | "referral"
  | "returning_customer"
  | "instagram"
  | "facebook"
  | "website"
  | "phone"
  | "google"
  | "event"
  | "other";

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: "walk_in",            label: "Walk-in" },
  { value: "referral",           label: "Referral" },
  { value: "returning_customer", label: "Returning customer" },
  { value: "instagram",          label: "Instagram" },
  { value: "facebook",           label: "Facebook" },
  { value: "website",            label: "Website" },
  { value: "phone",              label: "Phone" },
  { value: "google",             label: "Google" },
  { value: "event",              label: "Event" },
  { value: "other",              label: "Other" },
];

export const LEAD_SOURCE_VALUES: LeadSource[] = LEAD_SOURCES.map((s) => s.value);

export function leadSourceLabel(source: string): string {
  return LEAD_SOURCES.find((s) => s.value === source)?.label ?? source;
}

export type LeadStatus = "new" | "contacted" | "quoted" | "dead";

export interface LeadStatusConfig {
  label: string;
  color: string; // hex for column headers / badges
}

export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "quoted", "dead"];

export const LEAD_STATUS_CONFIG: Record<LeadStatus, LeadStatusConfig> = {
  new:       { label: "New",       color: "#3B82F6" },
  contacted: { label: "Contacted", color: "#F59E0B" },
  quoted:    { label: "Quoted",    color: "#10B981" },
  dead:      { label: "Dead",      color: "#6B7280" },
};

// Statuses that are still "live" and can therefore be overdue for follow-up.
export const ACTIVE_LEAD_STATUSES: LeadStatus[] = ["new", "contacted"];

export interface Lead {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  interested_in: string;
  source: string;
  next_action_date: string; // YYYY-MM-DD
  status: string;
  linked_customer_id: string | null;
  converted_quote_id: string | null;
  created_by_staff_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Returns today's ISO date string YYYY-MM-DD (local). */
export function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

/** Tomorrow as YYYY-MM-DD — the default next_action_date at capture (+1 day). */
export function defaultNextActionDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

/** A live lead whose next_action_date is in the past is overdue (renders red).
 *  Quoted/dead leads are terminal and never overdue. */
export function isLeadOverdue(lead: Pick<Lead, "next_action_date" | "status">): boolean {
  if (!lead.next_action_date) return false;
  if (!ACTIVE_LEAD_STATUSES.includes(lead.status as LeadStatus)) return false;
  return lead.next_action_date < todayDateStr();
}
