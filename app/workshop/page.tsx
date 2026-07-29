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
  workshop_subcontractor_name: string | null;
  workshop_pathway_id: string | null;
  workshop_step_index: number;
  workshop_intake_substatus: string | null;
  workshop_needs_valuation: boolean;
  workshop_valuer: string | null;
  workshop_supplier: string | null;
  workshop_po_number: string | null;
}

interface TeamMember { id: string; tenant_id: string; name: string; profile_id: string | null; sort_order: number; active: boolean; }
interface Subcontractor { id: string; tenant_id: string; name: string; sort_order: number; active: boolean; }
interface Valuer { id: string; name: string; active: boolean; }
interface PathwayStep { name: string; location: "inhouse" | "external"; }
interface Pathway { id: string; name: string; steps: PathwayStep[]; }
interface ManagerMessage { id: string; text: string; created_at: string; }
interface LeadTime { id: string; job_type: string; weeks: number | null; }
interface Profile { id: string; full_name: string | null; role: string | null; }

interface StageCategory { id: string; name: string; color: string; sort_order: number; default_collapsed: boolean; }
interface WorkshopStage { id: string; category_id: string | null; key: string; label: string; intake_substatus: string | null; sort_order: number; is_locked: boolean; }
interface WorkshopLocation { id: string; name: string; job_types: string[]; sort_order: number; }

interface WorkshopConfig {
  teamMembers: TeamMember[];
  subcontractors: Subcontractor[];
  valuers: Valuer[];
  pathways: Pathway[];
  messages: ManagerMessage[];
  leadTimes: LeadTime[];
  categories: StageCategory[];
  stages: WorkshopStage[];
  locations: WorkshopLocation[];
}

interface ColDesc {
  key: string;
  label: string;
  accent: string;
  colBg: string;
  isDynamic?: boolean; // team/sub columns: auto-hide when empty
  match: (p: WorkshopPacket, config: WorkshopConfig, profiles: Profile[]) => boolean;
  dropPayload: (config: WorkshopConfig) => Record<string, unknown>;
}

interface CategoryGroup {
  categoryId: string;
  label: string;
  color: string;
  accent: string;
  colBg: string;
  columns: ColDesc[];
  defaultCollapsed: boolean;
}

// ── Color palette ─────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { accent: string; colBg: string }> = {
  blue:   { accent: "#378ADD", colBg: "#F0F7FF" },
  amber:  { accent: "#BA7517", colBg: "#FFFBEB" },
  purple: { accent: "#7F77DD", colBg: "#F5F3FF" },
  coral:  { accent: "#D85A30", colBg: "#FFF5F3" },
  teal:   { accent: "#1D9E75", colBg: "#ECFDF5" },
  gray:   { accent: "#6B7280", colBg: "#F9FAFB" },
};

// ── Constants ─────────────────────────────────────────────────────────────────

const JOB_TYPE_LABELS: Record<string, string> = {
  repair: "Repair", custom_order: "Custom", stock_work: "Stock",
  online_order: "Online", collection_order: "Collection",
};

const JOB_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  repair:           { bg: "#EEF2FF", color: "#4F46E5" },
  custom_order:     { bg: "#FFF7ED", color: "#C2410C" },
  stock_work:       { bg: "#F0FDF4", color: "#15803D" },
  online_order:     { bg: "#EFF6FF", color: "#3B82F6" },
  collection_order: { bg: "#FDF4FF", color: "#9333EA" },
};

