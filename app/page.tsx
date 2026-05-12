"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Packet } from "@/lib/types";
import { packetTypeLabel, formatDateAU, formatCurrency } from "@/lib/formatters";

const TYPE_BADGE: Record<string, string> = {
  repair:        "ds-badge ds-badge-orange",
  custom_order:  "ds-badge ds-badge-violet",
  layby:         "ds-badge ds-badge-amber",
  client_intake: "ds-badge ds-badge-teal",
  online_order:  "ds-badge ds-badge-green",
};

function StatCard({
  label, value, sub, href, accentColor, accentGlow,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  accentColor?: string;
  accentGlow?: string;
}) {
  const inner = (
    <div
      className="ds-card"
      style={{
        padding: "18px 18px 16px",
        position: "relative",
        overflow: "hidden",
        transition: "transform .15s ease, border-color .15s",
        cursor: href ? "pointer" : "default",
      }}
      onMouseEnter={href ? (e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; } : undefined}
      onMouseLeave={href ? (e) => { (e.currentTarget as HTMLDivElement).style.transform = "none"; } : undefined}
    >
      {/* Accent bar */}
      <div style={{
        position: "absolute", inset: "0 0 auto 0", height: 2,
        background: accentColor ?? "var(--violet)",
        boxShadow: `0 0 12px ${accentGlow ?? "var(--violet-glow)"}`,
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: accentColor ?? "var(--violet)", boxShadow: `0 0 8px ${accentColor ?? "var(--violet)"}`, display: "inline-block" }} />
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text)" }}>{value}</div>
      {sub && <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link>;
  return inner;
}

function SkeletonCard() {
  return (
    <div className="ds-skeleton" style={{ height: 96, borderRadius: 12 }} />
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
  const dueToday = packets.filter((p) => p.due_date === today && p.collected_date == null).length;
  const overdueRepairs = packets.filter(
    (p) => p.packet_type === "repair" && p.due_date != null && p.due_date < today && p.collected_date == null
  ).length;
  const unprintedOnline = packets.filter((p) => p.packet_type === "online_order" && !p.label_printed).length;

  const recentOrders = [...packets]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in7DaysISO = in7Days.toISOString().split("T")[0];
  const upcoming = packets
    .filter((p) => p.due_date != null && p.due_date >= today && p.due_date <= in7DaysISO && p.collected_date == null)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  const overdue = packets
    .filter((p) => p.due_date != null && p.due_date < today && p.collected_date == null)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Page header */}
      <div className="ds-page-h">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back — here&apos;s what&apos;s happening today</p>
        </div>
        <div className="ds-page-h-actions">
          <Link href="/orders/new" className="ds-btn ds-btn-primary" style={{ textDecoration: "none" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            New Order
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 14, marginBottom: 24 }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Today's Orders" value={todaysOrders} sub="submitted today" href="/orders?filter=today"
              accentColor="var(--violet)" accentGlow="var(--violet-glow)" />
            <StatCard label="Due Today" value={dueToday} sub="awaiting collection" href="/orders?filter=due_today"
              accentColor={dueToday > 0 ? "var(--warning)" : "var(--text-dim)"}
              accentGlow={dueToday > 0 ? "rgba(245,158,11,0.3)" : "transparent"} />
            <StatCard label="Overdue" value={overdueRepairs} sub="past due date" href="/orders?filter=overdue"
              accentColor={overdueRepairs > 0 ? "var(--danger)" : "var(--text-dim)"}
              accentGlow={overdueRepairs > 0 ? "rgba(239,68,68,0.3)" : "transparent"} />
            <StatCard label="Unprinted Online" value={unprintedOnline} sub="need labels" href="/online?filter=unprinted"
              accentColor="var(--teal)" accentGlow="rgba(20,184,166,0.3)" />
            <StatCard label="Revenue MTD" value={revenueThisMonth != null ? formatCurrency(revenueThisMonth) : "—"} sub="month to date" href="/revenue"
              accentColor="var(--success)" accentGlow="rgba(34,197,94,0.3)" />
          </>
        )}
      </div>

      {/* Main content */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
        {/* Recent Orders */}
        <div className="ds-table-wrap">
          <div className="ds-card-h">
            <h3 style={{ margin: 0 }}>Recent Orders</h3>
            <Link href="/orders" className="ds-btn ds-btn-ghost ds-btn-sm" style={{ textDecoration: "none" }}>
              View all →
            </Link>
          </div>
          {loading ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
          ) : recentOrders.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No orders yet</div>
          ) : (
            <table className="ds-t">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Type</th>
                  <th>Customer</th>
                  <th>Due</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((p) => {
                  const customerName = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                  return (
                    <tr key={p.id} onClick={() => {}}>
                      <td><span className="ds-mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.reference_number}</span></td>
                      <td>
                        <span className={TYPE_BADGE[p.packet_type] ?? "ds-badge ds-badge-muted"}>
                          {packetTypeLabel(p.packet_type)}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500, color: "var(--text)" }}>{customerName}</td>
                      <td style={{ color: "var(--text-2)" }}>{formatDateAU(p.due_date) || "—"}</td>
                      <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDateAU(p.created_at?.split("T")[0]) || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Overdue */}
          {!loading && overdue.length > 0 && (
            <div className="ds-card" style={{ overflow: "hidden", borderColor: "rgba(239,68,68,0.25)" }}>
              <div className="ds-card-h" style={{ borderColor: "rgba(239,68,68,0.15)" }}>
                <h3 style={{ color: "#FCA5A5", margin: 0 }}>Overdue ({overdue.length})</h3>
                <span className="ds-badge ds-badge-red" style={{ marginLeft: "auto" }}>{overdue.length}</span>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {overdue.slice(0, 5).map((p) => {
                  const name = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                  return (
                    <li key={p.id} style={{ padding: "10px 16px", borderBottom: "1px solid rgba(239,68,68,0.08)" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--danger)", marginTop: 2 }}>
                        {packetTypeLabel(p.packet_type)} · Due {formatDateAU(p.due_date)}
                      </div>
                    </li>
                  );
                })}
                {overdue.length > 5 && (
                  <li style={{ padding: "8px 16px", fontSize: 12, color: "var(--text-muted)" }}>+{overdue.length - 5} more overdue</li>
                )}
              </ul>
            </div>
          )}

          {/* Due this week */}
          <div className="ds-card" style={{ overflow: "hidden" }}>
            <div className="ds-card-h">
              <h3 style={{ margin: 0 }}>Due This Week</h3>
              {upcoming.length > 0 && <span className="ds-badge ds-badge-amber">{upcoming.length}</span>}
            </div>
            {loading ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
            ) : upcoming.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nothing due this week ✓</div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {upcoming.map((p) => {
                  const name = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                  return (
                    <li key={p.id} style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                        {packetTypeLabel(p.packet_type)} · Due {formatDateAU(p.due_date)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Quick actions */}
          <div className="ds-card ds-card-pad">
            <div style={{ fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-dim)", fontWeight: 600, marginBottom: 12 }}>Quick Actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Link href="/orders/new" className="ds-btn ds-btn-primary" style={{ textDecoration: "none", width: "100%", justifyContent: "center" }}>
                New Order
              </Link>
              <Link href="/quote" className="ds-btn ds-btn-secondary" style={{ textDecoration: "none", width: "100%", justifyContent: "center" }}>
                New Quote
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
