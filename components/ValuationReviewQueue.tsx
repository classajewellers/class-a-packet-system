"use client";

import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { Packet } from "@/lib/types";
import { formatDateAU } from "@/lib/formatters";
import PacketDetailDrawer from "./PacketDetailDrawer";

export default function ValuationReviewQueue() {
  const { user } = useUser();
  const [packets, setPackets] = useState<Packet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Packet | null>(null);

  useEffect(() => {
    fetch("/api/admin/packets?valuation_status=pending_review", { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } })
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
      <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF' }}>
        <svg style={{ width: 24, height: 24, margin: '0 auto 8px' }} className="animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p style={{ fontSize: 14 }}>Loading certificate queue…</p>
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
        <div style={{ textAlign: 'center', padding: '64px 0', background: '#FFFFFF', borderRadius: 12, border: '1px solid #E8E8F0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
          <p style={{ color: '#6B7280', fontWeight: 500, fontSize: 14 }}>No certificates pending review</p>
          <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>All caught up!</p>
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid #E8E8F0', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E8E8F0' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', margin: 0 }}>{packets.length} pending review</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #E8E8F0', background: '#F9FAFB' }}>
                  {['Reference', 'Customer', 'Item Type', 'Metal', 'Main Stone', 'Submitted', 'Action'].map((h) => (
                    <th key={h} style={{ padding: '12px 20px', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {packets.map((p) => {
                  const specs = (p.item_specifications ?? {}) as Record<string, unknown>;
                  const stones = (specs.stones ?? []) as Array<Record<string, unknown>>;
                  const mainStone = stones[0];
                  return (
                    <tr
                      key={p.id}
                      style={{ borderBottom: '1px solid #E8E8F0', cursor: 'pointer', transition: 'background .12s' }}
                      onClick={() => setSelected(p)}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 20px', fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>{p.reference_number}</td>
                      <td style={{ padding: '12px 20px', fontWeight: 600, color: '#1A1A2E' }}>
                        {[p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td style={{ padding: '12px 20px', color: '#374151' }}>{String(specs.item_type ?? "—")}</td>
                      <td style={{ padding: '12px 20px', color: '#6B7280' }}>{String(specs.metal_type ?? "—")}</td>
                      <td style={{ padding: '12px 20px', color: '#6B7280' }}>
                        {mainStone ? `${String(mainStone.carat_weight ?? "")}ct ${String(mainStone.shape ?? "")} ${String(mainStone.stone_type ?? "")}`.trim() : "—"}
                      </td>
                      <td style={{ padding: '12px 20px', color: '#9CA3AF', fontSize: 12 }}>{formatDateAU(p.created_at?.split("T")[0])}</td>
                      <td style={{ padding: '12px 20px' }}>
                        <span style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#FEF3C7', color: '#92400E' }}>
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
