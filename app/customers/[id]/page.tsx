"use client";

import { useState, useEffect, useRef } from "react";
import { Packet, Quote } from "@/lib/types";
import { packetTypeLabel, formatDateAU, formatCurrency } from "@/lib/formatters";
import PacketDetailDrawer from "@/components/PacketDetailDrawer";

type Tab = "orders" | "quotes" | "timeline" | "notes";

const TYPE_COLORS: Record<string, string> = {
  repair:        "bg-orange-100 text-orange-700",
  custom_order:  "bg-purple-100 text-purple-700",
  layby:         "bg-blue-100 text-blue-700",
  client_intake: "bg-teal-100 text-teal-700",
  online_order:  "bg-green-100 text-green-700",
};

const STAGE_COLORS: Record<string, string> = {
  pending:      "bg-gray-100 text-gray-600",
  follow_up_1:  "bg-amber-100 text-amber-700",
  follow_up_2:  "bg-orange-100 text-orange-700",
  job_won:      "bg-green-100 text-green-700",
  job_lost:     "bg-red-100 text-red-600",
};

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
    <div className={`flex flex-col items-center justify-center rounded-xl px-4 py-3 ${accent ? "bg-black text-white" : "bg-gray-50 border border-gray-200"}`}>
      <span className={`text-xl font-bold ${accent ? "text-white" : "text-gray-900"}`}>{value}</span>
      <span className={`text-xs font-medium mt-0.5 ${accent ? "text-white/70" : "text-gray-400"}`}>{label}</span>
    </div>
  );
}

function TabButton({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
        active
          ? "border-black text-black"
          : "border-transparent text-gray-400 hover:text-gray-700"
      }`}
    >
      {label}
      {count != null && count > 0 && (
        <span className={`text-xs rounded-full px-1.5 py-0.5 font-bold ${active ? "bg-black text-white" : "bg-gray-100 text-gray-600"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

export default function CustomerProfilePage({ params }: { params: { id: string } }) {
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
    fetch(`/api/customers/${encodeURIComponent(email)}`, { cache: "no-store" })
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
          headers: { "Content-Type": "application/json" },
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
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              {/* Initials circle */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-full bg-[#A3B2A4] flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                  {(customer?.first_name?.[0] ?? email[0] ?? "?").toUpperCase()}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{name}</h1>
                  <p className="text-sm text-gray-500">{email}</p>
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
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100 overflow-x-auto">
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
                    <tr className="text-left bg-gray-50 border-b border-gray-100">
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500">Reference</th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500">Type</th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500">Description</th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500">Due</th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500">Total</th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {packets.map((p) => {
                      const isOverdue = p.due_date && p.due_date < new Date().toISOString().split("T")[0] && !p.collected_date;
                      const status = p.collected_date ? "Collected" : isOverdue ? "Overdue" : "Active";
                      return (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedPacket(p)}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <td className="px-5 py-3 font-mono text-xs text-gray-500">{p.reference_number}</td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_COLORS[p.packet_type] ?? "bg-gray-100 text-gray-600"}`}>
                              {packetTypeLabel(p.packet_type)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-700 max-w-[200px] truncate">
                            {p.articles || p.instructions || "—"}
                          </td>
                          <td className={`px-5 py-3 text-sm ${isOverdue ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                            {formatDateAU(p.due_date) || "—"}
                          </td>
                          <td className="px-5 py-3 font-semibold text-gray-800">
                            {typeof p.total_charges === "number" ? formatCurrency(p.total_charges) : "—"}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                              status === "Collected" ? "bg-green-100 text-green-700" :
                              status === "Overdue"   ? "bg-red-100 text-red-600" :
                              "bg-gray-100 text-gray-600"
                            }`}>
                              {status}
                            </span>
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
                    <tr className="text-left bg-gray-50 border-b border-gray-100">
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500">Reference</th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500">Type</th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500">Notes</th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500">Stage</th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500">Assigned To</th>
                      <th className="px-5 py-3 text-xs font-semibold text-gray-500">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {quotes.map((q) => (
                      <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-gray-500">{q.reference_number}</td>
                        <td className="px-5 py-3 text-gray-700">{q.quote_type || "—"}</td>
                        <td className="px-5 py-3 text-gray-500 max-w-[200px] truncate">{q.notes || "—"}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STAGE_COLORS[q.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {(q.status ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-500">{q.assigned_to || q.staff_member || "—"}</td>
                        <td className="px-5 py-3 text-gray-400 text-xs">{formatDateAU(q.created_at?.split("T")[0])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Timeline tab ── */}
          {activeTab === "timeline" && (
            <div className="px-5 py-4">
              {timeline.length === 0 ? (
                <p className="py-10 text-center text-gray-400 text-sm">No history</p>
              ) : (
                <div className="relative">
                  {/* Vertical line */}
                  <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-100" />
                  <div className="space-y-4 pl-14">
                    {timeline.map((ev, i) => (
                      <div key={i} className="relative">
                        {/* Icon */}
                        <div className={`absolute -left-9 top-1 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                          ev.type === "order" ? "bg-black text-white" : "bg-[#A3B2A4] text-white"
                        }`}>
                          {ev.type === "order" ? "📦" : "💬"}
                        </div>
                        <div className="bg-white border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-900">{ev.label}</span>
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  ev.type === "order"
                                    ? (ev.status === "Collected" ? "bg-green-100 text-green-700" : ev.status === "Overdue" ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600")
                                    : (STAGE_COLORS[ev.status] ?? "bg-gray-100 text-gray-600")
                                }`}>
                                  {ev.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                </span>
                                <span className="font-mono text-xs text-gray-300">{ev.ref}</span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ev.description}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {ev.amount != null && (
                                <p className="text-sm font-bold text-gray-900">{formatCurrency(ev.amount)}</p>
                              )}
                              <p className="text-xs text-gray-400">{formatDateAU(ev.date.split("T")[0])}</p>
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
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Staff Notes</label>
                {notesSaving && <span className="text-xs text-gray-400 animate-pulse">Saving…</span>}
              </div>
              <textarea
                rows={8}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  saveNotes(e.target.value);
                }}
                placeholder="Add notes about this customer — preferences, history, anything relevant for future visits…"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-colors resize-none"
              />
              <p className="text-xs text-gray-400 mt-2">Notes save automatically. Visible to all staff.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
