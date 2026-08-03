"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { formatDateAU, formatCurrency } from "@/lib/formatters";
import AttachmentsSection from "@/components/AttachmentsSection";

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
  workshop_po_number: string | null;
  blocked_reason: string | null;
  blocked_note: string | null;
  blocked_at: string | null;
}

export interface TeamMember     { id: string; tenant_id: string; name: string; profile_id: string | null; sort_order: number; active: boolean; }
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

type TabId = "overview" | "customer" | "items" | "notes" | "production" | "materials" | "pricing" | "qc" | "valuation" | "files" | "messages" | "history";

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

const TABS: { id: TabId; label: string }[] = [
  { id: "overview",    label: "Overview" },
  { id: "customer",    label: "Customer" },
  { id: "items",       label: "Items" },
  { id: "notes",       label: "Notes" },
  { id: "production",  label: "Production" },
  { id: "materials",   label: "Materials" },
  { id: "pricing",     label: "Pricing" },
  { id: "qc",          label: "QC" },
  { id: "valuation",   label: "Valuation" },
  { id: "files",       label: "Files" },
  { id: "messages",    label: "Messages" },
  { id: "history",     label: "History" },
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
  intake: "#378ADD", on_bench: "#7F77DD", quality_check: "#D85A30",
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
      return `Step advanced: Step ${Number(ov.step_index ?? 0) + 1} → Step ${Number(nv.step_index ?? 0) + 1}`;
    case "assignment_changed":
      return `Assigned to: ${(nv.subcontractor as string | null) ?? (nv.assigned_to ? "team member" : "Unassigned")}`;
    case "valuation_assigned":
      return `Valuer set: ${String(nv.valuer ?? "—")}`;
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
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting,  setDeleting]  = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("overview");

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

  const handleDelete = async () => {
    if (!confirm("Delete this job permanently?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/workshop/packets/${local.id}`, { method: "DELETE", headers: { "x-tenant-id": tenantId } });
      onDelete(local.id); onClose();
    } catch { /* noop */ } finally { setDeleting(false); }
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
  const FLAT_STAGES: StageEntry[] = config.stages.length > 0
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
        { label: "On Order",             status: "intake",        substatus: "on_order",  accent: "#378ADD" },
        { label: "On Bench",             status: "on_bench",      substatus: null,        accent: "#7F77DD" },
        { label: "Quality Control",      status: "quality_check", substatus: null,        accent: "#D85A30" },
        { label: "Valuation",            status: "to_be_valued",  substatus: null,        accent: "#BA7517" },
        { label: "Ready for Collection", status: "ready",         substatus: null,        accent: "#1D9E75" },
        { label: "Collected",            status: "collected",     substatus: null,        accent: "#6B7280" },
      ];

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
        {(overdue || dueToday) && (
          <div style={{ background: overdue ? "#FEE2E2" : "#FEF3C7", border: `1px solid ${overdue ? "#FCA5A5" : "#FDE68A"}`, borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, fontWeight: 600, color: overdue ? "#DC2626" : "#B45309" }}>
            {overdue ? "⚠ Overdue" : "⏰ Due today"}
          </div>
        )}
        {saveError && (
          <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13, color: "#DC2626" }}>{saveError}</div>
        )}

        {LABEL("Stage")}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
          {FLAT_STAGES.map(entry => {
            const active  = isStageActive(entry);
            const payload: Record<string, unknown> = { status: entry.status };
            if (entry.substatus !== null) payload.workshop_intake_substatus = entry.substatus;
            return (
              <button key={`${entry.status}_${entry.substatus ?? ""}`} onClick={() => patch(payload)}
                style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${active ? entry.accent : "#E8E8F0"}`, background: active ? entry.accent : "#fff", color: active ? "#fff" : "#6B7280", transition: "all .12s" }}>
                {entry.label}
              </button>
            );
          })}
        </div>
        {saving && <div style={{ fontSize: 11, color: "#635BFF", marginBottom: 10 }}>Saving…</div>}

        {LABEL("Blocked Status")}
        <div style={{ marginBottom: 14 }}>
          {local.blocked_reason ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "#FFF5F3", color: "#EA580C", border: "1px solid #FDBA74" }}>
                🚫 {BLOCKED_LABELS[local.blocked_reason] ?? local.blocked_reason}
              </span>
              {local.blocked_note && <span style={{ fontSize: 12, color: "#6B7280", alignSelf: "center" }}>{local.blocked_note}</span>}
              <button onClick={() => patch({ blocked_reason: null, blocked_note: null, blocked_at: null })}
                style={{ fontSize: 12, fontWeight: 600, color: "#16A34A", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
                Unblock
              </button>
            </div>
          ) : blockingOpen ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <select value={blockReason} onChange={e => setBlockReason(e.target.value)} style={INPUT}>
                <option value="">Select reason…</option>
                {BLOCKED_REASON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {blockReason === "other" && (
                <textarea rows={2} value={blockNote} onChange={e => setBlockNote(e.target.value)} placeholder="Add a note…" style={TEXTAREA} />
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => { patch({ blocked_reason: blockReason, blocked_note: blockNote || null, blocked_at: new Date().toISOString() }); setBlockingOpen(false); setBlockReason(""); setBlockNote(""); }}
                  disabled={!blockReason}
                  style={{ flex: 1, background: "#EA580C", color: "#fff", border: "none", borderRadius: 8, padding: "7px 0", fontSize: 13, fontWeight: 600, cursor: blockReason ? "pointer" : "default", opacity: blockReason ? 1 : 0.5 }}>
                  Mark as Blocked
                </button>
                <button onClick={() => { setBlockingOpen(false); setBlockReason(""); setBlockNote(""); }}
                  style={{ background: "#F9FAFB", color: "#6B7280", border: "1px solid #E8E8F0", borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setBlockingOpen(true)}
              style={{ fontSize: 12, fontWeight: 600, color: "#EA580C", background: "#FFF5F3", border: "1px solid #FDBA74", borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}>
              + Flag as Blocked
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

  function renderMaterials() {
    return (
      <div>
        {FIELD("Supplier",
          <input type="text" defaultValue={local.workshop_supplier ?? ""} onBlur={e => { if (e.target.value !== (local.workshop_supplier ?? "")) patch({ workshop_supplier: e.target.value || null }); }} style={INPUT} placeholder="Supplier name…" />
        )}
        {FIELD("PO Number",
          <input type="text" defaultValue={local.workshop_po_number ?? ""} onBlur={e => { if (e.target.value !== (local.workshop_po_number ?? "")) patch({ workshop_po_number: e.target.value || null }); }} style={INPUT} placeholder="PO-…" />
        )}
      </div>
    );
  }

  function renderPricing() {
    // Assignee dropdown value
    let assignVal = "";
    if (local.assigned_to) assignVal = `tp:${local.assigned_to}`;
    else if (local.workshop_subcontractor_name) {
      assignVal = config.teamMembers.some(m => !m.profile_id && m.name === local.workshop_subcontractor_name)
        ? `tn:${local.workshop_subcontractor_name}` : `sub:${local.workshop_subcontractor_name}`;
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
        {FIELD("Assign To",
          <select value={assignVal} onChange={e => {
            const v = e.target.value;
            if (!v) { patch({ assigned_to: null, workshop_subcontractor_name: null }); return; }
            if (v.startsWith("tp:")) { patch({ assigned_to: v.slice(3), workshop_subcontractor_name: null }); return; }
            if (v.startsWith("tn:")) { patch({ assigned_to: null, workshop_subcontractor_name: v.slice(3) }); return; }
            patch({ workshop_subcontractor_name: v.slice(4), assigned_to: null });
          }} style={INPUT}>
            <option value="">— Unassigned —</option>
            {config.teamMembers.filter(m => m.active).length > 0 && (
              <optgroup label="Team">
                {config.teamMembers.filter(m => m.active).map(m => (
                  <option key={m.id} value={m.profile_id ? `tp:${m.profile_id}` : `tn:${m.name}`}>{m.name}</option>
                ))}
              </optgroup>
            )}
            {config.subcontractors.filter(s => s.active).length > 0 && (
              <optgroup label="Subcontractors">
                {config.subcontractors.filter(s => s.active).map(s => (
                  <option key={s.id} value={`sub:${s.name}`}>{s.name}</option>
                ))}
              </optgroup>
            )}
          </select>
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100 }} onClick={onClose} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 101, width: "min(580px, 100vw)", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)" }}>

        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E8E8F0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#9CA3AF", marginBottom: 1 }}>{local.reference_number}</div>
              <div style={{ fontWeight: 700, color: "#1A1A2E", fontSize: 17, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName(local)}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9CA3AF", flexShrink: 0, marginTop: 2 }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
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
            {local.workshop_needs_valuation && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "#FDF4FF", color: "#9333EA", border: "1px solid #E9D5FF" }}>Needs Valuation</span>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid #E8E8F0", overflowX: "auto", flexShrink: 0, scrollbarWidth: "none" as React.CSSProperties["scrollbarWidth"] }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding: "10px 14px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", border: "none", background: "transparent", cursor: "pointer", flexShrink: 0, color: activeTab === tab.id ? "#635BFF" : "#6B7280", borderBottom: activeTab === tab.id ? "2px solid #635BFF" : "2px solid transparent", transition: "color .12s" }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {activeTab === "overview"   && renderOverview()}
          {activeTab === "customer"   && renderCustomer()}
          {activeTab === "items"      && renderItems()}
          {activeTab === "notes"      && renderNotes()}
          {activeTab === "production" && renderProduction()}
          {activeTab === "materials"  && renderMaterials()}
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
              style={{ background: "#FEE2E2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: deleting ? 0.5 : 1 }}>
              {deleting ? "Deleting…" : "Delete Job"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
