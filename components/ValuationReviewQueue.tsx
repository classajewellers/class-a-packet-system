"use client";

import { useState, useEffect } from "react";
import { Packet } from "@/lib/types";
import { formatDateAU } from "@/lib/formatters";
import PacketDetailDrawer from "./PacketDetailDrawer";

export default function ValuationReviewQueue() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Packet | null>(null);

  useEffect(() => {
    fetch("/api/admin/packets?valuation_status=pending_review", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        // Filter client-side for pending_review
        const all: Packet[] = json.packets ?? json.data ?? [];
        setPackets(all.filter((p) => p.valuation_status === "pending_review"));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function handleUpdate(updated: Packet) {
    setPackets((prev) => {
      const filtered = prev.filter((p) => p.id !== updated.id);
      if (updated.valuation_status === "pending_review") return [updated, ...filtered];
      return filtered; // Remove from queue when approved
    });
    if (selected?.id === updated.id) setSelected(updated);
  }

  function handleDelete(id: string) {
    setPackets((prev) => prev.filter((p) => p.id !== id));
    setSelected(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleRetry(_packetId: string, _output: string) {}

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-400">
        <svg className="w-6 h-6 mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm">Loading valuation queue…</p>
      </div>
    );
  }

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

      {packets.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-gray-500 font-medium">No valuations pending review</p>
          <p className="text-sm text-gray-400 mt-1">All caught up!</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-black">{packets.length} pending review</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Reference</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Customer</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Item Type</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Metal</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Main Stone</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Submitted</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {packets.map((p) => {
                  const specs = (p.item_specifications ?? {}) as Record<string, unknown>;
                  const stones = (specs.stones ?? []) as Array<Record<string, unknown>>;
                  const mainStone = stones[0];
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => setSelected(p)}>
                      <td className="px-5 py-3 font-mono text-xs text-gray-500">{p.reference_number}</td>
                      <td className="px-5 py-3 font-semibold text-gray-800">
                        {[p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{String(specs.item_type ?? "—")}</td>
                      <td className="px-5 py-3 text-gray-500">{String(specs.metal_type ?? "—")}</td>
                      <td className="px-5 py-3 text-gray-500">
                        {mainStone ? `${String(mainStone.carat_weight ?? "")}ct ${String(mainStone.shape ?? "")} ${String(mainStone.stone_type ?? "")}`.trim() : "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs">{formatDateAU(p.created_at?.split("T")[0])}</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex px-2 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700">
                          Review →
                        </span>
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
  );
}
