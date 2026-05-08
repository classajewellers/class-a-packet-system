"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import NavBar from "@/components/NavBar";

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split("T")[0];
}
function startOfMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
}
function startOfLastMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0];
}
function endOfLastMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];
}
function startOfWeekISO() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Mon start
  return new Date(now.getFullYear(), now.getMonth(), diff).toISOString().split("T")[0];
}

function formatCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
}

function formatDateLabel(iso: string) {
  const [, m, d] = iso.split("-");
  return `${parseInt(d)} ${["", "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)]}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DayRow {
  date: string;
  count: number;
  revenue: number;
  avg: number;
}

interface SummaryRow {
  id: string;
  created_at: string;
  reference_number: string;
  packet_type: string;
  total_charges: number;
  customer_first_name: string | null;
  customer_last_name: string | null;
}

interface RevenueData {
  summary: {
    totalRevenue: number;
    orderCount: number;
    avgOrderValue: number;
    largestOrder: number;
  };
  daily: DayRow[];
  rows: SummaryRow[];
}

const TYPE_OPTIONS = [
  { value: "all",          label: "All Types" },
  { value: "repair",       label: "Repair" },
  { value: "custom_order", label: "Custom Order" },
  { value: "online_order", label: "Online Order" },
];

const PACKET_TYPE_LABELS: Record<string, string> = {
  repair:       "Repair",
  custom_order: "Custom Order",
  online_order: "Online Order",
  layby:        "Layby",
  client_intake: "Client Intake",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function RevenuePage() {
  const [from, setFrom]     = useState(startOfMonthISO());
  const [to, setTo]         = useState(todayISO());
  const [type, setType]     = useState("all");
  const [data, setData]     = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ from, to, type });
      const res = await fetch(`/api/revenue?${p}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load revenue data");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [from, to, type]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function applyQuick(preset: "today" | "week" | "month" | "last_month") {
    if (preset === "today")      { setFrom(todayISO());          setTo(todayISO()); }
    if (preset === "week")       { setFrom(startOfWeekISO());    setTo(todayISO()); }
    if (preset === "month")      { setFrom(startOfMonthISO());   setTo(todayISO()); }
    if (preset === "last_month") { setFrom(startOfLastMonthISO()); setTo(endOfLastMonthISO()); }
  }

  const inputClass = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black";
  const s = data?.summary;

  return (
    <>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── Page header ── */}
        <div>
          <h1 className="text-2xl font-bold text-black">Revenue</h1>
          <p className="text-sm text-gray-500 mt-0.5">Completed orders with charges recorded</p>
        </div>

        {/* ── Filters ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
          {/* Quick buttons */}
          <div className="flex flex-wrap gap-2">
            {([
              { label: "Today",      preset: "today" },
              { label: "This Week",  preset: "week" },
              { label: "This Month", preset: "month" },
              { label: "Last Month", preset: "last_month" },
            ] as const).map(({ label, preset }) => (
              <button
                key={preset}
                onClick={() => applyQuick(preset)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
          {/* Inputs */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={inputClass}
                title="From date"
              />
              <span className="text-gray-400 text-sm">to</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={inputClass}
                title="To date"
              />
            </div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={inputClass}
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Loading / Error ── */}
        {loading && (
          <div className="text-center py-12 text-gray-400">
            <svg className="w-8 h-8 mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm">Loading…</p>
          </div>
        )}
        {error && !loading && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {!loading && !error && data && (
          <>
            {/* ── Summary cards ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Total Revenue",    value: formatCurrency(s?.totalRevenue ?? 0) },
                { label: "Orders",           value: String(s?.orderCount ?? 0) },
                { label: "Avg Order Value",  value: formatCurrency(s?.avgOrderValue ?? 0) },
                { label: "Largest Order",    value: formatCurrency(s?.largestOrder ?? 0) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                  <p className="text-2xl font-bold text-black leading-none">{value}</p>
                </div>
              ))}
            </div>

            {/* ── Bar chart ── */}
            {data.daily.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-black mb-4">Daily Revenue</h2>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.daily} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDateLabel}
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11 }}
                      width={48}
                    />
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any) => [formatCurrency(Number(value ?? 0)), "Revenue"]}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      labelFormatter={(label: any) => formatDateLabel(String(label ?? ""))}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="revenue" fill="#000000" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* ── Day-by-day table ── */}
            {data.daily.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-black">Day-by-Day Breakdown</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-left">
                        <th className="px-4 py-3 font-semibold text-black">Date</th>
                        <th className="px-4 py-3 font-semibold text-black text-right">Orders</th>
                        <th className="px-4 py-3 font-semibold text-black text-right">Revenue</th>
                        <th className="px-4 py-3 font-semibold text-black text-right">Avg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.daily.map((row) => (
                        <tr key={row.date} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-black font-medium">{formatDateLabel(row.date)}</td>
                          <td className="px-4 py-3 text-gray-600 text-right">{row.count}</td>
                          <td className="px-4 py-3 text-black font-semibold text-right">{formatCurrency(row.revenue)}</td>
                          <td className="px-4 py-3 text-gray-600 text-right">{formatCurrency(row.avg)}</td>
                        </tr>
                      ))}
                      {/* Totals row */}
                      <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                        <td className="px-4 py-3 text-black">Total</td>
                        <td className="px-4 py-3 text-black text-right">{s?.orderCount ?? 0}</td>
                        <td className="px-4 py-3 text-black text-right">{formatCurrency(s?.totalRevenue ?? 0)}</td>
                        <td className="px-4 py-3 text-black text-right">{formatCurrency(s?.avgOrderValue ?? 0)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Empty state ── */}
            {data.daily.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <p className="text-sm">No orders with charges found for this period.</p>
              </div>
            )}

            {/* ── Order rows ── */}
            {data.rows.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-black">{data.rows.length} Orders</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-left">
                        <th className="px-4 py-3 font-semibold text-black whitespace-nowrap">Reference</th>
                        <th className="px-4 py-3 font-semibold text-black">Customer</th>
                        <th className="px-4 py-3 font-semibold text-black">Type</th>
                        <th className="px-4 py-3 font-semibold text-black whitespace-nowrap">Date</th>
                        <th className="px-4 py-3 font-semibold text-black text-right whitespace-nowrap">Total (incl. GST)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.rows.map((row) => {
                        const name = [row.customer_first_name, row.customer_last_name].filter(Boolean).join(" ") || "—";
                        const date = new Date(row.created_at).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
                        return (
                          <tr key={row.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs text-black">{row.reference_number}</td>
                            <td className="px-4 py-3 text-black">{name}</td>
                            <td className="px-4 py-3 text-gray-600">{PACKET_TYPE_LABELS[row.packet_type] ?? row.packet_type}</td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{date}</td>
                            <td className="px-4 py-3 text-black font-semibold text-right">{formatCurrency(row.total_charges)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
