"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatDateAU, formatCurrency } from "@/lib/formatters";

interface CustomerRow {
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  total_orders: number;
  total_quotes: number;
  total_spend: number;
  last_visit: string;
  first_seen: string;
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-5 py-3">
          <div className="h-4 bg-gray-100 rounded w-20" />
        </td>
      ))}
    </tr>
  );
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchCustomers = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (q) p.set("search", q);
      const res = await fetch(`/api/customers?${p}`, { cache: "no-store" });
      const json = await res.json();
      setCustomers(json.customers ?? []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchCustomers]);

  function openProfile(email: string) {
    router.push(`/customers/${encodeURIComponent(email)}`);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Search bar */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderRadius: 12, padding: 16 }}>
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, email, phone, or item description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: 36, paddingRight: 12, border: '1px solid #E8E8F0', borderRadius: 8, background: '#fff', height: 40, fontSize: 14, color: '#1A1A2E', outline: 'none' }}
            />
          </div>
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              Clear
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
          Aggregated live from all orders and quotes. Search also matches item descriptions — try &ldquo;engagement ring&rdquo;.
        </p>
      </div>

      {/* Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #E8E8F0' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', margin: 0 }}>
            {loading
              ? "Loading…"
              : `${customers.length} customer${customers.length !== 1 ? "s" : ""}${search ? ` matching "${search}"` : ""}`}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid #E8E8F0', background: '#F9FAFB' }}>
                {['Name','Phone','Email','Orders','Quotes','Last Visit','Total Spend',''].map((h, i) => (
                  <th key={i} style={{ padding: '12px 20px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: ['Orders','Quotes'].includes(h) ? 'center' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px 20px', textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
                    {search
                      ? `No customers found matching "${search}"`
                      : "No customer records yet. Submit an order or quote to create customer records."}
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
                  return (
                    <tr
                      key={c.email}
                      onClick={() => openProfile(c.email)}
                      style={{ borderBottom: '1px solid #E8E8F0', cursor: 'pointer', transition: 'background .12s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 20px', fontWeight: 600, color: '#1A1A2E' }}>{name}</td>
                      <td style={{ padding: '12px 20px', color: '#6B7280' }}>{c.phone || "—"}</td>
                      <td style={{ padding: '12px 20px', color: '#6B7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email || "—"}</td>
                      <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                        {c.total_orders > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: '#635BFF', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                            {c.total_orders}
                          </span>
                        ) : (
                          <span style={{ color: '#D1D5DB' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                        {c.total_quotes > 0 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: '#EEF2FF', color: '#635BFF', fontSize: 12, fontWeight: 700 }}>
                            {c.total_quotes}
                          </span>
                        ) : (
                          <span style={{ color: '#D1D5DB' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 20px', color: '#6B7280' }}>
                        {formatDateAU(c.last_visit?.split("T")[0]) || "—"}
                      </td>
                      <td style={{ padding: '12px 20px', fontWeight: 600, color: '#1A1A2E' }}>
                        {c.total_spend > 0 ? formatCurrency(c.total_spend) : "—"}
                      </td>
                      <td style={{ padding: '12px 20px', color: '#D1D5DB' }}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
