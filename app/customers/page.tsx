"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDateAU, formatCurrency } from "@/lib/formatters";
import { useUser } from "@/context/UserContext";
import { hasPermission } from "@/lib/userTypes";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface VipTier {
  id: string;
  tier_name: string;
  tier_order: number;
  min_spend: number;
  min_orders: number;
  colour: string;
}

interface Appointment {
  id: string;
  customer_email: string;
  customer_first_name: string | null;
  customer_last_name: string | null;
  appointment_date: string;
  appointment_time: string | null;
  notes: string | null;
  status: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeTier(spend: number, orders: number, tiers: VipTier[]): VipTier | null {
  const sorted = [...tiers].sort((a, b) => b.tier_order - a.tier_order);
  return sorted.find(t => spend >= Number(t.min_spend) || orders >= t.min_orders) ?? null;
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "customers")) router.replace("/");
  }, [user, hydrated, router]);

  // Page tabs
  const [pageTab, setPageTab] = useState<"customers" | "appointments">("customers");

  // Customer tab state
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tiers, setTiers] = useState<VipTier[]>([]);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  // SMS unread counts — keyed by customer email
  const [smsUnreadMap, setSmsUnreadMap] = useState<Record<string, number>>({});

  // Appointments tab state
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoaded, setAppointmentsLoaded] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const tenantId = user?.tenantId ?? "";

  // Load VIP tier config once
  useEffect(() => {
    if (!tenantId) return;
    fetch("/api/vip-tiers", { headers: { "x-tenant-id": tenantId } })
      .then(r => r.json())
      .then(json => setTiers(json.tiers ?? []))
      .catch(() => {});
  }, [tenantId]);

  const fetchCustomers = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (q) p.set("search", q);
      const res = await fetch(`/api/customers?${p}`, { cache: "no-store", headers: { "x-tenant-id": tenantId } });
      const json = await res.json();
      setCustomers(json.customers ?? []);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(search), 300);
    return () => clearTimeout(timer);
  }, [search, fetchCustomers]);

  // ── Fetch SMS unread counts once tenant is known ──────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    fetch("/api/sms/unread", { headers: { "x-tenant-id": tenantId } })
      .then(r => r.json())
      .then(json => setSmsUnreadMap(json.unread ?? {}))
      .catch(() => {});
  }, [tenantId]);

  // ── Realtime: refresh unread counts on any new inbound SMS ────────────────
  useEffect(() => {
    if (!tenantId) return;
    const sb = createBrowserSupabaseClient();
    const channel = sb.channel(`sms-list:${tenantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_messages", filter: `tenant_id=eq.${tenantId}` },
        (payload: { new: Record<string, unknown> }) => {
          if (payload.new.direction === "in") {
            fetch("/api/sms/unread", { headers: { "x-tenant-id": tenantId } })
              .then(r => r.json())
              .then(json => setSmsUnreadMap(json.unread ?? {}))
              .catch(() => {});
          }
        }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [tenantId]);

  // Load appointments when tab activated
  useEffect(() => {
    if (pageTab !== "appointments" || appointmentsLoaded) return;
    fetch("/api/appointments", { headers: { "x-tenant-id": tenantId } })
      .then(r => r.json())
      .then(json => { setAppointments(json.appointments ?? []); setAppointmentsLoaded(true); })
      .catch(() => setAppointmentsLoaded(true));
  }, [pageTab, appointmentsLoaded, tenantId]);

  function openProfile(email: string) {
    router.push(`/customers/${encodeURIComponent(email)}`);
  }

  // Filtered customers
  const filteredCustomers = selectedTier
    ? customers.filter(c => computeTier(c.non_repair_spend ?? 0, c.non_repair_orders ?? 0, tiers)?.tier_name === selectedTier)
    : customers;

  // Filtered appointments
  const filteredAppointments = showCompleted
    ? appointments
    : appointments.filter(a => a.status === "upcoming");

  const sortedTiers = [...tiers].sort((a, b) => a.tier_order - b.tier_order);

  // Shared styles
  const CARD: React.CSSProperties = { background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12 };
  const TAB_BTN = (active: boolean): React.CSSProperties => ({
    padding: "8px 18px", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
    background: active ? "#635BFF" : "transparent", color: active ? "#fff" : "#6B7280", transition: "all .15s",
  });

  return (
    <div className="max-w-7xl mx-auto space-y-4">

      {/* ── Page tab bar ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 4, background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 4, alignSelf: "flex-start", width: "fit-content" }}>
        <button style={TAB_BTN(pageTab === "customers")} onClick={() => setPageTab("customers")}>
          Customers
          {Object.values(smsUnreadMap).reduce((s, n) => s + n, 0) > 0 && (
            <span style={{ marginLeft: 6, fontSize: 11, background: "#EF4444", color: "#fff", borderRadius: 999, padding: "1px 6px", fontWeight: 700 }}>
              {Object.values(smsUnreadMap).reduce((s, n) => s + n, 0)} SMS
            </span>
          )}
        </button>
        <button style={TAB_BTN(pageTab === "appointments")} onClick={() => setPageTab("appointments")}>
          Appointments
          {appointments.filter(a => a.status === "upcoming").length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 11, background: "#EEF2FF", color: "#635BFF", borderRadius: 999, padding: "1px 6px", fontWeight: 700 }}>
              {appointments.filter(a => a.status === "upcoming").length}
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════════════ CUSTOMERS TAB ═══════════════════════════════ */}
      {pageTab === "customers" && (
        <>
          {/* Search + tier filter */}
          <div style={CARD}>
            <div style={{ padding: 16, borderBottom: tiers.length > 0 ? "1px solid #F0F0F5" : undefined }}>
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search by name, maiden name, email, phone, or item description…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ width: "100%", paddingLeft: 36, paddingRight: 12, border: "1px solid #E8E8F0", borderRadius: 8, background: "#fff", height: 40, fontSize: 14, color: "#1A1A2E", outline: "none" }}
                  />
                </div>
                {search && (
                  <button onClick={() => setSearch("")} style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", background: "transparent", border: "none", cursor: "pointer" }}>
                    Clear
                  </button>
                )}
              </div>
              <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8 }}>
                Aggregated live from all orders and quotes. Search also matches item descriptions.
              </p>
            </div>

            {/* Tier filter */}
            {tiers.length > 0 && (
              <div style={{ padding: "10px 16px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={() => setSelectedTier(null)}
                  style={{
                    padding: "5px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: "1px solid #E8E8F0",
                    background: selectedTier === null ? "#635BFF" : "transparent",
                    color: selectedTier === null ? "#fff" : "#6B7280",
                  }}
                >
                  All
                </button>
                {sortedTiers.map(t => {
                  const active = selectedTier === t.tier_name;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTier(active ? null : t.tier_name)}
                      style={{
                        padding: "5px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        border: `1px solid ${t.colour}`,
                        background: active ? t.colour : "transparent",
                        color: active ? "#fff" : t.colour,
                        textTransform: "uppercase", letterSpacing: "0.04em",
                      }}
                    >
                      {t.tier_name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Customer list */}
          <div style={CARD}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #E8E8F0" }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E", margin: 0 }}>
                {loading
                  ? "Loading…"
                  : `${filteredCustomers.length} customer${filteredCustomers.length !== 1 ? "s" : ""}${search ? ` matching "${search}"` : ""}${selectedTier ? ` · ${selectedTier} tier` : ""}`}
              </h2>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {loading ? (
                <div style={{ padding: "48px 20px", textAlign: "center", color: "#6B7280", fontSize: 14 }}>Loading…</div>
              ) : filteredCustomers.length === 0 ? (
                <div style={{ padding: "48px 20px", textAlign: "center", color: "#6B7280", fontSize: 14 }}>
                  {search ? `No customers matching "${search}"` : selectedTier ? `No ${selectedTier} tier customers` : "No customer records yet."}
                </div>
              ) : filteredCustomers.map(c => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
                const mTier = computeTier(c.non_repair_spend ?? 0, c.non_repair_orders ?? 0, tiers);
                return (
                  <div key={c.email} onClick={() => openProfile(c.email)} className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer active:bg-gray-50">
                    <div className="min-w-0">
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600, color: "#1A1A2E", fontSize: 14 }}>{name}</span>
                        {mTier && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: `${mTier.colour}22`, color: mTier.colour, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                            {mTier.tier_name}
                          </span>
                        )}
                      </div>
                      <div style={{ color: "#6B7280", fontSize: 13, marginTop: 2 }}>{c.phone || c.email || "—"}</div>
                      <div style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>Last visit: {formatDateAU(c.last_visit?.split("T")[0]) || "—"}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {(smsUnreadMap[c.email] ?? 0) > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "#EF4444", color: "#fff", whiteSpace: "nowrap" }}>
                          {smsUnreadMap[c.email]} SMS
                        </span>
                      )}
                      {c.total_spend > 0 && <span style={{ fontWeight: 600, color: "#1A1A2E", fontSize: 14 }}>{formatCurrency(c.total_spend)}</span>}
                      <svg className="w-4 h-4" fill="none" stroke="#D1D5DB" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #E8E8F0", background: "#F9FAFB" }}>
                    {["Name", "Phone", "Email", "Orders", "Quotes", "Last Visit", "Total Spend", ""].map((h, i) => (
                      <th key={i} style={{ padding: "12px 20px", fontSize: 12, fontWeight: 500, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: ["Orders", "Quotes"].includes(h) ? "center" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                  ) : filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: "48px 20px", textAlign: "center", color: "#6B7280", fontSize: 14 }}>
                        {search ? `No customers matching "${search}"` : selectedTier ? `No ${selectedTier} tier customers.` : "No customer records yet. Submit an order or quote to create customer records."}
                      </td>
                    </tr>
                  ) : filteredCustomers.map(c => {
                    const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";
                    const dTier = computeTier(c.non_repair_spend ?? 0, c.non_repair_orders ?? 0, tiers);
                    return (
                      <tr
                        key={c.email}
                        onClick={() => openProfile(c.email)}
                        style={{ borderBottom: "1px solid #E8E8F0", cursor: "pointer", transition: "background .12s" }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "#F9FAFB"}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}
                      >
                        <td style={{ padding: "12px 20px", fontWeight: 600, color: "#1A1A2E" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {name}
                            {dTier && (
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: `${dTier.colour}22`, color: dTier.colour, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                                {dTier.tier_name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "12px 20px", color: "#6B7280" }}>{c.phone || "—"}</td>
                        <td style={{ padding: "12px 20px", color: "#6B7280", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email || "—"}</td>
                        <td style={{ padding: "12px 20px", textAlign: "center" }}>
                          {c.total_orders > 0 ? (
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: "#635BFF", color: "#fff", fontSize: 12, fontWeight: 700 }}>
                              {c.total_orders}
                            </span>
                          ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                        </td>
                        <td style={{ padding: "12px 20px", textAlign: "center" }}>
                          {c.total_quotes > 0 ? (
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: "#EEF2FF", color: "#635BFF", fontSize: 12, fontWeight: 700 }}>
                              {c.total_quotes}
                            </span>
                          ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                        </td>
                        <td style={{ padding: "12px 20px", color: "#6B7280" }}>{formatDateAU(c.last_visit?.split("T")[0]) || "—"}</td>
                        <td style={{ padding: "12px 20px", fontWeight: 600, color: "#1A1A2E" }}>{c.total_spend > 0 ? formatCurrency(c.total_spend) : "—"}</td>
                        <td style={{ padding: "12px 20px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                            {(smsUnreadMap[c.email] ?? 0) > 0 && (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "#EF4444", color: "#fff", whiteSpace: "nowrap" }}>
                                {smsUnreadMap[c.email]} SMS
                              </span>
                            )}
                            <svg className="w-4 h-4" fill="none" stroke="#D1D5DB" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════ APPOINTMENTS TAB ════════════════════════════ */}
      {pageTab === "appointments" && (
        <div style={CARD}>
          {/* Header row */}
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #E8E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E", margin: 0 }}>
              {!appointmentsLoaded ? "Loading…" : `${filteredAppointments.length} appointment${filteredAppointments.length !== 1 ? "s" : ""}${showCompleted ? "" : " upcoming"}`}
            </h2>
            <button
              onClick={() => setShowCompleted(v => !v)}
              style={{ fontSize: 12, fontWeight: 600, color: showCompleted ? "#635BFF" : "#6B7280", background: showCompleted ? "#EEF2FF" : "transparent", border: "1px solid #E8E8F0", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}
            >
              {showCompleted ? "Upcoming only" : "Show completed"}
            </button>
          </div>

          {/* Mobile */}
          <div className="md:hidden divide-y divide-gray-100">
            {!appointmentsLoaded ? (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading…</div>
            ) : filteredAppointments.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>No upcoming appointments.</div>
            ) : filteredAppointments.map(a => {
              const custName = [a.customer_first_name, a.customer_last_name].filter(Boolean).join(" ") || a.customer_email;
              return (
                <div key={a.id} style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: "#1A1A2E", fontSize: 14 }}>
                        {formatDateAU(a.appointment_date)}{a.appointment_time ? ` at ${String(a.appointment_time).slice(0, 5)}` : ""}
                      </div>
                      <Link href={`/customers/${encodeURIComponent(a.customer_email)}`} style={{ fontSize: 13, color: "#635BFF", textDecoration: "none", fontWeight: 500 }}>
                        {custName}
                      </Link>
                      {a.notes && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{a.notes}</div>}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: a.status === "upcoming" ? "#DCFCE7" : "#F3F4F6", color: a.status === "upcoming" ? "#166534" : "#6B7280", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {a.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #E8E8F0", background: "#F9FAFB" }}>
                  {["Date", "Time", "Customer", "Notes", "Status"].map(h => (
                    <th key={h} style={{ padding: "12px 20px", fontSize: 12, fontWeight: 500, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!appointmentsLoaded ? (
                  <tr><td colSpan={5} style={{ padding: "48px 20px", textAlign: "center", color: "#9CA3AF" }}>Loading…</td></tr>
                ) : filteredAppointments.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "48px 20px", textAlign: "center", color: "#9CA3AF" }}>No upcoming appointments. All clear!</td></tr>
                ) : filteredAppointments.map(a => {
                  const custName = [a.customer_first_name, a.customer_last_name].filter(Boolean).join(" ") || a.customer_email;
                  return (
                    <tr key={a.id} style={{ borderBottom: "1px solid #E8E8F0" }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "#F9FAFB"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}
                    >
                      <td style={{ padding: "12px 20px", fontWeight: 600, color: "#1A1A2E", whiteSpace: "nowrap" }}>{formatDateAU(a.appointment_date)}</td>
                      <td style={{ padding: "12px 20px", color: "#6B7280" }}>{a.appointment_time ? String(a.appointment_time).slice(0, 5) : "—"}</td>
                      <td style={{ padding: "12px 20px" }}>
                        <Link href={`/customers/${encodeURIComponent(a.customer_email)}`} style={{ color: "#635BFF", textDecoration: "none", fontWeight: 500, fontSize: 14 }}>
                          {custName}
                        </Link>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{a.customer_email}</div>
                      </td>
                      <td style={{ padding: "12px 20px", color: "#6B7280", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.notes || "—"}</td>
                      <td style={{ padding: "12px 20px" }}>
                        <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: a.status === "upcoming" ? "#DCFCE7" : "#F3F4F6", color: a.status === "upcoming" ? "#166534" : "#6B7280" }}>
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
