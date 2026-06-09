"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Tenant { id: string; name: string; slug: string; subscription_status: string; }
interface Store {
  id: string; plan: string; billing_status: string; monthly_fee_aud: number;
  contact_name: string | null; contact_email: string | null; store_city: string | null;
  store_state: string | null; onboarding_dns_connected: boolean; onboarding_staff_loaded: boolean;
  onboarding_first_order: boolean; onboarding_training_done: boolean; onboarding_billing_active: boolean;
  tenant: Tenant | null;
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active:    { bg: "#10B981", color: "#fff" },
  trial:     { bg: "#635BFF", color: "#fff" },
  overdue:   { bg: "#F59E0B", color: "#fff" },
  suspended: { bg: "#EF4444", color: "#fff" },
  cancelled: { bg: "#9ca3af", color: "#fff" },
};

function onboardingCount(s: Store) {
  return [s.onboarding_dns_connected, s.onboarding_staff_loaded, s.onboarding_first_order,
          s.onboarding_training_done, s.onboarding_billing_active].filter(Boolean).length;
}

export default function VaultAdminStoresPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchStores = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vault-admin/stores");
      const json = await res.json();
      setStores(json.stores ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStores(); }, [fetchStores]);

  const filtered = stores.filter((s) => {
    const nameMatch = (s.tenant?.name ?? "").toLowerCase().includes(search.toLowerCase());
    const statusMatch = statusFilter === "all" || s.billing_status === statusFilter;
    return nameMatch && statusMatch;
  });

  const thStyle = { padding: "11px 16px", textAlign: "left" as const, fontSize: 11, fontWeight: 600 as const, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.05em" };
  const tdStyle = { padding: "13px 16px", fontSize: 13, color: "#374151", verticalAlign: "middle" as const };

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1300 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1A1760", margin: 0 }}>Stores</h1>
          <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 3 }}>{stores.length} store{stores.length !== 1 ? "s" : ""} total</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <input
          placeholder="Search by store name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            border: "1px solid #e5e7eb", borderRadius: 9, padding: "9px 14px", fontSize: 14,
            outline: "none", width: 260, fontFamily: "Inter, sans-serif",
          }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            border: "1px solid #e5e7eb", borderRadius: 9, padding: "9px 14px", fontSize: 14,
            outline: "none", background: "#fff", fontFamily: "Inter, sans-serif",
          }}
        >
          {["all","active","trial","overdue","suspended","cancelled"].map((s) => (
            <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8E8F0", overflow: "hidden" }}>
        {loading ? (
          <p style={{ padding: 24, color: "#9ca3af", fontSize: 14 }}>Loading stores…</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #E8E8F0" }}>
                {["Store","City / State","Plan","Status","Monthly Fee","Contact","Onboarding",""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const done = onboardingCount(s);
                const statusStyle = STATUS_STYLE[s.billing_status] ?? STATUS_STYLE.cancelled;
                return (
                  <tr key={s.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "#111827" }}>
                      {s.tenant?.name ?? "—"}
                      <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{s.tenant?.slug}</div>
                    </td>
                    <td style={tdStyle}>{[s.store_city, s.store_state].filter(Boolean).join(", ") || "—"}</td>
                    <td style={{ ...tdStyle, textTransform: "capitalize" }}>{s.plan}</td>
                    <td style={tdStyle}>
                      <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: "capitalize", background: statusStyle.bg, color: statusStyle.color }}>
                        {s.billing_status}
                      </span>
                    </td>
                    <td style={tdStyle}>{s.monthly_fee_aud > 0 ? "$" + Number(s.monthly_fee_aud).toLocaleString("en-AU") : "—"}</td>
                    <td style={tdStyle}>
                      {s.contact_name && <div style={{ fontWeight: 500 }}>{s.contact_name}</div>}
                      {s.contact_email && <div style={{ fontSize: 12, color: "#6b7280" }}>{s.contact_email}</div>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: 12, marginBottom: 4 }}>{done}/5</div>
                      <div style={{ height: 4, background: "#e5e7eb", borderRadius: 2, width: 60 }}>
                        <div style={{ height: 4, borderRadius: 2, background: "#10B981", width: `${(done / 5) * 100}%` }} />
                      </div>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <button
                        onClick={() => router.push(`/vault-admin/stores/${s.id}`)}
                        style={{ background: "transparent", border: "1px solid #635BFF", color: "#635BFF", borderRadius: 7, padding: "5px 13px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                  {search || statusFilter !== "all" ? "No stores match your filters." : "No stores yet."}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
