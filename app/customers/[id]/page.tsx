"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from "react";
import { Packet, Quote } from "@/lib/types";
import { packetTypeLabel, formatDateAU, formatCurrency } from "@/lib/formatters";
import PacketDetailDrawer from "@/components/PacketDetailDrawer";
import { useUser } from "@/context/UserContext";

type Tab = "orders" | "quotes" | "timeline" | "notes";

const TYPE_BADGE_STYLES: Record<string, React.CSSProperties> = {
  repair:        { background: '#FEF3C7', color: '#92400E' },
  custom_order:  { background: '#EEF2FF', color: '#635BFF' },
  layby:         { background: '#DBEAFE', color: '#1E40AF' },
  client_intake: { background: '#DCFCE7', color: '#166534' },
  online_order:  { background: '#DCFCE7', color: '#166534' },
};

const STAGE_BADGE_STYLES: Record<string, React.CSSProperties> = {
  pending:      { background: '#F3F4F6', color: '#374151' },
  follow_up_1:  { background: '#DBEAFE', color: '#1E40AF' },
  follow_up_2:  { background: '#FEF3C7', color: '#92400E' },
  job_won:      { background: '#DCFCE7', color: '#166534' },
  job_lost:     { background: '#FEE2E2', color: '#991B1B' },
};
// Default fallback styles
const DEFAULT_BADGE: React.CSSProperties = { background: '#F3F4F6', color: '#374151' };

interface CustomerData {
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  street: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  notes: string | null;
  customer_id: string | null;
  total_orders: number;
  total_quotes: number;
  total_spend: number;
  first_seen: string;
  last_visit: string;
}

interface TimelineEvent {
  date: string;
  type: "order" | "quote";
  label: string;
  description: string;
  amount: number | null;
  ref: string;
  status: string;
}

function StatPill({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 12, padding: '12px 16px', background: accent ? '#635BFF' : '#F9FAFB', border: accent ? 'none' : '1px solid #E8E8F0' }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: accent ? '#fff' : '#1A1A2E' }}>{value}</span>
      <span style={{ fontSize: 12, fontWeight: 500, marginTop: 2, color: accent ? 'rgba(255,255,255,0.7)' : '#6B7280' }}>{label}</span>
    </div>
  );
}

