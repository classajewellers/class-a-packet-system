"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Packet, PacketType, AdminPacketsQuery, Quote } from "@/lib/types";
import { STAGE_CONFIG, quoteStage, isOverdue } from "@/lib/pipeline";
import { getSupabaseClient } from "@/lib/supabase";
import AdminTable from "@/components/AdminTable";
import PacketDetailDrawer from "@/components/PacketDetailDrawer";
import QuoteDetailDrawer from "@/components/QuoteDetailDrawer";
import QuotePipelineBoard from "@/components/QuotePipelineBoard";
import QuoteStatsBar from "@/components/QuoteStatsBar";
import NavBar from "@/components/NavBar";

// ── Note for deployment ───────────────────────────────────────────────────────
// Real-time subscriptions require Supabase replication enabled on both tables.
// In Supabase dashboard → Database → Replication, enable real-time for the
// "quotes" and "packets" tables. Without this, the channel subscribes but
// receives no events — the 10-second poll is the fallback in that case.
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_OPTIONS: { value: "all" | PacketType; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "repair", label: "Repair" },
  { value: "custom_order", label: "Custom Order" },
  { value: "layby", label: "Layby" },
  { value: "client_intake", label: "Client Intake" },
  { value: "online_order", label: "Online Order" },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"orders" | "quotes">("orders");

  // Packets state
  const [packets, setPackets] = useState<Packet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);
  const [query, setQuery] = useState<AdminPacketsQuery>({
    search: "",
    type: "all",
    from: "",
    to: "",
  });

  // Quotes state
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [quoteView, setQuoteView] = useState<"board" | "list">("board");

  // Keep a ref to the latest query so the polling interval can read it
  const queryRef = useRef(query);
  useEffect(() => { queryRef.current = query; }, [query]);

  // ── Read ?tab= from URL on mount ─────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "quotes" || tab === "orders") setActiveTab(tab);
  }, []);

  // ── Data fetchers ─────────────────────────────────────────────────────────

  const fetchPackets = useCallback(async (q: AdminPacketsQuery) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.search) params.set("search", q.search);
      if (q.type && q.type !== "all") params.set("type", q.type);
      if (q.from) params.set("from", q.from);
      if (q.to) params.set("to", q.to);
      const res = await fetch(`/api/admin/packets?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch packets");
      const json = await res.json();
      setPackets(json.packets ?? []);
    } catch {
      setPackets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchQuotes = useCallback(async () => {
    setQuotesLoading(true);
    try {
      const res = await fetch("/api/quotes", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch quotes");
      const json = await res.json();
      setQuotes(json.quotes ?? []);
    } catch {
      setQuotes([]);
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  // Silent refresh — no loading spinner, used by the poll interval
  const silentRefreshQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/quotes", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.quotes) setQuotes(json.quotes);
    } catch { /* ignore */ }
  }, []);

  const silentRefreshPackets = useCallback(async (q: AdminPacketsQuery) => {
    try {
      const params = new URLSearchParams();
      if (q.search) params.set("search", q.search);
      if (q.type && q.type !== "all") params.set("type", q.type);
      if (q.from) params.set("from", q.from);
      if (q.to) params.set("to", q.to);
      const res = await fetch(`/api/admin/packets?${params}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.packets) setPackets(json.packets);
    } catch { /* ignore */ }
  }, []);

  // ── Initial data load ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => fetchPackets(query), 300);
    return () => clearTimeout(timer);
  }, [query, fetchPackets]);

  useEffect(() => {
    if (activeTab === "quotes") fetchQuotes();
  }, [activeTab, fetchQuotes]);

  // ── Supabase real-time subscriptions ────────────────────────────────────
  // Subscribes to INSERT/UPDATE on both tables immediately on mount.
  // Requires real-time enabled for these tables in Supabase dashboard.
  useEffect(() => {
    const supabase = getSupabaseClient();

    const channel = supabase
      .channel("admin-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "quotes" },
        (payload) => {
          const incoming = payload.new as Quote;
          setQuotes((prev) => {
            if (prev.some((q) => q.id === incoming.id)) return prev;
            return [incoming, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quotes" },
        (payload) => {
          const updated = payload.new as Quote;
          setQuotes((prev) =>
            prev.map((q) => (q.id === updated.id ? updated : q))
          );
          // Keep selected quote in sync
          setSelectedQuote((cur) =>
            cur && cur.id === updated.id ? updated : cur
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "packets" },
        (payload) => {
          const incoming = payload.new as Packet;
          setPackets((prev) => {
            if (prev.some((p) => p.id === incoming.id)) return prev;
            return [incoming, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "packets" },
        (payload) => {
          const updated = payload.new as Packet;
          setPackets((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p))
          );
          setSelectedPacket((cur) =>
            cur && cur.id === updated.id ? updated : cur
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ── 10-second fallback poll ──────────────────────────────────────────────
  // Runs silently (no loading state) in case the websocket drops.
  useEffect(() => {
    const interval = setInterval(() => {
      silentRefreshQuotes();
      silentRefreshPackets(queryRef.current);
    }, 10_000);
    return () => clearInterval(interval);
  }, [silentRefreshQuotes, silentRefreshPackets]);

  // ── Event handlers ───────────────────────────────────────────────────────

  function handleUpdateQuote(updated: Quote) {
    setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
    setSelectedQuote(updated);
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    if (query.type && query.type !== "all") params.set("type", query.type);
    if (query.from) params.set("from", query.from);
    if (query.to) params.set("to", query.to);
    window.open(`/api/admin/export?${params}`, "_blank");
  }

  async function handleRetry(
    packetId: string,
    output: "klaviyo" | "email" | "sms" | "sheets" | "label"
  ) {
    const res = await fetch("/api/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packetId, output }),
    });
    if (res.ok) fetchPackets(query);
  }

  const inputClass =
    "rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black";

  return (
    <>
      {selectedPacket && (
        <PacketDetailDrawer
          packet={selectedPacket}
          onClose={() => setSelectedPacket(null)}
          onRetry={handleRetry}
        />
      )}

      {selectedQuote && (
        <QuoteDetailDrawer
          quote={selectedQuote}
          onClose={() => setSelectedQuote(null)}
          onUpdate={handleUpdateQuote}
        />
      )}

      <NavBar />

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-0">
            {(["orders", "quotes"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 text-sm font-semibold transition-colors capitalize ${
                  activeTab === tab
                    ? "text-black border-b-2 border-black"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "orders" && (
          <>
            {/* Filter bar */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-5">
              <div className="flex flex-wrap gap-3">
                {/* Search */}
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search by name, email, reference…"
                      value={query.search ?? ""}
                      onChange={(e) => setQuery((q) => ({ ...q, search: e.target.value }))}
                      className={`w-full pl-9 pr-3 ${inputClass}`}
                    />
                  </div>
                </div>

                {/* Type filter */}
                <select
                  value={query.type ?? "all"}
                  onChange={(e) =>
                    setQuery((q) => ({
                      ...q,
                      type: e.target.value as AdminPacketsQuery["type"],
                    }))
                  }
                  className={inputClass}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {/* Date range */}
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={query.from ?? ""}
                    onChange={(e) => setQuery((q) => ({ ...q, from: e.target.value }))}
                    className={inputClass}
                    title="From date"
                  />
                  <span className="text-gray-400 text-sm">to</span>
                  <input
                    type="date"
                    value={query.to ?? ""}
                    onChange={(e) => setQuery((q) => ({ ...q, to: e.target.value }))}
                    className={inputClass}
                    title="To date"
                  />
                </div>

                {/* Export */}
                <button
                  onClick={handleExport}
                  className="flex items-center gap-1.5 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#222222] transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Export CSV
                </button>
              </div>
            </div>

            {/* Orders table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-black">
                  {loading ? "Loading…" : `${packets.length} order${packets.length !== 1 ? "s" : ""}`}
                </h2>
                <div className="text-xs text-gray-400 flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-green-500 inline-block" /> Success
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-gray-300 inline-block" /> Pending/Failed
                  </span>
                  <span className="text-gray-300">|</span>
                  <span>Label · Klaviyo · Email · SMS · Sheets</span>
                </div>
              </div>
              <div className="px-5 py-4">
                {loading ? (
                  <div className="text-center py-12 text-gray-400">
                    <svg className="w-8 h-8 mx-auto mb-2 spinner" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <p className="text-sm">Loading orders…</p>
                  </div>
                ) : (
                  <AdminTable packets={packets} onRowClick={setSelectedPacket} />
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === "quotes" && (
          <>
            {/* Stats bar */}
            {!quotesLoading && quotes.length > 0 && (
              <QuoteStatsBar quotes={quotes} />
            )}

            {/* View toggle + count */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                {quotesLoading
                  ? "Loading…"
                  : `${quotes.filter((q) => q.status !== "converted").length} active quote${
                      quotes.filter((q) => q.status !== "converted").length !== 1 ? "s" : ""
                    }`}
              </p>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-semibold">
                <button
                  onClick={() => setQuoteView("board")}
                  className={`px-4 py-2 transition-colors ${
                    quoteView === "board" ? "bg-black text-white" : "bg-white text-gray-500 hover:text-black"
                  }`}
                >
                  Board
                </button>
                <button
                  onClick={() => setQuoteView("list")}
                  className={`px-4 py-2 transition-colors border-l border-gray-200 ${
                    quoteView === "list" ? "bg-black text-white" : "bg-white text-gray-500 hover:text-black"
                  }`}
                >
                  List
                </button>
              </div>
            </div>

            {quotesLoading ? (
              <div className="text-center py-16 text-gray-400">
                <svg className="w-8 h-8 mx-auto mb-2 spinner" fill="none" viewBox="0 0 24 24">
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
                quotes={quotes}
                onQuoteClick={setSelectedQuote}
                onUpdate={handleUpdateQuote}
              />
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left bg-gray-50">
                        <th className="px-4 py-3 font-semibold text-black whitespace-nowrap">Reference No.</th>
                        <th className="px-4 py-3 font-semibold text-black">Customer</th>
                        <th className="px-4 py-3 font-semibold text-black">Assigned To</th>
                        <th className="px-4 py-3 font-semibold text-black">Stage</th>
                        <th className="px-4 py-3 font-semibold text-black whitespace-nowrap">Follow Up Date</th>
                        <th className="px-4 py-3 font-semibold text-black whitespace-nowrap">Created At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {quotes.map((q) => {
                        const customerName =
                          [q.customer_first_name, q.customer_last_name]
                            .filter(Boolean)
                            .join(" ") || "—";
                        const created = new Date(q.created_at).toLocaleDateString("en-AU", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        });
                        const stage = quoteStage(q.status);
                        const stageConf = STAGE_CONFIG[stage];
                        const overdue = isOverdue(q.follow_up_date);
                        const activeStage = stage !== "job_won" && stage !== "job_lost";

                        return (
                          <tr
                            key={q.id}
                            onClick={() => setSelectedQuote(q)}
                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs font-semibold text-black">
                                {q.reference_number}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-black">{customerName}</div>
                              <div className="text-xs text-gray-400">{q.customer_phone ?? ""}</div>
                            </td>
                            <td className="px-4 py-3 text-gray-700 text-xs">{q.assigned_to ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span
                                className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                                style={{ backgroundColor: stageConf.color }}
                              >
                                {stageConf.label}
                              </span>
                              {q.status === "converted" && (
                                <span className="ml-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">
                                  Converted
                                </span>
                              )}
                            </td>
                            <td
                              className={`px-4 py-3 whitespace-nowrap text-xs font-medium ${
                                overdue && activeStage ? "text-red-600 font-bold" : "text-gray-600"
                              }`}
                            >
                              {q.follow_up_date
                                ? new Date(q.follow_up_date + "T00:00:00").toLocaleDateString("en-AU", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "—"}
                              {overdue && activeStage && " ⚠"}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                              {created}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
