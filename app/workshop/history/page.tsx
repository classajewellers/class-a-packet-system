"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { hasPermission } from "@/lib/userTypes";
import { formatDateAU } from "@/lib/formatters";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkshopPacket {
  id: string;
  reference_number: string;
  job_type: string | null;
  status: string | null;
  status_updated_at: string | null;
  collected_at: string | null;
  assigned_to_name: string | null;
  customer_display_name: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  due_date: string | null;
  articles: string | null;
  workshop_subcontractor_name: string | null;
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

type SortKey = "collected_at" | "due_date" | "reference_number" | "customer" | "job_type";
type SortDir = "asc" | "desc";

// ── Helpers ───────────────────────────────────────────────────────────────────

function displayName(p: WorkshopPacket) {
  if (p.job_type === "stock_work") return "Internal";
  return p.customer_display_name || [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
}
function resolveAssignee(p: WorkshopPacket) {
  return p.assigned_to_name || p.workshop_subcontractor_name || null;
}

// ── Nav ───────────────────────────────────────────────────────────────────────

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

// ── Badge ─────────────────────────────────────────────────────────────────────

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: bg, color, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ dir }: { dir: SortDir | null }) {
  if (!dir) return <span style={{ color: "#D1D5DB", fontSize: 10, marginLeft: 3 }}>↕</span>;
  return <span style={{ fontSize: 10, marginLeft: 3, color: "#635BFF" }}>{dir === "asc" ? "↑" : "↓"}</span>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkshopHistoryPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "workshop")) router.replace("/");
  }, [user, hydrated, router]);

  const tenantId = user?.tenantId ?? "";

  const [packets, setPackets] = useState<WorkshopPacket[]>([]);
  const [loading, setLoading] = useState(true);

  const [search,        setSearch]        = useState("");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [sortKey,       setSortKey]       = useState<SortKey>("collected_at");
  const [sortDir,       setSortDir]       = useState<SortDir>("desc");

  const headers = { "x-tenant-id": tenantId };

  const fetchPackets = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch("/api/workshop/packets?include_collected=1", { cache: "no-store", headers });
      const json = await res.json();
      setPackets((json.packets ?? []).filter((p: WorkshopPacket) => p.status === "collected"));
    } catch { setPackets([]); } finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { fetchPackets(); }, [fetchPackets]);

  // ── Filter ────────────────────────────────────────────────────────────────

  const q = search.trim().toLowerCase();
  const filtered = packets.filter(p => {
    if (jobTypeFilter !== "all" && p.job_type !== jobTypeFilter) return false;
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
    let va: string = "";
    let vb: string = "";
    switch (sortKey) {
      case "collected_at":    va = a.collected_at ?? ""; vb = b.collected_at ?? ""; break;
      case "due_date":        va = a.due_date ?? ""; vb = b.due_date ?? ""; break;
      case "reference_number": va = a.reference_number; vb = b.reference_number; break;
      case "customer":        va = displayName(a).toLowerCase(); vb = displayName(b).toLowerCase(); break;
      case "job_type":        va = a.job_type ?? ""; vb = b.job_type ?? ""; break;
    }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

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
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>History</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "2px 0 0" }}>Collected jobs</p>
        </div>
        <WorkshopNav active="history" />
      </div>

      {/* Filter bar */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" /></svg>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search ref, name, description…"
            style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px 6px 28px", fontSize: 13, outline: "none", background: "#F9FAFB", color: "#1A1A2E", width: 220 }}
          />
        </div>

        <div style={{ width: 1, height: 20, background: "#E8E8F0", flexShrink: 0 }} />

        <select value={jobTypeFilter} onChange={e => setJobTypeFilter(e.target.value)} style={{ border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 10px", fontSize: 13, color: "#374151", background: "#fff", outline: "none", cursor: "pointer" }}>
          <option value="all">All Types</option>
          <option value="repair">Repairs</option>
          <option value="custom_order">Custom</option>
          <option value="collection_order">Collection</option>
          <option value="online_order">Online</option>
          <option value="stock_work">Stock</option>
        </select>

        {(search || jobTypeFilter !== "all") && (
          <button onClick={() => { setSearch(""); setJobTypeFilter("all"); }} style={{ padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "1px solid #E8E8F0", background: "#fff", color: "#9CA3AF", cursor: "pointer" }}>
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
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading history…</div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
            {packets.length === 0 ? "No collected jobs yet." : "No jobs match the current filters."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <TH label="Collected"   sk="collected_at"   width={120} />
                  <TH label="Job #"       sk="reference_number" width={120} />
                  <TH label="Customer"    sk="customer"         />
                  <TH label="Type"        sk="job_type"         width={100} />
                  <TH label="Due Date"    sk="due_date"         width={100} />
                  <TH label="Assigned To"                       width={130} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => {
                  const jt      = p.job_type ?? "repair";
                  const jtColor = JOB_TYPE_COLORS[jt] ?? JOB_TYPE_COLORS.repair;
                  const assignee = resolveAssignee(p);
                  const rowBg = i % 2 === 0 ? "#fff" : "#FAFAFA";

                  return (
                    <tr
                      key={p.id}
                      style={{ background: rowBg, borderBottom: "1px solid #F3F4F6", cursor: "default" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F5F3FF")}
                      onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                    >
                      {/* Collected */}
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 12, color: "#6B7280" }}>
                          {p.collected_at ? formatDateAU(p.collected_at.split("T")[0]) : "—"}
                        </span>
                      </td>

                      {/* Job # */}
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#6B7280" }}>{p.reference_number}</span>
                      </td>

                      {/* Customer */}
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 600, color: "#1A1A2E", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {displayName(p)}
                        </div>
                        {p.articles && (
                          <div style={{ fontSize: 11, color: "#9CA3AF", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.articles}
                          </div>
                        )}
                      </td>

                      {/* Type */}
                      <td style={{ padding: "10px 14px" }}>
                        <Badge label={JOB_TYPE_LABELS[jt] ?? jt} bg={jtColor.bg} color={jtColor.color} />
                      </td>

                      {/* Due Date */}
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                          {p.due_date ? formatDateAU(p.due_date) : "—"}
                        </span>
                      </td>

                      {/* Assigned */}
                      <td style={{ padding: "10px 14px" }}>
                        {assignee ? (
                          <span style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>{assignee}</span>
                        ) : (
                          <span style={{ fontSize: 12, color: "#D1D5DB" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Back to active */}
      <div style={{ marginTop: 12, textAlign: "center", flexShrink: 0 }}>
        <a href="/workshop" style={{ fontSize: 13, color: "#9CA3AF", textDecoration: "none" }}>
          ← Back to active jobs
        </a>
      </div>
    </div>
  );
}
