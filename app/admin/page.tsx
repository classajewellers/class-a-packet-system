"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Packet, PacketType, Quote } from "@/lib/types";
import { STAGE_CONFIG, quoteStage, isOverdue } from "@/lib/pipeline";
import { getSupabaseClient } from "@/lib/supabase";
import dynamic from "next/dynamic";
import AdminTable from "@/components/AdminTable";
import PacketDetailDrawer from "@/components/PacketDetailDrawer";
import QuoteDetailDrawer from "@/components/QuoteDetailDrawer";
import QuoteStatsBar from "@/components/QuoteStatsBar";
import NavBar from "@/components/NavBar";

// Lazy-load the drag-and-drop board with ssr:false to avoid hydration
// mismatches from @hello-pangea/dnd accessing browser APIs during SSR.
const QuotePipelineBoard = dynamic(
  () => import("@/components/QuotePipelineBoard"),
  { ssr: false }
);

// ── Note for deployment ───────────────────────────────────────────────────────
// Real-time subscriptions require Supabase replication enabled on both tables.
// In Supabase dashboard → Database → Replication, enable real-time for the
// "quotes" and "packets" tables.
// ─────────────────────────────────────────────────────────────────────────────

type ActiveTab = "orders" | "quotes";

// "shopify" and "in-store" are meta-filters handled client-side;
// the rest map directly to packet_type values.
type OrderFilter = "all" | "shopify" | "in-store" | PacketType;

