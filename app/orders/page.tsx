"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Packet, PacketType } from "@/lib/types";
import { getSupabaseClient } from "@/lib/supabase";
import { useUser } from "@/context/UserContext";
import AdminTable from "@/components/AdminTable";
import PacketDetailDrawer from "@/components/PacketDetailDrawer";

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

export default function OrdersPage() {
  const { user } = useUser();
  const canDelete = user?.role !== "staff";

  const [packets, setPackets] = useState<Packet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchOrders = useCallback(async (params: { search?: string; from?: string; to?: string }) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (params.search) p.set("search", params.search);
      if (params.from)   p.set("from",   params.from);
      if (params.to)     p.set("to",     params.to);
      const res = await fetch(`/api/admin/packets?${p}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setPackets(json.packets ?? []);
    } catch {
      setPackets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchOrders({ search, from, to }), 300);
    return () => clearTimeout(timer);
  }, [search, from, to, fetchOrders]);

  // Real-time subscriptions
  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch {
      return;
    }
    const channel = supabase
      .channel("orders-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "packets" }, (payload) => {
        const row = payload.new as Packet;
        setPackets((prev) => prev.some((p) => p.id === row.id) ? prev : [row, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "packets" }, (payload) => {
        const row = payload.new as Packet;
        setPackets((prev) => prev.map((p) => p.id === row.id ? row : p));
        setSelectedPacket((cur) => cur?.id === row.id ? row : cur);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => { setSelectedIds(new Set()); }, [orderFilter]);

  function handleUpdate(updated: Packet) {
    setPackets((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setSelectedPacket(updated);
  }

  function handleDelete(id: string) {
    setPackets((prev) => prev.filter((p) => p.id !== id));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setSelectedPacket(null);
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} order${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => fetch(`/api/admin/packets/${id}`, { method: "DELETE" })));
    setPackets((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
  }

  async function handleRetry(packetId: string, output: "klaviyo" | "email" | "sms" | "sheets" | "label") {
    const res = await fetch("/api/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packetId, output }),
    });
    if (res.ok) fetchOrders({ search, from, to });
  }

  function handleExport() {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (from)   p.set("from",   from);
    if (to)     p.set("to",     to);
    window.open(`/api/admin/export?${p}`, "_blank");
  }

  const filteredPackets = useMemo(() => {
    return packets.filter((p) => {
      if (orderFilter === "shopify")  return p.packet_type === "online_order";
      if (orderFilter === "in-store") return p.packet_type !== "online_order";
      if (orderFilter === "all")      return true;
      return p.packet_type === orderFilter;
    });
  }, [packets, orderFilter]);

  const unprintedShopify = useMemo(() =>
    packets.filter((p) => p.packet_type === "online_order" && !p.label_printed),
    [packets]
  );

  const inputClass = "rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black";

  return (
    <>
      {selectedPacket && (
        <PacketDetailDrawer
          packet={selectedPacket}
          onClose={() => setSelectedPacket(null)}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
          onRetry={handleRetry}
        />
      )}

      <div className="max-w-7xl mx-auto space-y-4">
        {/* Filters */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {ORDER_FILTERS.map((f) => {
              const isActive  = orderFilter === f.value;
              const isShopify = f.value === "shopify";
              const hasBadge  = isShopify && unprintedShopify.length > 0;
              return (
                <button
                  key={f.value}
                  onClick={() => setOrderFilter(f.value)}
                  className={`relative px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isActive ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] relative">
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
            <div className="flex items-center gap-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} title="From date" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} title="To date" />
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

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-black">
                {loading ? "Loading…" : `${filteredPackets.length} order${filteredPackets.length !== 1 ? "s" : ""}`}
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
              <span>Label · Klaviyo · Email · SMS · Sheets</span>
            </div>
          </div>

          {selectedIds.size > 0 && canDelete && (
            <div className="px-5 py-2.5 bg-red-50 border-b border-red-100 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-red-700">{selectedIds.size} order{selectedIds.size !== 1 ? "s" : ""} selected</span>
              <div className="flex gap-2">
                <button onClick={() => setSelectedIds(new Set())} className="text-xs font-semibold text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
                  Clear
                </button>
                <button onClick={handleBulkDelete} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors">
                  Delete selected ({selectedIds.size})
                </button>
              </div>
            </div>
          )}

          <div className="px-5 py-4">
            {loading ? (
              <div className="text-center py-12 text-gray-400">
                <svg className="w-8 h-8 mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-sm">Loading orders…</p>
              </div>
            ) : (
              <AdminTable
                packets={filteredPackets}
                onRowClick={setSelectedPacket}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
