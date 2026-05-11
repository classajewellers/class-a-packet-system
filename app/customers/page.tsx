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
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, email, phone, or item description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 rounded-lg border border-gray-300 bg-white py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-xs font-semibold text-gray-400 hover:text-black transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Aggregated live from all orders and quotes. Search also matches item descriptions — try &ldquo;engagement ring&rdquo;.
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-black">
            {loading
              ? "Loading…"
              : `${customers.length} customer${customers.length !== 1 ? "s" : ""}${search ? ` matching "${search}"` : ""}`}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Name</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Phone</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Email</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 text-center">Orders</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 text-center">Quotes</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Last Visit</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Total Spend</th>
                <th className="px-5 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-400 text-sm">
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
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 font-semibold text-gray-900">{name}</td>
                      <td className="px-5 py-3 text-gray-500">{c.phone || "—"}</td>
                      <td className="px-5 py-3 text-gray-500 max-w-[200px] truncate">{c.email || "—"}</td>
                      <td className="px-5 py-3 text-center">
                        {c.total_orders > 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-black text-white text-xs font-bold">
                            {c.total_orders}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {c.total_quotes > 0 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#A3B2A4] text-white text-xs font-bold">
                            {c.total_quotes}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {formatDateAU(c.last_visit?.split("T")[0]) || "—"}
                      </td>
                      <td className="px-5 py-3 font-semibold text-gray-800">
                        {c.total_spend > 0 ? formatCurrency(c.total_spend) : "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-300">
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
