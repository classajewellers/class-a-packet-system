"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { hasPermission, canManage } from "@/lib/userTypes";
import { formatDateAU, formatCurrency } from "@/lib/formatters";

// ── Types ────────────────────────────────────────────────────────────────────

type KanbanStatus = "intake" | "on_bench" | "quality_check" | "to_be_valued" | "ready" | "collected";

interface WorkshopPacket {
  id: string;
  reference_number: string;
  packet_type: string | null;
  job_type: string | null;
  status: KanbanStatus | null;
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
  internal_notes: string | null;
  total_charges: number | string | null;
  deposit: number | string | null;
  balance: number | string | null;
  due_date: string | null;
  in_date: string | null;
  staff_member: string | null;
  valuation_required: boolean | null;
  collected_at: string | null;
  // New workshop columns
  workshop_subcontractor_name: string | null;
  workshop_pathway_id: string | null;
  workshop_step_index: number;
  workshop_intake_substatus: string | null;
  workshop_needs_valuation: boolean;
  workshop_valuer: string | null;
  workshop_supplier: string | null;
  workshop_po_number: string | null;
}

interface TeamMember {
  id: string;
  tenant_id: string;
  name: string;
  profile_id: string | null;
  sort_order: number;
  active: boolean;
}

interface Subcontractor {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
  active: boolean;
}

interface Valuer {
  id: string;
  name: string;
  active: boolean;
}

interface PathwayStep { name: string; location: "inhouse" | "external"; }
interface Pathway { id: string; name: string; steps: PathwayStep[]; }

interface ManagerMessage { id: string; text: string; created_at: string; }
interface LeadTime { id: string; job_type: string; weeks: number | null; }

interface Profile { id: string; full_name: string | null; role: string | null; }

interface WorkshopConfig {
  teamMembers: TeamMember[];
  subcontractors: Subcontractor[];
  valuers: Valuer[];
  pathways: Pathway[];
  messages: ManagerMessage[];
  leadTimes: LeadTime[];
}

// Column descriptor — one per kanban column rendered
interface ColDesc {
  key: string;
  label: string;
  headerBg: string;
  accent: string;
  colBg: string;
  match: (p: WorkshopPacket, config: WorkshopConfig, profiles: Profile[]) => boolean;
  dropPayload: (config: WorkshopConfig) => Record<string, unknown>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const JOB_TYPE_LABELS: Record<string, string> = {
  repair:           "Repair",
  custom_order:     "Custom",
  stock_work:       "Stock",
  online_order:     "Online",
  collection_order: "Collection",
};

const JOB_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  repair:           { bg: "#EEF2FF", color: "#4F46E5" },
  custom_order:     { bg: "#FFF7ED", color: "#C2410C" },
  stock_work:       { bg: "#F0FDF4", color: "#15803D" },
  online_order:     { bg: "#EFF6FF", color: "#3B82F6" },
  collection_order: { bg: "#FDF4FF", color: "#9333EA" },
};

