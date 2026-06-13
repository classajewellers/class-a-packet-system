"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Quote } from "@/lib/types";
import { getSupabaseClient } from "@/lib/supabase";
import { STAFF_EMAIL_MAP } from "@/lib/staffEmails";
import { formatDateAU } from "@/lib/formatters";
import nextDynamic from "next/dynamic";
import QuoteStatsBar from "@/components/QuoteStatsBar";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import { hasPermission } from "@/lib/userTypes";

const QuotePipelineBoard = nextDynamic(
  () => import("@/components/QuotePipelineBoard"),
  { ssr: false }
);

function todayISO() {
  return new Date().toISOString().split("T")[0];
}
function startOfMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
}

export default function QuotesPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "quotes")) router.replace("/");
  }, [user, hydrated, router]);

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [quoteView, setQuoteView] = useState<"board" | "list">("board");
  const [showConverted, setShowConverted] = useState(false);
  const [quoteListFilter, setQuoteListFilter] = useState<"active" | "all" | "converted">("active");
  const [quoteStaffFilter, setQuoteStaffFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/quotes", { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      const json = await res.json();
      if (!res.ok) { setQuotes([]); return; }
      setQuotes(json.quotes ?? []);
    } catch {
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  // Real-time subscriptions
  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch {
      return;
    }
    const channel = supabase
      .channel("quotes-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "quotes" }, (payload) => {
        const row = payload.new as Quote;
        setQuotes((prev) => prev.some((q) => q.id === row.id) ? prev : [row, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quotes" }, (payload) => {
        const row = payload.new as Quote;
        setQuotes((prev) => prev.map((q) => q.id === row.id ? row : q));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  function handleUpdate(updated: Quote) {
    setQuotes((prev) => prev.map((q) => q.id === updated.id ? updated : q));
  }

  function handleDelete(id: string) {
    setQuotes((prev) => prev.filter((q) => q.id !== id));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} quote${selectedIds.size !== 1 ? "s" : ""}?`)) return;
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => fetch(`/api/quotes/${id}`, { method: "DELETE", headers: { 'x-tenant-id': user?.tenantId ?? '' } })));
    setQuotes((prev) => prev.filter((q) => !selectedIds.has(q.id)));
    setSelectedIds(new Set());
  }

  const staffFilteredQuotes = useMemo(() => {
    if (quoteStaffFilter === "all") return quotes;
    return quotes.filter((q) =>
      (q.assigned_to ?? "").toLowerCase().trim() === quoteStaffFilter.toLowerCase().trim()
    );
  }, [quotes, quoteStaffFilter]);

  const filteredListQuotes = useMemo(() => {
    if (quoteListFilter === "active")    return staffFilteredQuotes.filter((q) => q.status !== "converted");
    if (quoteListFilter === "converted") return staffFilteredQuotes.filter((q) => q.status === "converted");
    return staffFilteredQuotes;
  }, [staffFilteredQuotes, quoteListFilter]);

  // Stats
  const today = todayISO();
  const monthStart = startOfMonthISO();
  const activeQuotes = quotes.filter((q) => q.status !== "converted" && q.status !== "job_lost");
  const followUpDueToday = quotes.filter((q) => q.follow_up_date === today && q.status !== "converted");
  const wonThisMonth = quotes.filter((q) => q.status === "converted" && (q.converted_at ?? "") >= monthStart);
  const lostThisMonth = quotes.filter((q) => q.status === "job_lost" && (q.job_lost_at ?? "") >= monthStart);
  const conversionRate = quotes.length > 0
    ? Math.round((quotes.filter((q) => q.status === "converted").length / quotes.length) * 100)
    : 0;

  return (
    <>
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>Quotes</h1>
          <Link
            href="/quotes/builder"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#635BFF', color: '#fff', borderRadius: 8, padding: '9px 18px', fontWeight: 500, fontSize: 14, textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.background = '#4F46E5'}
            onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.background = '#635BFF'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Build Quote
          </Link>
        </div>

        {/* Stats bar */}
        {!loading && quotes.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Active', value: activeQuotes.length, color: '#1A1A2E' },
                { label: 'Follow Up Today', value: followUpDueToday.length, color: followUpDueToday.length > 0 ? '#EF4444' : '#1A1A2E' },
                { label: 'Won This Month', value: wonThisMonth.length, color: '#10B981' },
                { label: 'Lost This Month', value: lostThisMonth.length, color: '#1A1A2E' },
                { label: 'Conversion Rate', value: `${conversionRate}%`, color: '#1A1A2E' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderRadius: 12, padding: 16, borderLeft: '3px solid #635BFF' }}>
                  <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</p>
                  <p style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</p>
                </div>
              ))}
            </div>
            <QuoteStatsBar quotes={quotes} />
          </>
        )}

        {/* Staff filter + view toggle */}
        {!loading && quotes.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <label style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filter by Staff</label>
              <select
                value={quoteStaffFilter}
                onChange={(e) => setQuoteStaffFilter(e.target.value)}
                style={{ border: '1px solid #E8E8F0', borderRadius: 8, background: '#fff', height: 36, fontSize: 14, padding: '0 12px', color: '#1A1A2E', outline: 'none' }}
              >
                <option value="all">All Staff</option>
                {Object.keys(STAFF_EMAIL_MAP).map((name) => (
                  <option key={name} value={name}>
                    {name.replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
              {quoteStaffFilter !== "all" && (
                <button onClick={() => setQuoteStaffFilter("all")} style={{ fontSize: 12, color: '#6B7280', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Clear
                </button>
              )}

              {quoteView === "board" && (
                <button
                  onClick={() => setShowConverted((v) => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, border: `1px solid ${showConverted ? '#635BFF' : '#E8E8F0'}`, padding: '6px 12px', fontSize: 12, fontWeight: 600, background: showConverted ? '#EEF2FF' : '#fff', color: showConverted ? '#635BFF' : '#6B7280', cursor: 'pointer', transition: 'all .15s' }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: showConverted ? '#635BFF' : '#D1D5DB', display: 'inline-block' }} />
                  {showConverted ? "Hiding converted" : "Show converted"}
                </button>
              )}

              {quoteView === "list" && (
                <div className="flex gap-1">
                  {(["active", "all", "converted"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setQuoteListFilter(f)}
                      style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: quoteListFilter === f ? '#635BFF' : '#F9FAFB', color: quoteListFilter === f ? '#fff' : '#6B7280', border: `1px solid ${quoteListFilter === f ? '#635BFF' : '#E8E8F0'}`, cursor: 'pointer', transition: 'all .15s' }}
                    >
                      {f === "active" ? "Active" : f === "all" ? "All" : "Converted"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', borderRadius: 8, border: '1px solid #E8E8F0', overflow: 'hidden', fontSize: 14, fontWeight: 600 }}>
              <button
                onClick={() => setQuoteView("board")}
                style={{ padding: '8px 16px', background: quoteView === "board" ? '#635BFF' : '#fff', color: quoteView === "board" ? '#fff' : '#6B7280', border: 'none', cursor: 'pointer', transition: 'all .15s' }}
              >Board</button>
              <button
                onClick={() => setQuoteView("list")}
                style={{ padding: '8px 16px', background: quoteView === "list" ? '#635BFF' : '#fff', color: quoteView === "list" ? '#fff' : '#6B7280', border: 'none', borderLeft: '1px solid #E8E8F0', cursor: 'pointer', transition: 'all .15s' }}
              >List</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <svg className="w-8 h-8 mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm">Loading quotes…</p>
          </div>
        ) : quotes.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">No quotes yet</p>
          </div>
        ) : quoteView === "board" ? (
          <QuotePipelineBoard
            quotes={staffFilteredQuotes}
            onQuoteClick={(q) => router.push(`/quotes/${q.id}`)}
            onUpdate={handleUpdate}
            showConverted={showConverted}
          />
        ) : (
          <div style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderRadius: 12, overflow: 'hidden' }}>
            {selectedIds.size > 0 && (
              <div style={{ padding: '10px 16px', background: '#FEE2E2', borderBottom: '1px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#991B1B' }}>{selectedIds.size} quote{selectedIds.size !== 1 ? "s" : ""} selected</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedIds(new Set())} style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', padding: '6px 12px', borderRadius: 8, border: '1px solid #E8E8F0', background: '#fff', cursor: 'pointer' }}>Clear</button>
                  <button onClick={handleBulkDelete} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: '#EF4444', padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>Delete ({selectedIds.size})</button>
                </div>
              </div>
            )}
            {/* Mobile: stacked cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {filteredListQuotes.map((q) => {
                const name = [q.customer_first_name, q.customer_last_name].filter(Boolean).join(" ") || "—";
                return (
                  <div
                    key={q.id}
                    onClick={() => router.push(`/quotes/${q.id}`)}
                    className="px-4 py-3 cursor-pointer active:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div style={{ fontWeight: 600, color: '#1A1A2E', fontSize: 14 }}>{name}</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{q.reference_number}</div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span style={{ fontSize: 12, color: '#374151', textTransform: 'capitalize' }}>{q.status?.replace(/_/g, " ") || "—"}</span>
                          {q.assigned_to && <span style={{ fontSize: 12, color: '#9CA3AF' }}>· {q.assigned_to}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {q.follow_up_date && (
                          <div style={{ fontSize: 12, color: '#6B7280' }}>{formatDateAU(q.follow_up_date)}</div>
                        )}
                        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{formatDateAU(q.created_at?.split("T")[0]) || "—"}</div>
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
                  <tr style={{ borderBottom: '1px solid #E8E8F0', textAlign: 'left', background: '#F9FAFB' }}>
                    <th style={{ padding: '12px 16px', width: 32 }}>
                      <input
                        type="checkbox"
                        checked={filteredListQuotes.length > 0 && filteredListQuotes.every((q) => selectedIds.has(q.id))}
                        ref={(el) => {
                          if (el) el.indeterminate = filteredListQuotes.some((q) => selectedIds.has(q.id)) && !filteredListQuotes.every((q) => selectedIds.has(q.id));
                        }}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(filteredListQuotes.map((q) => q.id)));
                          else setSelectedIds(new Set());
                        }}
                        style={{ accentColor: '#635BFF', cursor: 'pointer' }}
                      />
                    </th>
                    {['Reference No.','Customer','Assigned To','Stage','Follow Up Date',...(quoteListFilter === "converted" ? ['Order'] : []),'Created At'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredListQuotes.map((q) => {
                    const name = [q.customer_first_name, q.customer_last_name].filter(Boolean).join(" ") || "—";
                    return (
                      <tr
                        key={q.id}
                        onClick={() => router.push(`/quotes/${q.id}`)}
                        style={{ borderBottom: '1px solid #E8E8F0', cursor: 'pointer', transition: 'background .12s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                      >
                        <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(q.id)}
                            onChange={(e) => {
                              setSelectedIds((prev) => {
                                const n = new Set(prev);
                                if (e.target.checked) n.add(q.id); else n.delete(q.id);
                                return n;
                              });
                            }}
                            style={{ accentColor: '#635BFF', cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, color: '#6B7280' }}>{q.reference_number}</td>
                        <td style={{ padding: '12px 16px', fontWeight: 500, color: '#1A1A2E' }}>{name}</td>
                        <td style={{ padding: '12px 16px', color: '#374151' }} className="capitalize">{q.assigned_to || "—"}</td>
                        <td style={{ padding: '12px 16px', color: '#374151' }} className="capitalize">{q.status?.replace(/_/g, " ") || "—"}</td>
                        <td style={{ padding: '12px 16px', color: '#6B7280' }}>{formatDateAU(q.follow_up_date) || "—"}</td>
                        {quoteListFilter === "converted" && (
                          <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, color: '#6B7280' }}>{q.packet_reference || "—"}</td>
                        )}
                        <td style={{ padding: '12px 16px', color: '#9CA3AF', fontSize: 12 }}>{formatDateAU(q.created_at?.split("T")[0]) || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
