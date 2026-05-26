"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import Link from "next/link";
import { Packet, InventoryMovement, InventoryMovementType } from "@/lib/types";
import { packetTypeLabel, formatDateAU, formatCurrency } from "@/lib/formatters";

// ── Movement helpers ──────────────────────────────────────────────────────────
const MOVEMENT_BADGE: Record<InventoryMovementType, { bg: string; fg: string; label: string }> = {
  receive:      { bg: "#DCFCE7", fg: "#166534", label: "Receive" },
  transfer:     { bg: "#DBEAFE", fg: "#1E40AF", label: "Transfer" },
  sale:         { bg: "#EEF2FF", fg: "#635BFF", label: "Sale" },
  return:       { bg: "#FEF3C7", fg: "#92400E", label: "Return" },
  adjustment:   { bg: "#F3F4F6", fg: "#374151", label: "Adjustment" },
  workshop_in:  { bg: "#FDF4FF", fg: "#7E22CE", label: "Workshop In" },
  workshop_out: { bg: "#FFF7ED", fg: "#9A3412", label: "Workshop Out" },
  stocktake:    { bg: "#F0FDF4", fg: "#166534", label: "Stocktake" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Vault badge styles by packet type ────────────────────────────────────────
const TYPE_BADGE_STYLE: Record<string, React.CSSProperties> = {
  online_order:  { background: "#DCFCE7", color: "#166534" },
  repair:        { background: "#DBEAFE", color: "#1E40AF" },
  repair_job:    { background: "#DBEAFE", color: "#1E40AF" },
  custom_order:  { background: "#EEF2FF", color: "#635BFF" },
  layby:         { background: "#FEF3C7", color: "#92400E" },
  client_intake: { background: "#F3F4F6", color: "#374151" },
};

const BADGE_BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 500,
};

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E8E8F0",
        borderRadius: 12,
        padding: 20,
        transition: "box-shadow .15s",
        cursor: href ? "pointer" : "default",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: "#1A1A2E", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ marginTop: 6, fontSize: 12, color: "#9CA3AF" }}>{sub}</div>}
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link>;
  return inner;
}

