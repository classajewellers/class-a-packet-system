"use client";

import { useState, useEffect, useCallback } from "react";
import { Packet } from "@/lib/types";
import { formatDateAU } from "@/lib/formatters";
import PacketDetailDrawer from "@/components/PacketDetailDrawer";

export default function OnlinePage() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Packet | null>(null);
  const [search, setSearch] = useState("");

  const fetchOnline = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      p.set("type", "online_order");
      if (search) p.set("search", search);
      const res = await fetch(`/api/admin/packets?${p}`, { cache: "no-store" });
      const json = await res.json();
      setPackets(json.packets ?? []);
    } catch {
      setPackets([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(fetchOnline, 300);
    return () => clearTimeout(timer);
  }, [fetchOnline]);

  function handleUpdate(updated: Packet) {
    setPackets((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setSelected(updated);
  }

  function handleDelete(id: string) {
    setPackets((prev) => prev.filter((p) => p.id !== id));
    setSelected(null);
  }

  async function handleRetry(packetId: string, output: "klaviyo" | "email" | "sms" | "sheets" | "label") {
    await fetch("/api/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packetId, output }),
    });
    fetchOnline();
  }

  const unprinted = packets.filter((p) => !p.label_printed).length;

  return (
    <>
      {selected && (
        <PacketDetailDrawer
          packet={selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
          onRetry={handleRetry}
        />
      )}

      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header bar */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search online orders…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            {unprinted > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs font-semibold text-green-700">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                {unprinted} to print
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-black">
              {loading ? "Loading…" : `${packets.length} online order${packets.length !== 1 ? "s" : ""}`}
            </h2>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
            ) : packets.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">No online orders found</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">Ref</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">Customer</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">Source</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">Order #</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">Items</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">Due Date</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500">Label</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {packets.map((p) => {
                    const name = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.reference_number}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                            (p.order_source ?? "").toLowerCase().includes("shopify")
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}>
                            {p.order_source || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{p.order_number || "—"}</td>
                        <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{p.items_ordered || "—"}</td>
                        <td className="px-4 py-3 text-gray-500">{formatDateAU(p.due_date) || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                            p.label_printed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                          }`}>
                            {p.label_printed ? "Printed" : "Unprinted"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
