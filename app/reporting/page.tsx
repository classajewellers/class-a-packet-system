"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, ReactNode, Component } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { hasPermission, canSeeCosts } from "@/lib/userTypes";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return Number(n).toFixed(1) + "%";
}
function fmtDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${parseInt(d)} ${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parseInt(m)]}`;
}
function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csv = [headers, ...rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`))]
    .map((r) => r.join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.getFullYear(), now.getMonth(), diff).toISOString().split("T")[0];
}
function startOfYearISO() {
  return `${new Date().getFullYear()}-01-01`;
}

const COLORS = ["#635BFF", "#06B6D4", "#F59E0B", "#10B981", "#EF4444", "#8B5CF6"];

const PACKET_TYPE_LABELS: Record<string, string> = {
  repair: "Repair",
  custom_order: "Custom Order",
  online_order: "Online Order",
  layby: "Layby",
  client_intake: "Client Intake",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  follow_up_1: "Follow Up 1",
  follow_up_2: "Follow Up 2",
  job_won: "Won",
  job_lost: "Lost",
};

// ── Shared components ─────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: number | null;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E8E8F0",
        borderLeft: "3px solid #635BFF",
        borderRadius: 12,
        padding: 20,
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 500, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#1A1A2E", lineHeight: 1 }}>{value}</div>
      {delta != null && (
        <div style={{ marginTop: 6, fontSize: 12, color: delta >= 0 ? "#10B981" : "#EF4444", display: "flex", alignItems: "center", gap: 2 }}>
          <span>{delta >= 0 ? "▲" : "▼"}</span>
          <span>{Number(Math.abs(delta)).toFixed(1)}% vs prior period</span>
        </div>
      )}
      {sub && <div style={{ marginTop: 4, fontSize: 12, color: "#9CA3AF" }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children, height = 240 }: { title: string; children: ReactNode; height?: number }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A2E", marginBottom: 16 }}>{title}</div>
      <ResponsiveContainer width="100%" height={height}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

function SectionTable({
  title,
  headers,
  rows,
  onExport,
  renderCell,
}: {
  title: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  onExport?: () => void;
  renderCell?: (val: string | number | null | undefined, colIdx: number, rowIdx: number) => ReactNode;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #E8E8F0" }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#1A1A2E" }}>{title}</span>
        {onExport && (
          <button
            onClick={onExport}
            style={{
              padding: "6px 14px",
              background: "#F9FAFB",
              border: "1px solid #E8E8F0",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              color: "#6B7280",
              cursor: "pointer",
            }}
          >
            Export CSV
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No data</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#6B7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      background: "#F9FAFB",
                      textAlign: "left",
                      borderBottom: "1px solid #E8E8F0",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr
                  key={ri}
                  style={{ background: ri % 2 === 0 ? "#fff" : "#F9FAFB" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#EEF2FF"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ri % 2 === 0 ? "#fff" : "#F9FAFB"; }}
                >
                  {row.map((cell, ci) => (
                    <td key={ci} style={{ padding: "11px 16px", fontSize: 14, color: "#1A1A2E", borderBottom: "1px solid #E8E8F0" }}>
                      {renderCell ? renderCell(cell, ci, ri) : String(cell ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 64 }}>
      <svg style={{ width: 32, height: 32, animation: "spin 1s linear infinite" }} fill="none" viewBox="0 0 24 24">
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="#635BFF" strokeWidth="4" />
        <path style={{ opacity: 0.75 }} fill="#635BFF" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ padding: 64, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>{message}</div>
  );
}

// ── Debug panel ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DebugPanel({ data, section, start, end }: { data: any; section: string; start: string; end: string }) {
  const [open, setOpen] = useState(false);
  const meta = data?._meta;
  const keys = data ? Object.keys(data).filter(k => k !== '_meta') : [];
  const arraySizes = keys.reduce((acc: Record<string, number>, k) => {
    if (Array.isArray(data[k])) acc[k] = data[k].length;
    return acc;
  }, {});

  return (
    <div style={{ border: "1px solid #FDE68A", borderRadius: 12, overflow: "hidden", background: "#FFFBEB" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          color: "#92400E",
          textAlign: "left",
        }}
      >
        <span>🔍 Debug Info (manager only)</span>
        <span style={{ fontSize: 10, opacity: 0.7 }}>{open ? "▲ collapse" : "▼ expand"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px", fontSize: 12, color: "#78350F" }}>
          <div style={{ marginBottom: 8 }}>
            <strong>Section:</strong> {section} &nbsp;|&nbsp;
            <strong>Range:</strong> {start} → {end} &nbsp;|&nbsp;
            <strong>Records:</strong> {meta?.recordCount ?? "unknown"}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Response keys:</strong> {keys.join(", ") || "none"}
          </div>
          {Object.keys(arraySizes).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <strong>Array lengths:</strong>{" "}
              {Object.entries(arraySizes).map(([k, v]) => `${k}: ${v}`).join(", ")}
            </div>
          )}
          {data?.summary && (
            <div style={{ marginBottom: 8 }}>
              <strong>Summary:</strong>
              <pre style={{ margin: "4px 0 0", padding: 8, background: "#FEF3C7", borderRadius: 6, fontSize: 11, overflowX: "auto" }}>
                {JSON.stringify(data.summary, null, 2)}
              </pre>
            </div>
          )}
          <div>
            <strong>First record preview:</strong>
            {keys.map(k => Array.isArray(data[k]) && data[k].length > 0 ? (
              <div key={k} style={{ marginTop: 6 }}>
                <span style={{ fontWeight: 600 }}>{k}[0]:</span>
                <pre style={{ margin: "2px 0 0", padding: 6, background: "#FEF3C7", borderRadius: 4, fontSize: 10, overflowX: "auto" }}>
                  {JSON.stringify(data[k][0], null, 2)}
                </pre>
              </div>
            ) : null)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Error boundary ────────────────────────────────────────────────────────────

class SectionErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode; onRetry: () => void }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[reporting] Section render error:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: "center", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#DC2626", marginBottom: 8 }}>Section failed to render</div>
          <div style={{ fontSize: 12, color: "#DC2626", marginBottom: 16, fontFamily: "monospace" }}>{String(this.state.error)}</div>
          <button
            onClick={() => { this.setState({ error: null }); this.props.onRetry(); }}
            style={{ padding: "8px 20px", background: "#EF4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Section renderers ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SalesSection({ data, start, end }: { data: any; start: string; end: string }) {
  if (!data) return <EmptyState message={`No sales data between ${start} and ${end}.`} />;
  const s = data.summary ?? {};
  const daily: unknown[] = data.daily ?? [];
  const byType: unknown[] = data.byType ?? [];
  const byStaff: unknown[] = data.byStaff ?? [];
  const topOrders: unknown[] = data.topOrders ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPI row */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <KpiCard label="Total Revenue" value={fmtCurrency(s.totalRevenue ?? 0)} delta={s.revChange ?? null} />
        <KpiCard label="Orders" value={s.orderCount ?? 0} delta={s.orderChange ?? null} />
        <KpiCard label="Avg Order Value" value={fmtCurrency(s.avgOrderValue ?? 0)} />
        <KpiCard
          label="vs Prior Period"
          value={s.revChange != null ? (s.revChange >= 0 ? `+${fmtPct(s.revChange)}` : fmtPct(s.revChange)) : "N/A"}
          sub={`Prior: ${fmtCurrency(s.priorRevenue ?? 0)}`}
          delta={s.revChange ?? null}
        />
      </div>

      {/* Revenue by day */}
      {daily.length > 0 && (
        <ChartCard title="Revenue by Day">
          <BarChart data={daily} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              tickFormatter={(v: any) => `$${(Number(v) / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11 }}
              width={48}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [fmtCurrency(Number(value ?? 0)), "Revenue"]}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(label: any) => fmtDate(String(label ?? ""))}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="revenue" fill="#635BFF" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
      )}

      {/* Revenue by type + by staff */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {byType.length > 0 && (
          <ChartCard title="Revenue by Type" height={260}>
            <PieChart>
              <Pie data={byType} dataKey="revenue" nameKey="type" cx="50%" cy="45%" innerRadius={50} outerRadius={90}>
                {byType.map((_: unknown, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [fmtCurrency(Number(value ?? 0)), PACKET_TYPE_LABELS[String(name)] ?? name]}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => PACKET_TYPE_LABELS[value] ?? value}
                iconSize={10}
                wrapperStyle={{ fontSize: 12 }}
              />
            </PieChart>
          </ChartCard>
        )}
        {byStaff.length > 0 && (
          <ChartCard title="Revenue by Staff" height={260}>
            <BarChart data={byStaff} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <YAxis dataKey="staff" type="category" width={100} tick={{ fontSize: 11 }} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => [fmtCurrency(Number(value ?? 0)), "Revenue"]}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="revenue" fill="#635BFF" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ChartCard>
        )}
      </div>

      {/* Top orders table */}
      <SectionTable
        title="Top 10 Orders"
        headers={["Reference", "Customer", "Type", "Staff", "Total", "Date"]}
        rows={(topOrders as { reference_number: string; customer: string; type: string; staff: string; total: number; date: string }[]).map((o) => [
          o.reference_number,
          o.customer,
          PACKET_TYPE_LABELS[o.type] ?? o.type,
          o.staff,
          fmtCurrency(o.total ?? 0),
          o.date,
        ])}
        onExport={() =>
          downloadCSV(
            "top-orders.csv",
            ["Reference", "Customer", "Type", "Staff", "Total", "Date"],
            (topOrders as { reference_number: string; customer: string; type: string; staff: string; total: number; date: string }[]).map((o) => [
              o.reference_number,
              o.customer,
              o.type,
              o.staff,
              o.total ?? 0,
              o.date,
            ])
          )
        }
      />
      <DebugPanel data={data} section="sales" start={start} end={end} />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OrdersSection({ data, start, end }: { data: any; start: string; end: string }) {
  if (!data) return <EmptyState message={`No order data between ${start} and ${end}.`} />;
  const s = data.summary ?? {};
  const daily: unknown[] = data.daily ?? [];
  const byType: unknown[] = data.byType ?? [];
  const overdue: unknown[] = data.overdue ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <KpiCard label="Total Created" value={s.totalCreated ?? 0} />
        <KpiCard label="Overdue Count" value={s.overdueCount ?? 0} sub="past due date, unprinted" />
        <KpiCard label="Avg Turnaround" value={`${Math.round(s.avgTurnaround ?? 0)}d`} sub="created → due date" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {daily.length > 0 && (
          <ChartCard title="Orders by Day">
            <LineChart data={daily} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} width={32} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                labelFormatter={(label: any) => fmtDate(String(label ?? ""))}
                contentStyle={{ fontSize: 12 }}
              />
              <Line type="monotone" dataKey="count" stroke="#635BFF" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartCard>
        )}
        {byType.length > 0 && (
          <ChartCard title="Orders by Type">
            <BarChart data={byType} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="type"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                tickFormatter={(v: any) => PACKET_TYPE_LABELS[v] ?? v}
                tick={{ fontSize: 11 }}
              />
              <YAxis tick={{ fontSize: 11 }} width={32} />
              <Tooltip
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any) => [value, "Orders"]}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                labelFormatter={(label: any) => PACKET_TYPE_LABELS[label] ?? label}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="count" fill="#635BFF" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartCard>
        )}
      </div>

      <SectionTable
        title={`Overdue Orders (${overdue.length})`}
        headers={["Reference", "Customer", "Type", "Due Date", "Days Overdue"]}
        rows={(overdue as { reference_number: string; customer: string; type: string; due_date: string; days_overdue: number }[]).map((o) => [
          o.reference_number,
          o.customer,
          PACKET_TYPE_LABELS[o.type] ?? o.type,
          o.due_date,
          o.days_overdue,
        ])}
        renderCell={(val, ci) => {
          if (ci === 4) {
            const n = Number(val);
            const color = n > 7 ? "#EF4444" : n > 3 ? "#F59E0B" : "#1A1A2E";
            return <span style={{ color, fontWeight: n > 3 ? 600 : 400 }}>{n}</span>;
          }
          return String(val ?? "—");
        }}
        onExport={() =>
          downloadCSV(
            "overdue-orders.csv",
            ["Reference", "Customer", "Type", "Due Date", "Days Overdue"],
            (overdue as { reference_number: string; customer: string; type: string; due_date: string; days_overdue: number }[]).map((o) => [
              o.reference_number,
              o.customer,
              o.type,
              o.due_date,
              o.days_overdue,
            ])
          )
        }
      />
      <DebugPanel data={data} section="orders" start={start} end={end} />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WorkshopSection({ data, start, end }: { data: any; start: string; end: string }) {
  if (!data) return <EmptyState message={`No workshop data between ${start} and ${end}.`} />;
  const { summary: s, byJeweller, byStage, overdue } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <KpiCard label="Active Jobs" value={s?.totalActive ?? 0} />
        <KpiCard label="Completed in Period" value={s?.completedInPeriod ?? 0} />
        <KpiCard label="Overdue" value={s?.overdueCount ?? 0} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {byJeweller?.length > 0 && (
          <ChartCard title="Active Jobs per Jeweller">
            <BarChart data={byJeweller} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="jeweller" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={32} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="count" fill="#635BFF" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartCard>
        )}
        {byStage?.length > 0 && (
          <ChartCard title="Jobs by Stage" height={Math.max(200, (byStage?.length ?? 0) * 44)}>
            <BarChart data={byStage} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <YAxis dataKey="stage" type="category" width={110} tick={{ fontSize: 11 }} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="count" fill="#06B6D4" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ChartCard>
        )}
      </div>

      <SectionTable
        title={`Overdue Workshop Jobs (${overdue?.length ?? 0})`}
        headers={["Reference", "Customer", "Jeweller", "Stage", "Due Date", "Days Overdue"]}
        rows={(overdue ?? []).map((o: { reference_number: string; customer_surname: string; jeweller: string; stage: string; due_date: string; days_overdue: number }) => [
          o.reference_number,
          o.customer_surname,
          o.jeweller,
          o.stage,
          o.due_date,
          o.days_overdue,
        ])}
        onExport={() =>
          downloadCSV(
            "overdue-workshop.csv",
            ["Reference", "Customer", "Jeweller", "Stage", "Due Date", "Days Overdue"],
            (overdue ?? []).map((o: { reference_number: string; customer_surname: string; jeweller: string; stage: string; due_date: string; days_overdue: number }) => [
              o.reference_number,
              o.customer_surname,
              o.jeweller,
              o.stage,
              o.due_date,
              o.days_overdue,
            ])
          )
        }
      />
      <DebugPanel data={data} section="workshop" start={start} end={end} />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function QuotesSection({ data, start, end }: { data: any; start: string; end: string }) {
  if (!data) return <EmptyState message={`No quotes data between ${start} and ${end}.`} />;
  const s = data.summary ?? {};
  const byStatus: unknown[] = data.byStatus ?? [];
  const byStaff: unknown[] = data.byStaff ?? [];
  const pipeline: unknown[] = data.pipeline ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <KpiCard label="Total Created" value={s.totalCreated ?? 0} />
        <KpiCard label="Won" value={s.wonCount ?? 0} />
        <KpiCard label="Conversion Rate" value={fmtPct(s.conversionRate ?? 0)} />
        <KpiCard label="Pipeline Value" value={fmtCurrency(s.totalPipelineValue ?? 0)} />
      </div>

      {byStatus?.length > 0 && (
        <ChartCard title="Quotes by Status" height={260}>
          <PieChart>
            <Pie data={byStatus} dataKey="count" nameKey="status" cx="50%" cy="45%" innerRadius={50} outerRadius={90}>
              {byStatus.map((_: unknown, i: number) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: any) => [value, STATUS_LABELS[String(name)] ?? name]}
              contentStyle={{ fontSize: 12 }}
            />
            <Legend
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => STATUS_LABELS[value] ?? value}
              iconSize={10}
              wrapperStyle={{ fontSize: 12 }}
            />
          </PieChart>
        </ChartCard>
      )}

      {byStaff?.length > 0 && (
        <ChartCard title="Conversion Rate by Staff" height={Math.max(200, (byStaff?.length ?? 0) * 50)}>
          <BarChart data={byStaff} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <YAxis dataKey="staff" type="category" width={100} tick={{ fontSize: 11 }} />
            <XAxis type="number" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [fmtPct(Number(value ?? 0)), "Conversion Rate"]}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="rate" fill="#10B981" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ChartCard>
      )}

      <SectionTable
        title={`Pipeline (${pipeline.length})`}
        headers={["Reference", "Customer", "Staff", "Status", "Value", "Date"]}
        rows={(pipeline as { reference_number: string; customer: string; staff: string; status: string; value: number; date: string }[]).map((o) => [
          o.reference_number,
          o.customer,
          o.staff,
          STATUS_LABELS[o.status] ?? o.status,
          fmtCurrency(o.value ?? 0),
          o.date,
        ])}
        onExport={() =>
          downloadCSV(
            "quotes-pipeline.csv",
            ["Reference", "Customer", "Staff", "Status", "Value", "Date"],
            (pipeline as { reference_number: string; customer: string; staff: string; status: string; value: number; date: string }[]).map((o) => [
              o.reference_number,
              o.customer,
              o.staff,
              o.status,
              o.value,
              o.date,
            ])
          )
        }
      />
      <DebugPanel data={data} section="quotes" start={start} end={end} />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomersSection({ data, start, end }: { data: any; start: string; end: string }) {
  const [inactiveTab, setInactiveTab] = useState<"90" | "180" | "365">("90");

  if (!data) return <EmptyState message={`No customer data between ${start} and ${end}.`} />;
  const s = data.summary ?? {};
  const topCustomers: unknown[] = data.topCustomers ?? [];
  const inactive90: unknown[] = data.inactive90 ?? [];
  const inactive180: unknown[] = data.inactive180 ?? [];
  const inactive365: unknown[] = data.inactive365 ?? [];

  const inactiveData = inactiveTab === "90" ? inactive90 : inactiveTab === "180" ? inactive180 : inactive365;
  const inactiveLabel = `${inactiveTab}d inactive`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <KpiCard label="New in Period" value={s.newInPeriod ?? 0} />
        <KpiCard label="Returning in Period" value={s.returningInPeriod ?? 0} />
        <KpiCard label="Active (90d)" value={s.activeCustomers ?? 0} sub="visited in last 90 days" />
        <KpiCard label="Total Customers" value={s.totalCustomers ?? 0} />
      </div>

      <SectionTable
        title="Top 20 Customers by Spend"
        headers={["Name", "Email", "Phone", "Orders", "Total Spend", "Last Visit"]}
        rows={(topCustomers as { name: string; email: string; phone: string; total_orders: number; total_spend: number; last_visit_date: string }[]).map((c) => [
          c.name,
          c.email ?? "—",
          c.phone ?? "—",
          c.total_orders ?? 0,
          fmtCurrency(c.total_spend ?? 0),
          c.last_visit_date ?? "—",
        ])}
        onExport={() =>
          downloadCSV(
            "top-customers.csv",
            ["Name", "Email", "Phone", "Orders", "Total Spend", "Last Visit"],
            (topCustomers as { name: string; email: string; phone: string; total_orders: number; total_spend: number; last_visit_date: string }[]).map((c) => [
              c.name,
              c.email,
              c.phone,
              c.total_orders,
              c.total_spend,
              c.last_visit_date,
            ])
          )
        }
      />

      {/* Inactive tabs */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #E8E8F0" }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#1A1A2E" }}>Inactive Customers</span>
          <div style={{ display: "flex", gap: 4 }}>
            {(["90", "180", "365"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setInactiveTab(t)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 8,
                  border: "1px solid #E8E8F0",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  background: inactiveTab === t ? "#635BFF" : "#F9FAFB",
                  color: inactiveTab === t ? "#fff" : "#6B7280",
                }}
              >
                {t}d
              </button>
            ))}
          </div>
        </div>
        {inactiveData.length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No inactive customers ({inactiveLabel})</div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Name", "Email", "Phone", "Last Visit", "Total Spend"].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "10px 16px",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "#6B7280",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          background: "#F9FAFB",
                          textAlign: "left",
                          borderBottom: "1px solid #E8E8F0",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(inactiveData as { name: string; email: string; phone: string; last_visit_date: string; total_spend: number }[]).map((c, ri) => (
                    <tr
                      key={ri}
                      style={{ background: ri % 2 === 0 ? "#fff" : "#F9FAFB" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#EEF2FF"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ri % 2 === 0 ? "#fff" : "#F9FAFB"; }}
                    >
                      <td style={{ padding: "11px 16px", fontSize: 14, color: "#1A1A2E", borderBottom: "1px solid #E8E8F0" }}>{c.name}</td>
                      <td style={{ padding: "11px 16px", fontSize: 14, color: "#1A1A2E", borderBottom: "1px solid #E8E8F0" }}>{c.email ?? "—"}</td>
                      <td style={{ padding: "11px 16px", fontSize: 14, color: "#1A1A2E", borderBottom: "1px solid #E8E8F0" }}>{c.phone ?? "—"}</td>
                      <td style={{ padding: "11px 16px", fontSize: 14, color: "#1A1A2E", borderBottom: "1px solid #E8E8F0" }}>{c.last_visit_date ?? "—"}</td>
                      <td style={{ padding: "11px 16px", fontSize: 14, color: "#1A1A2E", borderBottom: "1px solid #E8E8F0" }}>{fmtCurrency(c.total_spend ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 20px", borderTop: "1px solid #E8E8F0", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() =>
                  downloadCSV(
                    `inactive-${inactiveTab}d.csv`,
                    ["Name", "Email", "Phone", "Last Visit", "Total Spend"],
                    (inactiveData as { name: string; email: string; phone: string; last_visit_date: string; total_spend: number }[]).map((c) => [
                      c.name,
                      c.email,
                      c.phone,
                      c.last_visit_date,
                      c.total_spend,
                    ])
                  )
                }
                style={{
                  padding: "6px 14px",
                  background: "#F9FAFB",
                  border: "1px solid #E8E8F0",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#6B7280",
                  cursor: "pointer",
                }}
              >
                Export CSV
              </button>
            </div>
          </>
        )}
      </div>
      <DebugPanel data={data} section="customers" start={start} end={end} />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StaffSection({ data, start, end }: { data: any; start: string; end: string }) {
  if (!data) return <EmptyState message={`No staff data between ${start} and ${end}.`} />;
  const performance: unknown[] = data.performance ?? [];

  if (performance.length === 0) {
    return <EmptyState message={`No staff data between ${start} and ${end}.`} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {performance.length > 0 && (
        <ChartCard title="Revenue by Staff">
          <BarChart data={performance} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="staff" tick={{ fontSize: 11 }} />
            <YAxis
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              tickFormatter={(v: any) => `$${(Number(v) / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11 }}
              width={48}
            />
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => [fmtCurrency(Number(value ?? 0)), "Revenue"]}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="revenueGenerated" fill="#635BFF" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
      )}

      <SectionTable
        title="Staff Performance"
        headers={["Staff", "Orders", "Revenue", "Quotes Created", "Quotes Won", "Conversion Rate"]}
        rows={(performance as { staff: string; ordersCreated: number; revenueGenerated: number; quotesCreated: number; quotesWon: number; conversionRate: number }[]).map((p) => [
          p.staff,
          p.ordersCreated ?? 0,
          fmtCurrency(p.revenueGenerated ?? 0),
          p.quotesCreated ?? 0,
          p.quotesWon ?? 0,
          fmtPct(p.conversionRate ?? 0),
        ])}
        onExport={() =>
          downloadCSV(
            "staff-performance.csv",
            ["Staff", "Orders", "Revenue", "Quotes Created", "Quotes Won", "Conversion Rate"],
            (performance as { staff: string; ordersCreated: number; revenueGenerated: number; quotesCreated: number; quotesWon: number; conversionRate: number }[]).map((p) => [
              p.staff,
              p.ordersCreated ?? 0,
              p.revenueGenerated ?? 0,
              p.quotesCreated ?? 0,
              p.quotesWon ?? 0,
              fmtPct(p.conversionRate ?? 0),
            ])
          )
        }
      />
      <DebugPanel data={data} section="staff" start={start} end={end} />
    </div>
  );
}

function InventorySection() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 64 }}>
      <div
        style={{
          background: "#fff",
          border: "1px solid #E8E8F0",
          borderRadius: 16,
          padding: 48,
          textAlign: "center",
          maxWidth: 400,
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            background: "#F3F4F6",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
            <line x1="12" y1="12" x2="12" y2="16" />
            <line x1="10" y1="14" x2="14" y2="14" />
          </svg>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A2E", marginBottom: 8 }}>Inventory Reporting</div>
        <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
          Inventory reporting will be available once stock management is connected.
        </div>
      </div>
    </div>
  );
}

// ── Purchase Cashflow Widget ──────────────────────────────────────────────────

interface CashflowData {
  weeks: { week_start: string; week_end: string; total: number; count: number }[];
  overdue: { total: number; count: number };
  later: { total: number; count: number };
  unscheduled: { total: number; count: number };
  coverage: { total_pending_lines: number; scheduled_lines: number; unscheduled_lines: number };
}

function fmtCcy(n: number): string {
  return "$" + n.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtWeekLabel(start: string, end: string): string {
  const [, sm, sd] = start.split("-");
  const [, em, ed] = end.split("-");
  return `${sd}/${sm} – ${ed}/${em}`;
}

function PoCashflowWidget({ data }: { data: CashflowData | null | "loading" }) {
  if (data === "loading") {
    return (
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E8E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: "#1A1A2E" }}>Purchase Cashflow Forecast</span>
        </div>
        <div style={{ padding: "24px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  if (!data) return null;

  const { weeks, overdue, later, unscheduled, coverage } = data;
  const hasPendingSpend = coverage.total_pending_lines > 0;
  const unscheduledPct  = coverage.total_pending_lines > 0
    ? Math.round((coverage.unscheduled_lines / coverage.total_pending_lines) * 100)
    : 0;

  const rows: { label: string; sublabel?: string; total: number; count: number; alert?: boolean; muted?: boolean }[] = [];
  if (overdue.count > 0) {
    rows.push({ label: "Overdue", sublabel: "expected date passed", total: overdue.total, count: overdue.count, alert: true });
  }
  for (const w of weeks) {
    rows.push({ label: fmtWeekLabel(w.week_start, w.week_end), total: w.total, count: w.count, muted: w.count === 0 });
  }
  if (later.count > 0) {
    rows.push({ label: "Later (8+ wks)", total: later.total, count: later.count });
  }
  if (unscheduled.count > 0) {
    rows.push({ label: "Unscheduled", sublabel: "no expected date set", total: unscheduled.total, count: unscheduled.count });
  }

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #E8E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 15, color: "#1A1A2E" }}>Purchase Cashflow Forecast</span>
          <span style={{ marginLeft: 10, fontSize: 12, color: "#9CA3AF" }}>pending uninvoiced lines by PO expected date</span>
        </div>
        <Link href="/inventory/purchase-orders" style={{ textDecoration: "none", color: "#635BFF", fontSize: 13, fontWeight: 500 }}>
          View POs →
        </Link>
      </div>

      {!hasPendingSpend ? (
        <div style={{ padding: "24px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No pending purchase spend</div>
      ) : (
        <>
          {unscheduledPct >= 50 && (
            <div style={{ padding: "10px 20px", background: "#FFFBEB", borderBottom: "1px solid #FDE68A", fontSize: 12, color: "#92400E" }}>
              {unscheduledPct}% of pending lines have no expected date — forecast accuracy is limited. Set expected delivery dates on POs to improve this view.
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  <th style={{ padding: "8px 20px", textAlign: "left", fontWeight: 600, color: "#6B7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Period</th>
                  <th style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600, color: "#6B7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Lines</th>
                  <th style={{ padding: "8px 20px", textAlign: "right", fontWeight: 600, color: "#6B7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Est. Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.label}
                    style={{ borderTop: "1px solid #F3F4F6", background: row.alert ? "#FEF2F2" : "transparent" }}
                  >
                    <td style={{ padding: "10px 20px", color: row.muted ? "#D1D5DB" : row.alert ? "#7F1D1D" : "#1A1A2E" }}>
                      {row.label}
                      {row.sublabel && <span style={{ fontSize: 11, color: row.alert ? "#EF4444" : "#9CA3AF", marginLeft: 6 }}>{row.sublabel}</span>}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right", color: row.muted ? "#D1D5DB" : "#6B7280" }}>
                      {row.count > 0 ? row.count : "—"}
                    </td>
                    <td style={{ padding: "10px 20px", textAlign: "right", fontFamily: "monospace", fontWeight: row.count > 0 ? 600 : 400, color: row.muted ? "#D1D5DB" : row.alert ? "#DC2626" : "#111827" }}>
                      {row.count > 0 ? fmtCcy(row.total) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid #E8E8F0", background: "#F9FAFB" }}>
                  <td style={{ padding: "10px 20px", fontWeight: 700, color: "#1A1A2E", fontSize: 13 }}>Total pending</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#374151", fontSize: 13 }}>{coverage.total_pending_lines}</td>
                  <td style={{ padding: "10px 20px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: "#111827", fontSize: 14 }}>{fmtCcy(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: string; label: string; disabled?: boolean; costGated?: boolean }[] = [
  { id: "sales", label: "Sales & Revenue" },
  { id: "orders", label: "Orders & Jobs" },
  { id: "workshop", label: "Workshop" },
  { id: "quotes", label: "Quotes & Pipeline" },
  { id: "customers", label: "Customers" },
  { id: "staff", label: "Staff Performance" },
  { id: "inventory", label: "Inventory", disabled: true },
  { id: "cashflow", label: "Purchase Cashflow", costGated: true },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReportingPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "reporting")) router.replace("/");
  }, [user, hydrated, router]);

  const [section, setSection] = useState("sales");
  const [start, setStart] = useState(startOfMonthISO());
  const [end, setEnd] = useState(todayISO());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cashflow, setCashflow] = useState<CashflowData | null | "loading">("loading");

  const fetchData = useCallback(async () => {
    if (section === "inventory" || section === "cashflow") {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const url = `/api/reporting?section=${section}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
      console.log('[reporting page] fetching section:', section, 'start:', start, 'end:', end);
      console.log('[reporting page] API URL:', url);
      const res = await fetch(url, { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      console.log('[reporting page] response status:', res.status);
      const json = await res.json();
      console.log('[reporting page] response data keys:', Object.keys(json));
      if (!res.ok) throw new Error(json.error ?? "Failed to load data");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [section, start, end]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (section !== "cashflow") return;
    setCashflow("loading");
    fetch("/api/inventory/purchase-cashflow", {
      cache: "no-store",
      headers: { "x-tenant-id": user?.tenantId ?? "" },
    })
      .then(r => r.json())
      .then(json => setCashflow(json.error ? null : json))
      .catch(() => setCashflow(null));
  }, [section, user?.tenantId]);

  function applyQuick(preset: string) {
    if (preset === "today") { setStart(todayISO()); setEnd(todayISO()); }
    if (preset === "week") { setStart(startOfWeekISO()); setEnd(todayISO()); }
    if (preset === "month") { setStart(startOfMonthISO()); setEnd(todayISO()); }
    if (preset === "last_month") { setStart(startOfLastMonthISO()); setEnd(endOfLastMonthISO()); }
    if (preset === "year") { setStart(startOfYearISO()); setEnd(todayISO()); }
  }

  if (user && !hasPermission(user, "reporting")) return null;

  const QUICK_BTNS = [
    { label: "Today", preset: "today" },
    { label: "This Week", preset: "week" },
    { label: "This Month", preset: "month" },
    { label: "Last Month", preset: "last_month" },
    { label: "This Year", preset: "year" },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1300, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Reporting</h1>
        <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>Business insights and analytics</p>
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Sub-nav */}
        <div
          style={{
            width: 200,
            minWidth: 200,
            background: "#fff",
            border: "1px solid #E8E8F0",
            borderRadius: 12,
            overflow: "hidden",
            padding: "8px 0",
          }}
        >
          {NAV_ITEMS.map((item) => {
            if (item.costGated && !canSeeCosts(user)) return null;
            const active = section === item.id && !item.disabled;
            return (
              <button
                key={item.id}
                onClick={() => { if (!item.disabled) setSection(item.id); }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 16px",
                  background: active ? "#EEF2FF" : "transparent",
                  borderLeft: active ? "3px solid #635BFF" : "3px solid transparent",
                  border: "none",
                  borderLeftWidth: 3,
                  borderLeftStyle: "solid",
                  borderLeftColor: active ? "#635BFF" : "transparent",
                  color: item.disabled ? "#9CA3AF" : active ? "#635BFF" : "#1A1A2E",
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  cursor: item.disabled ? "not-allowed" : "pointer",
                  opacity: item.disabled ? 0.5 : 1,
                  transition: "background .15s",
                }}
                onMouseEnter={(e) => {
                  if (!item.disabled && !active) (e.currentTarget as HTMLButtonElement).style.background = "#F9FAFB";
                }}
                onMouseLeave={(e) => {
                  if (!item.disabled && !active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Date range selector — not shown for sections with no date context */}
          {section !== "cashflow" && <div
            style={{
              background: "#fff",
              border: "1px solid #E8E8F0",
              borderRadius: 12,
              padding: "14px 16px",
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {QUICK_BTNS.map(({ label, preset }) => (
                <button
                  key={preset}
                  onClick={() => applyQuick(preset)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    background: "#F9FAFB",
                    color: "#6B7280",
                    border: "1px solid #E8E8F0",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "#EEF2FF";
                    (e.currentTarget as HTMLButtonElement).style.color = "#635BFF";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "#F9FAFB";
                    (e.currentTarget as HTMLButtonElement).style.color = "#6B7280";
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                style={{ border: "1px solid #E8E8F0", borderRadius: 8, background: "#fff", height: 36, fontSize: 13, padding: "0 10px", color: "#1A1A2E", outline: "none" }}
              />
              <span style={{ color: "#6B7280", fontSize: 12 }}>to</span>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                style={{ border: "1px solid #E8E8F0", borderRadius: 8, background: "#fff", height: 36, fontSize: 13, padding: "0 10px", color: "#1A1A2E", outline: "none" }}
              />
            </div>
          </div>}

          {/* Section content */}
          {loading && <LoadingState />}
          {error && !loading && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: 16, color: "#DC2626", fontSize: 14 }}>
              <strong>Error loading {section}:</strong> {error}
              <div style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF" }}>
                Check the server terminal for detailed logs.
              </div>
            </div>
          )}

          {/* Record count banner — always visible after a successful fetch */}
          {!loading && !error && data && section !== "inventory" && section !== "cashflow" && (
            <div style={{
              background: (data._meta?.recordCount ?? 0) === 0 ? "#FFFBEB" : "#F0FDF4",
              border: `1px solid ${(data._meta?.recordCount ?? 0) === 0 ? "#FDE68A" : "#BBF7D0"}`,
              borderRadius: 10,
              padding: "8px 14px",
              fontSize: 12,
              color: (data._meta?.recordCount ?? 0) === 0 ? "#92400E" : "#166534",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span>
                {(data._meta?.recordCount ?? 0) === 0
                  ? `⚠ No records found for "${section}" between ${start} and ${end}. Try widening the date range.`
                  : `✓ ${data._meta?.recordCount} record${data._meta?.recordCount !== 1 ? "s" : ""} found between ${start} and ${end}`}
              </span>
              {(data._meta?.recordCount ?? 0) === 0 && (
                <button
                  onClick={() => { setStart(startOfYearISO()); setEnd(todayISO()); }}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid #F59E0B",
                    background: "#FEF3C7",
                    color: "#92400E",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    marginLeft: 12,
                  }}
                >
                  Try This Year
                </button>
              )}
            </div>
          )}

          {!loading && !error && section !== "inventory" && section !== "cashflow" && (
            <SectionErrorBoundary onRetry={fetchData}>
              {section === "sales"     && <SalesSection     data={data} start={start} end={end} />}
              {section === "orders"    && <OrdersSection    data={data} start={start} end={end} />}
              {section === "workshop"  && <WorkshopSection  data={data} start={start} end={end} />}
              {section === "quotes"    && <QuotesSection    data={data} start={start} end={end} />}
              {section === "customers" && <CustomersSection data={data} start={start} end={end} />}
              {section === "staff"     && <StaffSection     data={data} start={start} end={end} />}
            </SectionErrorBoundary>
          )}
          {section === "inventory" && <InventorySection />}
          {section === "cashflow" && canSeeCosts(user) && <PoCashflowWidget data={cashflow} />}
        </div>
      </div>
    </div>
  );
}
