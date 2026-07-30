"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { hasPermission, canManage } from "@/lib/userTypes";
import { formatDateAU } from "@/lib/formatters";

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkshopPacket {
  id: string;
  reference_number: string;
  job_type: string | null;
  status: string | null;
  status_updated_at: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  customer_display_name: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  due_date: string | null;
  collected_at: string | null;
  articles: string | null;
  workshop_subcontractor_name: string | null;
  workshop_pathway_id: string | null;
  workshop_step_index: number;
  workshop_intake_substatus: string | null;
  blocked_reason: string | null;
  blocked_note: string | null;
}

interface TeamMember { id: string; name: string; profile_id: string | null; active: boolean; }
interface Subcontractor { id: string; name: string; active: boolean; }
interface Pathway { id: string; name: string; steps: { name: string }[]; }

interface WorkshopConfig {
  teamMembers: TeamMember[];
  subcontractors: Subcontractor[];
  pathways: Pathway[];
  settings: { stale_threshold_days: number; valuation_threshold: number };
}

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
const STAGE_LABELS: Record<string, string> = {
  intake: "Intake", on_bench: "Production", quality_check: "Quality Control",
  to_be_valued: "Valuation", ready: "Ready", collected: "Collected",
};
const STAGE_COLORS: Record<string, { bg: string; color: string }> = {
  intake:        { bg: "#EFF6FF", color: "#3B82F6" },
  on_bench:      { bg: "#F5F3FF", color: "#7C3AED" },
  quality_check: { bg: "#FFF7ED", color: "#C2410C" },
  to_be_valued:  { bg: "#FDF4FF", color: "#9333EA" },
  ready:         { bg: "#F0FDF4", color: "#15803D" },
  collected:     { bg: "#F3F4F6", color: "#6B7280" },
};
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

type SortKey = "due_date" | "reference_number" | "customer" | "job_type" | "status" | "status_updated_at" | "assigned";
type SortDir = "asc" | "desc";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split("T")[0]; }
function isOverdue(p: WorkshopPacket) {
  return !!p.due_date && p.due_date < todayStr() && p.status !== "collected";
}
function isDueToday(p: WorkshopPacket) {
  return !!p.due_date && p.due_date === todayStr() && p.status !== "collected";
}
function isStale(p: WorkshopPacket, threshold = 5) {
  if (!p.status_updated_at || p.status === "collected") return false;
  return (Date.now() - new Date(p.status_updated_at).getTime()) / 86_400_000 >= threshold;
}
function displayName(p: WorkshopPacket) {
  if (p.job_type === "stock_work") return "Internal";
  return p.customer_display_name || [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
}
function resolveAssignee(p: WorkshopPacket) {
  if (p.assigned_to_name) return p.assigned_to_name;
  if (p.workshop_subcontractor_name) return p.workshop_subcontractor_name;
  return null;
}
function resolveCurrentStep(p: WorkshopPacket, config: WorkshopConfig): string | null {
  if (!p.workshop_pathway_id) return null;
  const pw = config.pathways.find(x => x.id === p.workshop_pathway_id);
  if (!pw || !pw.steps.length) return null;
  const idx = p.workshop_step_index ?? 0;
  const step = pw.steps[idx];
  if (!step) return null;
  return `${idx + 1}/${pw.steps.length}: ${step.name}`;
}
function resolveSubStageLabel(p: WorkshopPacket): string | null {
  if (p.status !== "intake") return null;
  if (p.workshop_intake_substatus === "pre_check") return "Pre-Check";
  if (p.workshop_intake_substatus === "on_order")  return "On Order";
  return null;
}
function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)       return "just now";
  if (diff < 3600)     return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)    return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return formatDateAU(iso.split("T")[0]);
}

// ── Nav tabs shared across workshop views ─────────────────────────────────────

