"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Packet, InventoryMovement, InventoryMovementType } from "@/lib/types";
import { useUser } from "@/context/UserContext";
import { packetTypeLabel, formatDateAU, formatCurrency } from "@/lib/formatters";

// ── Movement helpers ──────────────────────────────────────────────────────────
const MOVEMENT_BADGE: Record<InventoryMovementType, { bg: string; fg: string; label: string }> = {
  receive:      { bg: "#F0F0F0", fg: "#1A1A1A", label: "Receive" },
  transfer:     { bg: "#F0F0F0", fg: "#1A1A1A", label: "Transfer" },
  sale:         { bg: "#F2F2F2", fg: "#111111", label: "Sale" },
  return:       { bg: "#F0F0F0", fg: "#1A1A1A", label: "Return" },
  adjustment:   { bg: "#F5F5F5", fg: "#2A2A2A", label: "Adjustment" },
  workshop_in:  { bg: "#F5F5F5", fg: "#111111", label: "Workshop In" },
  workshop_out: { bg: "#F5F5F5", fg: "#1A1A1A", label: "Workshop Out" },
  stocktake:    { bg: "#F5F5F5", fg: "#1A1A1A", label: "Stocktake" },
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
  online_order:  { background: "#F0F0F0", color: "#1A1A1A" },
  repair:        { background: "#F0F0F0", color: "#1A1A1A" },
  repair_job:    { background: "#F0F0F0", color: "#1A1A1A" },
  custom_order:  { background: "#F2F2F2", color: "#111111" },
  layby:         { background: "#F0F0F0", color: "#1A1A1A" },
  client_intake: { background: "#F5F5F5", color: "#2A2A2A" },
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
        border: "1px solid #EAEAEA",
        borderRadius: 12,
        padding: 20,
        transition: "box-shadow .15s",
        cursor: href ? "pointer" : "default",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
    >
      <div style={{ fontSize: 12, fontWeight: 500, color: "#595959", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: "#0A0A0A", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ marginTop: 6, fontSize: 12, color: "#8A8A8A" }}>{sub}</div>}
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link>;
  return inner;
}

