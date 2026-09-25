"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { formatDateAU, formatCurrency } from "@/lib/formatters";
import AttachmentsSection from "@/components/AttachmentsSection";
import WorkshopPurchasing, { useJobPurchases } from "@/components/WorkshopPurchasing";
import CadApprovalPanel from "@/components/CadApprovalPanel";
import { castingDueDate, isCastingOverdue, pathwayStepIndex } from "@/lib/cadStage";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkshopPacket {
  id: string;
  reference_number: string;
  packet_type: string | null;
  job_type: string | null;
  status: string | null;
  status_updated_at: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  customer_id: string | null;
  customer_display_name: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_street: string | null;
  customer_suburb: string | null;
  customer_state: string | null;
  customer_postcode: string | null;
  articles: string | null;
  instructions: string | null;
  item_specifications: string | null;
  internal_notes: string | null;
  total_charges: number | string | null;
  deposit: number | string | null;
  balance: number | string | null;
  due_date: string | null;
  in_date: string | null;
  staff_member: string | null;
  valuation_required: boolean | null;
  collected_at: string | null;
  workshop_subcontractor_name: string | null;
  workshop_pathway_id: string | null;
  workshop_step_index: number;
  workshop_intake_substatus: string | null;
  workshop_needs_valuation: boolean;
  workshop_valuer: string | null;
  workshop_supplier: string | null;
  workshop_due_date?: string | null;
  workshop_due_date_overridden?: boolean | null;
  cad_required?: boolean | null;
  workshop_po_number: string | null;
  blocked_reason: string | null;
  blocked_note: string | null;
  blocked_at: string | null;
  quality_issue?: boolean | null;
  delivery_method: string | null;
  shopify_order_id: string | null;
  shopify_fulfillment_id: string | null;
  pending_customer_approval?: boolean | null;
}

export interface TeamMember     { id: string; tenant_id: string; name: string; profile_id: string | null; sort_order: number; active: boolean; workshop_role_keys?: string[]; }
export interface Subcontractor  { id: string; tenant_id: string; name: string; sort_order: number; active: boolean; }
export interface Valuer         { id: string; name: string; active: boolean; }
export interface PathwayStep    { name: string; location: "inhouse" | "external"; }
export interface Pathway        { id: string; name: string; steps: PathwayStep[]; }
export interface ManagerMessage { id: string; text: string; created_at: string; }
export interface LeadTime       { id: string; job_type: string; weeks: number | null; }
export interface Profile        { id: string; full_name: string | null; role: string | null; }
export interface WorkshopLocation { id: string; name: string; job_types: string[]; sort_order: number; }

export interface WorkshopConfig {
  teamMembers: TeamMember[];
  subcontractors: Subcontractor[];
  valuers: Valuer[];
  pathways: Pathway[];
  messages: ManagerMessage[];
  leadTimes: LeadTime[];
  categories: { id: string; name: string; color: string; sort_order: number; default_collapsed: boolean; }[];
  stages: { id: string; category_id: string | null; key: string; label: string; intake_substatus: string | null; sort_order: number; is_locked: boolean; }[];
  locations: WorkshopLocation[];
  settings?: { stale_threshold_days: number; valuation_threshold: number };
}

// ── Internal types ────────────────────────────────────────────────────────────

type TabId = "overview" | "customer" | "items" | "notes" | "production" | "cad" | "materials" | "purchasing" | "pricing" | "qc" | "valuation" | "files" | "messages" | "history";

