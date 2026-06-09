"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Tenant { id: string; name: string; slug: string; subscription_status: string; }
interface Store {
  id: string; tenant_id: string; plan: string; billing_status: string;
  monthly_fee_aud: number; contact_name: string | null; contact_email: string | null;
  contact_phone: string | null; store_city: string | null; store_state: string | null;
  website_url: string | null; notes: string | null;
  onboarding_dns_connected: boolean; onboarding_staff_loaded: boolean;
  onboarding_first_order: boolean; onboarding_training_done: boolean;
  onboarding_billing_active: boolean;
  created_at: string; tenant: Tenant | null;
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

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.cancelled;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, textTransform: "capitalize",
      background: style.bg, color: style.color,
    }}>
      {status}
    </span>
  );
}

// ── Add Store Modal ───────────────────────────────────────────────────────────

function AddStoreModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    storeName: "", slug: "", contactName: "", contactEmail: "",
    contactPhone: "", storeCity: "", storeState: "SA", plan: "trial", monthlyFee: "0",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleNameChange = (v: string) => {
    set("storeName", v);
    set("slug", v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
  };

  const handleSubmit = async () => {
    setError("");
    if (!form.storeName.trim() || !form.slug.trim()) { setError("Store name and slug required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/vault-admin/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: form.storeName, slug: form.slug,
          contactName: form.contactName || undefined, contactEmail: form.contactEmail || undefined,
          contactPhone: form.contactPhone || undefined, storeCity: form.storeCity || undefined,
          storeState: form.storeState || undefined, plan: form.plan,
          monthlyFee: parseFloat(form.monthlyFee) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed"); return; }
      onSuccess();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: "100%", border: "1px solid #e5e7eb", borderRadius: 8,
    padding: "9px 12px", fontSize: 14, outline: "none", boxSizing: "border-box" as const,
    fontFamily: "Inter, sans-serif",
  };
  const labelStyle = { display: "block" as const, fontSize: 12, fontWeight: 600 as const, color: "#6b7280", marginBottom: 4 };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 16, padding: "32px", width: 500, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1A1760", margin: "0 0 24px" }}>Add New Store</h2>

        {error && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 16px" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Store Name *</label>
            <input style={inputStyle} value={form.storeName} onChange={(e) => handleNameChange(e.target.value)} placeholder="e.g. Gold & Co" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Slug *</label>
            <input style={{ ...inputStyle, fontFamily: "monospace" }} value={form.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
          </div>
          <div>
            <label style={labelStyle}>Contact Name</label>
            <input style={inputStyle} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Contact Email</label>
            <input style={inputStyle} type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Contact Phone</label>
            <input style={inputStyle} value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>City</label>
            <input style={inputStyle} value={form.storeCity} onChange={(e) => set("storeCity", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>State</label>
            <input style={inputStyle} value={form.storeState} onChange={(e) => set("storeState", e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Plan</label>
            <select style={inputStyle} value={form.plan} onChange={(e) => set("plan", e.target.value)}>
              {["trial","starter","pro","enterprise"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Monthly Fee (AUD)</label>
            <input style={inputStyle} type="number" min="0" step="0.01" value={form.monthlyFee} onChange={(e) => set("monthlyFee", e.target.value)} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 9, background: "transparent", border: "1px solid #d1d5db", color: "#6b7280", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={{ padding: "10px 20px", borderRadius: 9, background: saving ? "#a5b4fc" : "#635BFF", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Creating…" : "Create Store"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function VaultAdminDashboard() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState("");

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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const total  = stores.length;
  const active = stores.filter((s) => s.billing_status === "active").length;
  const trial  = stores.filter((s) => s.billing_status === "trial").length;
  const mrr    = stores.filter((s) => s.billing_status === "active").reduce((sum, s) => sum + (s.monthly_fee_aud ?? 0), 0);

  const cardStyle = { background: "#fff", borderRadius: 12, border: "1px solid #E8E8F0", padding: "20px 24px" };
  const thStyle = { padding: "11px 16px", textAlign: "left" as const, fontSize: 11, fontWeight: 600 as const, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.05em", whiteSpace: "nowrap" as const };
  const tdStyle = { padding: "13px 16px", fontSize: 13, color: "#374151", verticalAlign: "middle" as const };

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1300 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1A1760", margin: 0 }}>Dashboard</h1>
          <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 3 }}>Vault Operator CRM</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{ background: "#635BFF", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
        >
          + Add Store
        </button>
      </div>

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        {[
          { label: "Total Stores", value: total },
          { label: "Active",       value: active },
          { label: "On Trial",     value: trial },
          { label: "MRR",          value: "$" + mrr.toLocaleString("en-AU", { minimumFractionDigits: 0 }) },
        ].map(({ label, value }) => (
          <div key={label} style={cardStyle}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" }}>{label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: "#1A1760", margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Stores table */}
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
              {stores.map((s, i) => {
                const done = onboardingCount(s);
                return (
                  <tr key={s.id} style={{ borderBottom: i < stores.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "#111827" }}>
                      {s.tenant?.name ?? "—"}
                      <div style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{s.tenant?.slug}</div>
                    </td>
                    <td style={tdStyle}>{[s.store_city, s.store_state].filter(Boolean).join(", ") || "—"}</td>
                    <td style={{ ...tdStyle, textTransform: "capitalize" }}>{s.plan}</td>
                    <td style={tdStyle}><StatusBadge status={s.billing_status} /></td>
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
              {stores.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>No stores yet. Add your first store.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <AddStoreModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchStores(); showToast("Store created!"); }}
        />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#10B981", color: "#fff", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 200 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