function WorkshopNav({ active }: { active: "jobs" | "board" | "history" }) {
  const tabs: { key: typeof active; href: string; label: string }[] = [
    { key: "jobs",    href: "/workshop",         label: "All Jobs" },
    { key: "board",   href: "/workshop/board",   label: "Board" },
    { key: "history", href: "/workshop/history", label: "History" },
  ];
  return (
    <div style={{ display: "flex", gap: 2, background: "#F3F4F6", borderRadius: 10, padding: 3, flexShrink: 0 }}>
      {tabs.map(t => (
        <a key={t.key} href={t.href}
          style={{
            padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            textDecoration: "none", cursor: "pointer",
            background: active === t.key ? "#fff" : "transparent",
            color: active === t.key ? "#1A1A2E" : "#6B7280",
            boxShadow: active === t.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
            transition: "all .12s",
          }}
        >{t.label}</a>
      ))}
    </div>
  );
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

function Badge({ label, bg, color, border }: { label: string; bg: string; color: string; border?: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: bg, color, border: border ?? "none", whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

// ── Sort indicator ────────────────────────────────────────────────────────────

function SortIcon({ dir }: { dir: SortDir | null }) {
  if (!dir) return <span style={{ color: "#D1D5DB", fontSize: 10, marginLeft: 3 }}>↕</span>;
  return <span style={{ fontSize: 10, marginLeft: 3, color: "#635BFF" }}>{dir === "asc" ? "↑" : "↓"}</span>;
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

  const [packets, setPackets] = useState<WorkshopPacket[]>([]);
  const [config,  setConfig]  = useState<WorkshopConfig>({
    teamMembers: [], subcontractors: [], pathways: [],
    settings: { stale_threshold_days: 5, valuation_threshold: 3000 },
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search,          setSearch]          = useState("");
  const [jobTypeFilter,   setJobTypeFilter]   = useState("all");
  const [stageFilter,     setStageFilter]     = useState("all");
  const [assigneeFilter,  setAssigneeFilter]  = useState("all");
  const [blockedFilter,   setBlockedFilter]   = useState(false);
  const [overdueFilter,   setOverdueFilter]   = useState(false);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("due_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const headers = { "x-tenant-id": tenantId };

  const fetchPackets = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch("/api/workshop/packets", { cache: "no-store", headers });
      const json = await res.json();
      setPackets((json.packets ?? []).filter((p: WorkshopPacket) => p.status !== "collected"));
    } catch { setPackets([]); } finally { setLoading(false); }
  }, [tenantId]);

  const fetchConfig = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch("/api/workshop/config", { cache: "no-store", headers });
      const json = await res.json();
      setConfig({
        teamMembers:    json.teamMembers    ?? [],
        subcontractors: json.subcontractors ?? [],
        pathways:       json.pathways       ?? [],
        settings:       json.settings ?? { stale_threshold_days: 5, valuation_threshold: 3000 },
      });
    } catch { /* keep defaults */ }
  }, [tenantId]);

  useEffect(() => { fetchPackets(); }, [fetchPackets]);
  useEffect(() => { fetchConfig(); },  [fetchConfig]);

  // ── Derived assignee list for filter dropdown ─────────────────────────────

  const allAssignees = Array.from(new Set([
    ...config.teamMembers.filter(m => m.active).map(m => m.name),
    ...config.subcontractors.filter(s => s.active).map(s => s.name),
  ]));

  // ── Filter ────────────────────────────────────────────────────────────────

  const q = search.trim().toLowerCase();
  const filtered = packets.filter(p => {
    if (jobTypeFilter !== "all" && p.job_type !== jobTypeFilter) return false;
    if (stageFilter   !== "all" && p.status   !== stageFilter)   return false;
    if (overdueFilter && !isOverdue(p)) return false;
    if (blockedFilter && !p.blocked_reason) return false;
    if (assigneeFilter !== "all") {
      const a = resolveAssignee(p);
      if (a !== assigneeFilter) return false;
    }
    if (q) {
      const name = displayName(p).toLowerCase();
      const ref  = (p.reference_number ?? "").toLowerCase();
      const desc = (p.articles ?? "").toLowerCase();
      if (!name.includes(q) && !ref.includes(q) && !desc.includes(q)) return false;
    }
    return true;
  });

  // ── Sort ──────────────────────────────────────────────────────────────────

  const sorted = [...filtered].sort((a, b) => {
    let va: string | number = 0;
    let vb: string | number = 0;
    switch (sortKey) {
      case "due_date":        va = a.due_date ?? "9999"; vb = b.due_date ?? "9999"; break;
      case "reference_number": va = a.reference_number; vb = b.reference_number; break;
      case "customer":        va = displayName(a).toLowerCase(); vb = displayName(b).toLowerCase(); break;
      case "job_type":        va = a.job_type ?? ""; vb = b.job_type ?? ""; break;
      case "status":          va = a.status ?? ""; vb = b.status ?? ""; break;
      case "status_updated_at": va = a.status_updated_at ?? ""; vb = b.status_updated_at ?? ""; break;
      case "assigned":        va = (resolveAssignee(a) ?? "").toLowerCase(); vb = (resolveAssignee(b) ?? "").toLowerCase(); break;
    }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  // Overdue always float to top regardless of sort
  const withAtRisk = [
    ...sorted.filter(isOverdue),
    ...sorted.filter(p => !isOverdue(p) && isStale(p, config.settings.stale_threshold_days)),
    ...sorted.filter(p => !isOverdue(p) && !isStale(p, config.settings.stale_threshold_days)),
  ];

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  // ── Summary counts ────────────────────────────────────────────────────────

  const overdueCount = packets.filter(isOverdue).length;
  const blockedCount = packets.filter(p => !!p.blocked_reason).length;
  const staleCount   = packets.filter(p => !isOverdue(p) && isStale(p, config.settings.stale_threshold_days)).length;

  // ── Th helper ─────────────────────────────────────────────────────────────

  const TH = ({ label, sk, width }: { label: string; sk?: SortKey; width?: number }) => (
    <th
      onClick={sk ? () => handleSort(sk) : undefined}
      style={{
        padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700,
        color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em",
        background: "#F9FAFB", borderBottom: "1px solid #E8E8F0", whiteSpace: "nowrap",
        cursor: sk ? "pointer" : "default", userSelect: "none",
        width: width ? `${width}px` : undefined,
      }}
    >
      {label}{sk && <SortIcon dir={sortKey === sk ? sortDir : null} />}
    </th>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 80px)" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Workshop</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "2px 0 0" }}>{packets.length} active jobs</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* At-risk summary chips */}
          {overdueCount > 0 && (
            <button onClick={() => { setOverdueFilter(v => !v); }} style={{ background: overdueFilter ? "#FEE2E2" : "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "6px 12px", fontSize: 13, fontWeight: 600, color: "#DC2626", cursor: "pointer" }}>
              ⚠ {overdueCount} overdue
            </button>
          )}
          {staleCount > 0 && (
            <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 10, padding: "6px 12px", fontSize: 13, fontWeight: 600, color: "#B45309" }}>
              ⏸ {staleCount} stale
            </div>
          )}
          {blockedCount > 0 && (
            <button onClick={() => setBlockedFilter(v => !v)} style={{ background: blockedFilter ? "#FEE2E2" : "#FFF5F3", border: "1px solid #FDBA74", borderRadius: 10, padding: "6px 12px", fontSize: 13, fontWeight: 600, color: "#EA580C", cursor: "pointer" }}>
              🚫 {blockedCount} blocked
            </button>
          )}
          {overdueCount === 0 && staleCount === 0 && blockedCount === 0 && (
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: "6px 12px", fontSize: 13, fontWeight: 600, color: "#15803D" }}>
              ✓ All clear
            </div>
          )}
          <WorkshopNav active="jobs" />
          {isManager && (
            <a href="/workshop/settings" style={{ fontSize: 12, fontWeight: 600, color: "#635BFF", textDecoration: "none", border: "1px solid #635BFF", borderRadius: 8, padding: "6px 12px", flexShrink: 0 }}>
              ⚙ Settings
            </a>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
        {/* Search */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" /></svg>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search ref, name, description…"
            style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px 6px 28px", fontSize: 13, outline: "none", background: "#F9FAFB", color: "#1A1A2E", width: 220 }}
          />
        </div>

        <div style={{ width: 1, height: 20, background: "#E8E8F0", flexShrink: 0 }} />

        {/* Job type */}
        <select value={jobTypeFilter} onChange={e => setJobTypeFilter(e.target.value)} style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px", fontSize: 13, color: "#374151", background: "#fff", outline: "none", cursor: "pointer" }}>
          <option value="all">All Types</option>
          <option value="repair">Repairs</option>
          <option value="custom_order">Custom</option>
          <option value="collection_order">Collection</option>
          <option value="online_order">Online</option>
          <option value="stock_work">Stock</option>
        </select>

        {/* Stage */}
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px", fontSize: 13, color: "#374151", background: "#fff", outline: "none", cursor: "pointer" }}>
          <option value="all">All Stages</option>
          <option value="intake">Intake</option>
          <option value="on_bench">Production</option>
          <option value="quality_check">Quality Control</option>
          <option value="to_be_valued">Valuation</option>
          <option value="ready">Ready</option>
        </select>

        {/* Assignee */}
        {allAssignees.length > 0 && (
          <select value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)} style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px", fontSize: 13, color: "#374151", background: "#fff", outline: "none", cursor: "pointer" }}>
            <option value="all">All Assignees</option>
            {allAssignees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}

        <div style={{ width: 1, height: 20, background: "#E8E8F0", flexShrink: 0 }} />

        {/* Quick filter pills */}
        <button
          onClick={() => setOverdueFilter(v => !v)}
          style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: "none", background: overdueFilter ? "#FEE2E2" : "transparent", color: overdueFilter ? "#DC2626" : "#6B7280", cursor: "pointer", outline: overdueFilter ? "1px solid #FECACA" : "none" }}
        >
          Overdue
        </button>
        <button
          onClick={() => setBlockedFilter(v => !v)}
          style={{ padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: "none", background: blockedFilter ? "#FFF5F3" : "transparent", color: blockedFilter ? "#EA580C" : "#6B7280", cursor: "pointer", outline: blockedFilter ? "1px solid #FDBA74" : "none" }}
        >
          Blocked
        </button>

        {(search || jobTypeFilter !== "all" || stageFilter !== "all" || assigneeFilter !== "all" || blockedFilter || overdueFilter) && (
          <button onClick={() => { setSearch(""); setJobTypeFilter("all"); setStageFilter("all"); setAssigneeFilter("all"); setBlockedFilter(false); setOverdueFilter(false); }} style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1px solid #E8E8F0", background: "#fff", color: "#9CA3AF", cursor: "pointer" }}>
            Clear
          </button>
        )}

        <span style={{ marginLeft: "auto", fontSize: 12, color: "#9CA3AF" }}>
          {filtered.length} of {packets.length} jobs
        </span>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden", flex: 1 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading jobs…</div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
            {packets.length === 0 ? "No active jobs." : "No jobs match the current filters."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <TH label="Due Date"    sk="due_date"        width={110} />
                  <TH label="Job #"       sk="reference_number" width={120} />
                  <TH label="Customer"    sk="customer"         />
                  <TH label="Type"        sk="job_type"         width={100} />
                  <TH label="Stage"       sk="status"           width={140} />
                  <TH label="Step"                              width={160} />
                  <TH label="Assigned To" sk="assigned"         width={130} />
                  <TH label="Blocked"                           width={170} />
                  <TH label="Last Updated" sk="status_updated_at" width={110} />
                </tr>
              </thead>
              <tbody>
                {withAtRisk.map((p, i) => {
                  const overdue  = isOverdue(p);
                  const dueToday = isDueToday(p);
                  const stale    = isStale(p, config.settings.stale_threshold_days);
                  const jt       = p.job_type ?? "repair";
                  const jtColor  = JOB_TYPE_COLORS[jt] ?? JOB_TYPE_COLORS.repair;
                  const stColor  = STAGE_COLORS[p.status ?? ""] ?? STAGE_COLORS.intake;
                  const assignee = resolveAssignee(p);
                  const step     = resolveCurrentStep(p, config);
                  const subStage = resolveSubStageLabel(p);
                  const rowBg    = overdue ? "#FFF5F5" : stale ? "#FFFDF0" : i % 2 === 0 ? "#fff" : "#FAFAFA";

                  return (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/workshop/board?job=${p.id}`)}
                      style={{ background: rowBg, borderBottom: "1px solid #F3F4F6", cursor: "pointer", transition: "background .1s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F5F3FF")}
                      onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                    >
                      {/* Due Date */}
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        {p.due_date ? (
                          <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: overdue ? "#FEE2E2" : dueToday ? "#FEF3C7" : "transparent", color: overdue ? "#DC2626" : dueToday ? "#B45309" : "#374151" }}>
                            {overdue ? "⚠ " : dueToday ? "⏰ " : ""}{formatDateAU(p.due_date)}
                          </span>
                        ) : (
                          <span style={{ color: "#D1D5DB", fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Job # */}
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#6B7280" }}>{p.reference_number}</span>
                      </td>

                      {/* Customer */}
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600, color: "#1A1A2E", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {displayName(p)}
                        </div>
                        {p.articles && (
                          <div style={{ fontSize: 11, color: "#9CA3AF", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.articles}
                          </div>
                        )}
                      </td>

                      {/* Type */}
                      <td style={{ padding: "10px 14px" }}>
                        <Badge label={JOB_TYPE_LABELS[jt] ?? jt} bg={jtColor.bg} color={jtColor.color} />
                      </td>

                      {/* Stage */}
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <Badge label={STAGE_LABELS[p.status ?? ""] ?? (p.status ?? "—")} bg={stColor.bg} color={stColor.color} />
                          {subStage && <span style={{ fontSize: 10, color: "#9CA3AF" }}>{subStage}</span>}
                        </div>
                      </td>

                      {/* Step */}
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 12, color: "#6B7280" }}>{step ?? "—"}</span>
                      </td>

                      {/* Assigned */}
                      <td style={{ padding: "10px 14px" }}>
                        {assignee ? (
                          <span style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>{assignee}</span>
                        ) : (
                          <span style={{ fontSize: 12, color: "#D1D5DB" }}>Unassigned</span>
                        )}
                      </td>

                      {/* Blocked */}
                      <td style={{ padding: "10px 14px" }}>
                        {p.blocked_reason ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <Badge
                              label={BLOCKED_LABELS[p.blocked_reason] ?? p.blocked_reason}
                              bg="#FFF5F3" color="#EA580C" border="1px solid #FDBA74"
                            />
                            {p.blocked_reason === "other" && p.blocked_note && (
                              <span style={{ fontSize: 10, color: "#9CA3AF", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.blocked_note}</span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#D1D5DB", fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Last Updated */}
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 12, color: stale ? "#B45309" : "#9CA3AF" }}>
                          {stale ? "⏸ " : ""}{relativeTime(p.status_updated_at)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer link to history */}
      <div style={{ marginTop: 12, textAlign: "center", flexShrink: 0 }}>
        <a href="/workshop/history" style={{ fontSize: 13, color: "#9CA3AF", textDecoration: "none" }}>
          View collected jobs → History
        </a>
      </div>
    </div>
  );
}