const SUBSTATUS_LABELS: Record<string, string> = {
  jobs_in:   "Jobs In",
  pre_check: "Pre-Check",
  on_order:  "On Order",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string { return new Date().toISOString().split("T")[0]; }

function isOverdue(p: WorkshopPacket): boolean {
  return !!p.due_date && p.due_date < todayStr() && p.status !== "collected";
}

function isStale(p: WorkshopPacket): boolean {
  if (!p.status_updated_at || p.status === "collected") return false;
  const diff = (Date.now() - new Date(p.status_updated_at).getTime()) / 86_400_000;
  return diff >= 5;
}

function isDueToday(p: WorkshopPacket): boolean {
  return !!p.due_date && p.due_date === todayStr() && p.status !== "collected";
}

function displayName(p: WorkshopPacket): string {
  if (p.job_type === "stock_work") return "Internal";
  return p.customer_display_name ||
    [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") ||
    "No name";
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function resolveSubStatusLabel(p: WorkshopPacket, config: WorkshopConfig): string | null {
  if (p.workshop_intake_substatus === "on_order") return "On Order";
  if (p.workshop_pathway_id) {
    const pw = config.pathways.find(x => x.id === p.workshop_pathway_id);
    if (pw) {
      const total = pw.steps.length;
      const step = (p.workshop_step_index ?? 0) + 1;
      return `${pw.name} – Step ${step}/${total}`;
    }
  }
  if (p.workshop_valuer) return `Valuer: ${p.workshop_valuer}`;
  return null;
}

// ── Column builder ────────────────────────────────────────────────────────────

function buildColumns(config: WorkshopConfig): ColDesc[] {
  const cols: ColDesc[] = [];

  // 1. Intake
  cols.push({
    key: "intake",
    label: "Intake",
    headerBg: "#F3F4F6", accent: "#6B7280", colBg: "#F9FAFB",
    match: p => p.status === "intake" && p.workshop_intake_substatus !== "pre_check",
    dropPayload: () => ({ status: "intake", workshop_intake_substatus: "jobs_in" }),
  });

  // 2. Pre-Check
  cols.push({
    key: "pre_check",
    label: "Pre-Check",
    headerBg: "#FEF3C7", accent: "#D97706", colBg: "#FFFBEB",
    match: p => p.status === "intake" && p.workshop_intake_substatus === "pre_check",
    dropPayload: () => ({ status: "intake", workshop_intake_substatus: "pre_check" }),
  });

  // 3. Quality Control
  cols.push({
    key: "quality_check",
    label: "Quality Control",
    headerBg: "#DBEAFE", accent: "#3B82F6", colBg: "#EFF6FF",
    match: p => p.status === "quality_check",
    dropPayload: () => ({ status: "quality_check" }),
  });

  // 4a. Unassigned — Manufacturing (custom_order)
  cols.push({
    key: "unassigned_manufacturing",
    label: "Manufacturing Orders",
    headerBg: "#FFF7ED", accent: "#C2410C", colBg: "#FFF7ED",
    match: p => p.status === "on_bench" && !p.assigned_to && !p.workshop_subcontractor_name && p.job_type === "custom_order",
    dropPayload: () => ({ status: "on_bench", assigned_to: null, workshop_subcontractor_name: null }),
  });

  // 4b. Unassigned — Repairs (repair + stock_work + online_order)
  // NOTE: stock_work and online_order mapping here pending confirmation
  cols.push({
    key: "unassigned_repairs",
    label: "Repairs",
    headerBg: "#EEF2FF", accent: "#4F46E5", colBg: "#EEF2FF",
    match: p => p.status === "on_bench" && !p.assigned_to && !p.workshop_subcontractor_name &&
      (p.job_type === "repair" || p.job_type === "stock_work" || p.job_type === "online_order"),
    dropPayload: () => ({ status: "on_bench", assigned_to: null, workshop_subcontractor_name: null }),
  });

  // 4c. Unassigned — Collection Orders
  cols.push({
    key: "unassigned_collection",
    label: "Collection Orders",
    headerBg: "#FDF4FF", accent: "#9333EA", colBg: "#FDF4FF",
    match: p => p.status === "on_bench" && !p.assigned_to && !p.workshop_subcontractor_name && p.job_type === "collection_order",
    dropPayload: () => ({ status: "on_bench", assigned_to: null, workshop_subcontractor_name: null }),
  });

  // 5. One column per active team member
  for (const m of config.teamMembers.filter(m => m.active)) {
    cols.push({
      key: `member_${m.id}`,
      label: m.name,
      headerBg: "#F0F9FF", accent: "#0284C7", colBg: "#F0F9FF",
      match: (p, _cfg, profiles) => {
        if (p.status !== "on_bench" || !!p.workshop_subcontractor_name) return false;
        if (!p.assigned_to) return false;
        // Match by profile_id link first, then by name
        if (m.profile_id) return p.assigned_to === m.profile_id;
        const prof = profiles.find(pr => pr.id === p.assigned_to);
        return !!prof && prof.full_name?.toLowerCase().trim() === m.name.toLowerCase().trim();
      },
      dropPayload: () => ({
        status: "on_bench",
        assigned_to: m.profile_id ?? null,
        workshop_subcontractor_name: null,
      }),
    });
  }

  // 6. One column per active subcontractor
  for (const s of config.subcontractors.filter(s => s.active)) {
    cols.push({
      key: `sub_${s.id}`,
      label: s.name,
      headerBg: "#FFF1F2", accent: "#E11D48", colBg: "#FFF1F2",
      match: p => p.status === "on_bench" && p.workshop_subcontractor_name === s.name,
      dropPayload: () => ({ status: "on_bench", workshop_subcontractor_name: s.name, assigned_to: null }),
    });
  }

  // 7. To-Be-Valued
  cols.push({
    key: "to_be_valued",
    label: "To-Be-Valued",
    headerBg: "#FDF4FF", accent: "#9333EA", colBg: "#FAF5FF",
    match: p => p.status === "to_be_valued",
    dropPayload: () => ({ status: "to_be_valued" }),
  });

  // 8. Ready for Collection
  cols.push({
    key: "ready",
    label: "Ready for Collection",
    headerBg: "#DCFCE7", accent: "#16A34A", colBg: "#F0FDF4",
    match: p => p.status === "ready",
    dropPayload: () => ({ status: "ready" }),
  });

  // 9. Collected (collapsed by default — handled separately in render)
  cols.push({
    key: "collected",
    label: "Collected",
    headerBg: "#F3F4F6", accent: "#6B7280", colBg: "#F9FAFB",
    match: p => p.status === "collected",
    dropPayload: () => ({ status: "collected" }),
  });

  return cols;
}

// ── At-Risk banner ────────────────────────────────────────────────────────────

function AtRiskBanner({ packets }: { packets: WorkshopPacket[] }) {
  const active = packets.filter(p => p.status !== "collected");
  const overduePkts = active.filter(isOverdue);
  const stalePkts   = active.filter(p => !isOverdue(p) && isStale(p));

  if (overduePkts.length === 0 && stalePkts.length === 0) {
    return (
      <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#15803D", fontWeight: 600, flexShrink: 0 }}>
        <span>✓</span> Nothing at risk
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
      {overduePkts.length > 0 && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#DC2626" }}>
          ⚠ {overduePkts.length} overdue
        </div>
      )}
      {stalePkts.length > 0 && (
        <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#B45309" }}>
          ⏸ {stalePkts.length} stale (5+ days)
        </div>
      )}
    </div>
  );
}

// ── Manager Noticeboard ───────────────────────────────────────────────────────

function ManagerNoticeboard({
  messages,
  leadTimes,
  tenantId,
  onRefresh,
}: {
  messages: ManagerMessage[];
  leadTimes: LeadTime[];
  tenantId: string;
  onRefresh: () => void;
}) {
  const [newMsg, setNewMsg] = useState("");
  const [posting, setPosting] = useState(false);
  const [editLead, setEditLead] = useState<Record<string, string>>({});
  const [savingLead, setSavingLead] = useState(false);
  const h = { "Content-Type": "application/json", "x-tenant-id": tenantId };

  const postMessage = async () => {
    if (!newMsg.trim()) return;
    setPosting(true);
    await fetch("/api/workshop/manager-messages", { method: "POST", headers: h, body: JSON.stringify({ text: newMsg.trim() }) });
    setNewMsg("");
    setPosting(false);
    onRefresh();
  };

  const deleteMessage = async (id: string) => {
    await fetch("/api/workshop/manager-messages", { method: "DELETE", headers: h, body: JSON.stringify({ id }) });
    onRefresh();
  };

  const JOB_TYPES = ["repair", "custom_order", "collection_order", "stock_work", "online_order"];

  const saveLead = async (jobType: string) => {
    const weeks = editLead[jobType];
    if (weeks === undefined) return;
    setSavingLead(true);
    await fetch("/api/workshop/lead-times", {
      method: "PUT", headers: h,
      body: JSON.stringify({ job_type: jobType, weeks: weeks === "" ? null : Number(weeks) }),
    });
    setSavingLead(false);
    onRefresh();
  };

  const INPUT: React.CSSProperties = { border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px", fontSize: 13, outline: "none", background: "#fff", color: "#1A1A2E", fontFamily: "inherit" };

  return (
    <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", marginBottom: 12 }}>Manager Noticeboard</div>

      {/* Messages */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {messages.length === 0 && <div style={{ fontSize: 13, color: "#9CA3AF" }}>No messages yet.</div>}
        {messages.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px" }}>
            <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{m.text}</span>
            <button onClick={() => deleteMessage(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        ))}
      </div>

      {/* New message input */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input
          type="text"
          value={newMsg}
          onChange={e => setNewMsg(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") postMessage(); }}
          placeholder="Post a note to the team…"
          style={{ ...INPUT, flex: 1 }}
        />
        <button onClick={postMessage} disabled={posting || !newMsg.trim()} style={{ background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: posting ? 0.6 : 1 }}>
          Post
        </button>
      </div>

      {/* Lead times */}
      <div style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Estimated Lead Times</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {JOB_TYPES.map(jt => {
          const existing = leadTimes.find(lt => lt.job_type === jt);
          const val = editLead[jt] ?? (existing?.weeks != null ? String(existing.weeks) : "");
          return (
            <div key={jt} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>{JOB_TYPE_LABELS[jt] ?? jt}:</span>
              <input
                type="number"
                value={val}
                onChange={e => setEditLead(prev => ({ ...prev, [jt]: e.target.value }))}
                onBlur={() => saveLead(jt)}
                placeholder="wks"
                style={{ ...INPUT, width: 56, padding: "4px 8px", fontSize: 12 }}
              />
              {val && <span style={{ fontSize: 11, color: "#9CA3AF" }}>wk{Number(val) !== 1 ? "s" : ""}</span>}
            </div>
          );
        })}
        {savingLead && <span style={{ fontSize: 12, color: "#635BFF" }}>Saving…</span>}
      </div>
    </div>
  );
}

// ── Job Card ──────────────────────────────────────────────────────────────────

function JobCard({
  packet,
  config,
  onDragStart,
  onClick,
}: {
  packet: WorkshopPacket;
  config: WorkshopConfig;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onClick: (p: WorkshopPacket) => void;
}) {
  const overdue   = isOverdue(packet);
  const dueToday  = isDueToday(packet);
  const stale     = isStale(packet);
  const jt        = packet.job_type ?? "repair";
  const jtColor   = JOB_TYPE_COLORS[jt] ?? JOB_TYPE_COLORS.repair;
  const subStatus = resolveSubStatusLabel(packet, config);

  const leftBorder = overdue
    ? "3px solid #EF4444"
    : (stale && !dueToday)
      ? "3px solid #F59E0B"
      : "3px solid transparent";

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, packet.id)}
      onClick={() => onClick(packet)}
      style={{
        background: "#fff",
        border: "1px solid #E8E8F0",
        borderLeft: leftBorder,
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "grab",
        userSelect: "none",
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = "none")}
    >
      {/* Ref + badge row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 5 }}>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: "#9CA3AF", letterSpacing: "0.02em" }}>
          {packet.reference_number}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: jtColor.bg, color: jtColor.color, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {JOB_TYPE_LABELS[jt] ?? jt}
        </span>
      </div>

      {/* Customer name */}
      <div style={{ fontWeight: 600, color: "#1A1A2E", fontSize: 13, marginBottom: 3 }}>
        {displayName(packet)}
      </div>

      {/* Description */}
      {packet.articles && (
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {packet.articles}
        </div>
      )}

      {/* Sub-status + valuation badges */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {subStatus && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: "#F3F4F6", color: "#6B7280" }}>
            {subStatus}
          </span>
        )}
        {packet.workshop_needs_valuation && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FDF4FF", color: "#9333EA", border: "1px solid #E9D5FF" }}>
            Needs Valuation
          </span>
        )}
      </div>

      {/* Due date + assignee */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        {packet.due_date ? (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 6,
            background: overdue ? "#FEE2E2" : dueToday ? "#FEF3C7" : "#F3F4F6",
            color: overdue ? "#DC2626" : dueToday ? "#B45309" : "#6B7280",
          }}>
            {overdue ? "⚠ " : dueToday ? "⏰ " : ""}{formatDateAU(packet.due_date)}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "#D1D5DB" }}>No due date</span>
        )}
        {packet.assigned_to_name && (
          <span style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "#635BFF", color: "#fff",
            fontSize: 9, fontWeight: 700,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {initials(packet.assigned_to_name)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Slide-Over Panel ──────────────────────────────────────────────────────────

function SlideOver({
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
  onUpdate: (updated: WorkshopPacket) => void;
  onDelete: (id: string) => void;
}) {
  const [local, setLocal]   = useState<WorkshopPacket>(packet);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { setLocal(packet); }, [packet]);

  const headers = { "Content-Type": "application/json", "x-tenant-id": tenantId };

  const patch = useCallback(async (fields: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/workshop/packets/${local.id}`, {
        method: "PATCH", headers, body: JSON.stringify(fields),
      });
      const json = await res.json();
      if (json.packet) {
        // Re-resolve display names client-side
        const updated: WorkshopPacket = {
          ...json.packet,
          customer_display_name: local.customer_display_name,
          assigned_to_name: fields.assigned_to !== undefined
            ? (profiles.find(p => p.id === fields.assigned_to)?.full_name ?? null)
            : local.assigned_to_name,
        };
        setLocal(updated);
        onUpdate(updated);
      }
    } catch { /* noop */ } finally {
      setSaving(false);
    }
  }, [local.id, local.customer_display_name, local.assigned_to_name, headers, onUpdate, profiles]);

  const handleDelete = async () => {
    if (!confirm("Delete this job permanently?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/workshop/packets/${local.id}`, { method: "DELETE", headers });
      onDelete(local.id);
      onClose();
    } catch { /* noop */ } finally {
      setDeleting(false);
    }
  };

  const overdue  = isOverdue(local);
  const dueToday = isDueToday(local);

  const ALL_STATUSES: Array<[KanbanStatus, string, string]> = [
    ["intake",        "Intake",               "#6B7280"],
    ["on_bench",      "On Bench",             "#D97706"],
    ["quality_check", "Quality Control",      "#3B82F6"],
    ["to_be_valued",  "To-Be-Valued",         "#9333EA"],
    ["ready",         "Ready",                "#16A34A"],
    ["collected",     "Collected",            "#7C3AED"],
  ];

  const INPUT: React.CSSProperties = {
    width: "100%", border: "1px solid #E8E8F0", borderRadius: 8,
    padding: "7px 10px", fontSize: 13, color: "#1A1A2E",
    outline: "none", background: "#fff", fontFamily: "inherit",
  };
  const TEXTAREA: React.CSSProperties = { ...INPUT, resize: "vertical" as const };

  const FIELD = (label: string, content: React.ReactNode) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      {content}
    </div>
  );

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100 }} onClick={onClose} />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 101,
        width: "min(540px, 100vw)",
        background: "#fff",
        display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8F0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#9CA3AF", marginBottom: 2 }}>{local.reference_number}</div>
            <div style={{ fontWeight: 700, color: "#1A1A2E", fontSize: 18 }}>{displayName(local)}</div>
            {local.customer_email && <div style={{ fontSize: 12, color: "#6B7280" }}>{local.customer_email}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9CA3AF", flexShrink: 0 }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status buttons */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #E8E8F0", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Stage</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ALL_STATUSES.map(([s, label, accent]) => {
              const active = local.status === s;
              return (
                <button
                  key={s}
                  onClick={() => patch({ status: s })}
                  style={{
                    padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${active ? accent : "#E8E8F0"}`,
                    background: active ? accent : "#fff",
                    color: active ? "#fff" : "#6B7280",
                    transition: "all .12s",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {saving && <div style={{ fontSize: 11, color: "#635BFF", marginTop: 6 }}>Saving…</div>}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {(overdue || dueToday) && (
            <div style={{ background: overdue ? "#FEE2E2" : "#FEF3C7", border: `1px solid ${overdue ? "#FCA5A5" : "#FDE68A"}`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, fontWeight: 600, color: overdue ? "#DC2626" : "#B45309" }}>
              {overdue ? "⚠ Overdue" : "⏰ Due today"}
            </div>
          )}

          {FIELD("Job Type",
            <select value={local.job_type ?? "repair"} onChange={e => patch({ job_type: e.target.value })} style={INPUT}>
              <option value="repair">Repair</option>
              <option value="custom_order">Custom Order</option>
              <option value="collection_order">Collection Order</option>
              <option value="online_order">Online Order</option>
              <option value="stock_work">Stock Work</option>
            </select>
          )}

          {local.status === "intake" && FIELD("Intake Sub-Status",
            <select value={local.workshop_intake_substatus ?? "jobs_in"} onChange={e => patch({ workshop_intake_substatus: e.target.value })} style={INPUT}>
              <option value="jobs_in">Jobs In</option>
              <option value="pre_check">Pre-Check</option>
              <option value="on_order">On Order</option>
            </select>
          )}

          {FIELD("Assigned To",
            <select
              value={local.assigned_to ?? ""}
              onChange={e => patch({ assigned_to: e.target.value || null, workshop_subcontractor_name: null })}
              style={INPUT}
            >
              <option value="">— Unassigned —</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
              ))}
            </select>
          )}

          {FIELD("Subcontractor",
            <select
              value={local.workshop_subcontractor_name ?? ""}
              onChange={e => patch({ workshop_subcontractor_name: e.target.value || null, assigned_to: null })}
              style={INPUT}
            >
              <option value="">— None —</option>
              {config.subcontractors.filter(s => s.active).map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          )}

          {FIELD("Pathway",
            <select
              value={local.workshop_pathway_id ?? ""}
              onChange={e => patch({ workshop_pathway_id: e.target.value || null, workshop_step_index: 0 })}
              style={INPUT}
            >
              <option value="">— No pathway —</option>
              {config.pathways.map(pw => (
                <option key={pw.id} value={pw.id}>{pw.name}</option>
              ))}
            </select>
          )}

          {local.workshop_pathway_id && (() => {
            const pw = config.pathways.find(p => p.id === local.workshop_pathway_id);
            if (!pw || pw.steps.length === 0) return null;
            return FIELD(`Step (${pw.steps.length} total)`,
              <select
                value={local.workshop_step_index ?? 0}
                onChange={e => patch({ workshop_step_index: Number(e.target.value) })}
                style={INPUT}
              >
                {pw.steps.map((step, i) => (
                  <option key={i} value={i}>
                    {i + 1}. {step.name} ({step.location})
                  </option>
                ))}
              </select>
            );
          })()}

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!local.workshop_needs_valuation}
                onChange={e => patch({ workshop_needs_valuation: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: "#635BFF" }}
              />
              <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Needs Valuation</span>
            </label>
            {local.workshop_needs_valuation && Number(local.total_charges) >= 3000 && (
              <span style={{ fontSize: 11, color: "#9333EA" }}>Auto (≥$3,000)</span>
            )}
          </div>

          {local.workshop_needs_valuation && FIELD("Valuer",
            <select value={local.workshop_valuer ?? ""} onChange={e => patch({ workshop_valuer: e.target.value || null })} style={INPUT}>
              <option value="">— Unassigned —</option>
              {config.valuers.filter(v => v.active).map(v => (
                <option key={v.id} value={v.name}>{v.name}</option>
              ))}
            </select>
          )}

          {FIELD("Due Date",
            <input
              type="date"
              value={local.due_date ?? ""}
              onChange={e => patch({ due_date: e.target.value || null })}
              style={INPUT}
            />
          )}

          {FIELD("Description of Work",
            <textarea
              rows={3}
              defaultValue={local.articles ?? ""}
              onBlur={e => { if (e.target.value !== (local.articles ?? "")) patch({ articles: e.target.value || null }); }}
              style={TEXTAREA}
            />
          )}

          {FIELD("Instructions",
            <textarea
              rows={2}
              defaultValue={local.instructions ?? ""}
              onBlur={e => { if (e.target.value !== (local.instructions ?? "")) patch({ instructions: e.target.value || null }); }}
              style={TEXTAREA}
            />
          )}

          {FIELD("Internal Notes",
            <textarea
              rows={2}
              defaultValue={local.internal_notes ?? ""}
              onBlur={e => { if (e.target.value !== (local.internal_notes ?? "")) patch({ internal_notes: e.target.value || null }); }}
              style={TEXTAREA}
            />
          )}

          {/* Procurement */}
          <div style={{ borderTop: "1px solid #E8E8F0", paddingTop: 14, marginTop: 4, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Supplier</div>
              <input
                type="text"
                defaultValue={local.workshop_supplier ?? ""}
                onBlur={e => { if (e.target.value !== (local.workshop_supplier ?? "")) patch({ workshop_supplier: e.target.value || null }); }}
                style={INPUT}
                placeholder="Supplier name…"
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>PO Number</div>
              <input
                type="text"
                defaultValue={local.workshop_po_number ?? ""}
                onBlur={e => { if (e.target.value !== (local.workshop_po_number ?? "")) patch({ workshop_po_number: e.target.value || null }); }}
                style={INPUT}
                placeholder="PO-…"
              />
            </div>
          </div>

          {/* Pricing */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Quoted Price</div>
              <input
                type="number" step="0.01"
                defaultValue={Number(local.total_charges) || ""}
                onBlur={e => { const v = e.target.value ? Number(e.target.value) : null; if (v !== Number(local.total_charges)) patch({ total_charges: v }); }}
                style={INPUT} placeholder="0.00"
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Deposit Taken</div>
              <input
                type="number" step="0.01"
                defaultValue={Number(local.deposit) || ""}
                onBlur={e => { const v = e.target.value ? Number(e.target.value) : null; if (v !== Number(local.deposit)) patch({ deposit: v }); }}
                style={INPUT} placeholder="0.00"
              />
            </div>
          </div>

          {local.balance != null && local.total_charges != null && (
            <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "#1A1A2E", marginBottom: 12 }}>
              Balance owing: {formatCurrency(Number(local.balance))}
            </div>
          )}

          {/* Customer details */}
          {local.job_type !== "stock_work" && (
            <div style={{ borderTop: "1px solid #E8E8F0", paddingTop: 14, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Customer Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, color: "#374151" }}>
                <div><span style={{ color: "#9CA3AF" }}>Phone: </span>{local.customer_phone || "—"}</div>
                <div><span style={{ color: "#9CA3AF" }}>Email: </span>{local.customer_email || "—"}</div>
                {(local.customer_street || local.customer_suburb) && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "#9CA3AF" }}>Address: </span>
                    {[local.customer_street, local.customer_suburb, local.customer_state, local.customer_postcode].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dates */}
          <div style={{ borderTop: "1px solid #E8E8F0", paddingTop: 14, marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, color: "#374151" }}>
            <div><span style={{ color: "#9CA3AF" }}>In Date: </span>{local.in_date ? formatDateAU(local.in_date) : "—"}</div>
            <div><span style={{ color: "#9CA3AF" }}>Staff: </span>{local.staff_member || "—"}</div>
            {local.collected_at && (
              <div style={{ gridColumn: "1 / -1" }}>
                <span style={{ color: "#9CA3AF" }}>Collected: </span>
                {new Date(local.collected_at).toLocaleDateString("en-AU")}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {isManager && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #E8E8F0", flexShrink: 0 }}>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ background: "#FEE2E2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: deleting ? 0.5 : 1 }}
            >
              {deleting ? "Deleting…" : "Delete Job"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkshopPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "workshop")) router.replace("/");
  }, [user, hydrated, router]);

  const tenantId  = user?.tenantId ?? "";
  const isManager = canManage(user?.role ?? null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [packets,  setPackets]  = useState<WorkshopPacket[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [config,   setConfig]   = useState<WorkshopConfig>({
    teamMembers: [], subcontractors: [], valuers: [], pathways: [], messages: [], leadTimes: [],
  });
  const [loading,          setLoading]          = useState(true);
  const [selectedPacket,   setSelectedPacket]   = useState<WorkshopPacket | null>(null);
  const [collectedOpen,    setCollectedOpen]     = useState(false);
  const [includeCollected, setIncludeCollected]  = useState(false);
  const [jobTypeFilter,    setJobTypeFilter]     = useState("all");
  const [statusFilter,     setStatusFilter]      = useState("all");
  const [search,           setSearch]            = useState("");
  const dragId = useRef<string | null>(null);

  // ── Fetchers ───────────────────────────────────────────────────────────────
  const fetchPackets = useCallback(async (withCollected = includeCollected) => {
    if (!tenantId) return;
    const url = `/api/workshop/packets${withCollected ? "?include_collected=1" : ""}`;
    try {
      const res = await fetch(url, { cache: "no-store", headers: { "x-tenant-id": tenantId } });
      const json = await res.json();
      setPackets(json.packets ?? []);
    } catch { setPackets([]); } finally { setLoading(false); }
  }, [tenantId, includeCollected]);

  const fetchConfig = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch("/api/workshop/config", { cache: "no-store", headers: { "x-tenant-id": tenantId } });
      const json = await res.json();
      setConfig({
        teamMembers:   json.teamMembers   ?? [],
        subcontractors: json.subcontractors ?? [],
        valuers:       json.valuers       ?? [],
        pathways:      json.pathways      ?? [],
        messages:      json.messages      ?? [],
        leadTimes:     json.leadTimes     ?? [],
      });
    } catch { /* noop */ }
  }, [tenantId]);

  useEffect(() => { fetchPackets(); }, [fetchPackets]);
  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  useEffect(() => {
    if (!tenantId) return;
    fetch("/api/profiles", { headers: { "x-tenant-id": tenantId } })
      .then(r => r.json())
      .then(j => setProfiles(j.profiles ?? []))
      .catch(() => {});
  }, [tenantId]);

  // ── Columns (memoised on config) ───────────────────────────────────────────
  const columns = buildColumns(config);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();

  const sortAtRisk = (pkts: WorkshopPacket[]): WorkshopPacket[] =>
    [...pkts].sort((a, b) => {
      const aScore = (isOverdue(a) ? 2 : 0) + (isStale(a) ? 1 : 0);
      const bScore = (isOverdue(b) ? 2 : 0) + (isStale(b) ? 1 : 0);
      return bScore - aScore;
    });

  const filteredPackets = packets.filter(p => {
    if (jobTypeFilter !== "all" && p.job_type !== jobTypeFilter) return false;
    if (statusFilter === "overdue"   && !isOverdue(p))   return false;
    if (statusFilter === "due_today" && !isDueToday(p))  return false;
    if (statusFilter === "ready"     && p.status !== "ready") return false;
    if (q) {
      const name = displayName(p).toLowerCase();
      const ref  = (p.reference_number ?? "").toLowerCase();
      const desc = (p.articles ?? "").toLowerCase();
      if (!name.includes(q) && !ref.includes(q) && !desc.includes(q)) return false;
    }
    return true;
  });

  const packetsForCol = (col: ColDesc): WorkshopPacket[] =>
    sortAtRisk(filteredPackets.filter(p => col.match(p, config, profiles)));

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e: React.DragEvent, col: ColDesc) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).style.outline = "none";
    const id = dragId.current;
    if (!id) return;
    dragId.current = null;

    const payload = col.dropPayload(config);
    setPackets(prev => prev.map(p => p.id === id ? { ...p, ...(payload as Partial<WorkshopPacket>), status_updated_at: new Date().toISOString() } : p));
    if (selectedPacket?.id === id) setSelectedPacket(prev => prev ? { ...prev, ...(payload as Partial<WorkshopPacket>) } : null);

    try {
      await fetch(`/api/workshop/packets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify(payload),
      });
    } catch { fetchPackets(); }
  };

  const handleUpdate = (updated: WorkshopPacket) => {
    setPackets(prev => prev.map(p => p.id === updated.id ? updated : p));
    if (selectedPacket?.id === updated.id) setSelectedPacket(updated);
  };

  const handleDelete = (id: string) => {
    setPackets(prev => prev.filter(p => p.id !== id));
    if (selectedPacket?.id === id) setSelectedPacket(null);
  };

  const toggleCollected = () => {
    const next = !includeCollected;
    setIncludeCollected(next);
    setCollectedOpen(next);
    fetchPackets(next);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const JOB_TYPE_FILTER_OPTIONS = [
    ["all", "All Types"],
    ["repair", "Repairs"],
    ["custom_order", "Custom"],
    ["collection_order", "Collection"],
    ["online_order", "Online"],
    ["stock_work", "Stock"],
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", gap: 0 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 12, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Workshop</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "2px 0 0" }}>Everything on the bench</p>
        </div>
        <AtRiskBanner packets={packets} />
      </div>

      {/* ── Manager noticeboard ─────────────────────────────────────────────── */}
      {isManager && (
        <ManagerNoticeboard
          messages={config.messages}
          leadTimes={config.leadTimes}
          tenantId={tenantId}
          onRefresh={fetchConfig}
        />
      )}
      {!isManager && config.messages.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "12px 20px", marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {config.messages.map(m => (
              <div key={m.id} style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#374151" }}>
                {m.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
        {/* Search */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ref, name, description…"
            style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px 6px 28px", fontSize: 13, outline: "none", background: "#F9FAFB", color: "#1A1A2E", width: 220 }}
          />
        </div>

        <div style={{ width: 1, height: 20, background: "#E8E8F0", flexShrink: 0 }} />

        {/* Job type tabs */}
        <div style={{ display: "flex", gap: 3, background: "#F3F4F6", borderRadius: 8, padding: 3, flexShrink: 0 }}>
          {JOB_TYPE_FILTER_OPTIONS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => setJobTypeFilter(v)}
              style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none",
                background: jobTypeFilter === v ? "#fff" : "transparent",
                color: jobTypeFilter === v ? "#1A1A2E" : "#6B7280",
                boxShadow: jobTypeFilter === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                cursor: "pointer",
              }}
            >{label}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: "#E8E8F0", flexShrink: 0 }} />

        {/* Status pills */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {([
            ["all",      "All",       "#6B7280", "#F3F4F6"],
            ["overdue",  "Overdue",   "#DC2626", "#FEE2E2"],
            ["due_today","Due Today", "#B45309", "#FEF3C7"],
            ["ready",    "Ready",     "#16A34A", "#DCFCE7"],
          ] as const).map(([v, label, color, bg]) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              style={{
                padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: "none",
                background: statusFilter === v ? bg : "transparent",
                color: statusFilter === v ? color : "#6B7280",
                cursor: "pointer",
                outline: statusFilter === v ? `1px solid ${color}33` : "none",
              }}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* ── Kanban board ───────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 14 }}>
          Loading jobs…
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", gap: 10, overflowX: "auto", overflowY: "hidden", paddingBottom: 4 }}>
          {columns.map(col => {
            const cards    = packetsForCol(col);
            const isCollectedCol = col.key === "collected";

            if (isCollectedCol) {
              return (
                <div key={col.key} style={{ flexShrink: 0, width: collectedOpen ? 280 : 130, transition: "width .2s", display: "flex", flexDirection: "column" }}>
                  <button
                    onClick={toggleCollected}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between",
                      background: col.headerBg, border: "1px solid #E8E8F0", borderRadius: 10,
                      padding: "10px 14px", cursor: "pointer", width: "100%", marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: col.accent }}>
                      {collectedOpen ? "▾" : "▸"} Collected
                    </span>
                    {collectedOpen && <span style={{ fontSize: 12, fontWeight: 700, color: col.accent }}>{cards.length}</span>}
                  </button>
                  {collectedOpen && (
                    <div
                      style={{ flex: 1, overflowY: "auto", background: col.colBg, border: "1px solid #E8E8F0", borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 8 }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => handleDrop(e, col)}
                    >
                      {cards.length === 0 && <div style={{ padding: "24px 8px", textAlign: "center", color: "#D1D5DB", fontSize: 12 }}>No collected jobs</div>}
                      {cards.map(p => (
                        <JobCard key={p.id} packet={p} config={config} onDragStart={handleDragStart} onClick={() => setSelectedPacket(p)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={col.key} style={{ flexShrink: 0, width: 260, display: "flex", flexDirection: "column" }}>
                <div style={{
                  background: col.headerBg,
                  borderRadius: "10px 10px 0 0",
                  border: "1px solid #E8E8F0",
                  borderBottom: "none",
                  padding: "10px 14px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: col.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {col.label}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,0.7)", color: col.accent, borderRadius: 999, padding: "1px 7px", flexShrink: 0 }}>
                    {cards.length}
                  </span>
                </div>
                <div
                  style={{ flex: 1, overflowY: "auto", background: col.colBg, border: "1px solid #E8E8F0", borderTop: "none", borderRadius: "0 0 10px 10px", padding: 8, display: "flex", flexDirection: "column", gap: 8, minHeight: 180 }}
                  onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.outline = `2px dashed ${col.accent}`; }}
                  onDragLeave={e => { (e.currentTarget as HTMLDivElement).style.outline = "none"; }}
                  onDrop={e => handleDrop(e, col)}
                >
                  {cards.length === 0 && (
                    <div style={{ padding: "24px 8px", textAlign: "center", color: "#D1D5DB", fontSize: 12 }}>
                      {col.key === "collected" ? "No collected jobs" : "Drop cards here"}
                    </div>
                  )}
                  {cards.map(p => (
                    <JobCard key={p.id} packet={p} config={config} onDragStart={handleDragStart} onClick={() => setSelectedPacket(p)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Slide-over ─────────────────────────────────────────────────────── */}
      {selectedPacket && (
        <SlideOver
          packet={selectedPacket}
          config={config}
          profiles={profiles}
          isManager={isManager}
          tenantId={tenantId}
          onClose={() => setSelectedPacket(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
