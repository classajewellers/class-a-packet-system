"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Packet } from "@/lib/types";
import { packetTypeLabel, formatDateAU, formatCurrency } from "@/lib/formatters";

const TYPE_COLORS: Record<string, string> = {
  repair: "bg-orange-100 text-orange-700",
  custom_order: "bg-purple-100 text-purple-700",
  layby: "bg-blue-100 text-blue-700",
  client_intake: "bg-teal-100 text-teal-700",
  online_order: "bg-green-100 text-green-700",
};

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color ?? "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-24 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-16" />
    </div>
  );
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function startOfMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
}

export default function DashboardPage() {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [loading, setLoading] = useState(true);
  const [revenueThisMonth, setRevenueThisMonth] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/packets?limit=200", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        setPackets(json.packets ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Fetch revenue
    const monthStart = startOfMonthISO();
    const today = todayISO();
    fetch(`/api/revenue?from=${monthStart}&to=${today}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (typeof json.totalRevenue === "number") setRevenueThisMonth(json.totalRevenue);
        else if (Array.isArray(json.data)) {
          const total = json.data.reduce((sum: number, d: { revenue?: number }) => sum + (d.revenue ?? 0), 0);
          setRevenueThisMonth(total);
        }
      })
      .catch(() => {});
  }, []);

  const today = todayISO();

  const todaysOrders = packets.filter((p) => (p.created_at ?? "").startsWith(today)).length;
  const dueToday = packets.filter(
    (p) => p.due_date === today && p.collected_date == null
  ).length;
  const overdueRepairs = packets.filter(
    (p) =>
      p.packet_type === "repair" &&
      p.due_date != null &&
      p.due_date < today &&
      p.collected_date == null
  ).length;
  const unprintedOnline = packets.filter(
    (p) => p.packet_type === "online_order" && !p.label_printed
  ).length;

  // Recent 10 orders
  const recentOrders = [...packets].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 10);

  // Upcoming due: next 7 days (non-collected)
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in7DaysISO = in7Days.toISOString().split("T")[0];
  const upcoming = packets
    .filter(
      (p) =>
        p.due_date != null &&
        p.due_date >= today &&
        p.due_date <= in7DaysISO &&
        p.collected_date == null
    )
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const overdue = packets.filter(
    (p) => p.due_date != null && p.due_date < today && p.collected_date == null
  ).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Today's Orders" value={todaysOrders} sub="submitted today" />
            <StatCard
              label="Due Today"
              value={dueToday}
              sub="awaiting collection"
              color={dueToday > 0 ? "text-amber-600" : undefined}
            />
            <StatCard
              label="Overdue Repairs"
              value={overdueRepairs}
              sub="past due date"
              color={overdueRepairs > 0 ? "text-red-600" : undefined}
            />
            <StatCard
              label="Unprinted Online"
              value={unprintedOnline}
              sub="need labels"
              color={unprintedOnline > 0 ? "text-green-600" : undefined}
            />
            <StatCard
              label="Revenue This Month"
              value={revenueThisMonth != null ? formatCurrency(revenueThisMonth) : "—"}
              sub="month to date"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-black">Recent Orders</h2>
            <Link href="/orders" className="text-xs text-[#A3B2A4] font-semibold hover:underline">
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">Loading…</div>
            ) : recentOrders.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">No orders yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Ref</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Type</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Customer</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Due</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-gray-500">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentOrders.map((p) => {
                    const customerName = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{p.reference_number}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_COLORS[p.packet_type] ?? "bg-gray-100 text-gray-600"}`}>
                            {packetTypeLabel(p.packet_type)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{customerName}</td>
                        <td className="px-4 py-2.5 text-gray-500">{formatDateAU(p.due_date) || "—"}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{formatDateAU(p.created_at?.split("T")[0]) || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Upcoming + Overdue */}
        <div className="space-y-4">
          {/* Overdue */}
          {!loading && overdue.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-red-200">
                <h2 className="text-sm font-semibold text-red-700">Overdue ({overdue.length})</h2>
              </div>
              <ul className="divide-y divide-red-100">
                {overdue.slice(0, 5).map((p) => {
                  const name = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                  return (
                    <li key={p.id} className="px-5 py-2.5">
                      <p className="text-sm font-medium text-red-800">{name}</p>
                      <p className="text-xs text-red-600">{packetTypeLabel(p.packet_type)} · Due {formatDateAU(p.due_date)}</p>
                    </li>
                  );
                })}
                {overdue.length > 5 && (
                  <li className="px-5 py-2.5 text-xs text-red-400">+{overdue.length - 5} more overdue</li>
                )}
              </ul>
            </div>
          )}

          {/* Upcoming */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-black">Due This Week</h2>
            </div>
            {loading ? (
              <div className="px-5 py-6 text-center text-gray-400 text-sm">Loading…</div>
            ) : upcoming.length === 0 ? (
              <div className="px-5 py-6 text-center text-gray-400 text-sm">Nothing due this week</div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {upcoming.map((p) => {
                  const name = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                  return (
                    <li key={p.id} className="px-5 py-2.5">
                      <p className="text-sm font-medium text-gray-800">{name}</p>
                      <p className="text-xs text-gray-500">{packetTypeLabel(p.packet_type)} · Due {formatDateAU(p.due_date)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Quick links */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Quick Actions</p>
            <Link
              href="/orders/new"
              className="flex items-center gap-2 w-full bg-black text-white rounded-xl py-2.5 px-4 text-sm font-semibold hover:bg-[#222222] transition-colors"
            >
              <span>📦</span> New Order
            </Link>
            <Link
              href="/quote"
              className="flex items-center gap-2 w-full bg-[#A3B2A4] text-white rounded-xl py-2.5 px-4 text-sm font-semibold hover:bg-[#8fa090] transition-colors"
            >
              <span>💬</span> New Quote
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
