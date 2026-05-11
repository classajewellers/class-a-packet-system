"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatDateAU, formatCurrency } from "@/lib/formatters";

interface Customer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  total_orders: number;
  total_spend: number;
  last_visit_date: string | null;
}

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      const res = await fetch(`/api/customers?${p}`, { cache: "no-store" });
      const json = await res.json();
      setCustomers(json.customers ?? []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(fetchCustomers, 300);
    return () => clearTimeout(timer);
  }, [fetchCustomers]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, email, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 rounded-lg border border-gray-300 bg-white py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-black">
            {loading ? "Loading…" : `${customers.length} customer${customers.length !== 1 ? "s" : ""}`}
          </h2>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
          ) : customers.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              {search ? "No customers found" : "No customer records yet. Customers are created from packet data."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Name</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Phone</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Email</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Total Orders</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Last Visit</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Total Spend</th>
                  <th className="px-5 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {customers.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/customers/${c.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 font-medium text-gray-800">{name}</td>
                      <td className="px-5 py-3 text-gray-500">{c.phone || "—"}</td>
                      <td className="px-5 py-3 text-gray-500">{c.email || "—"}</td>
                      <td className="px-5 py-3 text-gray-700 font-medium">{c.total_orders}</td>
                      <td className="px-5 py-3 text-gray-500">{formatDateAU(c.last_visit_date) || "—"}</td>
                      <td className="px-5 py-3 text-gray-700 font-medium">{formatCurrency(c.total_spend)}</td>
                      <td className="px-5 py-3 text-gray-300">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
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
  );
}
