"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatDateAU, formatCurrency } from "@/lib/formatters";
import { useUser } from "@/context/UserContext";
import { hasPermission } from "@/lib/userTypes";

interface CustomerRow {
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  total_orders: number;
  non_repair_orders: number;
  total_quotes: number;
  total_spend: number;
  non_repair_spend: number;
  last_visit: string;
  first_seen: string;
}

function getVipTier(spend: number, nonRepairOrders: number) {
  if (spend >= 30000 || nonRepairOrders >= 20) return { tier: "Argyle",   color: "#E11D48", bg: "#FFF1F2" };
  if (spend >= 20000 || nonRepairOrders >= 15) return { tier: "Diamond",  color: "#0891B2", bg: "#ECFEFF" };
  if (spend >= 15000 || nonRepairOrders >= 10) return { tier: "Platinum", color: "#4F46E5", bg: "#EEF2FF" };
  if (spend >= 10000 || nonRepairOrders >= 6)  return { tier: "Gold",     color: "#D97706", bg: "#FFFBEB" };
  if (spend >= 5000  || nonRepairOrders >= 3)  return { tier: "Silver",   color: "#6B7280", bg: "#F3F4F6" };
  return null;
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
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "customers")) router.replace("/");
  }, [user, hydrated, router]);

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchCustomers = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (q) p.set("search", q);
      const res = await fetch(`/api/customers?${p}`, { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
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
        {/* Mobile: stacked cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {loading ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: '#6B7280', fontSize: 14 }}>Loading…</div>
          ) : customers.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: '#6B7280', fontSize: 14 }}>
              {search ? `No customers found matching "${search}"` : "No customer records yet."}
            </div>
          ) : customers.map((c) => {
            const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
            const mTier = getVipTier(c.non_repair_spend ?? 0, c.non_repair_orders ?? 0);
            return (
              <div
                key={c.email}
                onClick={() => openProfile(c.email)}
                className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer active:bg-gray-50"
              >
                <div className="min-w-0">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, color: '#1A1A2E', fontSize: 14 }}>{name}</span>
                    {mTier && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: mTier.bg, color: mTier.color, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{mTier.tier}</span>}
                  </div>
                  <div style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{c.phone || c.email || "—"}</div>
                  <div style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                    Last visit: {formatDateAU(c.last_visit?.split("T")[0]) || "—"}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {c.total_spend > 0 && (
                    <span style={{ fontWeight: 600, color: '#1A1A2E', fontSize: 14 }}>{formatCurrency(c.total_spend)}</span>
                  )}
                  <svg className="w-4 h-4" fill="none" stroke="#D1D5DB" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
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
                  const dTier = getVipTier(c.non_repair_spend ?? 0, c.non_repair_orders ?? 0);
                  return (
                    <tr
                      key={c.email}
                      onClick={() => openProfile(c.email)}
                      style={{ borderBottom: '1px solid #E8E8F0', cursor: 'pointer', transition: 'background .12s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 20px', fontWeight: 600, color: '#1A1A2E' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {name}
                          {dTier && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: dTier.bg, color: dTier.color, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{dTier.tier}</span>}
                        </div>
                      </td>
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