function TabButton({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: 14, fontWeight: 600, background: 'transparent', border: 'none', borderBottom: `2px solid ${active ? '#635BFF' : 'transparent'}`, color: active ? '#635BFF' : '#6B7280', cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap', marginBottom: -1 }}
    >
      {label}
      {count != null && count > 0 && (
        <span style={{ fontSize: 11, borderRadius: 999, padding: '2px 6px', fontWeight: 700, background: active ? '#635BFF' : '#F3F4F6', color: active ? '#fff' : '#6B7280' }}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function CustomerProfilePage({ params }: { params: { id: string } }) {
  const { user } = useUser();
  const email = decodeURIComponent(params.id);

  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/customers/${encodeURIComponent(email)}`, { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } })
      .then((r) => r.json())
      .then((json) => {
        setCustomer(json.customer ?? null);
        setPackets(json.packets ?? []);
        setQuotes(json.quotes ?? []);
        setNotes(json.customer?.notes ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email]);

  function saveNotes(value: string) {
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      setNotesSaving(true);
      try {
        await fetch(`/api/customers/${encodeURIComponent(email)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
          body: JSON.stringify({ notes: value }),
        });
      } finally {
        setNotesSaving(false);
      }
    }, 800);
  }

  function handlePacketUpdate(updated: Packet) {
    setPackets((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setSelectedPacket(updated);
  }

  function handlePacketDelete(id: string) {
    setPackets((prev) => prev.filter((p) => p.id !== id));
    setSelectedPacket(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleRetry(_packetId: string, _output: string) {}

  // Timeline: merge packets + quotes sorted by date desc
  const timeline: TimelineEvent[] = [
    ...packets.map((p): TimelineEvent => ({
      date: p.created_at,
      type: "order",
      label: packetTypeLabel(p.packet_type),
      description: [p.articles, p.instructions].filter(Boolean).join(" — ") || "—",
      amount: typeof p.total_charges === "number" ? p.total_charges : null,
      ref: p.reference_number,
      status: p.collected_date ? "Collected" : (p.due_date && p.due_date < new Date().toISOString().split("T")[0] ? "Overdue" : "Active"),
    })),
    ...quotes.map((q): TimelineEvent => ({
      date: q.created_at,
      type: "quote",
      label: "Quote",
      description: q.notes || (q.line_items as { design?: string }[])?.[0]?.design || "—",
      amount: null,
      ref: q.reference_number,
      status: q.status,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const name = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || email;
  const address = [customer?.street, customer?.suburb, customer?.state, customer?.postcode].filter(Boolean).join(", ");

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
        <div className="h-10 bg-gray-200 rounded-xl w-64" />
        <div className="h-32 bg-gray-200 rounded-2xl" />
        <div className="h-64 bg-gray-200 rounded-2xl" />
      </div>
    );
  }

  if (!customer && packets.length === 0 && quotes.length === 0) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-gray-400">No data found for <strong>{email}</strong></p>
      </div>
    );
  }

  return (
    <>
      {selectedPacket && (
        <PacketDetailDrawer
          packet={selectedPacket}
          onClose={() => setSelectedPacket(null)}
          onDelete={handlePacketDelete}
          onUpdate={handlePacketUpdate}
          onRetry={handleRetry}
        />
      )}

      <div className="max-w-4xl mx-auto space-y-5">

        {/* ── Customer header ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderRadius: 12, padding: 24 }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              {/* Initials circle */}
              <div className="flex items-center gap-3 mb-2">
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#635BFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                  {(customer?.first_name?.[0] ?? email[0] ?? "?").toUpperCase()}
                </div>
                <div>
                  <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>{name}</h1>
                  <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>{email}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
                {customer?.phone && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.338c0-1.023.916-1.838 1.904-1.838h.394c.97 0 1.838.755 1.904 1.838l.263 3.507c.063.839-.486 1.602-1.321 1.77l-.522.104a.75.75 0 00-.563.73c0 2.117 1.73 4.388 4.055 5.51a.75.75 0 00.73-.077l.376-.3c.647-.516 1.567-.587 2.284-.11l2.905 1.937a1.905 1.905 0 01-.082 3.2l-.367.22A3.754 3.754 0 017.5 21.75C4.045 21.75 2.25 17.39 2.25 12c0-2.56.67-4.96 1.838-6.85z" />
                    </svg>
                    {customer.phone}
                  </span>
                )}
                {address && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                    </svg>
                    {address}
                  </span>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="flex gap-2 flex-wrap">
              <StatPill label="Orders" value={customer?.total_orders ?? packets.length} accent />
              <StatPill label="Quotes" value={customer?.total_quotes ?? quotes.length} />
              <StatPill label="Spend" value={customer && customer.total_spend > 0 ? formatCurrency(customer.total_spend) : "—"} />
              <StatPill label="First visit" value={formatDateAU(customer?.first_seen?.split("T")[0]) || "—"} />
              <StatPill label="Last visit" value={formatDateAU(customer?.last_visit?.split("T")[0]) || "—"} />
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #E8E8F0', overflowX: 'auto' }}>
            <TabButton label="Orders" active={activeTab === "orders"} onClick={() => setActiveTab("orders")} count={packets.length} />
            <TabButton label="Quotes" active={activeTab === "quotes"} onClick={() => setActiveTab("quotes")} count={quotes.length} />
            <TabButton label="Timeline" active={activeTab === "timeline"} onClick={() => setActiveTab("timeline")} count={timeline.length} />
            <TabButton label="Notes" active={activeTab === "notes"} onClick={() => setActiveTab("notes")} />
          </div>

          {/* ── Orders tab ── */}
          {activeTab === "orders" && (
            <div className="overflow-x-auto">
              {packets.length === 0 ? (
                <p className="px-5 py-10 text-center text-gray-400 text-sm">No orders on file</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #E8E8F0', background: '#F9FAFB' }}>
                      {['Reference','Type','Description','Due','Total','Status','Specs','Certificate'].map((h) => (
                        <th key={h} style={{ padding: '12px 20px', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {packets.map((p) => {
                      const isOverdue = p.due_date && p.due_date < new Date().toISOString().split("T")[0] && !p.collected_date;
                      const status = p.collected_date ? "Collected" : isOverdue ? "Overdue" : "Active";
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedPacket(p)}
                          style={{ borderBottom: '1px solid #E8E8F0', cursor: 'pointer', transition: 'background .12s' }}
                          onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'}
                          onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                        >
                          <td style={{ padding: '12px 20px', fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>{p.reference_number}</td>
                          <td style={{ padding: '12px 20px' }}>
                            <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, ...(TYPE_BADGE_STYLES[p.packet_type] ?? DEFAULT_BADGE) }}>
                              {packetTypeLabel(p.packet_type)}
                            </span>
                          </td>
                          <td style={{ padding: '12px 20px', color: '#374151', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.articles || p.instructions || "—"}
                          </td>
                          <td style={{ padding: '12px 20px', fontSize: 14, color: isOverdue ? '#EF4444' : '#6B7280', fontWeight: isOverdue ? 600 : 400 }}>
                            {formatDateAU(p.due_date) || "—"}
                          </td>
                          <td style={{ padding: '12px 20px', fontWeight: 600, color: '#1A1A2E' }}>
                            {typeof p.total_charges === "number" ? formatCurrency(p.total_charges) : "—"}
                          </td>
                          <td style={{ padding: '12px 20px' }}>
                            <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                              ...(status === "Collected" ? { background: '#DCFCE7', color: '#166534' } :
                                  status === "Overdue"   ? { background: '#FEE2E2', color: '#991B1B' } :
                                  { background: '#F3F4F6', color: '#374151' }) }}>
                              {status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 20px' }}>
                            {p.item_specifications && Object.keys(p.item_specifications as Record<string, unknown>).length > 0 && (
                              <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#DBEAFE', color: '#1E40AF' }}>
                                Specs
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 20px' }}>
                            {p.valuation_status === "approved" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  import("@/lib/valuationCertificateGenerator").then(({ generateValuationCertificate }) => {
                                    generateValuationCertificate(p);
                                  });
                                }}
                                style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: '#DCFCE7', color: '#166534', border: 'none', cursor: 'pointer' }}
                              >
                                View Certificate
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Quotes tab ── */}
          {activeTab === "quotes" && (
            <div className="overflow-x-auto">
              {quotes.length === 0 ? (
                <p className="px-5 py-10 text-center text-gray-400 text-sm">No quotes on file</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #E8E8F0', background: '#F9FAFB' }}>
                      {['Reference','Type','Notes','Stage','Assigned To','Created'].map((h) => (
                        <th key={h} style={{ padding: '12px 20px', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr
                        key={q.id}
                        style={{ borderBottom: '1px solid #E8E8F0', transition: 'background .12s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                      >
                        <td style={{ padding: '12px 20px', fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>{q.reference_number}</td>
                        <td style={{ padding: '12px 20px', color: '#374151' }}>{q.quote_type || "—"}</td>
                        <td style={{ padding: '12px 20px', color: '#6B7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.notes || "—"}</td>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, ...(STAGE_BADGE_STYLES[q.status] ?? DEFAULT_BADGE) }}>
                            {(q.status ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                        </td>
                        <td style={{ padding: '12px 20px', color: '#6B7280' }}>{q.assigned_to || q.staff_member || "—"}</td>
                        <td style={{ padding: '12px 20px', color: '#9CA3AF', fontSize: 12 }}>{formatDateAU(q.created_at?.split("T")[0])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Timeline tab ── */}
          {activeTab === "timeline" && (
            <div style={{ padding: '16px 20px' }}>
              {timeline.length === 0 ? (
                <p style={{ padding: '40px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>No history</p>
              ) : (
                <div style={{ position: 'relative' }}>
                  {/* Vertical line */}
                  <div style={{ position: 'absolute', left: 20, top: 0, bottom: 0, width: 1, background: '#E8E8F0' }} />
                  <div style={{ paddingLeft: 56, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {timeline.map((ev, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        {/* Icon */}
                        <div style={{ position: 'absolute', left: -36, top: 4, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: ev.type === "order" ? '#635BFF' : '#EEF2FF', color: ev.type === "order" ? '#fff' : '#635BFF' }}>
                          {ev.type === "order" ? "📦" : "💬"}
                        </div>
                        <div style={{ background: '#fff', border: '1px solid #E8E8F0', borderRadius: 12, padding: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>{ev.label}</span>
                                <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                                  ...(ev.type === "order"
                                    ? (ev.status === "Collected" ? { background: '#DCFCE7', color: '#166534' } : ev.status === "Overdue" ? { background: '#FEE2E2', color: '#991B1B' } : { background: '#F3F4F6', color: '#374151' })
                                    : (STAGE_BADGE_STYLES[ev.status] ?? DEFAULT_BADGE)) }}>
                                  {ev.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                </span>
                                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#D1D5DB' }}>{ev.ref}</span>
                              </div>
                              <p style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{ev.description}</p>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              {ev.amount != null && (
                                <p style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>{formatCurrency(ev.amount)}</p>
                              )}
                              <p style={{ fontSize: 12, color: '#9CA3AF' }}>{formatDateAU(ev.date.split("T")[0])}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Notes tab ── */}
          {activeTab === "notes" && (
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Staff Notes</label>
                {notesSaving && <span style={{ fontSize: 12, color: '#9CA3AF' }} className="animate-pulse">Saving…</span>}
              </div>
              <textarea
                rows={8}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  saveNotes(e.target.value);
                }}
                placeholder="Add notes about this customer — preferences, history, anything relevant for future visits…"
                style={{ width: '100%', borderRadius: 8, border: '1px solid #E8E8F0', background: '#F9FAFB', padding: '12px 16px', fontSize: 14, color: '#1A1A2E', outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit' }}
              />
              <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>Notes save automatically. Visible to all staff.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