const LS_KEY = "workshop_category_collapsed_v1";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr(): string { return new Date().toISOString().split("T")[0]; }
function isOverdue(p: WorkshopPacket) { return !!p.due_date && p.due_date < todayStr() && p.status !== "collected"; }
function isStale(p: WorkshopPacket) {
  if (!p.status_updated_at || p.status === "collected") return false;
  return (Date.now() - new Date(p.status_updated_at).getTime()) / 86_400_000 >= 5;
}
function isDueToday(p: WorkshopPacket) { return !!p.due_date && p.due_date === todayStr() && p.status !== "collected"; }
function displayName(p: WorkshopPacket) {
  if (p.job_type === "stock_work") return "Internal";
  return p.customer_display_name || [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "No name";
}
function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
function resolveSubStatusLabel(p: WorkshopPacket, config: WorkshopConfig): string | null {
  if (p.workshop_intake_substatus === "on_order") return "On Order";
  if (p.workshop_pathway_id) {
    const pw = config.pathways.find(x => x.id === p.workshop_pathway_id);
    if (pw) return `${pw.name} – Step ${(p.workshop_step_index ?? 0) + 1}/${pw.steps.length}`;
  }
  if (p.workshop_valuer) return `Valuer: ${p.workshop_valuer}`;
  return null;
}

// ── Category group builder ────────────────────────────────────────────────────

function buildCategoryGroups(config: WorkshopConfig, profiles: Profile[]): CategoryGroup[] {
  if (!config.categories.length) return buildFallbackGroups(config, profiles);

  return config.categories
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(cat => {
      const colors = CATEGORY_COLORS[cat.color] ?? CATEGORY_COLORS.gray;
      const catNameLower = cat.name.toLowerCase().replace(/[^a-z]/g, "");
      let columns: ColDesc[] = [];

      if (catNameLower === "team") {
        columns = config.teamMembers.filter(m => m.active).map(m => ({
          key: `member_${m.id}`,
          label: m.name,
          ...colors,
          isDynamic: true,
          match: (p: WorkshopPacket, _: WorkshopConfig, profs: Profile[]) => {
            if (p.status !== "on_bench" || !!p.workshop_subcontractor_name || !p.assigned_to) return false;
            if (m.profile_id) return p.assigned_to === m.profile_id;
            const prof = profs.find(pr => pr.id === p.assigned_to);
            return !!prof && prof.full_name?.toLowerCase().trim() === m.name.toLowerCase().trim();
          },
          dropPayload: () => ({ status: "on_bench", assigned_to: m.profile_id ?? null, workshop_subcontractor_name: null }),
        }));
      } else if (catNameLower === "subcontractors" || catNameLower === "subcontractor") {
        columns = config.subcontractors.filter(s => s.active).map(s => ({
          key: `sub_${s.id}`,
          label: s.name,
          ...colors,
          isDynamic: true,
          match: (p: WorkshopPacket) => p.status === "on_bench" && p.workshop_subcontractor_name === s.name,
          dropPayload: () => ({ status: "on_bench", workshop_subcontractor_name: s.name, assigned_to: null }),
        }));
      } else if (catNameLower === "unassigned") {
        columns = config.locations.slice().sort((a, b) => a.sort_order - b.sort_order).map(loc => ({
          key: `loc_${loc.id}`,
          label: loc.name,
          ...colors,
          match: (p: WorkshopPacket) =>
            p.status === "on_bench" && !p.assigned_to && !p.workshop_subcontractor_name &&
            !!p.job_type && loc.job_types.includes(p.job_type),
          dropPayload: () => ({ status: "on_bench", assigned_to: null, workshop_subcontractor_name: null }),
        }));
      } else {
        // Static: one column per stage row in this category
        const catStages = config.stages
          .filter(s => s.category_id === cat.id)
          .sort((a, b) => a.sort_order - b.sort_order);

        columns = catStages.map(stage => ({
          key: stage.intake_substatus ? `${stage.key}_${stage.intake_substatus}` : stage.key,
          label: stage.label,
          ...colors,
          match: (p: WorkshopPacket) => {
            if (p.status !== stage.key) return false;
            if (stage.intake_substatus !== null) {
              return (p.workshop_intake_substatus ?? "jobs_in") === stage.intake_substatus;
            }
            if (stage.key === "intake") {
              const sub = p.workshop_intake_substatus ?? "jobs_in";
              return sub === "jobs_in" || sub === null;
            }
            return true;
          },
          dropPayload: () => {
            const pay: Record<string, unknown> = { status: stage.key };
            if (stage.intake_substatus) pay.workshop_intake_substatus = stage.intake_substatus;
            else if (stage.key === "intake") pay.workshop_intake_substatus = "jobs_in";
            return pay;
          },
        }));
      }

      return {
        categoryId: cat.id,
        label: cat.name,
        color: cat.color,
        ...colors,
        columns,
        defaultCollapsed: cat.default_collapsed,
      };
    });
}

// Fallback when migration 071 hasn't run yet (no categories in config)
function buildFallbackGroups(config: WorkshopConfig, profiles: Profile[]): CategoryGroup[] {
  const blue   = CATEGORY_COLORS.blue;
  const amber  = CATEGORY_COLORS.amber;
  const purple = CATEGORY_COLORS.purple;
  const coral  = CATEGORY_COLORS.coral;
  const teal   = CATEGORY_COLORS.teal;

  const intakeCols: ColDesc[] = [
    { key: "intake", label: "Intake", ...blue, match: p => p.status === "intake" && (p.workshop_intake_substatus ?? "jobs_in") === "jobs_in", dropPayload: () => ({ status: "intake", workshop_intake_substatus: "jobs_in" }) },
    { key: "intake_pre_check", label: "Pre-Check", ...blue, match: p => p.status === "intake" && p.workshop_intake_substatus === "pre_check", dropPayload: () => ({ status: "intake", workshop_intake_substatus: "pre_check" }) },
    { key: "intake_on_order",  label: "On Order",  ...blue, match: p => p.status === "intake" && p.workshop_intake_substatus === "on_order",  dropPayload: () => ({ status: "intake", workshop_intake_substatus: "on_order" }) },
    { key: "quality_check",    label: "Quality Control", ...blue, match: p => p.status === "quality_check", dropPayload: () => ({ status: "quality_check" }) },
  ];
  const unassignedCols: ColDesc[] = [
    { key: "loc_manufacturing", label: "Manufacturing Orders",       ...amber, match: p => p.status === "on_bench" && !p.assigned_to && !p.workshop_subcontractor_name && p.job_type === "custom_order",   dropPayload: () => ({ status: "on_bench", assigned_to: null, workshop_subcontractor_name: null }) },
    { key: "loc_repairs",       label: "Repairs",                    ...amber, match: p => p.status === "on_bench" && !p.assigned_to && !p.workshop_subcontractor_name && p.job_type === "repair",          dropPayload: () => ({ status: "on_bench", assigned_to: null, workshop_subcontractor_name: null }) },
    { key: "loc_stock_online",  label: "Stock Work / Online Orders", ...amber, match: p => p.status === "on_bench" && !p.assigned_to && !p.workshop_subcontractor_name && (p.job_type === "stock_work" || p.job_type === "online_order"), dropPayload: () => ({ status: "on_bench", assigned_to: null, workshop_subcontractor_name: null }) },
    { key: "loc_collection",    label: "Collection Orders",          ...amber, match: p => p.status === "on_bench" && !p.assigned_to && !p.workshop_subcontractor_name && p.job_type === "collection_order", dropPayload: () => ({ status: "on_bench", assigned_to: null, workshop_subcontractor_name: null }) },
  ];
  const teamCols: ColDesc[] = config.teamMembers.filter(m => m.active).map(m => ({
    key: `member_${m.id}`, label: m.name, ...purple, isDynamic: true,
    match: (p: WorkshopPacket, _: WorkshopConfig, profs: Profile[]) => {
      if (p.status !== "on_bench" || !!p.workshop_subcontractor_name || !p.assigned_to) return false;
      if (m.profile_id) return p.assigned_to === m.profile_id;
      const prof = profs.find(pr => pr.id === p.assigned_to);
      return !!prof && prof.full_name?.toLowerCase().trim() === m.name.toLowerCase().trim();
    },
    dropPayload: () => ({ status: "on_bench", assigned_to: m.profile_id ?? null, workshop_subcontractor_name: null }),
  }));
  const subCols: ColDesc[] = config.subcontractors.filter(s => s.active).map(s => ({
    key: `sub_${s.id}`, label: s.name, ...coral, isDynamic: true,
    match: (p: WorkshopPacket) => p.status === "on_bench" && p.workshop_subcontractor_name === s.name,
    dropPayload: () => ({ status: "on_bench", workshop_subcontractor_name: s.name, assigned_to: null }),
  }));
  const finishCols: ColDesc[] = [
    { key: "to_be_valued", label: "To-Be-Valued",         ...teal, match: p => p.status === "to_be_valued", dropPayload: () => ({ status: "to_be_valued" }) },
    { key: "ready",        label: "Ready for Collection", ...teal, match: p => p.status === "ready",        dropPayload: () => ({ status: "ready" }) },
    { key: "collected",    label: "Collected",            ...teal, match: p => p.status === "collected",    dropPayload: () => ({ status: "collected" }) },
  ];

  return [
    { categoryId: "fallback_intake",    label: "Intake",          color: "blue",   ...blue,   columns: intakeCols,     defaultCollapsed: false },
    { categoryId: "fallback_unassigned",label: "Unassigned",      color: "amber",  ...amber,  columns: unassignedCols, defaultCollapsed: false },
    { categoryId: "fallback_team",      label: "Team",            color: "purple", ...purple, columns: teamCols,       defaultCollapsed: false },
    { categoryId: "fallback_sub",       label: "Sub-contractors", color: "coral",  ...coral,  columns: subCols,        defaultCollapsed: false },
    { categoryId: "fallback_finishing", label: "Finishing",       color: "teal",   ...teal,   columns: finishCols,     defaultCollapsed: false },
  ];
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
      {overduePkts.length > 0 && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#DC2626" }}>⚠ {overduePkts.length} overdue</div>}
      {stalePkts.length > 0   && <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#B45309" }}>⏸ {stalePkts.length} stale (5+ days)</div>}
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
    <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
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

function JobCard({ packet, config, accent, onDragStart, onClick }: {
  packet: WorkshopPacket; config: WorkshopConfig; accent: string;
  onDragStart: (e: React.DragEvent, id: string) => void; onClick: (p: WorkshopPacket) => void;
}) {
  const overdue  = isOverdue(packet);
  const dueToday = isDueToday(packet);
  const stale    = isStale(packet);
  const jt       = packet.job_type ?? "repair";
  const jtColor  = JOB_TYPE_COLORS[jt] ?? JOB_TYPE_COLORS.repair;
  const subStatus = resolveSubStatusLabel(packet, config);
  const leftBorder = overdue ? "3px solid #EF4444" : stale && !dueToday ? "3px solid #F59E0B" : "3px solid transparent";

  return (
    <div draggable onDragStart={e => onDragStart(e, packet.id)} onClick={() => onClick(packet)}
      style={{ background: "#fff", border: "1px solid #E8E8F0", borderLeft: leftBorder, borderRadius: 10, padding: "10px 12px", cursor: "grab", userSelect: "none" }}
      onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = "none")}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 5 }}>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: "#9CA3AF", letterSpacing: "0.02em" }}>{packet.reference_number}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: jtColor.bg, color: jtColor.color, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>{JOB_TYPE_LABELS[jt] ?? jt}</span>
      </div>
      <div style={{ fontWeight: 600, color: "#1A1A2E", fontSize: 13, marginBottom: 3 }}>{displayName(packet)}</div>
      {packet.articles && <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{packet.articles}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {subStatus && <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 999, background: "#F3F4F6", color: "#6B7280" }}>{subStatus}</span>}
        {packet.workshop_needs_valuation && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FDF4FF", color: "#9333EA", border: "1px solid #E9D5FF" }}>Needs Valuation</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        {packet.due_date ? (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: overdue ? "#FEE2E2" : dueToday ? "#FEF3C7" : "#F3F4F6", color: overdue ? "#DC2626" : dueToday ? "#B45309" : "#6B7280" }}>
            {overdue ? "⚠ " : dueToday ? "⏰ " : ""}{formatDateAU(packet.due_date)}
          </span>
        ) : <span style={{ fontSize: 11, color: "#D1D5DB" }}>No due date</span>}
        {packet.assigned_to_name && (
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: accent, color: "#fff", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {initials(packet.assigned_to_name)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Slide-Over Panel ──────────────────────────────────────────────────────────

function SlideOver({ packet, config, profiles, isManager, tenantId, onClose, onUpdate, onDelete }: {
  packet: WorkshopPacket; config: WorkshopConfig; profiles: Profile[];
  isManager: boolean; tenantId: string;
  onClose: () => void; onUpdate: (p: WorkshopPacket) => void; onDelete: (id: string) => void;
}) {
  const [local, setLocal]   = useState<WorkshopPacket>(packet);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { setLocal(packet); }, [packet]);

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
          assigned_to_name: fields.assigned_to !== undefined ? (profiles.find(p => p.id === fields.assigned_to)?.full_name ?? null) : local.assigned_to_name,
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

  // Flat stage list — derive from config if available, else fallback
  type StageEntry = { label: string; status: string; substatus: string | null; accent: string };
  let FLAT_STAGES: StageEntry[];
  if (config.stages.length > 0) {
    FLAT_STAGES = config.stages
      .slice()
      .sort((a, b) => {
        const catA = config.categories.find(c => c.id === a.category_id);
        const catB = config.categories.find(c => c.id === b.category_id);
        const catOrderA = catA?.sort_order ?? 99;
        const catOrderB = catB?.sort_order ?? 99;
        if (catOrderA !== catOrderB) return catOrderA - catOrderB;
        return a.sort_order - b.sort_order;
      })
      .map(s => {
        const cat = config.categories.find(c => c.id === s.category_id);
        const colors = CATEGORY_COLORS[cat?.color ?? "gray"] ?? CATEGORY_COLORS.gray;
        return { label: s.label, status: s.key, substatus: s.intake_substatus, accent: colors.accent };
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

        {/* Flat stage selector */}
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

          {FIELD("Assigned To",
            <select value={local.assigned_to ?? ""} onChange={e => patch({ assigned_to: e.target.value || null, workshop_subcontractor_name: null })} style={INPUT}>
              <option value="">— Unassigned —</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>)}
            </select>
          )}

          {FIELD("Subcontractor",
            <select value={local.workshop_subcontractor_name ?? ""} onChange={e => patch({ workshop_subcontractor_name: e.target.value || null, assigned_to: null })} style={INPUT}>
              <option value="">— None —</option>
              {config.subcontractors.filter(s => s.active).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          )}

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

          {/* Procurement */}
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

          {/* Pricing */}
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

export default function WorkshopPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => { if (hydrated && user && !hasPermission(user, "workshop")) router.replace("/"); }, [user, hydrated, router]);

  const tenantId  = user?.tenantId ?? "";
  const isManager = canManage(user?.role ?? null);

  const [packets,  setPackets]  = useState<WorkshopPacket[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [config,   setConfig]   = useState<WorkshopConfig>({ teamMembers: [], subcontractors: [], valuers: [], pathways: [], messages: [], leadTimes: [], categories: [], stages: [], locations: [] });
  const [configError, setConfigError] = useState<string | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [selectedPacket, setSelectedPacket] = useState<WorkshopPacket | null>(null);
  const [includeCollected, setIncludeCollected] = useState(false);
  const [jobTypeFilter, setJobTypeFilter]   = useState("all");
  const [statusFilter,  setStatusFilter]    = useState("all");
  const [search,        setSearch]          = useState("");
  const [collapsedState, setCollapsedState] = useState<Record<string, boolean>>({});
  const dragId = useRef<string | null>(null);

  // Load collapse state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setCollapsedState(JSON.parse(saved));
    } catch { /* noop */ }
  }, []);

  const toggleCategory = (categoryId: string, defaultCollapsed: boolean) => {
    setCollapsedState(prev => {
      const current = prev[categoryId] ?? defaultCollapsed;
      const next = { ...prev, [categoryId]: !current };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const fetchPackets = useCallback(async (withCollected = includeCollected) => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/workshop/packets${withCollected ? "?include_collected=1" : ""}`, { cache: "no-store", headers: { "x-tenant-id": tenantId } });
      const json = await res.json();
      setPackets(json.packets ?? []);
    } catch { setPackets([]); } finally { setLoading(false); }
  }, [tenantId, includeCollected]);

  const fetchConfig = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch("/api/workshop/config", { cache: "no-store", headers: { "x-tenant-id": tenantId } });
      const json = await res.json();
      if (!res.ok) {
        console.error("[workshop] config fetch failed:", res.status, json);
        setConfigError(`Config load failed (${res.status})`);
        return;
      }
      if (json.configError) {
        console.error("[workshop] config query error:", json.configError);
        setConfigError(json.configError);
      } else {
        setConfigError(null);
      }
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
      });
    } catch (err) {
      console.error("[workshop] fetchConfig threw:", err);
      setConfigError("Couldn't reach workshop config endpoint");
    }
  }, [tenantId]);

  useEffect(() => { fetchPackets(); }, [fetchPackets]);
  useEffect(() => { fetchConfig(); }, [fetchConfig]);
  useEffect(() => {
    if (!tenantId) return;
    fetch("/api/profiles", { headers: { "x-tenant-id": tenantId } }).then(r => r.json()).then(j => setProfiles(j.profiles ?? [])).catch(() => {});
  }, [tenantId]);

  const usingFallback = config.categories.length === 0;
  const categoryGroups = buildCategoryGroups(config, profiles);

  const sortAtRisk = (pkts: WorkshopPacket[]) =>
    [...pkts].sort((a, b) => ((isOverdue(b) ? 2 : 0) + (isStale(b) ? 1 : 0)) - ((isOverdue(a) ? 2 : 0) + (isStale(a) ? 1 : 0)));

  const q = search.trim().toLowerCase();
  const filteredPackets = packets.filter(p => {
    if (jobTypeFilter !== "all" && p.job_type !== jobTypeFilter) return false;
    if (statusFilter === "overdue"   && !isOverdue(p))   return false;
    if (statusFilter === "due_today" && !isDueToday(p))  return false;
    if (statusFilter === "ready"     && p.status !== "ready") return false;
    if (q) {
      const name = displayName(p).toLowerCase();
      if (!name.includes(q) && !(p.reference_number ?? "").toLowerCase().includes(q) && !(p.articles ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const packetsForCol = (col: ColDesc) => sortAtRisk(filteredPackets.filter(p => col.match(p, config, profiles)));

  const handleDragStart = (e: React.DragEvent, id: string) => { dragId.current = id; e.dataTransfer.effectAllowed = "move"; };

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
      await fetch(`/api/workshop/packets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-tenant-id": tenantId }, body: JSON.stringify(payload) });
    } catch { fetchPackets(); }
  };

  const handleUpdate = (updated: WorkshopPacket) => {
    setPackets(prev => prev.map(p => p.id === updated.id ? updated : p));
    if (selectedPacket?.id === updated.id) setSelectedPacket(updated);
  };
  const handleDelete = (id: string) => { setPackets(prev => prev.filter(p => p.id !== id)); if (selectedPacket?.id === id) setSelectedPacket(null); };

  const JOB_TYPE_FILTER_OPTIONS = [
    ["all","All Types"],["repair","Repairs"],["custom_order","Custom"],
    ["collection_order","Collection"],["online_order","Online"],["stock_work","Stock"],
  ] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", gap: 0 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 12, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Workshop</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "2px 0 0" }}>Everything on the bench</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AtRiskBanner packets={packets} />
          {isManager && (
            <a href="/workshop/settings" style={{ fontSize: 12, fontWeight: 600, color: "#635BFF", textDecoration: "none", border: "1px solid #635BFF", borderRadius: 8, padding: "6px 12px", flexShrink: 0 }}>
              ⚙ Settings
            </a>
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

      {/* Config fallback banner */}
      {usingFallback && (
        <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#B45309", fontWeight: 500, marginBottom: 10, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span>⚠</span>
          <span>
            {configError
              ? `Couldn't load workshop configuration — showing default layout. (${configError})`
              : "Workshop configuration not found — showing default layout. Run migration 071 and check Supabase logs."}
          </span>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" /></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ref, name, description…" style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px 6px 28px", fontSize: 13, outline: "none", background: "#F9FAFB", color: "#1A1A2E", width: 220 }} />
        </div>
        <div style={{ width: 1, height: 20, background: "#E8E8F0", flexShrink: 0 }} />
        <div style={{ display: "flex", gap: 3, background: "#F3F4F6", borderRadius: 8, padding: 3, flexShrink: 0 }}>
          {JOB_TYPE_FILTER_OPTIONS.map(([v, label]) => (
            <button key={v} onClick={() => setJobTypeFilter(v)} style={{ padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none", background: jobTypeFilter === v ? "#fff" : "transparent", color: jobTypeFilter === v ? "#1A1A2E" : "#6B7280", boxShadow: jobTypeFilter === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none", cursor: "pointer" }}>{label}</button>
          ))}
        </div>
        <div style={{ width: 1, height: 20, background: "#E8E8F0", flexShrink: 0 }} />
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {([["all","All","#6B7280","#F3F4F6"],["overdue","Overdue","#DC2626","#FEE2E2"],["due_today","Due Today","#B45309","#FEF3C7"],["ready","Ready","#16A34A","#DCFCE7"]] as const).map(([v, label, color, bg]) => (
            <button key={v} onClick={() => setStatusFilter(v)} style={{ padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: "none", background: statusFilter === v ? bg : "transparent", color: statusFilter === v ? color : "#6B7280", cursor: "pointer", outline: statusFilter === v ? `1px solid ${color}33` : "none" }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Kanban board */}
      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 14 }}>Loading jobs…</div>
      ) : (
        <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", paddingBottom: 4 }}>
          <div style={{ display: "flex", gap: 12, height: "100%", minWidth: "max-content" }}>
            {categoryGroups.map(group => {
              const isCollapsed = collapsedState[group.categoryId] ?? group.defaultCollapsed;
              const groupPackets = filteredPackets.filter(p => group.columns.some(col => col.match(p, config, profiles)));
              const visibleCols = isCollapsed ? [] : group.columns.filter(col => !col.isDynamic || packetsForCol(col).length > 0);

              return (
                <div key={group.categoryId} style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
                  {/* Category header strip */}
                  <button
                    onClick={() => toggleCategory(group.categoryId, group.defaultCollapsed)}
                    style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${group.accent}33`, borderBottom: "none", borderRadius: isCollapsed ? 10 : "10px 10px 0 0", padding: "8px 12px", cursor: "pointer", width: "100%", textAlign: "left", marginBottom: 0 }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: group.accent, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: group.accent, textTransform: "uppercase", letterSpacing: "0.06em", flex: 1, whiteSpace: "nowrap" }}>{group.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, background: `${group.accent}20`, color: group.accent, borderRadius: 999, padding: "1px 7px", flexShrink: 0 }}>{groupPackets.length}</span>
                    <span style={{ fontSize: 11, color: group.accent, flexShrink: 0 }}>{isCollapsed ? "▸" : "▾"}</span>
                  </button>

                  {/* Columns */}
                  {!isCollapsed && (
                    <div style={{ display: "flex", gap: 8, background: `${group.accent}10`, border: `1px solid ${group.accent}33`, borderRadius: "0 0 10px 10px", padding: 8, flex: 1, overflowY: "hidden" }}>
                      {visibleCols.length === 0 ? (
                        <div style={{ width: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#D1D5DB", fontSize: 12, padding: "16px 8px" }}>No columns</div>
                      ) : visibleCols.map(col => {
                        const cards = packetsForCol(col);
                        return (
                          <div key={col.key} style={{ flexShrink: 0, width: 240, display: "flex", flexDirection: "column" }}>
                            <div style={{ background: col.colBg, borderRadius: "8px 8px 0 0", border: "1px solid #E8E8F0", borderBottom: "none", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: col.accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{col.label}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(255,255,255,0.7)", color: col.accent, borderRadius: 999, padding: "1px 7px", flexShrink: 0 }}>{cards.length}</span>
                            </div>
                            <div
                              style={{ flex: 1, overflowY: "auto", background: col.colBg, border: "1px solid #E8E8F0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 8, display: "flex", flexDirection: "column", gap: 8, minHeight: 160 }}
                              onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.outline = `2px dashed ${col.accent}`; }}
                              onDragLeave={e => { (e.currentTarget as HTMLDivElement).style.outline = "none"; }}
                              onDrop={e => handleDrop(e, col)}
                            >
                              {cards.length === 0 && <div style={{ padding: "20px 8px", textAlign: "center", color: "#D1D5DB", fontSize: 12 }}>Drop cards here</div>}
                              {cards.map(p => <JobCard key={p.id} packet={p} config={config} accent={col.accent} onDragStart={handleDragStart} onClick={() => setSelectedPacket(p)} />)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Collapsed pill — show when collapsed */}
                  {isCollapsed && (
                    <div style={{ background: `${group.accent}10`, border: `1px solid ${group.accent}33`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 11, color: group.accent }}>{groupPackets.length} job{groupPackets.length !== 1 ? "s" : ""}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Slide-over */}
      {selectedPacket && (
        <SlideOver packet={selectedPacket} config={config} profiles={profiles} isManager={isManager} tenantId={tenantId} onClose={() => setSelectedPacket(null)} onUpdate={handleUpdate} onDelete={handleDelete} />
      )}
    </div>
  );
}
