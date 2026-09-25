"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { hasPermission, canManage } from "@/lib/userTypes";
import { formatDateAU } from "@/lib/formatters";
import { isCastingOverdue } from "@/lib/cadStage";
import { assigneeBoardLabel, resolveAssigneeName } from "@/lib/workshopAssignee";

// ── Types ────────────────────────────────────────────────────────────────────

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
  workshop_due_date?: string | null;
  workshop_due_date_overridden?: boolean | null;
  cad_required?: boolean | null;
  workshop_po_number: string | null;
  blocked_reason: string | null;
  blocked_note: string | null;
  quality_issue?: boolean | null;
  blocked_at: string | null;
  delivery_method: string | null;
  shopify_order_id: string | null;
  shopify_fulfillment_id: string | null;
  pending_customer_approval?: boolean | null;
}

interface TeamMember     { id: string; tenant_id: string; name: string; profile_id: string | null; sort_order: number; active: boolean; workshop_role_keys?: string[]; }
interface Subcontractor  { id: string; tenant_id: string; name: string; sort_order: number; active: boolean; }
interface Valuer         { id: string; name: string; active: boolean; }
interface PathwayStep    { name: string; location: "inhouse" | "external"; }
interface Pathway        { id: string; name: string; steps: PathwayStep[]; }
interface ManagerMessage { id: string; text: string; created_at: string; }
interface LeadTime       { id: string; job_type: string; weeks: number | null; }
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

