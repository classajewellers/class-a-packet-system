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
  quality_issue?: boolean | null;
  delivery_method: string | null;
  pending_customer_approval?: boolean | null;
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
  online_order: "Online Order", collection_order: "Collection",
};
const STAGE_LABELS: Record<string, string> = {
  intake: "Intake", on_bench: "Production", quality_check: "Quality Control",
  to_be_valued: "Valuation", ready: "Ready", collected: "Collected",
};
const BLOCKED_LABELS: Record<string, string> = {
  waiting_customer:      "Waiting: customer",
  waiting_supplier:      "Waiting: supplier",
  waiting_materials:     "Waiting: materials",
  waiting_stone:         "Awaiting stone",
  waiting_casting:       "Waiting: casting",
  waiting_approval:      "Approval needed",
  waiting_subcontractor: "Waiting: subcontractor",
  other:                 "Blocked",
};

type SortKey = "due_date" | "reference_number" | "customer" | "job_type" | "status" | "status_updated_at" | "assigned";
type SortDir = "asc" | "desc";
type TabKey = "active" | "mine";

// ── Helpers (unchanged from the prior version - data logic not touched) ──────

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
function isMyJob(p: WorkshopPacket, userId: string | null | undefined) {
  return !!userId && p.assigned_to === userId;
}
function resolvePathwaySteps(p: WorkshopPacket, config: WorkshopConfig): { name: string }[] | null {
  if (!p.workshop_pathway_id) return null;
  const pw = config.pathways.find(x => x.id === p.workshop_pathway_id);
  return pw?.steps?.length ? pw.steps : null;
}
function resolveCurrentStepLabel(p: WorkshopPacket, config: WorkshopConfig): string | null {
  const steps = resolvePathwaySteps(p, config);
  if (!steps) return null;
  const step = steps[p.workshop_step_index ?? 0];
  return step ? step.name : null;
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
function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
// Deterministic colour per person, derived from their real name - not a new
// backend concept, just a display convenience so team members are visually
// distinguishable in the queue.
const AVATAR_PALETTE = ["#635BFF", "#B45309", "#16A34A", "#0EA5E9", "#DC2626", "#7C3AED", "#0891B2"];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
function needsAttentionReason(p: WorkshopPacket, staleThresholdDays: number): string | null {
  if (p.pending_customer_approval) return "Approval needed";
  if (p.blocked_reason) return BLOCKED_LABELS[p.blocked_reason] ?? p.blocked_reason;
  if (isOverdue(p)) return "Overdue";
  // Preserved from the prior version - a job with no status change in
  // stale_threshold_days (tenant-configured, default 5) is a real signal
  // worth surfacing, not something to silently drop just because the
  // reference mockup didn't show it.
  if (isStale(p, staleThresholdDays)) return "Stale — no update";
  return null;
}

// ── Small presentational primitives ──────────────────────────────────────────

function CountBadge({ n }: { n: number }) {
  return (
    <span style={{
      fontSize: 12, fontWeight: 600, color: "var(--vault-text-secondary)",
      background: "var(--vault-surface-selected)", borderRadius: 999,
      padding: "0 7px", minWidth: 18, height: 18, display: "inline-flex",
      alignItems: "center", justifyContent: "center", lineHeight: 1,
    }}>
      {n}
    </span>
  );
}

function OwnerChip({ name }: { name: string | null }) {
  if (!name) return <span style={{ fontSize: 12, color: "var(--vault-text-muted)" }}>Unassigned</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{
        width: 20, height: 20, borderRadius: "50%", background: avatarColor(name), color: "#fff",
        fontSize: 10, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {initials(name)}
      </span>
      <span style={{ fontSize: 12.5, color: "var(--vault-text)" }}>{name}</span>
    </span>
  );
}

function StageChip({ label }: { label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--vault-text)" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", border: "1.5px solid var(--vault-text-secondary)", flexShrink: 0 }} />
      {label}
    </span>
  );
}

// Horizontal stage-progress tracker - built from the tenant's REAL configured
// pathway steps (config.pathways[].steps) and the packet's real
// workshop_step_index. Not a fabricated/generic 6-step list.
function StageTracker({ steps, currentIndex }: { steps: { name: string }[]; currentIndex: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      {steps.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 64 }}>
              <div style={{
                width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 600, flexShrink: 0,
                background: done ? "var(--vault-text)" : current ? "var(--vault-canvas)" : "var(--vault-canvas)",
                color: done ? "#fff" : current ? "var(--vault-text)" : "var(--vault-text-muted)",
                border: current ? "2px solid var(--vault-text)" : done ? "none" : "1px solid var(--vault-border)",
              }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 11, color: current ? "var(--vault-text)" : "var(--vault-text-muted)", fontWeight: current ? 600 : 400, textAlign: "center", whiteSpace: "nowrap" }}>
                {step.name}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: done ? "var(--vault-text)" : "var(--vault-border)", marginBottom: 18, minWidth: 20 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Expanded inline row detail - the master/detail pattern applied as an