const ORDER_FILTERS: { value: OrderFilter; label: string }[] = [
  { value: "all",           label: "All Orders" },
  { value: "shopify",       label: "Shopify" },
  { value: "in-store",      label: "In-Store" },
  { value: "repair",        label: "Repair" },
  { value: "custom_order",  label: "Custom Order" },
  { value: "layby",         label: "Layby" },
  { value: "client_intake", label: "Client Intake" },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("orders");

  // ── All packets — all types loaded, filtered client-side ─────────────────
  const [packets, setPackets]               = useState<Packet[]>([]);
  const [loading, setLoading]               = useState(true);
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);
  const [orderFilter, setOrderFilter]       = useState<OrderFilter>("shopify");
  const [search, setSearch]                 = useState("");
  const [from, setFrom]                     = useState("");
  const [to, setTo]                         = useState("");

  // ── Quotes tab ────────────────────────────────────────────────────────────
  const [quotes, setQuotes]               = useState<Quote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [quoteView, setQuoteView]         = useState<"board" | "list">("board");
  const [showConverted, setShowConverted] = useState(false);
  const [quoteListFilter, setQuoteListFilter] = useState<"active" | "all" | "converted">("active");

  // Ref for polling so silent refresh always uses latest search params
  const fetchParamsRef = useRef({ search, from, to });
  useEffect(() => { fetchParamsRef.current = { search, from, to }; }, [search, from, to]);

  // ── Read ?tab= from URL on mount ─────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab") as ActiveTab | null;
    if (tab === "quotes" || tab === "orders") setActiveTab(tab);
  }, []);

  // ── Fetchers ──────────────────────────────────────────────────────────────

  // Fetch ALL packet types — type filter applied client-side
  const fetchOrders = useCallback(async (params: { search?: string; from?: string; to?: string }) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (params.search) p.set("search", params.search);
      if (params.from)   p.set("from",   params.from);
      if (params.to)     p.set("to",     params.to);
      // Deliberately no "type" param so API returns all packet types
      const res = await fetch(`/api/admin/packets?${p}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch orders");
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

  // Silent refreshes — no loading spinner, used by poll interval
  const silentRefreshOrders = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      const { search, from, to } = fetchParamsRef.current;
      if (search) p.set("search", search);
      if (from)   p.set("from",   from);
      if (to)     p.set("to",     to);
      const res = await fetch(`/api/admin/packets?${p}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.packets) setPackets(json.packets);
    } catch { /* ignore */ }
  }, []);

  const silentRefreshQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/quotes", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.quotes) setQuotes(json.quotes);
    } catch { /* ignore */ }
  }, []);

  // ── Initial load — debounced on search/date changes ──────────────────────
  useEffect(() => {
    const timer = setTimeout(() => fetchOrders({ search, from, to }), 300);
    return () => clearTimeout(timer);
  }, [search, from, to, fetchOrders]);

  useEffect(() => {
    if (activeTab === "quotes") fetchQuotes();
  }, [activeTab, fetchQuotes]);

  // ── Supabase real-time subscriptions ─────────────────────────────────────
  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch (err) {
      console.warn("[admin] Supabase client unavailable, real-time disabled:", err);
      return;
    }

    const channel = supabase
      .channel("admin-realtime")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "quotes" },
        (payload) => {
          const row = payload.new as Quote;
          setQuotes((prev) => prev.some((q) => q.id === row.id) ? prev : [row, ...prev]);
        }
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "quotes" },
        (payload) => {
          const row = payload.new as Quote;
          setQuotes((prev) => prev.map((q) => q.id === row.id ? row : q));
          setSelectedQuote((cur) => cur?.id === row.id ? row : cur);
        }
      )
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "packets" },
        (payload) => {
          const row = payload.new as Packet;
          // All packet types go into the single packets array; orderFilter handles display
          setPackets((prev) => prev.some((p) => p.id === row.id) ? prev : [row, ...prev]);
        }
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "packets" },
        (payload) => {
          const row = payload.new as Packet;
          setPackets((prev) => prev.map((p) => p.id === row.id ? row : p));
          setSelectedPacket((cur) => cur?.id === row.id ? row : cur);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── 10-second fallback poll ───────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      silentRefreshQuotes();
      silentRefreshOrders();
    }, 10_000);
    return () => clearInterval(interval);
  }, [silentRefreshQuotes, silentRefreshOrders]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleUpdateQuote(updated: Quote) {
    setQuotes((prev) => prev.map((q) => q.id === updated.id ? updated : q));
    setSelectedQuote(updated);
  }

  function handleExport() {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (from)   p.set("from",   from);
    if (to)     p.set("to",     to);
    window.open(`/api/admin/export?${p}`, "_blank");
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
    if (res.ok) fetchOrders({ search, from, to });
  }

  // ── Derived values ────────────────────────────────────────────────────────

  // Client-side type filter applied to the full packets array
  const filteredPackets = useMemo(() => {
    return (packets ?? []).filter((p) => {
      if (orderFilter === "shopify")  return p.packet_type === "online_order";
      if (orderFilter === "in-store") return p.packet_type !== "online_order";
      if (orderFilter === "all")      return true;
      return p.packet_type === orderFilter;
    });
  }, [packets, orderFilter]);

  // Unprinted online orders — drives the notification badge
  const unprintedShopify = useMemo(() =>
    (packets ?? []).filter((p) => p.packet_type === "online_order" && !p.label_printed),
    [packets]
  );

  // Quotes list view — filtered by active/converted/all
  const filteredListQuotes = useMemo(() => {
    if (quoteListFilter === "active")    return (quotes ?? []).filter((q) => q.status !== "converted");
    if (quoteListFilter === "converted") return (quotes ?? []).filter((q) => q.status === "converted");
    return quotes ?? [];
  }, [quotes, quoteListFilter]);

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

      {/* ── Tab bar ── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-0">

            {/* Orders tab — pulsing badge when unprinted Shopify orders exist */}
            <button
              onClick={() => setActiveTab("orders")}
              className={`relative px-6 py-3 text-sm font-semibold transition-colors ${
                activeTab === "orders"
                  ? "text-black border-b-2 border-black"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              Orders
              {unprintedShopify.length > 0 && (
                <span className="absolute top-2.5 right-1.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
              )}
            </button>

            {/* Quotes tab */}
            <button
              onClick={() => setActiveTab("quotes")}
              className={`px-6 py-3 text-sm font-semibold transition-colors ${
                activeTab === "quotes"
                  ? "text-black border-b-2 border-black"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              Quotes
            </button>

          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">

        {/* ── Orders tab ── */}
        {activeTab === "orders" && (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-5">

              {/* ── Filter button group ── */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {ORDER_FILTERS.map((f) => {
                  const isActive   = orderFilter === f.value;
                  const isShopify  = f.value === "shopify";
                  const hasBadge   = isShopify && unprintedShopify.length > 0;
                  return (
                    <button
                      key={f.value}
                      onClick={() => setOrderFilter(f.value)}
                      className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        isActive
                          ? "bg-black text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {f.label}
                      {hasBadge && (
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* ── Search + date range + export ── */}
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search by name, email, reference…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className={`w-full pl-9 pr-3 ${inputClass}`}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className={inputClass}
                    title="From date"
                  />
                  <span className="text-gray-400 text-sm">to</span>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className={inputClass}
                    title="To date"
                  />
                </div>
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

            {/* ── Table ── */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-black">
                    {loading
                      ? "Loading…"
                      : `${filteredPackets.length} order${filteredPackets.length !== 1 ? "s" : ""}`}
                  </h2>
                  {orderFilter === "shopify" && unprintedShopify.length > 0 && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-green-600">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                      </span>
                      {unprintedShopify.length} to print
                    </span>
                  )}
                </div>
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
                  <AdminTable packets={filteredPackets} onRowClick={setSelectedPacket} />
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Quotes tab ── */}
        {activeTab === "quotes" && (
          <>
            {!quotesLoading && quotes.length > 0 && <QuoteStatsBar quotes={quotes} />}

            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm text-gray-500">
                  {quotesLoading
                    ? "Loading…"
                    : `${(quotes ?? []).filter((q) => q.status !== "converted").length} active quote${(quotes ?? []).filter((q) => q.status !== "converted").length !== 1 ? "s" : ""}`}
                </p>
                {/* Board: show-converted toggle */}
                {quoteView === "board" && !quotesLoading && (
                  <button
                    onClick={() => setShowConverted((v) => !v)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      showConverted
                        ? "border-gray-400 bg-gray-100 text-gray-700"
                        : "border-gray-200 bg-white text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${showConverted ? "bg-gray-500" : "bg-gray-300"}`} />
                    {showConverted ? "Hiding converted" : "Show converted"}
                  </button>
                )}
                {/* List: filter pills */}
                {quoteView === "list" && !quotesLoading && (
                  <div className="flex gap-1">
                    {(["active", "all", "converted"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setQuoteListFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                          quoteListFilter === f
                            ? "bg-black text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
              <QuotePipelineBoard quotes={quotes} onQuoteClick={setSelectedQuote} onUpdate={handleUpdateQuote} showConverted={showConverted} />
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
                        {quoteListFilter === "converted" && (
                          <th className="px-4 py-3 font-semibold text-black whitespace-nowrap">Order</th>
                        )}
                        <th className="px-4 py-3 font-semibold text-black whitespace-nowrap">Created At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredListQuotes.length === 0 ? (
                        <tr>
                          <td colSpan={quoteListFilter === "converted" ? 7 : 6} className="px-4 py-12 text-center text-sm text-gray-400">
                            {quoteListFilter === "converted" ? "No converted quotes" : "No quotes found"}
                          </td>
                        </tr>
                      ) : filteredListQuotes.map((q) => {
                        const isConverted = q.status === "converted";
                        const customerName = [q.customer_first_name, q.customer_last_name].filter(Boolean).join(" ") || "—";
                        const created = new Date(q.created_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
                        const stage      = isConverted ? null : quoteStage(q.status);
                        const stageConf  = stage ? STAGE_CONFIG[stage] : null;
                        const overdue    = isOverdue(q.follow_up_date);
                        const activeStage = stage !== "job_won" && stage !== "job_lost";
                        return (
                          <tr
                            key={q.id}
                            onClick={() => setSelectedQuote(q)}
                            className={`cursor-pointer transition-colors ${isConverted ? "bg-gray-50 text-gray-400 hover:bg-gray-100" : "hover:bg-gray-50"}`}
                          >
                            <td className="px-4 py-3">
                              <span className={`font-mono text-xs font-semibold ${isConverted ? "text-gray-400" : "text-black"}`}>{q.reference_number}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className={`font-medium ${isConverted ? "text-gray-400" : "text-black"}`}>{customerName}</div>
                              <div className="text-xs text-gray-400">{q.customer_phone ?? ""}</div>
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{q.assigned_to ?? "—"}</td>
                            <td className="px-4 py-3">
                              {isConverted ? (
                                <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-500">
                                  Converted
                                </span>
                              ) : stageConf ? (
                                <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: stageConf.color }}>
                                  {stageConf.label}
                                </span>
                              ) : null}
                            </td>
                            <td className={`px-4 py-3 whitespace-nowrap text-xs font-medium ${overdue && activeStage && !isConverted ? "text-red-600 font-bold" : "text-gray-400"}`}>
                              {q.follow_up_date
                                ? new Date(q.follow_up_date + "T00:00:00").toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
                                : "—"}
                              {overdue && activeStage && !isConverted && " ⚠"}
                            </td>
                            {quoteListFilter === "converted" && (
                              <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                {q.packet_reference ? (
                                  <span className="font-mono text-xs font-semibold text-black bg-gray-100 rounded px-1.5 py-0.5">
                                    {q.packet_reference}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </td>
                            )}
                            <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-xs">{created}</td>
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