const STAGE_DEFS: { key: string; label: string; status: string; accent: string; colBg: string }[] = [
  { key: "intake",        label: "Intake",               status: "intake",        accent: "#378ADD", colBg: "#F0F7FF" },
  { key: "cad_design",    label: "CAD Design",           status: "cad_design",    accent: "#7F77DD", colBg: "#F5F3FF" },
  { key: "cad_approval",  label: "CAD Approval",         status: "cad_approval",  accent: "#BA7517", colBg: "#FFFBEB" },
  { key: "casting",       label: "Casting",              status: "casting",       accent: "#D85A30", colBg: "#FFF5F3" },
  { key: "polish_finish", label: "Polish/Finish",        status: "polish_finish", accent: "#0F6E56", colBg: "#ECFDF5" },
  { key: "polish_set",    label: "Polish/Set",           status: "polish_set",    accent: "#0F6E56", colBg: "#ECFDF5" },
  { key: "on_bench",      label: "Production",           status: "on_bench",      accent: "#7F77DD", colBg: "#F5F3FF" },
  { key: "quality_check", label: "Quality Control",      status: "quality_check", accent: "#D85A30", colBg: "#FFF5F3" },
  { key: "to_be_valued",  label: "Valuation",            status: "to_be_valued",  accent: "#BA7517", colBg: "#FFFBEB" },
  { key: "ready",         label: "Ready for Collection", status: "ready",         accent: "#1D9E75", colBg: "#ECFDF5" },
];

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
function resolveAssignee(p: WorkshopPacket, config?: WorkshopConfig): string | null {
  return resolveAssigneeName(p, { teamMembers: config?.teamMembers });
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

function stageColumnDefs(config: WorkshopConfig) {
  return STAGE_DEFS.map(c => {
    if (c.status === "intake") return c;
    const configured = config.stages.find(s => s.key === c.status && !s.intake_substatus);
    return configured ? { ...c, label: configured.label } : c;
  });
}

function buildStageColumns(config: WorkshopConfig): Column[] {
  return stageColumnDefs(config).map(c => ({
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
    return stageColumnDefs(config).filter(c => c.status !== p.status).map(c => ({
      value: c.key, label: c.label, payload: { status: c.status },
    }));
  }
  if (grouping === "assignee") {
    const opts: MoveOption[] = [];
    const isUnassigned = !p.assigned_to && !p.workshop_subcontractor_name;
    if (!isUnassigned) opts.push({ value: "unassigned", label: "— Unassigned —", payload: { assigned_to: null, workshop_subcontractor_name: null } });
    for (const m of config.teamMembers.filter(m => m.active && (p.status !== "cad_design" || (m.workshop_role_keys ?? []).includes("cad_designer")))) {
      const cur = m.profile_id ? p.assigned_to === m.profile_id : p.workshop_subcontractor_name === m.name && !p.assigned_to;
      if (!cur) opts.push({
        value: `tm_${m.id}`, label: m.name,
        payload: m.profile_id ? { assigned_to: m.profile_id, workshop_subcontractor_name: null } : { assigned_to: null, workshop_subcontractor_name: m.name },
      });
    }
    const teamNameSet = new Set(config.teamMembers.filter(m => !m.profile_id).map(m => m.name));
    if (p.status !== "cad_design") for (const s of config.subcontractors.filter(s => s.active)) {
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

function JobCard({ packet, config, grouping, draggingDisabled, focused, onDragStart, onClick, onMove }: {
  packet: WorkshopPacket;
  config: WorkshopConfig;
  accent: string;
  grouping: GroupingKey;
  draggingDisabled?: boolean;
  focused?: boolean;
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
  const assignee  = resolveAssignee(packet, config);
  const leftBorder = packet.pending_customer_approval ? "3px solid #EA580C" : overdue ? "3px solid #EF4444" : stale && !dueToday ? "3px solid #F59E0B" : packet.blocked_reason ? "3px solid #EA580C" : "3px solid transparent";
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
      data-job-id={packet.id}
      style={{ background: "#fff", border: focused ? "1px solid #635BFF" : "1px solid #E8E8F0", borderLeft: leftBorder, borderRadius: 10, padding: "10px 12px", cursor: draggingDisabled ? "pointer" : "grab", userSelect: "none", boxShadow: focused ? "0 0 0 3px rgba(99,91,255,0.35)" : undefined }}
      onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = focused ? "0 0 0 3px rgba(99,91,255,0.35)" : "none")}
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
        {packet.pending_customer_approval && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FFF5F3", color: "#EA580C", border: "1px solid #FDBA74" }}>
            ⏳ Pending Approval
          </span>
        )}
        {subStageLabel && <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: "#EFF6FF", color: "#3B82F6" }}>{subStageLabel}</span>}
        {isCastingOverdue(packet) && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FEE2E2", color: "#DC2626" }}>Casting overdue</span>}
        {stepLabel && <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: "#F5F3FF", color: "#635BFF" }}>{stepLabel}</span>}
        {packet.blocked_reason && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FFF5F3", color: "#EA580C", border: "1px solid #FDBA74" }}>
            🚫 {BLOCKED_LABELS[packet.blocked_reason] ?? packet.blocked_reason}
          </span>
        )}
        {packet.quality_issue && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA" }}>
            Quality issue
          </span>
        )}
        {packet.workshop_needs_valuation && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FDF4FF", color: "#9333EA", border: "1px solid #E9D5FF" }}>Needs Valuation</span>}
        {packet.delivery_method === "pickup"   && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#ECFDF5", color: "#059669" }}>🏪 Pickup</span>}
        {packet.delivery_method === "shipping" && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#EFF6FF", color: "#2563EB" }}>📦 Shipping</span>}
      </div>

      {/* Footer row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        {packet.due_date ? (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: overdue ? "#FEE2E2" : dueToday ? "#FEF3C7" : "#F3F4F6", color: overdue ? "#DC2626" : dueToday ? "#B45309" : "#6B7280" }}>
            {overdue ? "⚠ " : dueToday ? "⏰ " : ""}{formatDateAU(packet.due_date)}
          </span>
        ) : <span style={{ fontSize: 11, color: "#D1D5DB" }}>No due date</span>}
        <span
          title={assignee ?? undefined}
          style={{ fontSize: 11, fontWeight: assignee ? 600 : 500, color: assignee ? "#374151" : "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 108, minWidth: 0 }}
        >
          {assignee ? assigneeBoardLabel(assignee, packet, { teamMembers: config.teamMembers }) : "Unassigned"}
        </span>
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


// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkshopBoardPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => { if (hydrated && user && !hasPermission(user, "workshop")) router.replace("/"); }, [user, hydrated, router]);

  const tenantId  = user?.tenantId ?? "";
  const isManager = canManage(user?.role ?? null);

  const [packets,  setPackets]  = useState<WorkshopPacket[]>([]);
  const [config,   setConfig]   = useState<WorkshopConfig>({ teamMembers: [], subcontractors: [], valuers: [], pathways: [], messages: [], leadTimes: [], categories: [], stages: [], locations: [] });
  const [loading,  setLoading]  = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const [grouping, setGrouping] = useState<GroupingKey>("stage");

  // Filters
  const [search,          setSearch]          = useState("");
  const [jobTypeFilter,   setJobTypeFilter]   = useState("all");
  const [statusFilter,    setStatusFilter]    = useState("all");
  const [blockedFilter,   setBlockedFilter]   = useState("all");
  const [deliveryFilter,  setDeliveryFilter]  = useState("all");
  const [dueDateFrom,     setDueDateFrom]     = useState("");
  const [dueDateTo,       setDueDateTo]       = useState("");

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

  const staleThreshold = config.settings?.stale_threshold_days ?? 5;
  const q = search.trim().toLowerCase();

  const filteredPackets = useMemo(() => packets.filter(p => {
    if (jobTypeFilter !== "all" && p.job_type !== jobTypeFilter) return false;
    if (statusFilter === "overdue"   && !isOverdue(p))   return false;
    if (statusFilter === "due_today" && !isDueToday(p))  return false;
    if (statusFilter === "ready"     && p.status !== "ready") return false;
    if (blockedFilter === "blocked"     && !p.blocked_reason) return false;
    if (blockedFilter === "not_blocked" && !!p.blocked_reason) return false;
    if (deliveryFilter !== "all" && p.delivery_method !== deliveryFilter) return false;
    if (dueDateFrom && p.due_date && p.due_date < dueDateFrom) return false;
    if (dueDateTo   && p.due_date && p.due_date > dueDateTo)   return false;
    if (q) {
      const name = displayName(p).toLowerCase();
      if (!name.includes(q) && !(p.reference_number ?? "").toLowerCase().includes(q) && !(p.articles ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [packets, jobTypeFilter, statusFilter, blockedFilter, deliveryFilter, dueDateFrom, dueDateTo, q]);

  const activeColumns = useMemo(() => {
    switch (grouping) {
      case "stage":        return buildStageColumns(config);
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

  function cadAssignmentAllowed(packet: WorkshopPacket, payload: Record<string, unknown>): boolean {
    if (packet.status !== "cad_design") return true;
    if (!("workshop_subcontractor_name" in payload) && !("assigned_to" in payload)) return true;
    if (!payload.workshop_subcontractor_name && !payload.assigned_to) return true;
    if (payload.assigned_to) {
      return config.teamMembers.some((m) => m.profile_id === payload.assigned_to && (m.workshop_role_keys ?? []).includes("cad_designer"));
    }
    const name = String(payload.workshop_subcontractor_name);
    return config.teamMembers.some((m) => m.name === name && (m.workshop_role_keys ?? []).includes("cad_designer"));
  }

  const applyPacketMove = async (id: string, payload: Record<string, unknown>) => {
    const previous = packets.find((p) => p.id === id);
    if (previous && !cadAssignmentAllowed(previous, payload)) {
      setMoveError("CAD Design can only be assigned to a CAD Designer.");
      return;
    }
    setMoveError(null);
    setPackets(prev => prev.map(p => {
      if (p.id !== id) return p;
      const next: WorkshopPacket = {
        ...p,
        ...(payload as Partial<WorkshopPacket>),
        ...(payload.status !== undefined ? { status_updated_at: new Date().toISOString() } : {}),
      };
      if ("assigned_to" in payload || "workshop_subcontractor_name" in payload) {
        next.assigned_to_name = resolveAssigneeName({
          assigned_to: next.assigned_to,
          assigned_to_name: null,
          workshop_subcontractor_name: next.workshop_subcontractor_name,
        }, { teamMembers: config.teamMembers });
      }
      return next;
    }));
    try {
      const res = await fetch(`/api/workshop/packets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-tenant-id": tenantId }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (previous) {
          setPackets(prev => prev.map(p => p.id === id ? previous : p));
        } else {
          fetchPackets();
        }
        setMoveError(json.error ?? "Could not move this job");
        return;
      }
      if (json.packet && previous) {
        const updated: WorkshopPacket = {
          ...previous,
          ...json.packet,
          customer_display_name: previous.customer_display_name,
          assigned_to_name: previous.assigned_to_name,
        };
        if ("assigned_to" in payload || "workshop_subcontractor_name" in payload) {
          updated.assigned_to_name = resolveAssigneeName({
            assigned_to: updated.assigned_to,
            assigned_to_name: null,
            workshop_subcontractor_name: updated.workshop_subcontractor_name,
          }, { teamMembers: config.teamMembers });
        }
        setPackets(prev => prev.map(p => p.id === id ? updated : p));
      }
    } catch {
      if (previous) {
        setPackets(prev => prev.map(p => p.id === id ? previous : p));
      }
      setMoveError("Network error");
    }
  };

  const handleDrop = async (e: React.DragEvent, col: Column) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).style.outline = "none";
    if (col.dragDisabled) return;
    const id = dragId.current;
    if (!id) return;
    dragId.current = null;
    const payload = col.dropPayload();
    if (!Object.keys(payload).length) return;
    await applyPacketMove(id, payload);
  };

  const handleMove = async (id: string, fields: Record<string, unknown>) => {
    await applyPacketMove(id, fields);
  };

  const hasActiveFilters = jobTypeFilter !== "all" || statusFilter !== "all" || blockedFilter !== "all" || deliveryFilter !== "all" || !!dueDateFrom || !!dueDateTo || !!search;

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
      {moveError && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#DC2626", fontWeight: 600, marginBottom: 10, flexShrink: 0 }}>
          {moveError}
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

        {/* Delivery method */}
        <select value={deliveryFilter} onChange={e => setDeliveryFilter(e.target.value)} style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "#374151", background: "#fff", outline: "none", cursor: "pointer" }}>
          <option value="all">All Delivery</option>
          <option value="pickup">Pickup</option>
          <option value="shipping">Shipping</option>
        </select>

        {/* Due date range */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap" }}>Due:</span>
          <input type="date" value={dueDateFrom} onChange={e => setDueDateFrom(e.target.value)} style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "5px 8px", fontSize: 12, outline: "none", background: "#F9FAFB", color: "#374151" }} />
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>–</span>
          <input type="date" value={dueDateTo} onChange={e => setDueDateTo(e.target.value)} style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "5px 8px", fontSize: 12, outline: "none", background: "#F9FAFB", color: "#374151" }} />
        </div>

        {hasActiveFilters && (
          <button onClick={() => { setSearch(""); setJobTypeFilter("all"); setStatusFilter("all"); setBlockedFilter("all"); setDeliveryFilter("all"); setDueDateFrom(""); setDueDateTo(""); }}
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
                        onClick={() => router.push(`/workshop/jobs/${p.id}`)}
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

    </div>
  );
}
