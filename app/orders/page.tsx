"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Packet, PacketType } from "@/lib/types";
import { getSupabaseClient } from "@/lib/supabase";
import { useUser } from "@/context/UserContext";
import { hasPermission } from "@/lib/userTypes";
import AdminTable from "@/components/AdminTable";
import PacketDetailDrawer from "@/components/PacketDetailDrawer";

type OrderFilter = "all" | "shopify" | "in-store" | "repair";
type UrlFilter   = "today" | "due_today" | "overdue" | null;

const ORDER_FILTERS: { value: OrderFilter; label: string }[] = [
  { value: "all",      label: "All Orders" },
  { value: "shopify",  label: "Shopify" },
  { value: "in-store", label: "In-Store" },
  { value: "repair",   label: "Repair" },
];

const PAGE_SIZE = 25;

function OrdersPageInner() {
  const { user, hydrated } = useUser();
  const canDelete = user?.role !== "staff";
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "orders")) router.replace("/");
  }, [user, hydrated, router]);

  const [packets, setPackets] = useState<Packet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [urlFilter, setUrlFilter] = useState<UrlFilter>(null);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  // Apply filter from URL param on mount
  useEffect(() => {
    const f = searchParams.get("filter");
    if (f === "today" || f === "due_today" || f === "overdue") {
      setUrlFilter(f);
    }
  }, [searchParams]);

  // Auto-open drawer when ?open=[reference_number] is in the URL
  useEffect(() => {
    const openRef = searchParams.get("open");
    if (!openRef || loading || packets.length === 0) return;
    const target = packets.find((p) => p.reference_number === openRef);
    if (target) setSelectedPacket(target);
  }, [searchParams, packets, loading]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchOrders = useCallback(async (params: { search?: string; from?: string; to?: string }) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (params.search) p.set("search", params.search);
      if (params.from)   p.set("from",   params.from);
      if (params.to)     p.set("to",     params.to);
      const res = await fetch(`/api/admin/packets?${p}`, { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setPackets(json.packets ?? []);
    } catch {
      setPackets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchOrders({ search, from, to }), 300);
    return () => clearTimeout(timer);
  }, [search, from, to, fetchOrders]);

  // Real-time subscriptions
  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseClient>;
    try {
      supabase = getSupabaseClient();
    } catch {
      return;
    }
    const channel = supabase
      .channel("orders-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "packets" }, (payload) => {
        const row = payload.new as Packet;
        setPackets((prev) => prev.some((p) => p.id === row.id) ? prev : [row, ...prev]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "packets" }, (payload) => {
        const row = payload.new as Packet;
        setPackets((prev) => prev.map((p) => p.id === row.id ? row : p));
        setSelectedPacket((cur) => cur?.id === row.id ? row : cur);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => { setSelectedIds(new Set()); setPage(1); }, [orderFilter]);
  useEffect(() => { setPage(1); }, [search, from, to, urlFilter]);

  function handleUpdate(updated: Packet) {
    setPackets((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setSelectedPacket(updated);
  }

  function handleDelete(id: string) {
    setPackets((prev) => prev.filter((p) => p.id !== id));
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    setSelectedPacket(null);
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} order${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => fetch(`/api/admin/packets/${id}`, { method: "DELETE", headers: { 'x-tenant-id': user?.tenantId ?? '' } })));
    setPackets((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
  }

  async function handleRetry(packetId: string, output: "klaviyo" | "email" | "sms" | "sheets" | "label") {
    const res = await fetch("/api/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
      body: JSON.stringify({ packetId, output }),
    });
    if (res.ok) fetchOrders({ search, from, to });
  }

  function handleExport() {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (from)   p.set("from",   from);
    if (to)     p.set("to",     to);
    window.open(`/api/admin/export?${p}`, "_blank");
  }

  const todayStr = new Date().toISOString().split("T")[0];

  const filteredPackets = useMemo(() => {
    return packets.filter((p) => {
      // URL-based filters take priority
      if (urlFilter === "today") {
        return (p.created_at ?? "").startsWith(todayStr);
      }
      if (urlFilter === "due_today") {
        return p.due_date === todayStr && p.collected_date == null;
      }
      if (urlFilter === "overdue") {
        return (p.packet_type === "repair" || p.packet_type === "custom_order") &&
          p.due_date != null && p.due_date < todayStr && p.collected_date == null;
      }
      // Normal type filters
      if (orderFilter === "shopify")  return p.packet_type === "online_order";
      if (orderFilter === "in-store") return p.packet_type !== "online_order";
      if (orderFilter === "all")      return true;
      return p.packet_type === orderFilter;
    });
  }, [packets, orderFilter, urlFilter, todayStr]);

  const unprintedShopify = useMemo(() =>
    packets.filter((p) => p.packet_type === "online_order" && !p.label_printed),
    [packets]
  );

  const totalPages  = Math.max(1, Math.ceil(filteredPackets.length / PAGE_SIZE));
  const pagedPackets = filteredPackets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      {selectedPacket && (
        <PacketDetailDrawer
          packet={selectedPacket}
          onClose={() => setSelectedPacket(null)}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
          onRetry={handleRetry}
        />
      )}

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Page header */}
        <div className="ds-page-h">
          <div>
            <h1>Orders</h1>
            <p>
              {loading ? "Loading…" : `${filteredPackets.length} order${filteredPackets.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="ds-page-h-actions">
            <button onClick={handleExport} className="ds-btn ds-btn-secondary">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export CSV
            </button>
            <button
              onClick={() => router.push("/orders/new")}
              className="ds-btn ds-btn-primary"
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Order
            </button>
          </div>
        </div>

        {/* URL filter banner */}
        {urlFilter && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "rgba(124,106,254,0.08)", border: "1px solid rgba(124,106,254,0.25)",
            borderRadius: 10, padding: "10px 16px", marginBottom: 16,
          }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-2)", margin: 0 }}>
              {urlFilter === "today"     && "Showing: Orders created today"}
              {urlFilter === "due_today" && "Showing: Orders due today"}
              {urlFilter === "overdue"   && "Showing: Overdue repairs & custom orders"}
            </p>
            <button onClick={() => setUrlFilter(null)} className="ds-btn ds-btn-ghost ds-btn-sm">
              Clear ×
            </button>
          </div>
        )}

        {/* Table wrap */}
        <div className="ds-table-wrap">
          {/* Search — full width, prominent */}
          <div style={{ padding: "16px 16px 0" }}>
            <div style={{ position: "relative" }}>
              <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name, reference, email or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ds-input"
                style={{ paddingLeft: 42, width: "100%", height: 40, fontSize: 14, boxSizing: "border-box" }}
              />
            </div>
          </div>

          {/* Filters + date range row */}
          <div className="ds-table-header" style={{ flexWrap: "wrap", gap: 10, paddingTop: 10 }}>
            <div className="ds-filters">
              {ORDER_FILTERS.map((f) => {
                const isActive  = orderFilter === f.value;
                const isShopify = f.value === "shopify";
                const hasBadge  = isShopify && unprintedShopify.length > 0;
                return (
                  <button
                    key={f.value}
                    onClick={() => setOrderFilter(f.value)}
                    className={`ds-chip${isActive ? " active" : ""}`}
                    style={{ position: "relative" }}
                  >
                    {f.label}
                    {hasBadge && (
                      <span style={{
                        position: "absolute", top: -3, right: -3,
                        width: 8, height: 8, borderRadius: "50%",
                        background: "var(--success)",
                        boxShadow: "0 0 6px var(--success)",
                        display: "inline-block",
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
            {/* Date range */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ds-input" style={{ width: 140, height: 32, fontSize: 13 }} title="From date" />
              <span style={{ color: "var(--text-dim)", fontSize: 13 }}>–</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ds-input" style={{ width: 140, height: 32, fontSize: 13 }} title="To date" />
            </div>
          </div>

          {/* Bulk delete bar */}
          {selectedIds.size > 0 && canDelete && (
            <div style={{
              padding: "10px 16px",
              borderBottom: "1px solid rgba(239,68,68,0.2)",
              background: "rgba(239,68,68,0.06)",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#FCA5A5" }}>
                {selectedIds.size} order{selectedIds.size !== 1 ? "s" : ""} selected
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setSelectedIds(new Set())} className="ds-btn ds-btn-ghost ds-btn-sm">Clear</button>
                <button onClick={handleBulkDelete} className="ds-btn ds-btn-danger ds-btn-sm">
                  Delete {selectedIds.size} selected
                </button>
              </div>
            </div>
          )}

          {/* Shopify unprinted banner */}
          {orderFilter === "shopify" && unprintedShopify.length > 0 && (
            <div style={{
              padding: "8px 16px", borderBottom: "1px solid var(--border-subtle)",
              display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--success)",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)", boxShadow: "0 0 6px var(--success)", display: "inline-block" }} />
              {unprintedShopify.length} orders need labels printed
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-muted)" }}>
              <svg className="w-8 h-8 mx-auto mb-2 spinner" fill="none" viewBox="0 0 24 24">
                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p style={{ fontSize: 13 }}>Loading orders…</p>
            </div>
          ) : (
            <AdminTable
              packets={pagedPackets}
              onRowClick={setSelectedPacket}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />
          )}

          {/* Pagination */}
          {!loading && filteredPackets.length > PAGE_SIZE && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", borderTop: "1px solid var(--border-subtle)",
            }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filteredPackets.length)} of {filteredPackets.length} orders
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="ds-btn ds-btn-secondary ds-btn-sm"
                  style={{ opacity: page === 1 ? 0.4 : 1 }}
                >
                  ← Previous
                </button>
                <span style={{ fontSize: 13, color: "var(--text-2)", padding: "0 4px", lineHeight: "30px" }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="ds-btn ds-btn-secondary ds-btn-sm"
                  style={{ opacity: page === totalPages ? 0.4 : 1 }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>Loading orders…</div>}>
      <OrdersPageInner />
    </Suspense>
  );
}
