"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Quote } from "@/lib/types";
import { getSupabaseClient } from "@/lib/supabase";
import { STAFF_EMAIL_MAP } from "@/lib/staffEmails";
import { formatDateAU } from "@/lib/formatters";
import dynamic from "next/dynamic";
import QuoteDetailDrawer from "@/components/QuoteDetailDrawer";
import QuoteStatsBar from "@/components/QuoteStatsBar";

const QuotePipelineBoard = dynamic(
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
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [quoteView, setQuoteView] = useState<"board" | "list">("board");
  const [showConverted, setShowConverted] = useState(false);
  const [quoteListFilter, setQuoteListFilter] = useState<"active" | "all" | "converted">("active");
  const [quoteStaffFilter, setQuoteStaffFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/quotes", { cache: "no-store" });
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
        setSelectedQuote((cur) => cur?.id === row.id ? row : cur);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  function handleUpdate(updated: Quote) {
    setQuotes((prev) => prev.map((q) => q.id === updated.id ? updated : q));
    setSelectedQuote(updated);
  }

  function handleDelete(id: string) {
    setQuotes((prev) => prev.filter((q) => q.id !== id));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setSelectedQuote(null);
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} quote${selectedIds.size !== 1 ? "s" : ""}?`)) return;
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => fetch(`/api/quotes/${id}`, { method: "DELETE" })));
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
      {selectedQuote && (
        <QuoteDetailDrawer
          quote={selectedQuote}
          onClose={() => setSelectedQuote(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}

      <div className="max-w-7xl mx-auto space-y-4">
        {/* Stats bar */}
        {!loading && quotes.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Active</p>
                <p className="text-2xl font-bold text-gray-900">{activeQuotes.length}</p>
              </div>
              <div className={`rounded-xl border shadow-sm p-4 ${followUpDueToday.length > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Follow Up Today</p>
                <p className={`text-2xl font-bold ${followUpDueToday.length > 0 ? "text-red-600" : "text-gray-900"}`}>{followUpDueToday.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Won This Month</p>
                <p className="text-2xl font-bold text-emerald-600">{wonThisMonth.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Lost This Month</p>
                <p className="text-2xl font-bold text-gray-900">{lostThisMonth.length}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Conversion Rate</p>
                <p className="text-2xl font-bold text-gray-900">{conversionRate}%</p>
              </div>
            </div>
            <QuoteStatsBar quotes={quotes} />
          </>
        )}

        {/* Staff filter + view toggle */}
        {!loading && quotes.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filter by Staff</label>
              <select
                value={quoteStaffFilter}
                onChange={(e) => setQuoteStaffFilter(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="all">All Staff</option>
                {Object.keys(STAFF_EMAIL_MAP).map((name) => (
                  <option key={name} value={name}>
                    {name.replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
              {quoteStaffFilter !== "all" && (
                <button onClick={() => setQuoteStaffFilter("all")} className="text-xs text-gray-400 hover:text-gray-700 underline">
                  Clear
                </button>
              )}

              {quoteView === "board" && (
                <button
                  onClick={() => setShowConverted((v) => !v)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    showConverted ? "border-gray-400 bg-gray-100 text-gray-700" : "border-gray-200 bg-white text-gray-400 hover:text-gray-600"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${showConverted ? "bg-gray-500" : "bg-gray-300"}`} />
                  {showConverted ? "Hiding converted" : "Show converted"}
                </button>
              )}

              {quoteView === "list" && (
                <div className="flex gap-1">
                  {(["active", "all", "converted"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setQuoteListFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                        quoteListFilter === f ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {f === "active" ? "Active" : f === "all" ? "All" : "Converted"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-semibold">
              <button
                onClick={() => setQuoteView("board")}
                className={`px-4 py-2 transition-colors ${quoteView === "board" ? "bg-black text-white" : "bg-white text-gray-500 hover:text-black"}`}
              >Board</button>
              <button
                onClick={() => setQuoteView("list")}
                className={`px-4 py-2 transition-colors border-l border-gray-200 ${quoteView === "list" ? "bg-black text-white" : "bg-white text-gray-500 hover:text-black"}`}
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
            onQuoteClick={setSelectedQuote}
            onUpdate={handleUpdate}
            showConverted={showConverted}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {selectedIds.size > 0 && (
              <div className="px-4 py-2.5 bg-red-50 border-b border-red-100 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-red-700">{selectedIds.size} quote{selectedIds.size !== 1 ? "s" : ""} selected</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedIds(new Set())} className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">Clear</button>
                  <button onClick={handleBulkDelete} className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg">Delete ({selectedIds.size})</button>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left bg-gray-50">
                    <th className="px-4 py-3 w-8">
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
                        className="h-4 w-4 rounded border-gray-300 accent-black cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-3 font-semibold text-black">Reference No.</th>
                    <th className="px-4 py-3 font-semibold text-black">Customer</th>
                    <th className="px-4 py-3 font-semibold text-black">Assigned To</th>
                    <th className="px-4 py-3 font-semibold text-black">Stage</th>
                    <th className="px-4 py-3 font-semibold text-black">Follow Up Date</th>
                    {quoteListFilter === "converted" && (
                      <th className="px-4 py-3 font-semibold text-black">Order</th>
                    )}
                    <th className="px-4 py-3 font-semibold text-black">Created At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredListQuotes.map((q) => {
                    const name = [q.customer_first_name, q.customer_last_name].filter(Boolean).join(" ") || "—";
                    return (
                      <tr
                        key={q.id}
                        onClick={() => setSelectedQuote(q)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                            className="h-4 w-4 rounded border-gray-300 accent-black cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{q.reference_number}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{name}</td>
                        <td className="px-4 py-3 text-gray-600 capitalize">{q.assigned_to || "—"}</td>
                        <td className="px-4 py-3 text-gray-600 capitalize">{q.status?.replace(/_/g, " ") || "—"}</td>
                        <td className="px-4 py-3 text-gray-500">{formatDateAU(q.follow_up_date) || "—"}</td>
                        {quoteListFilter === "converted" && (
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{q.packet_reference || "—"}</td>
                        )}
                        <td className="px-4 py-3 text-gray-400 text-xs">{formatDateAU(q.created_at?.split("T")[0]) || "—"}</td>
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
