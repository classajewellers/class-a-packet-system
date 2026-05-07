"use client";

import { useState, useEffect, useCallback } from "react";
import { Packet, PacketType, AdminPacketsQuery } from "@/lib/types";
import AdminTable from "@/components/AdminTable";
import PacketDetailDrawer from "@/components/PacketDetailDrawer";

const TYPE_OPTIONS: { value: "all" | PacketType; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "repair", label: "Repair" },
  { value: "custom_order", label: "Custom Order" },
  { value: "layby", label: "Layby" },
  { value: "client_intake", label: "Client Intake" },
  { value: "online_order", label: "Online Order" },
];

export default function AdminPage() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);
  const [query, setQuery] = useState<AdminPacketsQuery>({
    search: "",
    type: "all",
    from: "",
    to: "",
  });

  const fetchPackets = useCallback(async (q: AdminPacketsQuery) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.search) params.set("search", q.search);
      if (q.type && q.type !== "all") params.set("type", q.type);
      if (q.from) params.set("from", q.from);
      if (q.to) params.set("to", q.to);

      const res = await fetch(`/api/admin/packets?${params}`);
      if (!res.ok) throw new Error("Failed to fetch packets");
      const json = await res.json();
      setPackets(json.packets ?? []);
    } catch {
      setPackets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchPackets(query), 300);
    return () => clearTimeout(timer);
  }, [query, fetchPackets]);

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
    if (res.ok) {
      fetchPackets(query);
    }
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

      {/* Header */}
      <header className="bg-[#A3B2A4] shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <img
              src="/class-a-logo.png"
              alt="Class A Jewellers"
              className="h-[40px] w-auto object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
                const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                if (fallback) fallback.style.display = "block";
              }}
            />
            <div style={{ display: "none" }}>
              <p className="font-serif text-white font-bold text-lg tracking-wider leading-none">
                CLASS A JEWELLERS
              </p>
              <p className="text-white/60 text-xs mt-0.5">Admin — Packet History</p>
            </div>
          </div>
          <a
            href="/"
            className="text-xs font-semibold text-white/80 hover:text-white border border-white/30 hover:border-white rounded-lg px-3 py-1.5 transition-colors"
          >
            ← New Packet
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
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
            <div>
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
            </div>

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

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-black">
              {loading ? "Loading…" : `${packets.length} packet${packets.length !== 1 ? "s" : ""}`}
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
                <p className="text-sm">Loading packets…</p>
              </div>
            ) : (
              <AdminTable packets={packets} onRowClick={setSelectedPacket} />
            )}
          </div>
        </div>
      </main>
    </>
  );
}