interface ActivityEvent {
  id: string;
  event_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

interface SmsMessage {
  id: string;
  direction: "in" | "out";
  body: string;
  sent_at: string;
  staff_id: string | null;
  read_at: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FRONT_SECTIONS: { id: TabId; label: string }[] = [
  { id: "overview",   label: "Job" },
  { id: "items",      label: "Items" },
  { id: "production", label: "Production" },
  { id: "cad",        label: "CAD" },
  { id: "materials",  label: "Materials" },
];

const MORE_SECTIONS: { id: TabId; label: string }[] = [
  { id: "customer",   label: "Customer" },
  { id: "notes",      label: "Notes" },
  { id: "purchasing", label: "Purchasing" },
  { id: "pricing",    label: "Pricing" },
  { id: "qc",         label: "QC" },
  { id: "valuation",  label: "Valuation" },
  { id: "files",      label: "Files" },
  { id: "messages",   label: "Messages" },
  { id: "history",    label: "History" },
];

const BLOCKED_REASON_OPTIONS = [
  { value: "waiting_customer",      label: "Waiting: Customer" },
  { value: "waiting_supplier",      label: "Waiting: Supplier" },
  { value: "waiting_materials",     label: "Waiting: Materials" },
  { value: "waiting_stone",         label: "Waiting: Stone" },
  { value: "waiting_casting",       label: "Waiting: Casting" },
  { value: "waiting_approval",      label: "Waiting: Approval" },
  { value: "waiting_subcontractor", label: "Waiting: Subcontractor" },
  { value: "other",                 label: "Other (add note)" },
];

const BLOCKED_LABELS: Record<string, string> = {
  waiting_customer:      "Waiting: Customer",
  waiting_supplier:      "Waiting: Supplier",
  waiting_materials:     "Waiting: Materials",
  waiting_stone:         "Waiting: Stone",
  waiting_casting:       "Waiting: Casting",
  waiting_approval:      "Waiting: Approval",
  waiting_subcontractor: "Waiting: Subcontractor",
  other:                 "Blocked",
};

const STAGE_LABELS: Record<string, string> = {
  intake:        "Intake",
  cad_design:    "CAD Design",
  cad_approval:  "CAD Approval",
  casting:       "Casting",
  polish_finish: "Polish/Finish",
  polish_set:    "Polish/Set",
  on_bench:      "Production",
  quality_check: "Quality Control",
  to_be_valued:  "Valuation",
  ready:         "Ready for Collection",
  collected:     "Collected",
};

const JOB_TYPE_LABELS: Record<string, string> = {
  repair: "Repair", custom_order: "Custom", stock_work: "Stock",
  online_order: "Online Order", collection_order: "Collection",
};

const JOB_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  repair:           { bg: "#EEF2FF", color: "#4F46E5" },
  custom_order:     { bg: "#FFF7ED", color: "#C2410C" },
  stock_work:       { bg: "#F0FDF4", color: "#15803D" },
  online_order:     { bg: "#EFF6FF", color: "#3B82F6" },
  collection_order: { bg: "#FDF4FF", color: "#9333EA" },
};

const STAGE_ACCENT: Record<string, string> = {
  intake: "#378ADD", cad_design: "#7F77DD", cad_approval: "#BA7517", casting: "#D85A30",
  polish_finish: "#0F6E56", polish_set: "#0F6E56",
  on_bench: "#7F77DD", quality_check: "#D85A30",
  to_be_valued: "#BA7517", ready: "#1D9E75", collected: "#6B7280",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayName(p: WorkshopPacket) {
  if (p.job_type === "stock_work") return "Internal";
  return p.customer_display_name || [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "No name";
}

function isOverdue(p: WorkshopPacket) {
  const today = new Date().toISOString().split("T")[0];
  return !!p.due_date && p.due_date < today && p.status !== "collected";
}

function isDueToday(p: WorkshopPacket) {
  const today = new Date().toISOString().split("T")[0];
  return !!p.due_date && p.due_date === today && p.status !== "collected";
}

const STAGE_SHORT: Record<string, string> = {
  "Pre-Check": "Pre",
  "On Order": "Order",
  "On Bench": "Bench",
  "Quality Control": "QC",
  "To-Be-Valued": "Value",
  "Valuation": "Value",
  "Ready for Collection": "Ready",
};

function stageShort(label: string): string {
  if (STAGE_SHORT[label]) return STAGE_SHORT[label];
  if (label.length <= 10) return label;
  return label.split(/[\s-]+/)[0]?.slice(0, 8) || label.slice(0, 8);
}

function activityLabel(event: ActivityEvent): string {
  const nv = event.new_value ?? {};
  const ov = event.old_value ?? {};
  switch (event.event_type) {
    case "status_change":
      return `Stage: ${STAGE_LABELS[(ov.status as string) ?? ""] ?? ov.status ?? "?"} → ${STAGE_LABELS[(nv.status as string) ?? ""] ?? nv.status ?? "?"}`;
    case "blocked_cleared":
      return `Unblocked (was ${BLOCKED_LABELS[(ov.blocked_reason as string) ?? ""] ?? ov.blocked_reason ?? "blocked"})`;
    case "qc_action": {
      const icons: Record<string, string> = { pass: "✓ Pass", rework: "↩ Return for Rework", fail: "✕ Fail" };
      const label = icons[(nv.action as string) ?? ""] ?? String(nv.action ?? "");
      const inspector = nv.inspector_name ? ` — ${nv.inspector_name}` : "";
      const notes = nv.notes ? `: "${nv.notes}"` : "";
      return `QC ${label}${inspector}${notes}`;
    }
    case "step_advanced":
    case "step_change":
      return `Step: Step ${Number(ov.step_index ?? 0) + 1} → Step ${Number(nv.step_index ?? 0) + 1}`;
    case "quality_issue":
      return nv.quality_issue ? "Quality issue flagged" : "Quality issue cleared";
    case "assignment_changed":
      return `Assigned to: ${(nv.subcontractor as string | null) ?? (nv.assigned_to ? "team member" : "Unassigned")}`;
    case "valuation_assigned":
      return `Valuer set: ${String(nv.valuer ?? "—")}`;
    case "cad_decision": {
      const action = String(nv.action ?? "");
      const ver = nv.version_number != null ? `v${nv.version_number}` : "CAD";
      if (action === "approve") return `CAD ${ver} approved — moved to Casting`;
      if (action === "request_changes") return `CAD ${ver} changes requested${nv.note ? `: ${nv.note}` : ""}`;
      if (action === "reject") return `CAD ${ver} rejected${nv.note ? `: ${nv.note}` : ""}`;
      return `CAD decision ${ver}`;
    }
    case "shopify_pickup": {
      const actor = nv.actor_name ? ` by ${nv.actor_name}` : "";
      const fid = nv.shopify_fulfillment_id ? ` (Shopify #${nv.shopify_fulfillment_id})` : "";
      return `Picked Up — fulfilled in Shopify${fid}${actor}`;
    }
    default:
      return event.event_type.replace(/_/g, " ");
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorkshopJobDrawer({
  packet,
  config,
  profiles,
  isManager,
  tenantId,
  onClose,
  onUpdate,
  onDelete,
}: {
  packet: WorkshopPacket;
  config: WorkshopConfig;
  profiles: Profile[];
  isManager: boolean;
  tenantId: string;
  onClose: () => void;
  onUpdate: (p: WorkshopPacket) => void;
  onDelete: (id: string) => void;
}) {
  const { user } = useUser();
  const [local,     setLocal]     = useState<WorkshopPacket>(packet);
  const purchases = useJobPurchases(packet.id, tenantId);
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting,  setDeleting]  = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Blocked control
  const [blockingOpen, setBlockingOpen] = useState(false);
  const [blockReason,  setBlockReason]  = useState("");
  const [blockNote,    setBlockNote]    = useState("");

  // QC
  const [qcNotes,      setQcNotes]      = useState("");
  const [qcInspector,  setQcInspector]  = useState("");
  const [qcAction,     setQcAction]     = useState<"pass" | "rework" | "fail" | null>(null);
  const [qcRevertStep, setQcRevertStep] = useState(0);
  const [qcSaving,     setQcSaving]     = useState(false);
  const [qcError,      setQcError]      = useState<string | null>(null);

  // SMS
  const [smsMessages, setSmsMessages] = useState<SmsMessage[]>([]);
  const [smsLoading,  setSmsLoading]  = useState(false);
  const [smsText,     setSmsText]     = useState("");
  const [smsSending,  setSmsSending]  = useState(false);

  // Activity
  const [activityEvents,  setActivityEvents]  = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Pickup fulfillment
  const [pickingUp,    setPickingUp]    = useState(false);
  const [pickupError,  setPickupError]  = useState<string | null>(null);

  useEffect(() => {
    setLocal(packet);
    setBlockingOpen(false); setBlockReason(""); setBlockNote("");
    setSaveError(null);
    setQcError(null); setQcAction(null); setQcNotes(""); setQcRevertStep(0);
  }, [packet]);

  useEffect(() => { if (user?.name) setQcInspector(user.name); }, [user]);

  const h = useCallback(
    () => ({ "Content-Type": "application/json", "x-tenant-id": tenantId }),
    [tenantId]
  );

  const patch = useCallback(async (fields: Record<string, unknown>) => {
    setSaving(true); setSaveError(null);
    try {
      const res  = await fetch(`/api/workshop/packets/${local.id}`, { method: "PATCH", headers: h(), body: JSON.stringify(fields) });
      const json = await res.json();
      if (!res.ok) { setSaveError(json.error ?? `Error ${res.status}`); return; }
      if (json.packet) {
        const updated: WorkshopPacket = {
          ...json.packet,
          customer_display_name: local.customer_display_name,
          assigned_to_name: (() => {
            if (fields.assigned_to) return profiles.find(p => p.id === fields.assigned_to)?.full_name ?? null;
            if (fields.workshop_subcontractor_name !== undefined) return fields.workshop_subcontractor_name as string | null;
            if (fields.assigned_to === null && fields.workshop_subcontractor_name === null) return null;
            return local.assigned_to_name;
          })(),
        };
        setLocal(updated); onUpdate(updated);
      }
    } catch { setSaveError("Network error"); } finally { setSaving(false); }
  }, [local.id, local.customer_display_name, local.assigned_to_name, h, onUpdate, profiles]);

  const handlePickedUp = useCallback(async () => {
    setPickingUp(true); setPickupError(null);
    try {
      const res = await fetch(`/api/workshop/packets/${local.id}/pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId, "x-actor-name": user?.name ?? "" },
      });
      const json = await res.json();
      if (!res.ok) { setPickupError(json.error ?? `Error ${res.status}`); return; }
      if (json.packet) {
        const updated: WorkshopPacket = { ...json.packet, customer_display_name: local.customer_display_name, assigned_to_name: local.assigned_to_name };
        setLocal(updated); onUpdate(updated);
      }
    } catch { setPickupError("Network error — Shopify fulfillment may not have been created. Check Shopify directly."); }
    finally { setPickingUp(false); }
  }, [local.id, local.customer_display_name, local.assigned_to_name, tenantId, user, onUpdate]);

  const submitQc = async () => {
    if (!qcAction) return;
    setQcSaving(true); setQcError(null);
    try {
      const res  = await fetch(`/api/workshop/packets/${local.id}/qc`, {
        method: "POST", headers: h(),
        body: JSON.stringify({ action: qcAction, notes: qcNotes, inspector_name: qcInspector, revert_step_index: qcAction === "rework" ? qcRevertStep : undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setQcError(json.error ?? `Error ${res.status}`); return; }
      if (json.packet) {
        const updated: WorkshopPacket = { ...json.packet, customer_display_name: local.customer_display_name, assigned_to_name: local.assigned_to_name };
        setLocal(updated); onUpdate(updated);
        setQcAction(null); setQcNotes("");
      }
    } catch { setQcError("Network error"); } finally { setQcSaving(false); }
  };

  const fetchSms = useCallback(async () => {
    if (!local.customer_id) return;
    setSmsLoading(true);
    try {
      const res  = await fetch(`/api/sms/messages?customer_id=${local.customer_id}`, { headers: { "x-tenant-id": tenantId } });
      const json = await res.json();
      setSmsMessages(json.messages ?? []);
    } catch { /* noop */ } finally { setSmsLoading(false); }
  }, [local.customer_id, tenantId]);

  const sendSms = async () => {
    if (!smsText.trim() || !local.customer_id) return;
    setSmsSending(true);
    try {
      await fetch("/api/sms/send", { method: "POST", headers: h(), body: JSON.stringify({ customer_id: local.customer_id, body: smsText.trim() }) });
      setSmsText(""); await fetchSms();
    } catch { /* noop */ } finally { setSmsSending(false); }
  };

  const fetchActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res  = await fetch(`/api/workshop/packets/${local.id}/activity`, { headers: { "x-tenant-id": tenantId } });
      const json = await res.json();
      setActivityEvents(json.events ?? []);
    } catch { /* noop */ } finally { setActivityLoading(false); }
  }, [local.id, tenantId]);

  useEffect(() => { if (activeTab === "messages") fetchSms(); }, [activeTab, fetchSms]);
  useEffect(() => { if (activeTab === "history")  fetchActivity(); }, [activeTab, fetchActivity]);

  const handleDelete = () => {
    setDeleteError(null);
    setConfirmDelete(true);
  };

  const confirmDeleteJob = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/workshop/packets/${local.id}`, { method: "DELETE", headers: { "x-tenant-id": tenantId } });
      if (!res.ok) {
        const json = await res.json().catch(() => ({} as { error?: string }));
        setDeleteError(json.error ?? "Could not delete this job");
        return;
      }
      onDelete(local.id);
      onClose();
    } catch {
      setDeleteError("Could not delete this job");
    } finally {
      setDeleting(false);
    }
  };

  const overdue  = isOverdue(local);
  const dueToday = isDueToday(local);

  const INPUT: React.CSSProperties    = { width: "100%", border: "1px solid #E8E8F0", borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "#1A1A2E", outline: "none", background: "#fff", fontFamily: "inherit", boxSizing: "border-box" };
  const TEXTAREA: React.CSSProperties = { ...INPUT, resize: "vertical" as const };
  const LABEL = (text: string) => (
    <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>{text}</div>
  );
  const FIELD = (label: string, content: React.ReactNode) => (
    <div style={{ marginBottom: 14 }}>{LABEL(label)}{content}</div>
  );

  // ── Stage selector (used in Overview) ────────────────────────────────────

  const CATEGORY_COLORS: Record<string, string> = { blue: "#378ADD", amber: "#BA7517", purple: "#7F77DD", coral: "#D85A30", teal: "#1D9E75", gray: "#6B7280" };
  type StageEntry = { label: string; status: string; substatus: string | null; accent: string };
  const configuredStages: StageEntry[] = config.stages.length > 0
    ? config.stages.slice().sort((a, b) => {
        const catA = config.categories.find(c => c.id === a.category_id);
        const catB = config.categories.find(c => c.id === b.category_id);
        return (catA?.sort_order ?? 99) - (catB?.sort_order ?? 99) || a.sort_order - b.sort_order;
      }).map(s => {
        const cat = config.categories.find(c => c.id === s.category_id);
        return { label: s.label, status: s.key, substatus: s.intake_substatus, accent: CATEGORY_COLORS[cat?.color ?? "gray"] ?? "#6B7280" };
      })
    : [
        { label: "Intake",               status: "intake",        substatus: "jobs_in",   accent: "#378ADD" },
        { label: "Pre-Check",            status: "intake",        substatus: "pre_check", accent: "#378ADD" },
        { label: "CAD Design",           status: "cad_design",    substatus: null,        accent: "#7F77DD" },
        { label: "CAD Approval",         status: "cad_approval",  substatus: null,        accent: "#BA7517" },
        { label: "Casting",              status: "casting",       substatus: null,        accent: "#D85A30" },
        { label: "Polish/Finish",        status: "polish_finish", substatus: null,        accent: "#0F6E56" },
        { label: "Polish/Set",           status: "polish_set",    substatus: null,        accent: "#0F6E56" },
        { label: "On Order",             status: "intake",        substatus: "on_order",  accent: "#378ADD" },
        { label: "On Bench",             status: "on_bench",      substatus: null,        accent: "#7F77DD" },
        { label: "Quality Control",      status: "quality_check", substatus: null,        accent: "#D85A30" },
        { label: "Valuation",            status: "to_be_valued",  substatus: null,        accent: "#BA7517" },
        { label: "Ready for Collection", status: "ready",         substatus: null,        accent: "#1D9E75" },
        { label: "Collected",            status: "collected",     substatus: null,        accent: "#6B7280" },
      ];
  const CAD_STAGE_FALLBACK: StageEntry[] = [
    { label: "CAD Design",    status: "cad_design",    substatus: null, accent: "#7F77DD" },
    { label: "CAD Approval",  status: "cad_approval",  substatus: null, accent: "#BA7517" },
    { label: "Casting",       status: "casting",       substatus: null, accent: "#D85A30" },
    { label: "Polish/Finish", status: "polish_finish", substatus: null, accent: "#0F6E56" },
    { label: "Polish/Set",    status: "polish_set",    substatus: null, accent: "#0F6E56" },
  ];
  const missingCadStages = CAD_STAGE_FALLBACK.filter((entry) =>
    !configuredStages.some((stage) => stage.status === entry.status && stage.substatus == null)
  );
  const preCheckAt = configuredStages.findIndex((stage) => stage.status === "intake" && stage.substatus === "pre_check");
  const FLAT_STAGES: StageEntry[] = missingCadStages.length === 0
    ? configuredStages
    : preCheckAt === -1
      ? [...configuredStages, ...missingCadStages]
      : [...configuredStages.slice(0, preCheckAt + 1), ...missingCadStages, ...configuredStages.slice(preCheckAt + 1)];

  function isStageActive(entry: StageEntry): boolean {
    if (local.status !== entry.status) return false;
    if (entry.substatus !== null) return (local.workshop_intake_substatus ?? "jobs_in") === entry.substatus;
    if (entry.status === "intake") return (local.workshop_intake_substatus ?? "jobs_in") === "jobs_in";
    return true;
  }

  // ── Tab renderers ─────────────────────────────────────────────────────────

  function renderOverview() {
    return (
      <div>
        {local.pending_customer_approval && (
          <div style={{ background: "#FFF5F3", border: "1px solid #FDBA74", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#EA580C", marginBottom: isManager ? 8 : 0 }}>
              ⏳ Auto-created — pending your approval before this can move through the workshop
            </div>
            {isManager ? (
              <button
                onClick={() => patch({ pending_customer_approval: false })}
                style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#EA580C", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                Approve Order
              </button>
            ) : (
              <div style={{ fontSize: 12, color: "#9A5B3A" }}>A manager needs to approve this order before work can begin.</div>
            )}
          </div>
        )}
        {isCastingOverdue(local) && (
          <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, fontWeight: 600, color: "#DC2626" }}>
            Casting overdue — expected back {castingDueDate(local) ? formatDateAU(castingDueDate(local) as string) : ""} and still in Casting.
          </div>
        )}
        {(overdue || dueToday) && (
          <div style={{ background: overdue ? "#FEE2E2" : "#FEF3C7", border: `1px solid ${overdue ? "#FCA5A5" : "#FDE68A"}`, borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, fontWeight: 600, color: overdue ? "#DC2626" : "#B45309" }}>
            {overdue ? "⚠ Overdue" : "⏰ Due today"}
          </div>
        )}
        {saveError && (
          <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: "#DC2626" }}>{saveError}</div>
        )}

        <WorkshopPurchasing rows={purchases.rows} error={purchases.error} />

        {LABEL("Stage")}
        <div style={{ display: "flex", alignItems: "flex-start", width: "100%", overflowX: "auto", marginBottom: 16, padding: "2px 0 8px" }}>
          {FLAT_STAGES.map((entry, index) => {
            const active = isStageActive(entry);
            const currentIndex = FLAT_STAGES.findIndex(isStageActive);
            const done = currentIndex >= 0 && index < currentIndex;
            const isNext = currentIndex >= 0 && index === currentIndex + 1;
            const payload: Record<string, unknown> = { status: entry.status };
            if (entry.substatus !== null) payload.workshop_intake_substatus = entry.substatus;
            const pathway = config.pathways.find((item) => item.id === local.workshop_pathway_id);
            const step = pathwayStepIndex(pathway?.steps, entry.status);
            if (step !== null) payload.workshop_step_index = step;
            const blockedByApproval = !!local.pending_customer_approval && isNext;
            const canAdvance = isNext && !blockedByApproval;
            const label = (narrow && !active && !isNext) ? stageShort(entry.label) : entry.label;
            return (
              <div key={`${entry.status}_${entry.substatus ?? ""}`} style={{ display: "flex", alignItems: "flex-start", flex: index === 0 ? "0 0 auto" : "1 1 0", minWidth: active || isNext ? 72 : 44 }}>
                {index > 0 && (
                  <div style={{ flex: 1, height: 2, marginTop: 15, background: done || active ? "#635BFF" : "#E5E7EB", minWidth: 8 }} />
                )}
                <button
                  type="button"
                  onClick={() => { if (canAdvance) patch(payload); }}
                  disabled={!canAdvance}
                  title={blockedByApproval ? "Approve this order before changing its stage" : canAdvance ? `Move to ${entry.label}` : entry.label}
                  style={{ border: isNext ? "1px solid #C7C4FF" : "none", background: isNext ? "#F5F3FF" : "transparent", borderRadius: 10, padding: isNext ? "4px 8px 6px" : "0 2px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: canAdvance ? "pointer" : "default", maxWidth: active || isNext ? 120 : 88 }}
                >
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", color: "#635BFF", lineHeight: 1, minHeight: 9 }}>
                    {active ? "NOW" : isNext ? "NEXT" : ""}
                  </span>
                  <span style={{ width: active ? 14 : 8, height: active ? 14 : 8, borderRadius: "50%", background: active || done ? "#635BFF" : isNext ? "#fff" : "#E5E7EB", border: isNext ? "2px solid #635BFF" : "none", boxShadow: active ? "0 0 0 4px rgba(99,91,255,0.22)" : undefined, boxSizing: "content-box" }} />
                  <span style={{ fontSize: active || isNext ? 12 : 10, lineHeight: 1.2, fontWeight: active || isNext ? 700 : 500, color: active || isNext ? "#1A1A2E" : "#6B7280", textAlign: "center" }}>{label}</span>
                </button>
              </div>
            );
          })}
        </div>
        {saving && <div style={{ fontSize: 11, color: "#635BFF", marginBottom: 10 }}>Saving…</div>}

        {/* Pickup fulfillment — only for in-store pickup online orders */}
        {local.delivery_method === "pickup" && local.job_type === "online_order" && local.status !== "collected" && (
          <div style={{ marginBottom: 14 }}>
            {pickupError && (
              <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 12px", marginBottom: 8, fontSize: 13, color: "#DC2626" }}>
                {pickupError}
              </div>
            )}
            <button
              onClick={handlePickedUp}
              disabled={pickingUp}
              style={{ width: "100%", background: pickingUp ? "#D1FAE5" : "#10B981", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 14, fontWeight: 700, cursor: pickingUp ? "default" : "pointer", opacity: pickingUp ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {pickingUp ? "Fulfilling in Shopify…" : "✓ Picked Up — Fulfil in Shopify"}
            </button>
            {local.shopify_fulfillment_id && (
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4, textAlign: "center" }}>
                Shopify fulfillment #{local.shopify_fulfillment_id}
              </div>
            )}
          </div>
        )}
        {local.delivery_method === "pickup" && local.status === "collected" && local.shopify_fulfillment_id && (
          <div style={{ marginBottom: 14, background: "#D1FAE5", border: "1px solid #6EE7B7", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#065F46" }}>
            ✓ Picked up and fulfilled in Shopify (#{local.shopify_fulfillment_id})
          </div>
        )}

        {local.blocked_reason && local.blocked_note && (
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 14 }}>{local.blocked_note}</div>
        )}

        {blockingOpen && !local.blocked_reason && (
          <div style={{ marginBottom: 14, border: "1px solid #E8E8F0", borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Flag as blocked</div>
            <select value={blockReason} onChange={e => setBlockReason(e.target.value)} style={INPUT}>
              <option value="">Select reason…</option>
              {BLOCKED_REASON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {blockReason === "other" && (
              <textarea rows={2} value={blockNote} onChange={e => setBlockNote(e.target.value)} placeholder="Add a note…" style={{ ...TEXTAREA, marginTop: 8 }} />
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button
                onClick={() => { patch({ blocked_reason: blockReason, blocked_note: blockNote || null, blocked_at: new Date().toISOString() }); setBlockingOpen(false); setBlockReason(""); setBlockNote(""); }}
                disabled={!blockReason}
                style={{ background: "#fff", color: "#374151", border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: blockReason ? "pointer" : "default", opacity: blockReason ? 1 : 0.5 }}>
                Save
              </button>
              <button onClick={() => { setBlockingOpen(false); setBlockReason(""); setBlockNote(""); }}
                style={{ background: "transparent", color: "#6B7280", border: "none", padding: "6px 8px", fontSize: 12, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {LABEL("Quality issue")}
        <div style={{ marginBottom: 14 }}>
          {local.quality_issue ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" }}>
                Quality issue
              </span>
              <button onClick={() => patch({ quality_issue: false })}
                style={{ fontSize: 12, fontWeight: 600, color: "#374151", background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
                Clear flag
              </button>
            </div>
          ) : (
            <button onClick={() => patch({ quality_issue: true })}
              style={{ fontSize: 12, fontWeight: 600, color: "#B91C1C", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}>
              + Flag quality issue
            </button>
          )}
        </div>

        <div style={{ borderTop: "1px solid #E8E8F0", paddingTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, color: "#374151" }}>
          <div><span style={{ color: "#9CA3AF" }}>In Date: </span>{local.in_date ? formatDateAU(local.in_date) : "—"}</div>
          <div><span style={{ color: "#9CA3AF" }}>Staff: </span>{local.staff_member || "—"}</div>
          {local.collected_at && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#9CA3AF" }}>Collected: </span>{new Date(local.collected_at).toLocaleDateString("en-AU")}</div>}
        </div>
      </div>
    );
  }

  function renderCustomer() {
    if (local.job_type === "stock_work") {
      return <div style={{ color: "#9CA3AF", fontSize: 13 }}>No customer linked — internal/stock job.</div>;
    }
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>{LABEL("First Name")}<div style={{ fontSize: 13, color: "#1A1A2E" }}>{local.customer_first_name || "—"}</div></div>
          <div>{LABEL("Last Name")}<div style={{ fontSize: 13, color: "#1A1A2E" }}>{local.customer_last_name || "—"}</div></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>{LABEL("Phone")}<div style={{ fontSize: 13, color: "#1A1A2E" }}>{local.customer_phone || "—"}</div></div>
          <div>{LABEL("Email")}<div style={{ fontSize: 13, color: "#1A1A2E" }}>{local.customer_email || "—"}</div></div>
        </div>
        {(local.customer_street || local.customer_suburb) && (
          <div style={{ marginBottom: 14 }}>
            {LABEL("Address")}
            <div style={{ fontSize: 13, color: "#1A1A2E" }}>{[local.customer_street, local.customer_suburb, local.customer_state, local.customer_postcode].filter(Boolean).join(", ")}</div>
          </div>
        )}
      </div>
    );
  }

  function renderItems() {
    return (
      <div>
        {FIELD("Description of Work",
          <textarea rows={4} defaultValue={local.articles ?? ""} onBlur={e => { if (e.target.value !== (local.articles ?? "")) patch({ articles: e.target.value || null }); }} style={TEXTAREA} placeholder="Describe the jewellery and work required…" />
        )}
        {FIELD("Item Specifications",
          <textarea rows={4} defaultValue={local.item_specifications ?? ""} onBlur={e => { if (e.target.value !== (local.item_specifications ?? "")) patch({ item_specifications: e.target.value || null }); }} style={TEXTAREA} placeholder="Specifications, dimensions, metals, stones…" />
        )}
      </div>
    );
  }

  function renderNotes() {
    return (
      <div>
        {FIELD("Customer Instructions",
          <textarea rows={4} defaultValue={local.instructions ?? ""} onBlur={e => { if (e.target.value !== (local.instructions ?? "")) patch({ instructions: e.target.value || null }); }} style={TEXTAREA} />
        )}
        {FIELD("Internal Notes",
          <textarea rows={4} defaultValue={local.internal_notes ?? ""} onBlur={e => { if (e.target.value !== (local.internal_notes ?? "")) patch({ internal_notes: e.target.value || null }); }} style={TEXTAREA} />
        )}
      </div>
    );
  }

  function renderProduction() {
    const pw    = config.pathways.find(p => p.id === local.workshop_pathway_id);
    const steps = pw?.steps ?? [];
    const cur   = local.workshop_step_index ?? 0;

    return (
      <div>
        {FIELD("Pathway",
          <select value={local.workshop_pathway_id ?? ""} onChange={e => patch({ workshop_pathway_id: e.target.value || null, workshop_step_index: 0 })} style={INPUT}>
            <option value="">— No pathway —</option>
            {config.pathways.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        {pw && steps.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {LABEL(`Steps — ${pw.name}`)}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {steps.map((step, i) => {
                const done    = i < cur;
                const current = i === cur;
                const isLast  = i === steps.length - 1;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        background: done ? "#16A34A" : current ? "#635BFF" : "#F3F4F6",
                        border: `2px solid ${done ? "#16A34A" : current ? "#635BFF" : "#D1D5DB"}`,
                        color: done ? "#fff" : current ? "#fff" : "#9CA3AF",
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {done ? "✓" : i + 1}
                      </div>
                      {!isLast && <div style={{ width: 2, height: 24, background: done ? "#16A34A" : "#E5E7EB" }} />}
                    </div>
                    <div style={{ paddingBottom: isLast ? 0 : 8, paddingTop: 2, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: current ? 700 : 500, color: done ? "#9CA3AF" : current ? "#1A1A2E" : "#6B7280", textDecoration: done ? "line-through" : "none" }}>
                          {step.name}
                        </span>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: step.location === "inhouse" ? "#EEF2FF" : "#FFF7ED", color: step.location === "inhouse" ? "#4F46E5" : "#C2410C" }}>
                          {step.location === "inhouse" ? "In-house" : "External"}
                        </span>
                        {current && cur < steps.length - 1 && (
                          <button onClick={() => patch({ workshop_step_index: cur + 1 })} disabled={saving}
                            style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: "#635BFF", color: "#fff", border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                            Complete →
                          </button>
                        )}
                        {current && cur === steps.length - 1 && (
                          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: "#F0FDF4", color: "#16A34A", fontWeight: 600 }}>Final step</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {cur >= steps.length && (
              <div style={{ marginTop: 10, background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "#16A34A" }}>
                ✓ All pathway steps complete — move to Quality Control
              </div>
            )}
          </div>
        )}
        {pw && steps.length === 0 && (
          <div style={{ fontSize: 13, color: "#9CA3AF" }}>Pathway has no steps defined.</div>
        )}
      </div>
    );
  }

  function renderPurchasing() {
    return <WorkshopPurchasing rows={purchases.rows} error={purchases.error} />;
  }

  function renderMaterials() {
    return (
      <div>
        {FIELD("Supplier",
          <input type="text" defaultValue={local.workshop_supplier ?? ""} onBlur={e => { if (e.target.value !== (local.workshop_supplier ?? "")) patch({ workshop_supplier: e.target.value || null }); }} style={INPUT} placeholder="Supplier name…" />
        )}
        {FIELD("PO Number",
          <input type="text" defaultValue={local.workshop_po_number ?? ""} onBlur={e => { if (e.target.value !== (local.workshop_po_number ?? "")) patch({ workshop_po_number: e.target.value || null }); }} style={INPUT} placeholder="PO-…" />
        )}
        {FIELD("Expected return",
          <input type="date" value={local.workshop_due_date ?? ""} onChange={e => patch({ workshop_due_date: e.target.value || null, workshop_due_date_overridden: !!e.target.value })} style={INPUT} />
        )}
        {local.due_date && local.due_date !== local.workshop_due_date && (
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: -8, marginBottom: 10 }}>Customer due date: {formatDateAU(local.due_date)}</div>
        )}
        {local.status === "casting" && (
          <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.45 }}>
            {isCastingOverdue(local)
              ? "This casting is overdue. It is still in Casting, so it is not back. When it returns, move the stage to Polish/Finish or Polish/Set."
              : "Expected return is the workshop due date. While the job stays in Casting past that date, it is overdue. When it returns, move the stage to Polish/Finish or Polish/Set."}
          </div>
        )}
      </div>
    );
  }

  function renderCad() {
    return (
      <CadApprovalPanel
        packetId={local.id}
        isManager={isManager}
        onPacket={(packet) => {
          const updated: WorkshopPacket = {
            ...local,
            ...(packet as Partial<WorkshopPacket>),
            customer_display_name: local.customer_display_name,
            assigned_to_name: local.assigned_to_name,
          };
          setLocal(updated);
          onUpdate(updated);
        }}
      />
    );
  }

  function renderPricing() {
    // Assignee dropdown value
    const assignTeam = config.teamMembers.filter((m) => m.active).filter((m) =>
      local.status !== "cad_design" || (m.workshop_role_keys ?? []).includes("cad_designer")
    );
    let assignVal = "";
    if (local.assigned_to) assignVal = `tp:${local.assigned_to}`;
    else if (local.workshop_subcontractor_name) {
      assignVal = assignTeam.some(m => !m.profile_id && m.name === local.workshop_subcontractor_name)
        ? `tn:${local.workshop_subcontractor_name}` : local.status === "cad_design" ? "" : `sub:${local.workshop_subcontractor_name}`;
    }

    return (
      <div>
        {FIELD("Job Type",
          <select value={local.job_type ?? "repair"} onChange={e => patch({ job_type: e.target.value })} style={INPUT}>
            <option value="repair">Repair</option>
            <option value="custom_order">Custom Order</option>
            <option value="collection_order">Collection Order</option>
            <option value="online_order">Online Order</option>
            <option value="stock_work">Stock Work</option>
          </select>
        )}
        {FIELD(local.status === "cad_design" ? "Assign To (CAD Designer only)" : "Assign To",
          <select value={assignVal} onChange={e => {
            const v = e.target.value;
            if (!v) { patch({ assigned_to: null, workshop_subcontractor_name: null }); return; }
            if (v.startsWith("tp:")) { patch({ assigned_to: v.slice(3), workshop_subcontractor_name: null }); return; }
            if (v.startsWith("tn:")) { patch({ assigned_to: null, workshop_subcontractor_name: v.slice(3) }); return; }
            patch({ workshop_subcontractor_name: v.slice(4), assigned_to: null });
          }} style={INPUT}>
            <option value="">— Unassigned —</option>
            {assignTeam.length > 0 && (
              <optgroup label={local.status === "cad_design" ? "CAD Designers" : "Team"}>
                {assignTeam.map(m => (
                  <option key={m.id} value={m.profile_id ? `tp:${m.profile_id}` : `tn:${m.name}`}>{m.name}</option>
                ))}
              </optgroup>
            )}
            {local.status !== "cad_design" && config.subcontractors.filter(s => s.active).length > 0 && (
              <optgroup label="Subcontractors">
                {config.subcontractors.filter(s => s.active).map(s => (
                  <option key={s.id} value={`sub:${s.name}`}>{s.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        )}
        {local.status === "cad_design" && assignTeam.length === 0 && (
          <div style={{ fontSize: 12, color: "#B45309", marginTop: -8, marginBottom: 14 }}>
            No CAD Designers yet. In Settings → Team, tag a staff member with CAD Designer.
          </div>
        )}
        {FIELD("Due Date", <input type="date" value={local.due_date ?? ""} onChange={e => patch({ due_date: e.target.value || null })} style={INPUT} />)}
        {FIELD("Staff Member",
          <input type="text" defaultValue={local.staff_member ?? ""} onBlur={e => { if (e.target.value !== (local.staff_member ?? "")) patch({ staff_member: e.target.value || null }); }} style={INPUT} />
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            {LABEL("Quoted Price")}
            <input type="number" step="0.01" defaultValue={Number(local.total_charges) || ""} onBlur={e => { const v = e.target.value ? Number(e.target.value) : null; if (v !== Number(local.total_charges)) patch({ total_charges: v }); }} style={INPUT} placeholder="0.00" />
          </div>
          <div>
            {LABEL("Deposit Taken")}
            <input type="number" step="0.01" defaultValue={Number(local.deposit) || ""} onBlur={e => { const v = e.target.value ? Number(e.target.value) : null; if (v !== Number(local.deposit)) patch({ deposit: v }); }} style={INPUT} placeholder="0.00" />
          </div>
        </div>
        {local.balance != null && local.total_charges != null && (
          <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "#1A1A2E", marginBottom: 14 }}>
            Balance owing: {formatCurrency(Number(local.balance))}
          </div>
        )}
      </div>
    );
  }

  function renderQC() {
    const pw    = config.pathways.find(p => p.id === local.workshop_pathway_id);
    const steps = pw?.steps ?? [];

    if (local.status !== "quality_check") {
      return (
        <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 8, padding: "16px", fontSize: 13, color: "#6B7280" }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Not in Quality Control</div>
          <div>Current stage: <strong>{STAGE_LABELS[local.status ?? ""] ?? local.status ?? "Unknown"}</strong></div>
          <div style={{ marginTop: 8, fontSize: 12 }}>Move this job to Quality Control from the Overview tab to record QC results.</div>
        </div>
      );
    }

    return (
      <div>
        {qcError && (
          <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: "#DC2626" }}>{qcError}</div>
        )}
        {FIELD("Inspector",
          <input type="text" value={qcInspector} onChange={e => setQcInspector(e.target.value)} style={INPUT} placeholder="Inspector name…" />
        )}
        {FIELD("QC Notes",
          <textarea rows={3} value={qcNotes} onChange={e => setQcNotes(e.target.value)} style={TEXTAREA} placeholder="Observations, issues found…" />
        )}
        {qcAction === "rework" && steps.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {LABEL("Return to step")}
            <select value={qcRevertStep} onChange={e => setQcRevertStep(Number(e.target.value))} style={INPUT}>
              {steps.map((step, i) => <option key={i} value={i}>Step {i + 1}: {step.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {(["pass", "rework"] as const).map(action => (
            <button key={action} onClick={() => setQcAction(qcAction === action ? null : action)}
              style={{ flex: 1, minWidth: 100, padding: "9px 8px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
                border: `2px solid ${qcAction === action ? (action === "pass" ? "#16A34A" : "#B45309") : "#E8E8F0"}`,
                background: qcAction === action ? (action === "pass" ? "#F0FDF4" : "#FEF3C7") : "#fff",
                color: qcAction === action ? (action === "pass" ? "#16A34A" : "#B45309") : "#374151" }}>
              {action === "pass" ? "✓ Pass" : "↩ Return for Rework"}
            </button>
          ))}
          {isManager && (
            <button onClick={() => setQcAction(qcAction === "fail" ? null : "fail")}
              style={{ flex: 1, minWidth: 80, padding: "9px 8px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `2px solid ${qcAction === "fail" ? "#DC2626" : "#E8E8F0"}`, background: qcAction === "fail" ? "#FEE2E2" : "#fff", color: qcAction === "fail" ? "#DC2626" : "#374151" }}>
              ✕ Fail (Restart)
            </button>
          )}
        </div>
        {qcAction && (
          <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 8, padding: "12px", marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: "#374151", marginBottom: 10 }}>
              {qcAction === "pass"   && `Pass → moves to ${local.workshop_needs_valuation ? "Valuation" : "Ready for Collection"}`}
              {qcAction === "rework" && `Return for Rework → moves to Production${steps.length > 0 ? ` at Step ${qcRevertStep + 1}: ${steps[qcRevertStep]?.name ?? ""}` : ""}`}
              {qcAction === "fail"   && "Fail → returns to Intake for full restart."}
            </div>
            <button onClick={submitQc} disabled={qcSaving}
              style={{ padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none",
                background: qcAction === "pass" ? "#16A34A" : qcAction === "fail" ? "#DC2626" : "#B45309",
                color: "#fff", opacity: qcSaving ? 0.6 : 1 }}>
              {qcSaving ? "Saving…" : `Confirm ${qcAction === "pass" ? "Pass" : qcAction === "rework" ? "Rework" : "Fail"}`}
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderValuation() {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: isManager ? "pointer" : "default" }}>
            <input type="checkbox" checked={!!local.workshop_needs_valuation}
              onChange={e => isManager && patch({ workshop_needs_valuation: e.target.checked })}
              disabled={!isManager}
              style={{ width: 16, height: 16, accentColor: "#635BFF" }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Needs Valuation</span>
          </label>
          {local.workshop_needs_valuation && Number(local.total_charges) >= 3000 && (
            <span style={{ fontSize: 11, color: "#9333EA", background: "#FDF4FF", padding: "2px 8px", borderRadius: 999 }}>Auto (≥$3,000)</span>
          )}
        </div>
        {local.workshop_needs_valuation ? (
          <>
            {FIELD("Valuer",
              <select value={local.workshop_valuer ?? ""} onChange={e => patch({ workshop_valuer: e.target.value || null })} style={INPUT}>
                <option value="">— Unassigned —</option>
                {config.valuers.filter(v => v.active).map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
            )}
            {local.status !== "to_be_valued" && (
              <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: "#B45309" }}>
                Move job to <strong>Valuation</strong> stage (via Overview → Stage) before completing.
              </div>
            )}
            {local.status === "to_be_valued" && (
              <>
                <button onClick={() => patch({ status: "ready" })} disabled={saving || !local.workshop_valuer}
                  style={{ padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "none", background: local.workshop_valuer ? "#635BFF" : "#E5E7EB", color: local.workshop_valuer ? "#fff" : "#9CA3AF", cursor: local.workshop_valuer ? "pointer" : "default", opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Valuation Complete — Mark Ready"}
                </button>
                {!local.workshop_valuer && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#9CA3AF" }}>Assign a valuer above to enable.</div>
                )}
              </>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, color: "#9CA3AF" }}>
            {isManager ? "Enable above to assign a valuer." : "No valuation required for this job."}
          </div>
        )}
      </div>
    );
  }

  function renderFiles() {
    return <AttachmentsSection entityType="packet" entityId={local.id} />;
  }

  function renderMessages() {
    if (!local.customer_id) {
      return <div style={{ fontSize: 13, color: "#9CA3AF" }}>No customer linked to this job. Messages are customer-scoped.</div>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, minHeight: 120 }}>
          {smsLoading && <div style={{ fontSize: 13, color: "#9CA3AF" }}>Loading messages…</div>}
          {!smsLoading && smsMessages.length === 0 && <div style={{ fontSize: 13, color: "#9CA3AF" }}>No messages yet.</div>}
          {smsMessages.map(m => (
            <div key={m.id} style={{ display: "flex", justifyContent: m.direction === "out" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "80%", padding: "8px 12px", borderRadius: 12, fontSize: 13,
                background: m.direction === "out" ? "#635BFF" : "#F3F4F6",
                color: m.direction === "out" ? "#fff" : "#1A1A2E",
                borderBottomRightRadius: m.direction === "out" ? 2 : 12,
                borderBottomLeftRadius:  m.direction === "in"  ? 2 : 12,
              }}>
                <div>{m.body}</div>
                <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>
                  {new Date(m.sent_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })} · {new Date(m.sent_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <textarea value={smsText} onChange={e => setSmsText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendSms(); } }}
            rows={2} placeholder="Type a message… (Enter to send)"
            style={{ ...TEXTAREA, flex: 1, marginBottom: 0 }} />
          <button onClick={sendSms} disabled={smsSending || !smsText.trim()}
            style={{ padding: "0 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, border: "none", background: smsText.trim() ? "#635BFF" : "#E5E7EB", color: smsText.trim() ? "#fff" : "#9CA3AF", cursor: smsText.trim() ? "pointer" : "default", flexShrink: 0, opacity: smsSending ? 0.6 : 1 }}>
            {smsSending ? "…" : "Send"}
          </button>
        </div>
      </div>
    );
  }

  function renderHistory() {
    if (activityLoading) return <div style={{ fontSize: 13, color: "#9CA3AF" }}>Loading activity…</div>;
    if (activityEvents.length === 0) return <div style={{ fontSize: 13, color: "#9CA3AF" }}>No activity recorded yet.</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {activityEvents.map(evt => (
          <div key={evt.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#635BFF", flexShrink: 0, marginTop: 5 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "#1A1A2E" }}>{activityLabel(evt)}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                {new Date(evt.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })} · {new Date(evt.created_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Header derived values ─────────────────────────────────────────────────

  const stageAccent = STAGE_ACCENT[local.status ?? ""] ?? "#6B7280";
  const stageLabel  = STAGE_LABELS[local.status ?? ""] ?? local.status ?? "Unknown";
  const jt          = local.job_type ?? "repair";
  const jtColor     = JOB_TYPE_COLORS[jt] ?? JOB_TYPE_COLORS.repair;
  const moreActive  = MORE_SECTIONS.find(section => section.id === activeTab);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", paddingBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 600, color: "#635BFF", cursor: "pointer" }}>
          ← Board
        </button>
        <a href="/workshop" style={{ fontSize: 13, fontWeight: 600, color: "#6B7280", textDecoration: "none" }}>All jobs</a>
      </div>

        {/* Header */}
        <div style={{ padding: "14px 20px", border: "1px solid #E8E8F0", borderRadius: 12, background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#9CA3AF", marginBottom: 1 }}>{local.reference_number}</div>
              <div style={{ fontWeight: 700, color: "#1A1A2E", fontSize: 17, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName(local)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 2, flexShrink: 0, position: "relative" }}>
              <button
                type="button"
                onClick={() => setMenuOpen(open => !open)}
                aria-label="Job actions"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#6B7280", fontSize: 18, lineHeight: 1 }}
              >
                ···
              </button>
              {menuOpen && (
                <button type="button" aria-label="Close job actions" onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 4, background: "transparent", border: "none", cursor: "default" }} />
              )}
              {menuOpen && (
                <div style={{ position: "absolute", top: 28, right: 0, zIndex: 5, background: "#fff", border: "1px solid #E8E8F0", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", minWidth: 160, padding: 4 }}>
                  {local.blocked_reason ? (
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); patch({ blocked_reason: null, blocked_note: null, blocked_at: null }); }}
                      style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "8px 10px", fontSize: 13, color: "#374151", cursor: "pointer" }}
                    >
                      Unblock
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setMenuOpen(false); setActiveTab("overview"); setBlockingOpen(true); }}
                      style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "8px 10px", fontSize: 13, color: "#374151", cursor: "pointer" }}
                    >
                      Flag as blocked
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: jtColor.bg, color: jtColor.color }}>{JOB_TYPE_LABELS[jt] ?? jt}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: `${stageAccent}18`, color: stageAccent, border: `1px solid ${stageAccent}40` }}>{stageLabel}</span>
            {local.due_date && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: overdue ? "#FEE2E2" : dueToday ? "#FEF3C7" : "#F3F4F6", color: overdue ? "#DC2626" : dueToday ? "#B45309" : "#6B7280" }}>
                {overdue ? "⚠ " : dueToday ? "⏰ " : "Due: "}{formatDateAU(local.due_date)}
              </span>
            )}
            {local.blocked_reason && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#FFF5F3", color: "#EA580C", border: "1px solid #FDBA74" }}>
                🚫 {BLOCKED_LABELS[local.blocked_reason] ?? "Blocked"}
              </span>
            )}
            {local.cad_required && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#F5F3FF", color: "#5B21B6", border: "1px solid #DDD6FE" }}>CAD required</span>
            )}
            {isCastingOverdue(local) && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#FEE2E2", color: "#DC2626", border: "1px solid #FECACA" }}>Casting overdue</span>
            )}
            {local.quality_issue && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" }}>
                Quality issue
              </span>
            )}
            {local.workshop_needs_valuation && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "#FDF4FF", color: "#9333EA", border: "1px solid #E9D5FF" }}>Needs Valuation</span>
            )}
            {local.delivery_method === "pickup" && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#ECFDF5", color: "#059669", border: "1px solid #A7F3D0" }}>🏪 Pickup</span>
            )}
            {local.delivery_method === "shipping" && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE" }}>📦 Shipping</span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 2, background: "#F3F4F6", borderRadius: 10, padding: 3 }}>
            {FRONT_SECTIONS.map(section => {
              const on = activeTab === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => { setActiveTab(section.id); setMoreOpen(false); }}
                  style={{ padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: on ? "#fff" : "transparent", color: on ? "#1A1A2E" : "#6B7280", boxShadow: on ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}
                >
                  {section.label}
                </button>
              );
            })}
          </div>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMoreOpen(open => !open)}
              style={{ padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid #E8E8F0", cursor: "pointer", background: moreActive ? "#fff" : "#F9FAFB", color: moreActive ? "#1A1A2E" : "#6B7280" }}
            >
              {moreActive ? moreActive.label : "More"}
            </button>
            {moreOpen && (
              <>
                <button type="button" aria-label="Close sections" onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 4, background: "transparent", border: "none", cursor: "default" }} />
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 5, background: "#fff", border: "1px solid #E8E8F0", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", minWidth: 160, padding: 4 }}>
                  {MORE_SECTIONS.map(section => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => { setActiveTab(section.id); setMoreOpen(false); }}
                      style={{ display: "block", width: "100%", textAlign: "left", background: activeTab === section.id ? "#F5F3FF" : "transparent", border: "none", borderRadius: 6, padding: "8px 10px", fontSize: 13, fontWeight: activeTab === section.id ? 700 : 500, color: "#374151", cursor: "pointer" }}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Section */}
        <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "16px 20px", marginTop: 12 }}>
          {activeTab === "overview"   && renderOverview()}
          {activeTab === "customer"   && renderCustomer()}
          {activeTab === "items"      && renderItems()}
          {activeTab === "notes"      && renderNotes()}
          {activeTab === "production" && renderProduction()}
          {activeTab === "cad"        && renderCad()}
          {activeTab === "materials"  && renderMaterials()}
          {activeTab === "purchasing" && renderPurchasing()}
          {activeTab === "pricing"    && renderPricing()}
          {activeTab === "qc"         && renderQC()}
          {activeTab === "valuation"  && renderValuation()}
          {activeTab === "files"      && renderFiles()}
          {activeTab === "messages"   && renderMessages()}
          {activeTab === "history"    && renderHistory()}
        </div>

        {/* Footer: delete */}
        {isManager && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #E8E8F0", flexShrink: 0 }}>
            <button onClick={handleDelete} disabled={deleting}
              style={{ background: "transparent", color: "#6B7280", border: "none", padding: "4px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Delete job
            </button>
          </div>
        )}
        {confirmDelete && (
          <div style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, width: "min(400px, 100%)", boxShadow: "0 16px 40px rgba(0,0,0,0.18)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A2E", marginBottom: 8 }}>Delete this job?</div>
              <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 16px" }}>
                {local.reference_number} will be deleted. This cannot be undone.
              </p>
              {deleteError && (
                <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#B91C1C", marginBottom: 12 }}>{deleteError}</div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => { if (!deleting) { setConfirmDelete(false); setDeleteError(null); } }}
                  style={{ background: "#fff", color: "#374151", border: "1px solid #E8E8F0", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteJob}
                  disabled={deleting}
                  style={{ background: "#DC2626", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.6 : 1 }}
                >
                  {deleting ? "Deleting…" : "Delete job"}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
