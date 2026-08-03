"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { hasPermission, canManage } from "@/lib/userTypes";
import { formatDateAU, formatCurrency } from "@/lib/formatters";
import WorkshopJobDrawer from "@/components/WorkshopJobDrawer";

// ── Types ────────────────────────────────────────────────────────────────────

type KanbanStatus = "intake" | "on_bench" | "quality_check" | "to_be_valued" | "ready" | "collected";
type GroupingKey  = "stage" | "assignee" | "work_centre" | "current_step";

interface WorkshopPacket {
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
  internal_notes: string | null;
  item_specifications: string | null;
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

interface TeamMember     { id: string; tenant_id: string; name: string; profile_id: string | null; sort_order: number; active: boolean; }
interface Subcontractor  { id: string; tenant_id: string; name: string; sort_order: number; active: boolean; }
interface Valuer         { id: string; name: string; active: boolean; }
interface PathwayStep    { name: string; location: "inhouse" | "external"; }
interface Pathway        { id: string; name: string; steps: PathwayStep[]; }
interface ManagerMessage { id: string; text: string; created_at: string; }
interface LeadTime       { id: string; job_type: string; weeks: number | null; }
interface Profile        { id: string; full_name: string | null; role: string | null; }
interface WorkshopLocation { id: string; name: string; job_types: string[]; sort_order: number; }

interface WorkshopConfig {
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

interface Column {
  key: string;
  label: string;
  accent: string;
  colBg: string;
  alwaysShow?: boolean;
  dragDisabled?: boolean;
  match: (p: WorkshopPacket) => boolean;
  dropPayload: () => Record<string, unknown>;
}

interface MoveOption { value: string; label: string; payload: Record<string, unknown>; }

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_GROUPING_KEY = "workshop_grouping_v1";

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

const STAGE_DEFS = [
  { key: "intake",        label: "Intake",               status: "intake",        accent: "#378ADD", colBg: "#F0F7FF" },
  { key: "on_bench",      label: "Production",           status: "on_bench",      accent: "#7F77DD", colBg: "#F5F3FF" },
  { key: "quality_check", label: "Quality Control",      status: "quality_check", accent: "#D85A30", colBg: "#FFF5F3" },
  { key: "to_be_valued",  label: "Valuation",            status: "to_be_valued",  accent: "#BA7517", colBg: "#FFFBEB" },
  { key: "ready",         label: "Ready for Collection", status: "ready",         accent: "#1D9E75", colBg: "#ECFDF5" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string { return new Date().toISOString().split("T")[0]; }
function isOverdue(p: WorkshopPacket)  { return !!p.due_date && p.due_date < todayStr() && p.status !== "collected"; }
function isDueToday(p: WorkshopPacket) { return !!p.due_date && p.due_date === todayStr() && p.status !== "collected"; }
function isStale(p: WorkshopPacket, threshold = 5) {
  if (!p.status_updated_at || p.status === "collected") return false;
  return (Date.now() - new Date(p.status_updated_at).getTime()) / 86_400_000 >= threshold;
}
function displayName(p: WorkshopPacket) {
  if (p.job_type === "stock_work") return "Internal";
  return p.customer_display_name || [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "No name";
}
function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
function resolveAssignee(p: WorkshopPacket): string | null {
  return p.assigned_to_name || p.workshop_subcontractor_name || null;
}
function resolveStepLabel(p: WorkshopPacket, config: WorkshopConfig): string | null {
  if (!p.workshop_pathway_id) return null;
  const pw = config.pathways.find(x => x.id === p.workshop_pathway_id);
  if (!pw || !pw.steps.length) return null;
  const idx = p.workshop_step_index ?? 0;
  const step = pw.steps[idx];
  if (!step) return null;
  return `Step ${idx + 1}/${pw.steps.length}: ${step.name}`;
}

// ── Column builders ───────────────────────────────────────────────────────────

function buildStageColumns(): Column[] {
  return STAGE_DEFS.map(c => ({
    key: c.key, label: c.label, accent: c.accent, colBg: c.colBg, alwaysShow: true,
    match: (p) => p.status === c.status,
    dropPayload: () => ({ status: c.status }),
  }));
}

function buildAssigneeColumns(config: WorkshopConfig): Column[] {
  const accent = "#7F77DD", colBg = "#F5F3FF";
  const subAccent = "#D85A30", subBg = "#FFF5F3";
  const cols: Column[] = [
    {
      key: "unassigned", label: "Unassigned", accent, colBg, alwaysShow: true,
      match: (p) => !p.assigned_to && !p.workshop_subcontractor_name,
      dropPayload: () => ({ assigned_to: null, workshop_subcontractor_name: null }),
    },
  ];
  for (const m of config.teamMembers.filter(m => m.active)) {
    const mid = m.id, mpid = m.profile_id, mname = m.name;
    cols.push({
      key: `tm_${mid}`, label: mname, accent, colBg,
      match: (p) => mpid
        ? p.assigned_to === mpid && !p.workshop_subcontractor_name
        : p.workshop_subcontractor_name === mname && !p.assigned_to,
      dropPayload: () => mpid
        ? { assigned_to: mpid, workshop_subcontractor_name: null }
        : { assigned_to: null, workshop_subcontractor_name: mname },
    });
  }
  const teamNameSet = new Set(config.teamMembers.filter(m => !m.profile_id).map(m => m.name));
  for (const s of config.subcontractors.filter(s => s.active)) {
    if (teamNameSet.has(s.name)) continue; // already covered by team
    const sname = s.name;
    cols.push({
      key: `sub_${s.id}`, label: sname, accent: subAccent, colBg: subBg,
      match: (p) => p.workshop_subcontractor_name === sname,
      dropPayload: () => ({ workshop_subcontractor_name: sname, assigned_to: null }),
    });
  }
  return cols;
}

function buildWorkCentreColumns(config: WorkshopConfig): Column[] {
  const accent = "#BA7517", colBg = "#FFFBEB";
  if (config.locations.length > 0) {
    return config.locations.slice().sort((a, b) => a.sort_order - b.sort_order).map(loc => {
      const jts = loc.job_types;
      return {
        key: `loc_${loc.id}`, label: loc.name, accent, colBg, alwaysShow: true, dragDisabled: true,
        match: (p) => !!p.job_type && jts.includes(p.job_type),
        dropPayload: () => ({}),
      };
    });
  }
  return [
    { key: "wc_custom", label: "Manufacturing Orders", accent, colBg, alwaysShow: true, dragDisabled: true, match: (p) => p.job_type === "custom_order",   dropPayload: () => ({}) },
    { key: "wc_repair", label: "Repairs",              accent, colBg, alwaysShow: true, dragDisabled: true, match: (p) => p.job_type === "repair",          dropPayload: () => ({}) },
    { key: "wc_stock",  label: "Stock / Online",       accent, colBg, alwaysShow: true, dragDisabled: true, match: (p) => p.job_type === "stock_work" || p.job_type === "online_order", dropPayload: () => ({}) },
    { key: "wc_coll",   label: "Collection Orders",    accent, colBg, alwaysShow: true, dragDisabled: true, match: (p) => p.job_type === "collection_order", dropPayload: () => ({}) },
  ];
}

function buildCurrentStepColumns(packets: WorkshopPacket[], config: WorkshopConfig): Column[] {
  const accent = "#635BFF", colBg = "#F5F3FF";
  const pwIds = new Set(packets.filter(p => p.workshop_pathway_id).map(p => p.workshop_pathway_id as string));
  const multiPw = pwIds.size > 1;
  const seen = new Set<string>();
  const stepCols: Column[] = [];

  for (const p of packets) {
    if (!p.workshop_pathway_id) continue;
    const idx = p.workshop_step_index ?? 0;
    const ck = `${p.workshop_pathway_id}_${idx}`;
    if (seen.has(ck)) continue;
    seen.add(ck);
    const pw = config.pathways.find(x => x.id === p.workshop_pathway_id);
    if (!pw) continue;
    const step = pw.steps[idx];
    if (!step) continue;
    const label = multiPw ? `${pw.name}: ${step.name}` : `Step ${idx + 1}/${pw.steps.length}: ${step.name}`;
    const pwId = p.workshop_pathway_id;
    stepCols.push({
      key: `step_${ck}`, label, accent, colBg,
      match: (p2) => p2.workshop_pathway_id === pwId && (p2.workshop_step_index ?? 0) === idx,
      dropPayload: () => ({ workshop_pathway_id: pwId, workshop_step_index: idx }),
    });
  }

  return [
    {
      key: "no_pathway", label: "No Pathway", accent: "#9CA3AF", colBg: "#F9FAFB", alwaysShow: true,
      match: (p) => !p.workshop_pathway_id,
      dropPayload: () => ({ workshop_pathway_id: null, workshop_step_index: 0 }),
    },
    ...stepCols,
  ];
}

// ── Move options per grouping ─────────────────────────────────────────────────

function getMoveOptions(p: WorkshopPacket, grouping: GroupingKey, config: WorkshopConfig): MoveOption[] {
  if (grouping === "stage") {
    return STAGE_DEFS.filter(c => c.status !== p.status).map(c => ({
      value: c.key, label: c.label, payload: { status: c.status },
    }));
  }
  if (grouping === "assignee") {
    const opts: MoveOption[] = [];
    const isUnassigned = !p.assigned_to && !p.workshop_subcontractor_name;
    if (!isUnassigned) opts.push({ value: "unassigned", label: "— Unassigned —", payload: { assigned_to: null, workshop_subcontractor_name: null } });
    for (const m of config.teamMembers.filter(m => m.active)) {
      const cur = m.profile_id ? p.assigned_to === m.profile_id : p.workshop_subcontractor_name === m.name && !p.assigned_to;
      if (!cur) opts.push({
        value: `tm_${m.id}`, label: m.name,
        payload: m.profile_id ? { assigned_to: m.profile_id, workshop_subcontractor_name: null } : { assigned_to: null, workshop_subcontractor_name: m.name },
      });
    }
    const teamNameSet = new Set(config.teamMembers.filter(m => !m.profile_id).map(m => m.name));
    for (const s of config.subcontractors.filter(s => s.active)) {
      if (teamNameSet.has(s.name)) continue;
      if (p.workshop_subcontractor_name !== s.name) opts.push({ value: `sub_${s.id}`, label: s.name, payload: { workshop_subcontractor_name: s.name, assigned_to: null } });
    }
    return opts;
  }
  if (grouping === "current_step") {
    if (!p.workshop_pathway_id) return [];
    const pw = config.pathways.find(x => x.id === p.workshop_pathway_id);
    if (!pw) return [];
    return pw.steps.map((step, i) => ({
      value: String(i),
      label: `Step ${i + 1}/${pw.steps.length}: ${step.name}`,
      payload: { workshop_step_index: i },
    })).filter((_, i) => i !== (p.workshop_step_index ?? 0));
  }
  return [];
}

// ── At-Risk Banner ────────────────────────────────────────────────────────────

function AtRiskBanner({ packets, staleThreshold }: { packets: WorkshopPacket[]; staleThreshold: number }) {
  const overduePkts = packets.filter(isOverdue);
  const stalePkts   = packets.filter(p => !isOverdue(p) && isStale(p, staleThreshold));
  const blockedPkts = packets.filter(p => !!p.blocked_reason);
  if (!overduePkts.length && !stalePkts.length && !blockedPkts.length) {
    return <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#15803D", fontWeight: 600, flexShrink: 0 }}>✓ Nothing at risk</div>;
  }
  return (
    <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
      {overduePkts.length > 0 && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#DC2626" }}>⚠ {overduePkts.length} overdue</div>}
      {stalePkts.length   > 0 && <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#B45309" }}>⏸ {stalePkts.length} stale</div>}
      {blockedPkts.length > 0 && <div style={{ background: "#FFF5F3", border: "1px solid #FDBA74", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#EA580C" }}>🚫 {blockedPkts.length} blocked</div>}
    </div>
  );
}

// ── Manager Noticeboard ───────────────────────────────────────────────────────

function ManagerNoticeboard({ messages, leadTimes, tenantId, onRefresh }: { messages: ManagerMessage[]; leadTimes: LeadTime[]; tenantId: string; onRefresh: () => void; }) {
  const [newMsg, setNewMsg] = useState("");
  const [posting, setPosting] = useState(false);
  const [editLead, setEditLead] = useState<Record<string, string>>({});
  const [savingLead, setSavingLead] = useState(false);
  const h = { "Content-Type": "application/json", "x-tenant-id": tenantId };

  const postMessage = async () => {
    if (!newMsg.trim()) return;
    setPosting(true);
    await fetch("/api/workshop/manager-messages", { method: "POST", headers: h, body: JSON.stringify({ text: newMsg.trim() }) });
    setNewMsg(""); setPosting(false); onRefresh();
  };
  const deleteMessage = async (id: string) => {
    await fetch("/api/workshop/manager-messages", { method: "DELETE", headers: h, body: JSON.stringify({ id }) });
    onRefresh();
  };
  const saveLead = async (jobType: string) => {
    const weeks = editLead[jobType];
    if (weeks === undefined) return;
    setSavingLead(true);
    await fetch("/api/workshop/lead-times", { method: "PUT", headers: h, body: JSON.stringify({ job_type: jobType, weeks: weeks === "" ? null : Number(weeks) }) });
    setSavingLead(false); onRefresh();
  };

  const INPUT: React.CSSProperties = { border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px", fontSize: 13, outline: "none", background: "#fff", color: "#1A1A2E", fontFamily: "inherit" };

  return (
    <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "16px 20px", marginBottom: 16, flexShrink: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", marginBottom: 12 }}>Manager Noticeboard</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {messages.length === 0 && <div style={{ fontSize: 13, color: "#9CA3AF" }}>No messages yet.</div>}
        {messages.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px" }}>
            <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{m.text}</span>
            <button onClick={() => deleteMessage(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => { if (e.key === "Enter") postMessage(); }} placeholder="Post a note to the team…" style={{ ...INPUT, flex: 1 }} />
        <button onClick={postMessage} disabled={posting || !newMsg.trim()} style={{ background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: posting ? 0.6 : 1 }}>Post</button>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Estimated Lead Times</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {["repair","custom_order","collection_order","stock_work","online_order"].map(jt => {
          const existing = leadTimes.find(lt => lt.job_type === jt);
          const val = editLead[jt] ?? (existing?.weeks != null ? String(existing.weeks) : "");
          return (
            <div key={jt} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" }}>{JOB_TYPE_LABELS[jt] ?? jt}:</span>
              <input type="number" value={val} onChange={e => setEditLead(prev => ({ ...prev, [jt]: e.target.value }))} onBlur={() => saveLead(jt)} placeholder="wks" style={{ ...INPUT, width: 56, padding: "4px 8px", fontSize: 12 }} />
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

function JobCard({ packet, config, accent, grouping, draggingDisabled, onDragStart, onClick, onMove }: {
  packet: WorkshopPacket;
  config: WorkshopConfig;
  accent: string;
  grouping: GroupingKey;
  draggingDisabled?: boolean;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onClick: (p: WorkshopPacket) => void;
  onMove: (fields: Record<string, unknown>) => void;
}) {
  const [blockingOpen, setBlockingOpen] = useState(false);
  const [blockReason,  setBlockReason]  = useState("");
  const [blockNote,    setBlockNote]    = useState("");

  const overdue  = isOverdue(packet);
  const dueToday = isDueToday(packet);
  const stale    = isStale(packet);
  const jt       = packet.job_type ?? "repair";
  const jtColor  = JOB_TYPE_COLORS[jt] ?? JOB_TYPE_COLORS.repair;
  const stepLabel = resolveStepLabel(packet, config);
  const assignee  = resolveAssignee(packet);
  const leftBorder = overdue ? "3px solid #EF4444" : stale && !dueToday ? "3px solid #F59E0B" : packet.blocked_reason ? "3px solid #EA580C" : "3px solid transparent";
  const moveOptions = getMoveOptions(packet, grouping, config);

  const submitBlock = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!blockReason) return;
    onMove({ blocked_reason: blockReason, blocked_note: blockNote || null, blocked_at: new Date().toISOString() });
    setBlockingOpen(false); setBlockReason(""); setBlockNote("");
  };

  const subStageLabel = (() => {
    if (packet.workshop_intake_substatus === "pre_check") return "Pre-Check";
    if (packet.workshop_intake_substatus === "on_order")  return "On Order";
    return null;
  })();

  return (
    <div
      draggable={!draggingDisabled}
      onDragStart={e => !draggingDisabled && onDragStart(e, packet.id)}
      onClick={() => onClick(packet)}
      style={{ background: "#fff", border: "1px solid #E8E8F0", borderLeft: leftBorder, borderRadius: 10, padding: "10px 12px", cursor: draggingDisabled ? "pointer" : "grab", userSelect: "none" }}
      onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = "none")}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 5 }}>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: "#9CA3AF", letterSpacing: "0.02em" }}>{packet.reference_number}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: jtColor.bg, color: jtColor.color, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{JOB_TYPE_LABELS[jt] ?? jt}</span>
      </div>

      {/* Customer */}
      <div style={{ fontWeight: 600, color: "#1A1A2E", fontSize: 13, marginBottom: 3 }}>{displayName(packet)}</div>
      {packet.articles && <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{packet.articles}</div>}

      {/* Badges */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {subStageLabel && <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: "#EFF6FF", color: "#3B82F6" }}>{subStageLabel}</span>}
        {stepLabel && <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: "#F5F3FF", color: "#635BFF" }}>{stepLabel}</span>}
        {packet.blocked_reason && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FFF5F3", color: "#EA580C", border: "1px solid #FDBA74" }}>
            🚫 {BLOCKED_LABELS[packet.blocked_reason] ?? packet.blocked_reason}
          </span>
        )}
        {packet.workshop_needs_valuation && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FDF4FF", color: "#9333EA", border: "1px solid #E9D5FF" }}>Needs Valuation</span>}
      </div>

      {/* Footer row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        {packet.due_date ? (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: overdue ? "#FEE2E2" : dueToday ? "#FEF3C7" : "#F3F4F6", color: overdue ? "#DC2626" : dueToday ? "#B45309" : "#6B7280" }}>
            {overdue ? "⚠ " : dueToday ? "⏰ " : ""}{formatDateAU(packet.due_date)}
          </span>
        ) : <span style={{ fontSize: 11, color: "#D1D5DB" }}>No due date</span>}
        {assignee && (
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: accent, color: "#fff", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {initials(assignee)}
          </span>
        )}
      </div>

      {/* Block / Unblock control */}
      <div style={{ marginTop: 7 }} onClick={e => e.stopPropagation()}>
        {packet.blocked_reason ? (
          <button
            onClick={e => { e.stopPropagation(); onMove({ blocked_reason: null, blocked_note: null, blocked_at: null }); }}
            style={{ fontSize: 11, fontWeight: 600, color: "#16A34A", background: "transparent", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
          >
            Unblock
          </button>
        ) : blockingOpen ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
            <select value={blockReason} onChange={e => setBlockReason(e.target.value)} onClick={e => e.stopPropagation()}
              style={{ border: "1px solid #E8E8F0", borderRadius: 6, padding: "4px 6px", fontSize: 11, color: "#374151", background: "#fff", outline: "none", fontFamily: "inherit" }}>
              <option value="">Select reason…</option>
              {BLOCKED_REASON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {blockReason === "other" && (
              <textarea rows={2} value={blockNote} onChange={e => setBlockNote(e.target.value)} onClick={e => e.stopPropagation()}
                placeholder="Add note…"
                style={{ border: "1px solid #E8E8F0", borderRadius: 6, padding: "4px 6px", fontSize: 11, color: "#374151", background: "#fff", outline: "none", resize: "vertical", fontFamily: "inherit" }} />
            )}
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={submitBlock} disabled={!blockReason}
                style={{ flex: 1, background: blockReason ? "#EA580C" : "#E5E7EB", color: blockReason ? "#fff" : "#9CA3AF", border: "none", borderRadius: 6, padding: "4px 0", fontSize: 11, fontWeight: 600, cursor: blockReason ? "pointer" : "default" }}>
                Block
              </button>
              <button onClick={e => { e.stopPropagation(); setBlockingOpen(false); setBlockReason(""); setBlockNote(""); }}
                style={{ background: "#F3F4F6", color: "#6B7280", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}>
                ✕
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setBlockingOpen(true); }}
            style={{ fontSize: 11, color: "#9CA3AF", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
          >
            + Block
          </button>
        )}
      </div>

      {/* Move to dropdown */}
      {moveOptions.length > 0 && (
        <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}>
          <select
            defaultValue=""
            onChange={e => {
              const opt = moveOptions.find(o => o.value === e.target.value);
              if (opt) { onMove(opt.payload); e.target.value = ""; }
            }}
            style={{ width: "100%", border: "1px solid #E8E8F0", borderRadius: 6, padding: "4px 6px", fontSize: 11, color: "#6B7280", background: "#F9FAFB", cursor: "pointer", outline: "none", fontFamily: "inherit" }}
          >
            <option value="">Move to…</option>
            {moveOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

// ── (SlideOver removed — see components/WorkshopJobDrawer.tsx) ───────────────

function _SlideOver_REMOVED({ packet, config, profiles, isManager, tenantId, onClose, onUpdate, onDelete }: {
  packet: WorkshopPacket; config: WorkshopConfig; profiles: Profile[];
  isManager: boolean; tenantId: string;
  onClose: () => void; onUpdate: (p: WorkshopPacket) => void; onDelete: (id: string) => void;
}) {
  const [local,    setLocal]    = useState<WorkshopPacket>(packet);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blockingOpen, setBlockingOpen] = useState(false);
  const [blockReason,  setBlockReason]  = useState("");
  const [blockNote,    setBlockNote]    = useState("");
  useEffect(() => { setLocal(packet); setBlockingOpen(false); setBlockReason(""); setBlockNote(""); }, [packet]);

  const headers = { "Content-Type": "application/json", "x-tenant-id": tenantId };

  const patch = useCallback(async (fields: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/workshop/packets/${local.id}`, { method: "PATCH", headers, body: JSON.stringify(fields) });
      const json = await res.json();
      if (json.packet) {
        const updated: WorkshopPacket = {
          ...json.packet,
          customer_display_name: local.customer_display_name,
          assigned_to_name: (() => {
            if (fields.assigned_to) return profiles.find(p => p.id === fields.assigned_to)?.full_name ?? null;
            if (fields.workshop_subcontractor_name !== undefined) return fields.workshop_subcontractor_name as string | null;
            if (fields.assigned_to === null) return null;
            return local.assigned_to_name;
          })(),
        };
        setLocal(updated); onUpdate(updated);
      }
    } catch { /* noop */ } finally { setSaving(false); }
  }, [local.id, local.customer_display_name, local.assigned_to_name, headers, onUpdate, profiles]);

  const handleDelete = async () => {
    if (!confirm("Delete this job permanently?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/workshop/packets/${local.id}`, { method: "DELETE", headers });
      onDelete(local.id); onClose();
    } catch { /* noop */ } finally { setDeleting(false); }
  };

  const submitBlock = async () => {
    if (!blockReason) return;
    await patch({ blocked_reason: blockReason, blocked_note: blockNote || null, blocked_at: new Date().toISOString() });
    setBlockingOpen(false); setBlockReason(""); setBlockNote("");
  };

  type StageEntry = { label: string; status: string; substatus: string | null; accent: string };
  let FLAT_STAGES: StageEntry[];
  if (config.stages.length > 0) {
    const CATEGORY_COLORS: Record<string, string> = { blue: "#378ADD", amber: "#BA7517", purple: "#7F77DD", coral: "#D85A30", teal: "#1D9E75", gray: "#6B7280" };
    FLAT_STAGES = config.stages
      .slice()
      .sort((a, b) => {
        const catA = config.categories.find(c => c.id === a.category_id);
        const catB = config.categories.find(c => c.id === b.category_id);
        return (catA?.sort_order ?? 99) - (catB?.sort_order ?? 99) || a.sort_order - b.sort_order;
      })
      .map(s => {
        const cat = config.categories.find(c => c.id === s.category_id);
        return { label: s.label, status: s.key, substatus: s.intake_substatus, accent: CATEGORY_COLORS[cat?.color ?? "gray"] ?? "#6B7280" };
      });
  } else {
    FLAT_STAGES = [
      { label: "Intake",               status: "intake",        substatus: "jobs_in",   accent: "#378ADD" },
      { label: "Pre-Check",            status: "intake",        substatus: "pre_check", accent: "#378ADD" },
      { label: "On Order",             status: "intake",        substatus: "on_order",  accent: "#378ADD" },
      { label: "Quality Control",      status: "quality_check", substatus: null,        accent: "#378ADD" },
      { label: "On Bench",             status: "on_bench",      substatus: null,        accent: "#7F77DD" },
      { label: "To-Be-Valued",         status: "to_be_valued",  substatus: null,        accent: "#1D9E75" },
      { label: "Ready for Collection", status: "ready",         substatus: null,        accent: "#1D9E75" },
      { label: "Collected",            status: "collected",     substatus: null,        accent: "#6B7280" },
    ];
  }

  function isStageActive(entry: StageEntry): boolean {
    if (local.status !== entry.status) return false;
    if (entry.substatus !== null) return (local.workshop_intake_substatus ?? "jobs_in") === entry.substatus;
    if (entry.status === "intake") return (local.workshop_intake_substatus ?? "jobs_in") === "jobs_in";
    return true;
  }

  const overdue  = isOverdue(local);
  const dueToday = isDueToday(local);
  const INPUT: React.CSSProperties = { width: "100%", border: "1px solid #E8E8F0", borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "#1A1A2E", outline: "none", background: "#fff", fontFamily: "inherit" };
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
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 101, width: "min(540px, 100vw)", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8F0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#9CA3AF", marginBottom: 2 }}>{local.reference_number}</div>
            <div style={{ fontWeight: 700, color: "#1A1A2E", fontSize: 18 }}>{displayName(local)}</div>
            {local.customer_email && <div style={{ fontSize: 12, color: "#6B7280" }}>{local.customer_email}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9CA3AF", flexShrink: 0 }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Stage selector */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #E8E8F0", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Stage</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {FLAT_STAGES.map(entry => {
              const active = isStageActive(entry);
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
          {saving && <div style={{ fontSize: 11, color: "#635BFF", marginTop: 6 }}>Saving…</div>}
        </div>

        {/* Blocked status */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #E8E8F0", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Blocked Status</div>
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
                <button onClick={submitBlock} disabled={!blockReason}
                  style={{ flex: 1, background: "#EA580C", color: "#fff", border: "none", borderRadius: 8, padding: "7px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: blockReason ? 1 : 0.5 }}>
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

        {/* Body */}
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

          {FIELD("Assign To", (() => {
            let currentVal = "";
            if (local.assigned_to) currentVal = `team_profile:${local.assigned_to}`;
            else if (local.workshop_subcontractor_name) {
              const isTeamName = config.teamMembers.some(m => !m.profile_id && m.name === local.workshop_subcontractor_name);
              currentVal = isTeamName ? `team_name:${local.workshop_subcontractor_name}` : `sub:${local.workshop_subcontractor_name}`;
            }
            return (
              <select value={currentVal} onChange={e => {
                const val = e.target.value;
                if (!val) { patch({ assigned_to: null, workshop_subcontractor_name: null }); return; }
                if (val.startsWith("team_profile:")) { patch({ assigned_to: val.slice(13), workshop_subcontractor_name: null }); return; }
                if (val.startsWith("team_name:"))    { patch({ assigned_to: null, workshop_subcontractor_name: val.slice(10) }); return; }
                if (val.startsWith("sub:"))           { patch({ workshop_subcontractor_name: val.slice(4), assigned_to: null }); return; }
              }} style={INPUT}>
                <option value="">— Unassigned —</option>
                {config.teamMembers.filter(m => m.active).length > 0 && (
                  <optgroup label="Team">
                    {config.teamMembers.filter(m => m.active).map(m => (
                      <option key={m.id} value={m.profile_id ? `team_profile:${m.profile_id}` : `team_name:${m.name}`}>{m.name}</option>
                    ))}
                  </optgroup>
                )}
                {config.subcontractors.filter(s => s.active).length > 0 && (
                  <optgroup label="Sub-contractors">
                    {config.subcontractors.filter(s => s.active).map(s => (
                      <option key={s.id} value={`sub:${s.name}`}>{s.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            );
          })())}

          {FIELD("Pathway",
            <select value={local.workshop_pathway_id ?? ""} onChange={e => patch({ workshop_pathway_id: e.target.value || null, workshop_step_index: 0 })} style={INPUT}>
              <option value="">— No pathway —</option>
              {config.pathways.map(pw => <option key={pw.id} value={pw.id}>{pw.name}</option>)}
            </select>
          )}

          {local.workshop_pathway_id && (() => {
            const pw = config.pathways.find(p => p.id === local.workshop_pathway_id);
            if (!pw || !pw.steps.length) return null;
            return FIELD(`Step (${pw.steps.length} total)`,
              <select value={local.workshop_step_index ?? 0} onChange={e => patch({ workshop_step_index: Number(e.target.value) })} style={INPUT}>
                {pw.steps.map((step, i) => <option key={i} value={i}>{i + 1}. {step.name} ({step.location})</option>)}
              </select>
            );
          })()}

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={!!local.workshop_needs_valuation} onChange={e => patch({ workshop_needs_valuation: e.target.checked })} style={{ width: 16, height: 16, accentColor: "#635BFF" }} />
              <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Needs Valuation</span>
            </label>
            {local.workshop_needs_valuation && Number(local.total_charges) >= 3000 && <span style={{ fontSize: 11, color: "#9333EA" }}>Auto (≥$3,000)</span>}
          </div>

          {local.workshop_needs_valuation && FIELD("Valuer",
            <select value={local.workshop_valuer ?? ""} onChange={e => patch({ workshop_valuer: e.target.value || null })} style={INPUT}>
              <option value="">— Unassigned —</option>
              {config.valuers.filter(v => v.active).map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
            </select>
          )}

          {FIELD("Due Date", <input type="date" value={local.due_date ?? ""} onChange={e => patch({ due_date: e.target.value || null })} style={INPUT} />)}
          {FIELD("Description of Work",
            <textarea rows={3} defaultValue={local.articles ?? ""} onBlur={e => { if (e.target.value !== (local.articles ?? "")) patch({ articles: e.target.value || null }); }} style={TEXTAREA} />
          )}
          {FIELD("Instructions",
            <textarea rows={2} defaultValue={local.instructions ?? ""} onBlur={e => { if (e.target.value !== (local.instructions ?? "")) patch({ instructions: e.target.value || null }); }} style={TEXTAREA} />
          )}
          {FIELD("Internal Notes",
            <textarea rows={2} defaultValue={local.internal_notes ?? ""} onBlur={e => { if (e.target.value !== (local.internal_notes ?? "")) patch({ internal_notes: e.target.value || null }); }} style={TEXTAREA} />
          )}

          <div style={{ borderTop: "1px solid #E8E8F0", paddingTop: 14, marginTop: 4, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Supplier</div>
              <input type="text" defaultValue={local.workshop_supplier ?? ""} onBlur={e => { if (e.target.value !== (local.workshop_supplier ?? "")) patch({ workshop_supplier: e.target.value || null }); }} style={INPUT} placeholder="Supplier name…" />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>PO Number</div>
              <input type="text" defaultValue={local.workshop_po_number ?? ""} onBlur={e => { if (e.target.value !== (local.workshop_po_number ?? "")) patch({ workshop_po_number: e.target.value || null }); }} style={INPUT} placeholder="PO-…" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Quoted Price</div>
              <input type="number" step="0.01" defaultValue={Number(local.total_charges) || ""} onBlur={e => { const v = e.target.value ? Number(e.target.value) : null; if (v !== Number(local.total_charges)) patch({ total_charges: v }); }} style={INPUT} placeholder="0.00" />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Deposit Taken</div>
              <input type="number" step="0.01" defaultValue={Number(local.deposit) || ""} onBlur={e => { const v = e.target.value ? Number(e.target.value) : null; if (v !== Number(local.deposit)) patch({ deposit: v }); }} style={INPUT} placeholder="0.00" />
            </div>
          </div>

          {local.balance != null && local.total_charges != null && (
            <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "#1A1A2E", marginBottom: 12 }}>
              Balance owing: {formatCurrency(Number(local.balance))}
            </div>
          )}

          {local.job_type !== "stock_work" && (
            <div style={{ borderTop: "1px solid #E8E8F0", paddingTop: 14, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Customer Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, color: "#374151" }}>
                <div><span style={{ color: "#9CA3AF" }}>Phone: </span>{local.customer_phone || "—"}</div>
                <div><span style={{ color: "#9CA3AF" }}>Email: </span>{local.customer_email || "—"}</div>
                {(local.customer_street || local.customer_suburb) && (
                  <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#9CA3AF" }}>Address: </span>{[local.customer_street, local.customer_suburb, local.customer_state, local.customer_postcode].filter(Boolean).join(", ")}</div>
                )}
              </div>
            </div>
          )}

          <div style={{ borderTop: "1px solid #E8E8F0", paddingTop: 14, marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, color: "#374151" }}>
            <div><span style={{ color: "#9CA3AF" }}>In Date: </span>{local.in_date ? formatDateAU(local.in_date) : "—"}</div>
            <div><span style={{ color: "#9CA3AF" }}>Staff: </span>{local.staff_member || "—"}</div>
            {local.collected_at && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#9CA3AF" }}>Collected: </span>{new Date(local.collected_at).toLocaleDateString("en-AU")}</div>}
          </div>
        </div>

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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkshopBoardPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => { if (hydrated && user && !hasPermission(user, "workshop")) router.replace("/"); }, [user, hydrated, router]);

  const tenantId  = user?.tenantId ?? "";
  const isManager = canManage(user?.role ?? null);

  const [packets,  setPackets]  = useState<WorkshopPacket[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [config,   setConfig]   = useState<WorkshopConfig>({ teamMembers: [], subcontractors: [], valuers: [], pathways: [], messages: [], leadTimes: [], categories: [], stages: [], locations: [] });
  const [loading,  setLoading]  = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const [selectedPacket, setSelectedPacket] = useState<WorkshopPacket | null>(null);
  const [grouping, setGrouping] = useState<GroupingKey>("stage");

  // Filters
  const [search,        setSearch]        = useState("");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [blockedFilter, setBlockedFilter] = useState("all");
  const [dueDateFrom,   setDueDateFrom]   = useState("");
  const [dueDateTo,     setDueDateTo]     = useState("");

  const dragId = useRef<string | null>(null);

  // Load grouping from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_GROUPING_KEY);
      if (saved && ["stage","assignee","work_centre","current_step"].includes(saved)) setGrouping(saved as GroupingKey);
    } catch { /* noop */ }
  }, []);

  const changeGrouping = (g: GroupingKey) => {
    setGrouping(g);
    try { localStorage.setItem(LS_GROUPING_KEY, g); } catch { /* noop */ }
  };

  const fetchPackets = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch("/api/workshop/packets", { cache: "no-store", headers: { "x-tenant-id": tenantId } });
      const json = await res.json();
      setPackets((json.packets ?? []).filter((p: WorkshopPacket) => p.status !== "collected"));
    } catch { setPackets([]); } finally { setLoading(false); }
  }, [tenantId]);

  const fetchConfig = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch("/api/workshop/config", { cache: "no-store", headers: { "x-tenant-id": tenantId } });
      const json = await res.json();
      if (!res.ok) { setConfigError(`Config load failed (${res.status})`); return; }
      setConfigError(json.configError ?? null);
      setConfig({
        teamMembers:    json.teamMembers    ?? [],
        subcontractors: json.subcontractors ?? [],
        valuers:        json.valuers        ?? [],
        pathways:       json.pathways       ?? [],
        messages:       json.messages       ?? [],
        leadTimes:      json.leadTimes      ?? [],
        categories:     json.categories     ?? [],
        stages:         json.stages         ?? [],
        locations:      json.locations      ?? [],
        settings:       json.settings,
      });
    } catch { setConfigError("Couldn't reach workshop config endpoint"); }
  }, [tenantId]);

  useEffect(() => { fetchPackets(); }, [fetchPackets]);
  useEffect(() => { fetchConfig(); }, [fetchConfig]);
  useEffect(() => {
    if (!tenantId) return;
    fetch("/api/profiles", { headers: { "x-tenant-id": tenantId } }).then(r => r.json()).then(j => setProfiles(j.profiles ?? [])).catch(() => {});
  }, [tenantId]);

  const staleThreshold = config.settings?.stale_threshold_days ?? 5;
  const q = search.trim().toLowerCase();

  const filteredPackets = useMemo(() => packets.filter(p => {
    if (jobTypeFilter !== "all" && p.job_type !== jobTypeFilter) return false;
    if (statusFilter === "overdue"   && !isOverdue(p))   return false;
    if (statusFilter === "due_today" && !isDueToday(p))  return false;
    if (statusFilter === "ready"     && p.status !== "ready") return false;
    if (blockedFilter === "blocked"     && !p.blocked_reason) return false;
    if (blockedFilter === "not_blocked" && !!p.blocked_reason) return false;
    if (dueDateFrom && p.due_date && p.due_date < dueDateFrom) return false;
    if (dueDateTo   && p.due_date && p.due_date > dueDateTo)   return false;
    if (q) {
      const name = displayName(p).toLowerCase();
      if (!name.includes(q) && !(p.reference_number ?? "").toLowerCase().includes(q) && !(p.articles ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [packets, jobTypeFilter, statusFilter, blockedFilter, dueDateFrom, dueDateTo, q]);

  const activeColumns = useMemo(() => {
    switch (grouping) {
      case "stage":        return buildStageColumns();
      case "assignee":     return buildAssigneeColumns(config);
      case "work_centre":  return buildWorkCentreColumns(config);
      case "current_step": return buildCurrentStepColumns(filteredPackets, config);
    }
  }, [grouping, config, filteredPackets]);

  // For assignee: hide empty non-alwaysShow columns; for others: show all
  const visibleColumns = useMemo(() => {
    if (grouping === "assignee") {
      return activeColumns.filter(col => col.alwaysShow || filteredPackets.some(p => col.match(p)));
    }
    return activeColumns;
  }, [activeColumns, grouping, filteredPackets]);

  const sortAtRisk = (pkts: WorkshopPacket[]) =>
    [...pkts].sort((a, b) => ((isOverdue(b) ? 2 : 0) + (isStale(b, staleThreshold) ? 1 : 0)) - ((isOverdue(a) ? 2 : 0) + (isStale(a, staleThreshold) ? 1 : 0)));

  const packetsForCol = useCallback((col: Column) => sortAtRisk(filteredPackets.filter(p => col.match(p))), [filteredPackets, staleThreshold]);

  const handleDragStart = (e: React.DragEvent, id: string) => { dragId.current = id; e.dataTransfer.effectAllowed = "move"; };

  const handleDrop = async (e: React.DragEvent, col: Column) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).style.outline = "none";
    if (col.dragDisabled) return;
    const id = dragId.current;
    if (!id) return;
    dragId.current = null;
    const payload = col.dropPayload();
    if (!Object.keys(payload).length) return;
    setPackets(prev => prev.map(p => p.id === id ? {
      ...p, ...(payload as Partial<WorkshopPacket>),
      ...(payload.status !== undefined ? { status_updated_at: new Date().toISOString() } : {}),
    } : p));
    if (selectedPacket?.id === id) setSelectedPacket(prev => prev ? { ...prev, ...(payload as Partial<WorkshopPacket>) } : null);
    try {
      await fetch(`/api/workshop/packets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-tenant-id": tenantId }, body: JSON.stringify(payload) });
    } catch { fetchPackets(); }
  };

  const handleUpdate = (updated: WorkshopPacket) => {
    setPackets(prev => prev.map(p => p.id === updated.id ? updated : p));
    if (selectedPacket?.id === updated.id) setSelectedPacket(updated);
  };
  const handleDelete = (id: string) => { setPackets(prev => prev.filter(p => p.id !== id)); if (selectedPacket?.id === id) setSelectedPacket(null); };

  const handleMove = async (id: string, fields: Record<string, unknown>) => {
    setPackets(prev => prev.map(p => p.id === id ? {
      ...p, ...(fields as Partial<WorkshopPacket>),
      ...(fields.status !== undefined ? { status_updated_at: new Date().toISOString() } : {}),
    } : p));
    if (selectedPacket?.id === id) setSelectedPacket(prev => prev ? { ...prev, ...(fields as Partial<WorkshopPacket>) } : null);
    try {
      await fetch(`/api/workshop/packets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-tenant-id": tenantId }, body: JSON.stringify(fields) });
    } catch { fetchPackets(); }
  };

  const hasActiveFilters = jobTypeFilter !== "all" || statusFilter !== "all" || blockedFilter !== "all" || !!dueDateFrom || !!dueDateTo || !!search;

  const GROUPING_OPTIONS: { key: GroupingKey; label: string }[] = [
    { key: "stage",        label: "Stage" },
    { key: "assignee",     label: "Assignee" },
    { key: "work_centre",  label: "Work Centre" },
    { key: "current_step", label: "Current Step" },
  ];

  const JOB_TYPE_OPTS = [["all","All Types"],["repair","Repairs"],["custom_order","Custom"],["collection_order","Collection"],["online_order","Online"],["stock_work","Stock"]] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", gap: 0 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 12, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Workshop</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "2px 0 0" }}>{filteredPackets.length} of {packets.length} active jobs</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <AtRiskBanner packets={packets} staleThreshold={staleThreshold} />
          <div style={{ display: "flex", gap: 2, background: "#F3F4F6", borderRadius: 10, padding: 3, flexShrink: 0 }}>
            {([["jobs","/workshop","All Jobs"],["board","/workshop/board","Board"],["history","/workshop/history","History"]] as const).map(([key, href, label]) => (
              <a key={key} href={href} style={{ padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none", cursor: "pointer", background: key === "board" ? "#fff" : "transparent", color: key === "board" ? "#1A1A2E" : "#6B7280", boxShadow: key === "board" ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>{label}</a>
            ))}
          </div>
          {isManager && (
            <a href="/workshop/settings" style={{ fontSize: 12, fontWeight: 600, color: "#635BFF", textDecoration: "none", border: "1px solid #635BFF", borderRadius: 8, padding: "6px 12px", flexShrink: 0 }}>⚙ Settings</a>
          )}
        </div>
      </div>

      {/* Manager noticeboard */}
      {isManager && <ManagerNoticeboard messages={config.messages} leadTimes={config.leadTimes} tenantId={tenantId} onRefresh={fetchConfig} />}
      {!isManager && config.messages.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "12px 20px", marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {config.messages.map(m => <div key={m.id} style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#374151" }}>{m.text}</div>)}
          </div>
        </div>
      )}
      {configError && (
        <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#B45309", fontWeight: 500, marginBottom: 10, flexShrink: 0 }}>
          ⚠ {configError}
        </div>
      )}

      {/* Grouping selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", whiteSpace: "nowrap" }}>Group by:</span>
        <div style={{ display: "flex", gap: 2, background: "#F3F4F6", borderRadius: 10, padding: 3 }}>
          {GROUPING_OPTIONS.map(o => (
            <button key={o.key} onClick={() => changeGrouping(o.key)}
              style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: grouping === o.key ? "#fff" : "transparent", color: grouping === o.key ? "#1A1A2E" : "#6B7280", boxShadow: grouping === o.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all .12s" }}>
              {o.label}
            </button>
          ))}
        </div>
        {grouping === "work_centre" && (
          <span style={{ fontSize: 12, color: "#9CA3AF", background: "#F3F4F6", borderRadius: 6, padding: "3px 8px" }}>Drag disabled — work centre is derived from job type</span>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
        {/* Search */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" /></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ref, name, description…" style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px 6px 28px", fontSize: 13, outline: "none", background: "#F9FAFB", color: "#1A1A2E", width: 210 }} />
        </div>

        <div style={{ width: 1, height: 20, background: "#E8E8F0", flexShrink: 0 }} />

        {/* Job type */}
        <div style={{ display: "flex", gap: 2, background: "#F3F4F6", borderRadius: 8, padding: 3, flexShrink: 0 }}>
          {JOB_TYPE_OPTS.map(([v, label]) => (
            <button key={v} onClick={() => setJobTypeFilter(v)} style={{ padding: "5px 9px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none", background: jobTypeFilter === v ? "#fff" : "transparent", color: jobTypeFilter === v ? "#1A1A2E" : "#6B7280", boxShadow: jobTypeFilter === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none", cursor: "pointer" }}>{label}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: "#E8E8F0", flexShrink: 0 }} />

        {/* Status pills */}
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          {([["all","All","#6B7280","#F3F4F6"],["overdue","Overdue","#DC2626","#FEE2E2"],["due_today","Due Today","#B45309","#FEF3C7"],["ready","Ready","#16A34A","#DCFCE7"]] as const).map(([v, label, color, bg]) => (
            <button key={v} onClick={() => setStatusFilter(v)} style={{ padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: "none", background: statusFilter === v ? bg : "transparent", color: statusFilter === v ? color : "#6B7280", cursor: "pointer", outline: statusFilter === v ? `1px solid ${color}33` : "none" }}>{label}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: "#E8E8F0", flexShrink: 0 }} />

        {/* Blocked */}
        <select value={blockedFilter} onChange={e => setBlockedFilter(e.target.value)} style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "#374151", background: "#fff", outline: "none", cursor: "pointer" }}>
          <option value="all">All jobs</option>
          <option value="blocked">Blocked only</option>
          <option value="not_blocked">Not blocked</option>
        </select>

        {/* Due date range */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap" }}>Due:</span>
          <input type="date" value={dueDateFrom} onChange={e => setDueDateFrom(e.target.value)} style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "5px 8px", fontSize: 12, outline: "none", background: "#F9FAFB", color: "#374151" }} />
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>–</span>
          <input type="date" value={dueDateTo} onChange={e => setDueDateTo(e.target.value)} style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "5px 8px", fontSize: 12, outline: "none", background: "#F9FAFB", color: "#374151" }} />
        </div>

        {hasActiveFilters && (
          <button onClick={() => { setSearch(""); setJobTypeFilter("all"); setStatusFilter("all"); setBlockedFilter("all"); setDueDateFrom(""); setDueDateTo(""); }}
            style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1px solid #E8E8F0", background: "#fff", color: "#9CA3AF", cursor: "pointer" }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Board */}
      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 14 }}>Loading jobs…</div>
      ) : (
        <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", paddingBottom: 4 }}>
          <div style={{ display: "flex", gap: 12, height: "100%", minWidth: "max-content" }}>
            {visibleColumns.map(col => {
              const cards = packetsForCol(col);
              return (
                <div key={col.key} style={{ flexShrink: 0, width: 252, display: "flex", flexDirection: "column" }}>
                  {/* Column header */}
                  <div style={{ background: col.colBg, borderRadius: "10px 10px 0 0", border: "1px solid #E8E8F0", borderBottom: "none", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: col.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{col.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, background: col.accent + "22", color: col.accent, borderRadius: 999, padding: "1px 8px", flexShrink: 0 }}>{cards.length}</span>
                  </div>
                  {/* Column body */}
                  <div
                    style={{ flex: 1, overflowY: "auto", background: col.colBg, border: "1px solid #E8E8F0", borderTop: "none", borderRadius: "0 0 10px 10px", padding: 8, display: "flex", flexDirection: "column", gap: 8, minHeight: 160 }}
                    onDragOver={e => { if (!col.dragDisabled) { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.outline = `2px dashed ${col.accent}`; } }}
                    onDragLeave={e => { (e.currentTarget as HTMLDivElement).style.outline = "none"; }}
                    onDrop={e => handleDrop(e, col)}
                  >
                    {cards.length === 0 && (
                      <div style={{ padding: "20px 8px", textAlign: "center", color: "#D1D5DB", fontSize: 12 }}>
                        {col.dragDisabled ? "No jobs" : "Drop cards here"}
                      </div>
                    )}
                    {cards.map(p => (
                      <JobCard
                        key={p.id}
                        packet={p}
                        config={config}
                        accent={col.accent}
                        grouping={grouping}
                        draggingDisabled={col.dragDisabled}
                        onDragStart={handleDragStart}
                        onClick={() => setSelectedPacket(p)}
                        onMove={fields => handleMove(p.id, fields)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Job detail drawer */}
      {selectedPacket && (
        <WorkshopJobDrawer packet={selectedPacket} config={config} profiles={profiles} isManager={isManager} tenantId={tenantId} onClose={() => setSelectedPacket(null)} onUpdate={handleUpdate} onDelete={handleDelete} />
      )}
    </div>
  );
}
