"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Packet, Quote } from "@/lib/types";
import { packetTypeLabel, formatDateAU, formatCurrency } from "@/lib/formatters";

interface Customer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  notes: string | null;
  referral_source: string | null;
  total_orders: number;
  total_spend: number;
  last_visit_date: string | null;
  created_at: string;
}

export default function CustomerProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/customers/${params.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        setCustomer(json.customer ?? null);
        setPackets(json.packets ?? []);
        setQuotes(json.quotes ?? []);
        setNotes(json.customer?.notes ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  async function saveNotes(value: string) {
    if (!customer) return;
    setNotesSaving(true);
    try {
      await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      });
    } finally {
      setNotesSaving(false);
    }
  }

  function handleNotesChange(value: string) {
    setNotes(value);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => saveNotes(value), 1500);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-24 text-gray-400">
        <p>Customer not found.</p>
        <button onClick={() => router.push("/customers")} className="mt-4 text-sm text-[#A3B2A4] hover:underline">
          Back to Customers
        </button>
      </div>
    );
  }

  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Unknown";
  const address = [customer.address, customer.suburb, customer.state, customer.postcode].filter(Boolean).join(", ");
  const avgOrderValue = packets.length > 0
    ? packets.reduce((sum, p) => sum + (p.total_charges ?? 0), 0) / packets.length
    : 0;
  const typeCount: Record<string, number> = {};
  packets.forEach((p) => { typeCount[p.packet_type] = (typeCount[p.packet_type] ?? 0) + 1; });
  const mostCommonType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push("/customers")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back to Customers
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-[#A3B2A4] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {customer.phone && (
                <p className="text-sm text-gray-500"><span className="font-medium text-gray-700">Phone:</span> {customer.phone}</p>
              )}
              {customer.email && (
                <p className="text-sm text-gray-500"><span className="font-medium text-gray-700">Email:</span> {customer.email}</p>
              )}
              {address && (
                <p className="text-sm text-gray-500"><span className="font-medium text-gray-700">Address:</span> {address}</p>
              )}
              {customer.referral_source && (
                <p className="text-sm text-gray-500"><span className="font-medium text-gray-700">Referred by:</span> {customer.referral_source}</p>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">{customer.total_orders}</p>
              <p className="text-xs text-gray-400">Orders</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(customer.total_spend)}</p>
              <p className="text-xs text-gray-400">Spend</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">{formatDateAU(customer.last_visit_date) || "—"}</p>
              <p className="text-xs text-gray-400">Last Visit</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Avg Order Value</p>
          <p className="text-xl font-bold text-gray-800">{formatCurrency(avgOrderValue)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Most Common Type</p>
          <p className="text-sm font-bold text-gray-800">{mostCommonType ? packetTypeLabel(mostCommonType) : "—"}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">First Visit</p>
          <p className="text-sm font-bold text-gray-800">{formatDateAU(customer.created_at?.split("T")[0]) || "—"}</p>
        </div>
      </div>

      {/* Order history */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-black">Order History ({packets.length})</h2>
        </div>
        {packets.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">No orders found for this customer</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Ref</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Type</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Date</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Due</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {packets.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{p.reference_number}</td>
                    <td className="px-5 py-3 text-gray-700">{packetTypeLabel(p.packet_type)}</td>
                    <td className="px-5 py-3 text-gray-500">{formatDateAU(p.created_at?.split("T")[0])}</td>
                    <td className="px-5 py-3 text-gray-500">{formatDateAU(p.due_date) || "—"}</td>
                    <td className="px-5 py-3 text-gray-700">{p.total_charges != null ? formatCurrency(p.total_charges) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quotes */}
      {quotes.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-black">Quotes ({quotes.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Ref</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Type</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {quotes.map((q) => (
                  <tr key={q.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{q.reference_number}</td>
                    <td className="px-5 py-3 text-gray-700 capitalize">{q.quote_type?.replace(/_/g, " ")}</td>
                    <td className="px-5 py-3 text-gray-500 capitalize">{q.status?.replace(/_/g, " ")}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{formatDateAU(q.created_at?.split("T")[0])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-black">Notes</h2>
          {notesSaving && <span className="text-xs text-gray-400">Saving…</span>}
        </div>
        <div className="p-5">
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Add notes about this customer…"
            rows={4}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#A3B2A4] resize-none"
          />
        </div>
      </div>
    </div>
  );
}