function SkeletonCard() {
  return (
    <div style={{ height: 96, borderRadius: 12, background: "#F5F5F5", animation: "pulse 1.5s infinite" }} />
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
  const { user } = useUser();
  const router = useRouter();
  const [packets, setPackets] = useState<Packet[]>([]);
  const [loading, setLoading] = useState(true);
  const [revenueThisMonth, setRevenueThisMonth] = useState<number | null>(null);
  const [lowStockCount, setLowStockCount] = useState<number | null>(null);
  const [recentMovements, setRecentMovements] = useState<InventoryMovement[]>([]);

  useEffect(() => {
    fetch("/api/admin/packets?limit=200", { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } })
      .then((r) => r.json())
      .then((json) => {
        setPackets(json.packets ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    const monthStart = startOfMonthISO();
    const today = todayISO();
    fetch(`/api/reporting?section=sales&start=${monthStart}&end=${today}`, { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } })
      .then((r) => r.json())
      .then((json) => {
        if (typeof json.totalRevenue === "number") setRevenueThisMonth(json.totalRevenue);
      })
      .catch(() => {});

    // Inventory: low stock count
    fetch("/api/inventory/items?lowstock=true", { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } })
      .then((r) => r.json())
      .then((json) => setLowStockCount((json.items ?? []).length))
      .catch(() => {});

    // Inventory: recent movements
    fetch("/api/inventory/movements?limit=5", { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } })
      .then((r) => r.json())
      .then((json) => setRecentMovements(json.movements ?? []))
      .catch(() => {});

  }, []);

  const today = todayISO();
  const todaysOrders    = packets.filter((p) => (p.created_at ?? "").startsWith(today)).length;
  const dueToday        = packets.filter((p) => p.due_date === today && p.collected_date == null).length;
  const ONLINE_SOURCES = ["shopify", "online"];
  const overdueRepairs  = packets.filter(
    (p) =>
      p.packet_type === "repair" &&
      p.due_date != null &&
      p.due_date < today &&
      p.collected_date == null &&
      !ONLINE_SOURCES.includes((p as any).order_source ?? "") &&
      (p as any).order_type !== "online"
  ).length;

  const recentOrders = [...packets]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in7DaysISO = in7Days.toISOString().split("T")[0];

  const upcoming = packets
    .filter((p) => p.due_date != null && p.due_date >= today && p.due_date <= in7DaysISO && p.collected_date == null)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

  // ── Shared styles ──────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #EAEAEA",
    borderRadius: 12,
    overflow: "hidden",
  };

  const thStyle: React.CSSProperties = {
    padding: "10px 16px",
    fontSize: 12,
    fontWeight: 500,
    color: "#595959",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    background: "#FFFFFF",
    textAlign: "left",
    borderBottom: "1px solid #EAEAEA",
  };

  const tdStyle: React.CSSProperties = {
    padding: "12px 16px",
    fontSize: 14,
    color: "#0A0A0A",
    borderBottom: "1px solid #EAEAEA",
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>

      {/* ── Header with action buttons ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginBottom: 20 }}>
        <Link
          href="/quotes/builder"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#111111", color: "#fff", height: 38, padding: "0 18px", borderRadius: 8, fontWeight: 500, fontSize: 14 }}
        >
          New Quote
        </Link>
        <Link
          href="/orders/new"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#fff", color: "#0A0A0A", height: 38, padding: "0 18px", borderRadius: 8, fontWeight: 500, fontSize: 14, border: "1px solid #EAEAEA" }}
        >
          New Order
        </Link>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Today's Orders" value={todaysOrders}   sub="submitted today"     href="/orders?filter=today" />
            <StatCard label="Due Today"       value={dueToday}       sub="awaiting collection" href="/orders?filter=due_today" />
            <StatCard label="Overdue"         value={overdueRepairs} sub="past due date"       href="/orders?filter=overdue" />
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
              href="/inventory?lowstock=true"
            />
          </>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">

        {/* Recent Orders */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #EAEAEA" }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: "#0A0A0A" }}>Recent Orders</span>
            <Link href="/orders" style={{ textDecoration: "none", color: "#111111", fontSize: 13, fontWeight: 500 }}>
              View all →
            </Link>
          </div>
          {loading ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "#8A8A8A", fontSize: 13 }}>Loading…</div>
          ) : recentOrders.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center", color: "#8A8A8A", fontSize: 13 }}>No orders yet</div>
          ) : (
            <>
              {/* Mobile: stacked cards */}
              <div className="md:hidden divide-y divide-gray-100">
                {recentOrders.map((p) => {
                  const customerName = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                  const badgeStyle = { ...BADGE_BASE, ...(TYPE_BADGE_STYLE[p.packet_type] ?? { background: "#F5F5F5", color: "#2A2A2A" }) };
                  return (
                    <div
                      key={p.id}
                      onClick={() => router.push(`/orders?open=${encodeURIComponent(p.reference_number)}`)}
                      className="px-4 py-3 cursor-pointer active:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div style={{ fontWeight: 500, color: "#0A0A0A", fontSize: 14 }}>{customerName}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span style={badgeStyle}>{packetTypeLabel(p.packet_type)}</span>
                            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#8A8A8A" }}>{p.reference_number}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: "#595959", textAlign: "right", flexShrink: 0 }}>
                          <div>{formatDateAU(p.due_date) || "—"}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: full table */}
              <table style={{ width: "100%", borderCollapse: "collapse" }} className="hidden md:table">
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
                    const badgeStyle = { ...BADGE_BASE, ...(TYPE_BADGE_STYLE[p.packet_type] ?? { background: "#F5F5F5", color: "#2A2A2A" }) };
                    return (
                      <tr
                        key={p.id}
                        onClick={() => router.push(`/orders?open=${encodeURIComponent(p.reference_number)}`)}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "#FAFAFA"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                      >
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: "#595959" }}>{p.reference_number}</td>
                        <td style={tdStyle}>
                          <span style={badgeStyle}>{packetTypeLabel(p.packet_type)}</span>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 500 }}>{customerName}</td>
                        <td style={{ ...tdStyle, color: "#595959" }}>{formatDateAU(p.due_date) || "—"}</td>
                        <td style={{ ...tdStyle, fontSize: 12, color: "#8A8A8A" }}>{formatDateAU(p.created_at?.split("T")[0]) || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Due This Week */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #EAEAEA" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#0A0A0A" }}>Due This Week</span>
              {upcoming.length > 0 && (
                <span style={{ ...BADGE_BASE, background: "#F0F0F0", color: "#1A1A1A" }}>{upcoming.length}</span>
              )}
            </div>
            {loading ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "#8A8A8A", fontSize: 13 }}>Loading…</div>
            ) : upcoming.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "#8A8A8A", fontSize: 13 }}>Nothing due this week ✓</div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {upcoming.map((p) => {
                  const name = [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "—";
                  return (
                    <li key={p.id} style={{ padding: "10px 16px", borderBottom: "1px solid #EAEAEA" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0A0A0A" }}>{name}</div>
                      <div style={{ fontSize: 12, color: "#595959", marginTop: 2 }}>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #EAEAEA" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#0A0A0A" }}>Recent Movements</span>
              <Link href="/inventory" style={{ textDecoration: "none", color: "#111111", fontSize: 12, fontWeight: 500 }}>
                View all →
              </Link>
            </div>
            {recentMovements.length === 0 ? (
              <div style={{ padding: "20px 16px", textAlign: "center", color: "#8A8A8A", fontSize: 13 }}>No movements yet</div>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {recentMovements.map((m) => {
                  const cfg = (m.movement_type ? MOVEMENT_BADGE[m.movement_type] : null) ?? { bg: "#F5F5F5", fg: "#2A2A2A", label: m.movement_type ?? "move" };
                  return (
                    <li key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #EAEAEA" }}>
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: cfg.bg, color: cfg.fg, whiteSpace: "nowrap" }}>
                        {cfg.label}
                      </span>
                      <span style={{ flex: 1, fontSize: 13, color: "#0A0A0A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.item?.name ?? "—"}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#2A2A2A", whiteSpace: "nowrap" }}>
                        {(m.quantity ?? 0) > 0 ? `+${m.quantity}` : m.quantity ?? ""}
                      </span>
                      <span style={{ fontSize: 11, color: "#8A8A8A", whiteSpace: "nowrap" }}>
                        {timeAgo(m.created_at ?? m.moved_at ?? "")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Quick Actions */}
          <div style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: "#595959", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              Quick Actions
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Link
                href="/orders/new"
                style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", background: "#111111", color: "#fff", height: 36, borderRadius: 8, fontWeight: 500, fontSize: 14 }}
              >
                New Order
              </Link>
              <Link
                href="/quote"
                style={{ textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", background: "#F2F2F2", color: "#111111", height: 36, borderRadius: 8, fontWeight: 500, fontSize: 14 }}
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
