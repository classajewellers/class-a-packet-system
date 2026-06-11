"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Packet } from "@/lib/types";
import { formatDateAU } from "@/lib/formatters";
import PacketDetailDrawer from "@/components/PacketDetailDrawer";
import { useUser } from "@/context/UserContext";
import { hasPermission } from "@/lib/userTypes";

export default function OnlinePage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "online")) router.replace("/");
  }, [user, hydrated, router]);
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
      const res = await fetch(`/api/admin/packets?${p}`, { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
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
      headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
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
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderRadius: 12, padding: 16 }}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search online orders…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%', paddingLeft: 36, paddingRight: 12, border: '1px solid #E8E8F0', borderRadius: 8, background: '#fff', height: 40, fontSize: 14, color: '#1A1A2E', outline: 'none' }}
              />
            </div>
            {unprinted > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#166534' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                {unprinted} to print
              </div>
            )}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E8E8F0' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', margin: 0 }}>
              {loading ? "Loading…" : `${packets.length} online order${packets.length !== 1 ? "s" : ""}`}
            </h2>
          </div>
          {loading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: '#6B7280', fontSize: 14 }}>Loading…</div>
          ) : packets.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: '#6B7280', fontSize: 14 }}>No online orders found</div>
          ) : (
            <>
              {/* Mobile: stacked cards */}
              <div className="md:hidden divide-y divide-gray-100">
                {packets.map((p) => {
                  const name = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className="px-4 py-3 cursor-pointer active:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div style={{ fontWeight: 600, color: '#1A1A2E', fontSize: 14 }}>{name}</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{p.reference_number}</div>
                          {p.items_ordered && (
                            <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.items_ordered}</div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span style={{ display: 'inline-flex', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, background: p.label_printed ? '#DCFCE7' : '#FEF3C7', color: p.label_printed ? '#166534' : '#92400E' }}>
                            {p.label_printed ? "Printed" : "Unprinted"}
                          </span>
                          <span style={{ fontSize: 12, color: '#9CA3AF' }}>{formatDateAU(p.due_date) || "—"}</span>
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
                      <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ref</th>
                      <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer</th>
                      <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Source</th>
                      <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Order #</th>
                      <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Items</th>
                      <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due Date</th>
                      <th style={{ padding: '12px 16px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Label</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packets.map((p) => {
                      const name = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setSelected(p)}
                          style={{ borderBottom: '1px solid #E8E8F0', cursor: 'pointer', transition: 'background .12s' }}
                          onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'}
                          onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                        >
                          <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 12, color: '#6B7280' }}>{p.reference_number}</td>
                          <td style={{ padding: '12px 16px', fontWeight: 500, color: '#1A1A2E' }}>{name}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ display: 'inline-flex', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, background: (p.order_source ?? "").toLowerCase().includes("shopify") ? '#DCFCE7' : '#F3F4F6', color: (p.order_source ?? "").toLowerCase().includes("shopify") ? '#166534' : '#374151' }}>
                              {p.order_source || "—"}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#374151' }}>{p.order_number || "—"}</td>
                          <td style={{ padding: '12px 16px', color: '#6B7280', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.items_ordered || "—"}</td>
                          <td style={{ padding: '12px 16px', color: '#6B7280' }}>{formatDateAU(p.due_date) || "—"}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ display: 'inline-flex', padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, background: p.label_printed ? '#DCFCE7' : '#FEF3C7', color: p.label_printed ? '#166534' : '#92400E' }}>
                              {p.label_printed ? "Printed" : "Unprinted"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