function SkeletonCard() {
  return (
    <div style={{ height: 96, borderRadius: 12, background: "#F3F4F6", animation: "pulse 1.5s infinite" }} />
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
  const [lowStockCount, setLowStockCount] = useState<number | null>(null);
  const [recentMovements, setRecentMovements] = useState<InventoryMovement[]>([]);

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

    // Inventory: low stock count
    fetch("/api/inventory/items?lowstock=true", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setLowStockCount((json.items ?? []).length))
      .catch(() => {});

    // Inventory: recent movements
    fetch("/api/inventory/movements?limit=5", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setRecentMovements(json.movements ?? []))
      .catch(() => {});
  }, []);

  const today = todayISO();
  const todaysOrders    = packets.filter((p) => (p.created_at ?? "").startsWith(today)).length;
  const dueToday        = packets.filter((p) => p.due_date === today && p.collected_date == null).length;
  const overdueRepairs  = packets.filter(
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

  // ── Shared styles ──────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #E8E8F0",
    borderRadius: 12,
    overflow: "hidden",
  };

  const thStyle: React.CSSProperties = {
    padding: "10px 16px",
    fontSize: 12,
    fontWeight: 500,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    background: "#F9FAFB",
    textAlign: "left",
    borderBottom: "1px solid #E8E8F0",
  };

  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    fontSize: 14,
    color: "#1A1A2E",
    borderBottom: "1px solid #E8E8F0",
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>

      {/* ── Stat cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 14, marginBottom: 24 }}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Today's Orders"   value={todaysOrders}    sub="submitted today"     href="/orders?filter=today" />
            <StatCard label="Due Today"         value={dueToday}        sub="awaiting collection" href="/orders?filter=due_today" />
            <StatCard label="Overdue"           value={overdueRepairs}  sub="past due date"       href="/orders?filter=overdue" />
            <StatCard label="Unprinted Online"  value={unprintedOnline} sub="need labels"         href="/online?filter=unprinted" />
            <StatCard
              label="Revenue MTD"
              value={revenueThisMonth != null ? formatCurrency(revenueThisMonth) : "—"}
              sub="month to date"
              href="/reporting"
            />
            <StatCard
              label="Low Stock"
              value={lowStockCount ?? "—"}
              sub="items below reorder point"
              href="/inventory/stock?lowstock=true"
            />
          </>
        )}
      </div>

      {/* ── Main content ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>

        {/* Recent Orders */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #E8E8F0" }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: "#1A1A2E" }}>Recent Orders</span>
            <Link href="/orders" style={{ textDecoration: "none", color: "#635BFF", fontSize: 13, fontWeight: 500 }}>
              View all →
            </Link>
          </div>
          {loading ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
          ) : recentOrders.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No orders yet</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Ref</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Customer</th>
                  <th style={thStyle}>Due</th>
                  <th style={thStyle}>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((p) => {
                  const customerName = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                  const badgeStyle = { ...BADGE_BASE, ...(TYPE_BADGE_STYLE[p.packet_type] ?? { background: "#F3F4F6", color: "#374151" }) };
                  return (
                    <tr
                      key={p.id}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#F9FAFB"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                    >
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: "#6B7280" }}>{p.reference_number}</td>
                      <td style={tdStyle}>
                        <span style={badgeStyle}>{packetTypeLabel(p.packet_type)}</span>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{customerName}</td>
                      <td style={{ ...tdStyle, color: "#6B7280" }}>{formatDateAU(p.due_date) || "—"}</td>
                      <td style={{ ...tdStyle, fontSize: 12, color: "#9CA3AF" }}>{formatDateAU(p.created_at?.split("T")[0]) || "—"}</td>
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
            <div style={{ ...card }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #FEE2E2" }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: "#1A1A2E" }}>Overdue</span>
                <span style={{ ...BADGE_BASE, background: "#EF4444", color: "#fff" }}>{overdue.length}</span>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {overdue.slice(0, 5).map((p) => {
                  const name = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                  return (
                    <li key={p.id} style={{ padding: "10px 16px", borderBottom: "1px solid #E8E8F0" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A2E" }}>{name}</div>
                      <div style={{ fontSize: 12, color: "#EF4444", marginTop: 2 }}>
                        {packetTypeLabel(p.packet_type)} · Due {formatDateAU(p.due_date)}
                      </div>
                    </li>
                  );
                })}
                {overdue.length > 5 && (
                  <li style={{ padding: "8px 16px", fontSize: 12, color: "#9CA3AF" }}>+{overdue.length - 5} more overdue</li>
                )}
              </ul>
            </div>
          )}

          {/* Due This Week */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #E8E8F0" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#1A1A2E" }}>Due This Week</span>
              {upcoming.length > 0 && (
                <span style={{ ...BADGE_BASE, background: "#FEF3C7", color: "#92400E" }}>{upcoming.length}</span>
              )}
            </div>
            {loading ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
            ) : upcoming.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>Nothing due this week ✓</div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {upcoming.map((p) => {
                  const name = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                  return (
                    <li key={p.id} style={{ padding: "10px 16px", borderBottom: "1px solid #E8E8F0" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A2E" }}>{name}</div>
                      <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                        {packetTypeLabel(p.packet_type)} ·{" "}
                        <span style={{ color: "#EF4444" }}>Due {formatDateAU(p.due_date)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Recent Stock Movements */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #E8E8F0" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#1A1A2E" }}>Recent Movements</span>
              <Link href="/inventory/stock" style={{ textDecoration: "none", color: "#635BFF", fontSize: 12, fontWeight: 500 }}>
                View all →
              </Link>
            </div>
            {recentMovements.length === 0 ? (
              <div style={{ padding: "20px 16px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No movements yet</div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {recentMovements.map((m) => {
                  const cfg = MOVEMENT_BADGE[m.movement_type] ?? { bg: "#F3F4F6", fg: "#374151", label: m.movement_type };
                  return (
                    <li key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #E8E8F0" }}>
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: cfg.bg, color: cfg.fg, whiteSpace: "nowrap" }}>
                        {cfg.label}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, color: "#1A1A2E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.item?.name ?? "—"}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </span>
                      <span style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>
                        {timeAgo(m.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Quick Actions */}
          <div style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              Quick Actions
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Link
                href="/orders/new"
                style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", background: "#635BFF", color: "#fff", height: 36, borderRadius: 8, fontWeight: 500, fontSize: 14 }}
              >
                New Order
              </Link>
              <Link
                href="/quote"
                style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", background: "#EEF2FF", color: "#635BFF", height: 36, borderRadius: 8, fontWeight: 500, fontSize: 14 }}
              >
                New Quote
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
