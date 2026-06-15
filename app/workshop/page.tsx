"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { canManage, hasPermission } from "@/lib/userTypes";
import { WorkshopJob } from "@/lib/types";
import { formatDateAU } from "@/lib/formatters";
import nextDynamic from "next/dynamic";

// Lazy-load DnD to avoid SSR issues
const WorkshopBoard = nextDynamic(() => import("@/components/WorkshopBoard"), { ssr: false });
const ValuationReviewQueue = nextDynamic(() => import("@/components/ValuationReviewQueue"), { ssr: false });

export default function WorkshopPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "workshop")) router.replace("/");
  }, [user, hydrated, router]);

  const [jobs, setJobs] = useState<WorkshopJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "list">("board");
  const [overdueFilter, setOverdueFilter] = useState(false);
  const [valuationFilter, setValuationFilter] = useState(false);
  const [jewellerFilter, setJewellerFilter] = useState<string>("all");
  const [tab, setTab] = useState<"workshop" | "valuations">("workshop");

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/workshop/jobs", { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      const json = await res.json();
      setJobs(json.jobs ?? []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  async function handleStageChange(jobId: string, newStage: string) {
    setJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, stage: newStage, stage_changed_at: new Date().toISOString() } : j));
    await fetch(`/api/workshop/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
      body: JSON.stringify({ stage: newStage }),
    });
  }

  function handleJobDeleted(id: string) {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }

  if (!user || !hasPermission(user, "workshop")) return null;

  const today = new Date().toISOString().split("T")[0];

  // Jewellers list from jobs
  const jewellers = Array.from(new Set(jobs.map((j) => j.assigned_jeweller).filter(Boolean))) as string[];

  const filteredJobs = jobs.filter((j) => {
    if (overdueFilter && (j.due_date == null || j.due_date >= today)) return false;
    if (valuationFilter && !j.valuation_required) return false;
    if (jewellerFilter !== "all" && j.assigned_jeweller !== jewellerFilter) return false;
    return true;
  });

  const mainJobs = filteredJobs.filter((j) => !j.is_subcontractor);
  const subcontractorJobs = jobs.filter((j) => j.is_subcontractor);

  return (
    <div className="space-y-6">
      {/* Job list shortcuts */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Link
          href="/workshop/major-jobs"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid #E8E8F0', background: '#fff', color: '#635BFF', fontSize: 13, fontWeight: 600, textDecoration: 'none', transition: 'background .15s' }}
        >
          Major Jobs
        </Link>
        <Link
          href="/workshop/minor-jobs"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid #E8E8F0', background: '#fff', color: '#635BFF', fontSize: 13, fontWeight: 600, textDecoration: 'none', transition: 'background .15s' }}
        >
          Minor Jobs
        </Link>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #E8E8F0' }}>
        {(['workshop','valuations'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, border: 'none', background: 'transparent', cursor: 'pointer', borderBottom: `2px solid ${tab === t ? '#635BFF' : 'transparent'}`, color: tab === t ? '#635BFF' : '#6B7280', transition: 'all .15s', marginBottom: -1, textTransform: 'capitalize' }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "workshop" && (<>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setOverdueFilter((v) => !v)}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: overdueFilter ? '#EF4444' : '#F9FAFB', color: overdueFilter ? '#fff' : '#6B7280', border: `1px solid ${overdueFilter ? '#EF4444' : '#E8E8F0'}`, cursor: 'pointer', transition: 'all .15s' }}
          >
            Overdue only
          </button>
          <button
            onClick={() => setValuationFilter((v) => !v)}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: valuationFilter ? '#FEF3C7' : '#F9FAFB', color: valuationFilter ? '#92400E' : '#6B7280', border: `1px solid ${valuationFilter ? '#D97706' : '#E8E8F0'}`, cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z"/></svg>
            Valuation
          </button>
        </div>
        {jewellers.length > 0 && (
          <select
            value={jewellerFilter}
            onChange={(e) => setJewellerFilter(e.target.value)}
            style={{ border: '1px solid #E8E8F0', borderRadius: 8, background: '#fff', height: 36, fontSize: 14, padding: '0 12px', color: '#1A1A2E', outline: 'none' }}
          >
            <option value="all">All Jewellers</option>
            {jewellers.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', borderRadius: 8, border: '1px solid #E8E8F0', overflow: 'hidden', fontSize: 14, fontWeight: 600 }}>
          <button
            onClick={() => setView("board")}
            style={{ padding: '6px 16px', background: view === "board" ? '#635BFF' : '#fff', color: view === "board" ? '#fff' : '#6B7280', border: 'none', cursor: 'pointer', transition: 'all .15s' }}
          >Board</button>
          <button
            onClick={() => setView("list")}
            style={{ padding: '6px 16px', background: view === "list" ? '#635BFF' : '#fff', color: view === "list" ? '#fff' : '#6B7280', border: 'none', borderLeft: '1px solid #E8E8F0', cursor: 'pointer', transition: 'all .15s' }}
          >List</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-8 h-8 mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm">Loading workshop…</p>
        </div>
      ) : view === "board" ? (
        <WorkshopBoard jobs={mainJobs} onStageChange={handleStageChange} onRefresh={fetchJobs} onJobDeleted={handleJobDeleted} />
      ) : (
        /* List view */
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E8E8F0' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', margin: 0 }}>{mainJobs.length} job{mainJobs.length !== 1 ? "s" : ""}</h2>
          </div>
          {/* Mobile: stacked cards */}
          <div className="md:hidden divide-y divide-gray-100">
            {mainJobs.map((j) => {
              const isOverdue = j.due_date != null && j.due_date < today;
              return (
                <div key={j.id} className="px-4 py-3 active:bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div style={{ fontWeight: 600, color: '#1A1A2E', fontSize: 14 }}>{j.customer_surname || "—"}</div>
                      <div style={{ fontSize: 13, color: '#374151', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.description || "—"}</div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span style={{ fontSize: 12, color: '#6B7280', textTransform: 'capitalize' }}>{j.stage.replace(/_/g, " ")}</span>
                        {j.assigned_jeweller && <span style={{ fontSize: 12, color: '#9CA3AF' }}>· {j.assigned_jeweller}</span>}
                        {j.valuation_required && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z"/></svg>
                            Valuation
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div style={{ fontSize: 14, color: isOverdue ? '#EF4444' : '#6B7280', fontWeight: isOverdue ? 600 : 400 }}>
                        {formatDateAU(j.due_date) || "—"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: full table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #E8E8F0', background: '#F9FAFB' }}>
                  {['Customer','Description','Track','Jeweller','Stage','Due Date','Days In Stage','Flags'].map(h => (
                    <th key={h} style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mainJobs.map((j) => {
                  const isOverdue = j.due_date != null && j.due_date < today;
                  const days = Math.floor((Date.now() - new Date(j.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <tr key={j.id} style={{ borderBottom: '1px solid #E8E8F0', transition: 'background .12s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                      <td style={{ padding: '12px 20px', fontWeight: 600, color: '#1A1A2E' }}>{j.customer_surname || "—"}</td>
                      <td style={{ padding: '12px 20px', color: '#374151', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.description || "—"}</td>
                      <td style={{ padding: '12px 20px', color: '#6B7280', textTransform: 'capitalize' }}>{(j.track ?? "repair").replace("_", " ")}</td>
                      <td style={{ padding: '12px 20px', color: '#6B7280' }}>{j.assigned_jeweller || "—"}</td>
                      <td style={{ padding: '12px 20px', color: '#6B7280', textTransform: 'capitalize' }}>{j.stage.replace(/_/g, " ")}</td>
                      <td style={{ padding: '12px 20px', fontSize: 14, color: isOverdue ? '#EF4444' : '#6B7280', fontWeight: isOverdue ? 600 : 400 }}>
                        {formatDateAU(j.due_date) || "—"}
                      </td>
                      <td style={{ padding: '12px 20px', color: '#9CA3AF', fontSize: 12 }}>{days}d</td>
                      <td style={{ padding: '12px 20px' }}>
                        {j.valuation_required && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', whiteSpace: 'nowrap' }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z"/></svg>
                            Valuation
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subcontractors */}
      {subcontractorJobs.length > 0 && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E8E8F0', background: '#F9FAFB' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', margin: 0 }}>Subcontractors ({subcontractorJobs.length})</h2>
          </div>
          <div>
            {subcontractorJobs.map((j) => (
              <div key={j.id} style={{ padding: '16px 20px', borderBottom: '1px solid #E8E8F0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <p style={{ fontWeight: 600, color: '#1A1A2E' }}>{j.subcontractor_name || "Unknown"}</p>
                  <p style={{ fontSize: 14, color: '#374151', marginTop: 2 }}>{j.description}</p>
                  {j.subcontractor_instructions && (
                    <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{j.subcontractor_instructions}</p>
                  )}
                  <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
                    Due: {formatDateAU(j.subcontractor_due_date) || "—"} &bull; Ref: {j.reference_number || "—"}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, background: j.subcontractor_status === "received" ? '#DCFCE7' : '#FEF3C7', color: j.subcontractor_status === "received" ? '#166534' : '#92400E' }}>
                    {j.subcontractor_status === "received" ? "Received" : "Sent"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </>)}

      {tab === "valuations" && <ValuationReviewQueue />}
    </div>
  );
}