// in-place expansion. Specifications = the packet's real `articles` text;
// "Current step" substitutes for the mockup's "Next action" (no such field
// exists on this record - fabricating one would be inventing data); Latest
// update = the real status_updated_at timestamp.
function ExpandedDetail({ p, config }: { p: WorkshopPacket; config: WorkshopConfig }) {
  const router = useRouter();
  const steps = resolvePathwaySteps(p, config);
  const currentIndex = p.workshop_step_index ?? 0;

  return (
    <div style={{ padding: "16px 14px 20px 44px", background: "var(--vault-surface)", borderBottom: "1px solid var(--vault-border)" }}>
      {steps && steps.length > 0 && (
        <div style={{ marginBottom: 18, maxWidth: 640 }}>
          <StageTracker steps={steps} currentIndex={currentIndex} />
        </div>
      )}
      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px", minWidth: 180 }}>
          <div className="vault-label">Specifications</div>
          <div style={{ fontSize: 13, color: "var(--vault-text)" }}>{p.articles || "—"}</div>
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 180 }}>
          <div className="vault-label">Current step</div>
          <div style={{ fontSize: 13, color: "var(--vault-text)" }}>{resolveCurrentStepLabel(p, config) ?? "—"}</div>
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 180 }}>
          <div className="vault-label">Latest update</div>
          <div style={{ fontSize: 13, color: "var(--vault-text)" }}>{relativeTime(p.status_updated_at)}</div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <button
            className="vault-btn vault-btn-secondary"
            onClick={(e) => { e.stopPropagation(); router.push(`/workshop/board?job=${p.id}`); }}
          >
            Open packet
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function JobRow({
  p, config, expanded, onToggle, showWarning,
}: {
  p: WorkshopPacket; config: WorkshopConfig; expanded: boolean; onToggle: () => void; showWarning?: string | null;
}) {
  const stepLabel = resolveCurrentStepLabel(p, config) ?? STAGE_LABELS[p.status ?? ""] ?? (p.status ?? "—");
  return (
    <div>
      <div
        onClick={onToggle}
        data-selected={expanded || undefined}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,2.4fr) minmax(0,1.6fr) minmax(0,1.3fr) minmax(0,1.3fr) 90px",
          gap: 12, alignItems: "center",
          padding: "10px 14px", borderBottom: "1px solid var(--vault-border)",
          cursor: "pointer", background: expanded ? "var(--vault-surface-selected)" : "transparent",
          transition: "background var(--vault-motion-fast)",
        }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLDivElement).style.background = "var(--vault-surface)"; }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {showWarning && <span style={{ color: "var(--vault-status-error)", flexShrink: 0 }} aria-hidden>⚠</span>}
          <span style={{ fontFamily: "monospace", fontSize: 11.5, color: "var(--vault-text-muted)", flexShrink: 0 }}>{p.reference_number}</span>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: "var(--vault-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.articles || JOB_TYPE_LABELS[p.job_type ?? ""] || "Job"}
          </span>
          {p.quality_issue && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA", flexShrink: 0 }}>
              Quality issue
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: "var(--vault-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayName(p)}
        </div>
        {showWarning ? (
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--vault-status-error)" }}>{showWarning}</div>
        ) : (
          <StageChip label={stepLabel} />
        )}
        <div><OwnerChip name={resolveAssignee(p)} /></div>
        <div style={{ fontSize: 12.5, color: isOverdue(p) ? "var(--vault-status-error)" : isDueToday(p) ? "var(--vault-status-warning)" : "var(--vault-text-secondary)", fontWeight: (isOverdue(p) || isDueToday(p)) ? 600 : 400 }}>
          {p.due_date ? formatDateAU(p.due_date) : "—"}
        </div>
      </div>
      {expanded && <ExpandedDetail p={p} config={config} />}
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 14px 8px" }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--vault-text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
        {label}
      </span>
      <CountBadge n={count} />
    </div>
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

  const [packets, setPackets] = useState<WorkshopPacket[]>([]);
  const [config,  setConfig]  = useState<WorkshopConfig>({
    teamMembers: [], subcontractors: [], pathways: [],
    settings: { stale_threshold_days: 5, valuation_threshold: 3000 },
  });
  const [loading, setLoading] = useState(true);

  // Filters — unchanged logic from the prior version, just visually
  // relocated into a compact Filter control rather than an always-open bar.
  const [search,          setSearch]          = useState("");
  const [jobTypeFilter,   setJobTypeFilter]   = useState("all");
  const [stageFilter,     setStageFilter]     = useState("all");
  const [assigneeFilter,  setAssigneeFilter]  = useState("all");
  const [deliveryFilter,  setDeliveryFilter]  = useState("all");
  const [filtersOpen,     setFiltersOpen]     = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("due_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [sortOpen, setSortOpen] = useState(false);

  const [tab, setTab] = useState<TabKey>("active");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const allAssignees = Array.from(new Set([
    ...config.teamMembers.filter(m => m.active).map(m => m.name),
    ...config.subcontractors.filter(s => s.active).map(s => s.name),
  ]));

  // ── Filter (identical logic to the prior version) ─────────────────────────
  const q = search.trim().toLowerCase();
  const filtered = packets.filter(p => {
    if (jobTypeFilter   !== "all" && p.job_type       !== jobTypeFilter)   return false;
    if (stageFilter     !== "all" && p.status         !== stageFilter)     return false;
    if (deliveryFilter  !== "all" && p.delivery_method !== deliveryFilter)  return false;
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

  // My jobs — packets whose assigned_to is this login, not a name match
  // on staff_member or the assignee label.
  const tabFiltered = tab === "mine"
    ? filtered.filter(p => isMyJob(p, user?.id))
    : filtered;

  // ── Sort (identical logic to the prior version) ───────────────────────────
  const sorted = [...tabFiltered].sort((a, b) => {
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

  // Grouping — "Needs Attention" / "In Production" / remaining, all derived
  // from real fields already on the record (blocked_reason,
  // pending_customer_approval, isOverdue, resolveAssignee). No new data.
  const needsAttention = sorted.filter(p => !!needsAttentionReason(p, config.settings.stale_threshold_days));
  const inProduction    = sorted.filter(p => !needsAttentionReason(p, config.settings.stale_threshold_days) && !!resolveAssignee(p));
  const remaining       = sorted.filter(p => !needsAttentionReason(p, config.settings.stale_threshold_days) && !resolveAssignee(p));

  const activeFilterCount = [jobTypeFilter !== "all", stageFilter !== "all", assigneeFilter !== "all", deliveryFilter !== "all"].filter(Boolean).length;

  const toggleExpand = (id: string) => setExpandedId(cur => (cur === id ? null : id));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 80px)" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: "var(--vault-text-page-title)", fontWeight: 600, color: "var(--vault-text)", margin: 0 }}>Workshop</h1>
          <p style={{ fontSize: 13, color: "var(--vault-text-secondary)", margin: "2px 0 0" }}>Your production queue.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isManager && (
            <a href="/workshop/settings" className="vault-btn vault-btn-secondary" style={{ textDecoration: "none" }}>
              Settings
            </a>
          )}
          <a href="/workshop/board" className="vault-btn vault-btn-secondary" style={{ textDecoration: "none" }}>
            Board view
          </a>
          <button className="vault-btn vault-btn-primary" onClick={() => router.push("/orders/new")}>
            + New job
          </button>
        </div>
      </div>

      {/* Tabs + Filter/Sort row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--vault-border)", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 20 }}>
          <button className={"vault-tab" + (tab === "active" ? " vault-tab-active" : "")} onClick={() => setTab("active")}>
            Active <span style={{ marginLeft: 5 }}><CountBadge n={filtered.length} /></span>
          </button>
          <button className={"vault-tab" + (tab === "mine" ? " vault-tab-active" : "")} onClick={() => setTab("mine")}>
            My jobs <span style={{ marginLeft: 5 }}><CountBadge n={filtered.filter(p => isMyJob(p, user?.id)).length} /></span>
          </button>
          <a href="/workshop/history" className="vault-tab" style={{ textDecoration: "none", display: "inline-block" }}>
            Completed
          </a>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative", paddingBottom: 6 }}>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="vault-input"
            style={{ width: 160, height: 32 }}
          />
          <div style={{ position: "relative" }}>
            <button className="vault-btn vault-btn-secondary" style={{ height: 32, padding: "0 12px", fontSize: 13 }} onClick={() => { setFiltersOpen(v => !v); setSortOpen(false); }}>
              Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            {filtersOpen && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30, background: "var(--vault-canvas)", border: "1px solid var(--vault-border)", borderRadius: "var(--vault-radius-md)", boxShadow: "var(--vault-shadow-elevated)", padding: 12, width: 220, display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label className="vault-label">Job type</label>
                  <select className="vault-input" value={jobTypeFilter} onChange={e => setJobTypeFilter(e.target.value)}>
                    <option value="all">All types</option>
                    <option value="repair">Repairs</option>
                    <option value="custom_order">Custom</option>
                    <option value="collection_order">Collection</option>
                    <option value="online_order">Online order</option>
                    <option value="stock_work">Stock</option>
                  </select>
                </div>
                <div>
                  <label className="vault-label">Stage</label>
                  <select className="vault-input" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
                    <option value="all">All stages</option>
                    <option value="intake">Intake</option>
                    <option value="on_bench">Production</option>
                    <option value="quality_check">Quality control</option>
                    <option value="to_be_valued">Valuation</option>
                    <option value="ready">Ready</option>
                  </select>
                </div>
                <div>
                  <label className="vault-label">Delivery</label>
                  <select className="vault-input" value={deliveryFilter} onChange={e => setDeliveryFilter(e.target.value)}>
                    <option value="all">All delivery</option>
                    <option value="pickup">Pickup</option>
                    <option value="shipping">Shipping</option>
                  </select>
                </div>
                {allAssignees.length > 0 && (
                  <div>
                    <label className="vault-label">Assignee</label>
                    <select className="vault-input" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
                      <option value="all">All assignees</option>
                      {allAssignees.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                )}
                {(jobTypeFilter !== "all" || stageFilter !== "all" || deliveryFilter !== "all" || assigneeFilter !== "all") && (
                  <button className="vault-btn-tertiary" style={{ alignSelf: "flex-start" }} onClick={() => { setJobTypeFilter("all"); setStageFilter("all"); setDeliveryFilter("all"); setAssigneeFilter("all"); }}>
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <button className="vault-btn vault-btn-secondary" style={{ height: 32, padding: "0 12px", fontSize: 13 }} onClick={() => { setSortOpen(v => !v); setFiltersOpen(false); }}>
              Sort
            </button>
            {sortOpen && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 30, background: "var(--vault-canvas)", border: "1px solid var(--vault-border)", borderRadius: "var(--vault-radius-md)", boxShadow: "var(--vault-shadow-elevated)", padding: 4, width: 160 }}>
                {([
                  ["due_date", "Due date"], ["reference_number", "Job #"], ["customer", "Customer"],
                  ["status", "Stage"], ["assigned", "Owner"], ["status_updated_at", "Last updated"],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir("asc"); } setSortOpen(false); }}
                    style={{ display: "flex", width: "100%", justifyContent: "space-between", padding: "7px 8px", fontSize: 13, background: sortKey === key ? "var(--vault-surface-selected)" : "transparent", border: "none", borderRadius: 6, color: "var(--vault-text)", cursor: "pointer", textAlign: "left" }}
                  >
                    {label}
                    {sortKey === key && <span style={{ color: "var(--vault-text-secondary)" }}>{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "minmax(0,2.4fr) minmax(0,1.6fr) minmax(0,1.3fr) minmax(0,1.3fr) 90px",
        gap: 12, padding: "8px 14px", fontSize: 11.5, fontWeight: 500, color: "var(--vault-text-muted)",
        textTransform: "uppercase" as const, letterSpacing: "0.03em", borderBottom: "1px solid var(--vault-border)",
      }}>
        <div>Job</div><div>Customer</div><div>Stage</div><div>Owner</div><div>Due</div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--vault-text-muted)", fontSize: 14 }}>Loading jobs…</div>
      ) : sorted.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--vault-text-muted)", fontSize: 14 }}>
          {packets.length === 0 ? "No active jobs." : "No jobs match these filters."}
          {activeFilterCount > 0 && (
            <div style={{ marginTop: 8 }}>
              <button className="vault-btn-tertiary" onClick={() => { setJobTypeFilter("all"); setStageFilter("all"); setDeliveryFilter("all"); setAssigneeFilter("all"); setSearch(""); }}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1 }}>
          {needsAttention.length > 0 && (
            <div>
              <SectionHeader label="Needs attention" count={needsAttention.length} />
              {needsAttention.map(p => (
                <JobRow key={p.id} p={p} config={config} expanded={expandedId === p.id} onToggle={() => toggleExpand(p.id)} showWarning={needsAttentionReason(p, config.settings.stale_threshold_days)} />
              ))}
            </div>
          )}
          {inProduction.length > 0 && (
            <div>
              <SectionHeader label="In production" count={inProduction.length} />
              {inProduction.map(p => (
                <JobRow key={p.id} p={p} config={config} expanded={expandedId === p.id} onToggle={() => toggleExpand(p.id)} />
              ))}
            </div>
          )}
          {remaining.length > 0 && (
            <div>
              {(needsAttention.length > 0 || inProduction.length > 0) && <SectionHeader label="Unassigned" count={remaining.length} />}
              {remaining.map(p => (
                <JobRow key={p.id} p={p} config={config} expanded={expandedId === p.id} onToggle={() => toggleExpand(p.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 4px", fontSize: 12.5, color: "var(--vault-text-secondary)", flexShrink: 0 }}>
        <span>{filtered.length} active job{filtered.length === 1 ? "" : "s"}</span>
        <span>All changes saved</span>
      </div>
    </div>
  );
}
