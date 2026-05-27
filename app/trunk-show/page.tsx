"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { Plus, Download, X, Tag, CheckCircle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TrunkShowSale {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  sku: string | null;
  item_description: string;
  sale_type: "full_sale" | "deposit";
  payment_method: string | null;
  payment_amount: number;
  balance_owing: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  staff_name?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const AMBER = "#F59E0B";
const AMBER_DARK = "#D97706";
const AMBER_BG = "#FFFBEB";
const AMBER_LIGHT = "#FEF3C7";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  eftpos: "Eftpos",
  bank_transfer: "Bank Transfer",
};

const PAYMENT_BADGE: Record<string, { bg: string; fg: string }> = {
  cash:          { bg: "#D1FAE5", fg: "#065F46" },
  visa:          { bg: "#DBEAFE", fg: "#1E40AF" },
  mastercard:    { bg: "#FEE2E2", fg: "#991B1B" },
  amex:          { bg: "#EEF2FF", fg: "#4338CA" },
  eftpos:        { bg: "#F3F4F6", fg: "#374151" },
  bank_transfer: { bg: "#FDF4FF", fg: "#7E22CE" },
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
}

function exportCSV(sales: TrunkShowSale[]) {
  const header = [
    "Date", "Time", "Customer Name", "Phone", "Email", "SKU",
    "Description", "Sale Type", "Payment Method", "Amount",
    "Balance Owing", "Notes", "Recorded By",
  ].join(",");

  const rows = sales.map((s) => [
    fmtDate(s.created_at),
    fmtTime(s.created_at),
    `"${(s.customer_name ?? "").replace(/"/g, '""')}"`,
    s.customer_phone ?? "",
    s.customer_email ?? "",
    s.sku ?? "",
    `"${(s.item_description ?? "").replace(/"/g, '""')}"`,
    s.sale_type === "full_sale" ? "Full Sale" : "Deposit",
    s.payment_method ? PAYMENT_LABELS[s.payment_method] ?? s.payment_method : "",
    s.payment_amount,
    s.balance_owing ?? 0,
    `"${(s.notes ?? "").replace(/"/g, '""')}"`,
    s.staff_name ?? "",
  ].join(","));

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trunk-show-sales-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── New Sale Form ─────────────────────────────────────────────────────────────
const PAYMENT_METHODS = ["cash", "visa", "mastercard", "amex", "eftpos", "bank_transfer"];

interface FormState {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  sku: string;
  item_description: string;
  sale_type: "full_sale" | "deposit";
  payment_method: string;
  payment_amount: string;
  balance_owing: string;
  notes: string;
}

const defaultForm: FormState = {
  customer_name: "",
  customer_phone: "",
  customer_email: "",
  sku: "",
  item_description: "",
  sale_type: "full_sale",
  payment_method: "",
  payment_amount: "",
  balance_owing: "",
  notes: "",
};

interface NewSaleDrawerProps {
  onClose: () => void;
  onSaved: () => void;
  userId: string | null;
}

function NewSaleDrawer({ onClose, onSaved, userId }: NewSaleDrawerProps) {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 14,
    border: "1px solid #E5E7EB", outline: "none", boxSizing: "border-box",
    color: "#1A1A2E",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: "#6B7280",
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5, display: "block",
  };

  const handleSave = async () => {
    setError(null);
    if (!form.customer_name.trim()) { setError("Customer name is required."); return; }
    if (!form.item_description.trim()) { setError("Item description is required."); return; }
    if (!form.payment_amount || isNaN(parseFloat(form.payment_amount))) { setError("Payment amount is required."); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/trunk-show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name:    form.customer_name.trim(),
          customer_phone:   form.customer_phone.trim() || null,
          customer_email:   form.customer_email.trim() || null,
          sku:              form.sku.trim() || null,
          item_description: form.item_description.trim(),
          sale_type:        form.sale_type,
          payment_method:   form.payment_method || null,
          payment_amount:   parseFloat(form.payment_amount),
          balance_owing:    form.sale_type === "deposit" ? parseFloat(form.balance_owing || "0") : 0,
          notes:            form.notes.trim() || null,
          created_by:       userId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to save sale."); return; }
      setSaved(true);
      setTimeout(() => { onSaved(); onClose(); }, 800);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex" }}>
      {/* Overlay */}
      <div
        style={{ flex: 1, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      {/* Drawer */}
      <div style={{
        width: 480, background: "#fff", height: "100%", overflowY: "auto",
        display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px 18px", borderBottom: "2px solid " + AMBER_LIGHT,
          background: AMBER_BG, display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A2E" }}>New Sale</div>
            <div style={{ fontSize: 12, color: AMBER_DARK, marginTop: 2 }}>Melbourne Trunk Show</div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "#6B7280", padding: 4, borderRadius: 6 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Customer */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: AMBER_DARK, textTransform: "uppercase", marginBottom: 12 }}>
              Customer
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={labelStyle}>Name <span style={{ color: "#EF4444" }}>*</span></label>
                <input style={inputStyle} value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} placeholder="Full name" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input style={inputStyle} value={form.customer_phone} onChange={(e) => set("customer_phone", e.target.value)} placeholder="04xx xxx xxx" />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input style={inputStyle} type="email" value={form.customer_email} onChange={(e) => set("customer_email", e.target.value)} placeholder="email@example.com" />
                </div>
              </div>
            </div>
          </section>

          {/* Item */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: AMBER_DARK, textTransform: "uppercase", marginBottom: 12 }}>
              Item
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={labelStyle}>SKU</label>
                <input style={inputStyle} value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="e.g. GR-18K-001" />
              </div>
              <div>
                <label style={labelStyle}>Description <span style={{ color: "#EF4444" }}>*</span></label>
                <textarea
                  style={{ ...inputStyle, resize: "vertical", minHeight: 72, fontFamily: "inherit" }}
                  value={form.item_description}
                  onChange={(e) => set("item_description", e.target.value)}
                  placeholder="e.g. 18K Yellow Gold Diamond Ring 1.2ct"
                />
              </div>
            </div>
          </section>

          {/* Payment */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: AMBER_DARK, textTransform: "uppercase", marginBottom: 12 }}>
              Payment
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Sale type toggle */}
              <div>
                <label style={labelStyle}>Sale Type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["full_sale", "deposit"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set("sale_type", t)}
                      style={{
                        padding: "8px 20px", borderRadius: 8, fontWeight: 600, fontSize: 14,
                        border: `2px solid ${form.sale_type === t ? AMBER : "#E5E7EB"}`,
                        background: form.sale_type === t ? AMBER_LIGHT : "#fff",
                        color: form.sale_type === t ? AMBER_DARK : "#6B7280",
                        cursor: "pointer", transition: "all .15s",
                      }}
                    >
                      {t === "full_sale" ? "Full Sale" : "Deposit"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment method pills */}
              <div>
                <label style={labelStyle}>Payment Method</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {PAYMENT_METHODS.map((m) => {
                    const active = form.payment_method === m;
                    const style = PAYMENT_BADGE[m] ?? { bg: "#F3F4F6", fg: "#374151" };
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => set("payment_method", active ? "" : m)}
                        style={{
                          padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600,
                          border: `2px solid ${active ? style.fg : "#E5E7EB"}`,
                          background: active ? style.bg : "#fff",
                          color: active ? style.fg : "#6B7280",
                          cursor: "pointer", transition: "all .15s",
                        }}
                      >
                        {PAYMENT_LABELS[m]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Amounts */}
              <div style={{ display: "grid", gridTemplateColumns: form.sale_type === "deposit" ? "1fr 1fr" : "1fr", gap: 10 }}>
                <div>
                  <label style={labelStyle}>Amount Received <span style={{ color: "#EF4444" }}>*</span></label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", fontSize: 14 }}>$</span>
                    <input
                      style={{ ...inputStyle, paddingLeft: 24 }}
                      type="number" step="0.01" min="0"
                      value={form.payment_amount}
                      onChange={(e) => set("payment_amount", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                {form.sale_type === "deposit" && (
                  <div>
                    <label style={labelStyle}>Balance Owing</label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", fontSize: 14 }}>$</span>
                      <input
                        style={{ ...inputStyle, paddingLeft: 24 }}
                        type="number" step="0.01" min="0"
                        value={form.balance_owing}
                        onChange={(e) => set("balance_owing", e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Notes */}
          <section>
            <label style={labelStyle}>Notes</label>
            <textarea
              style={{ ...inputStyle, resize: "vertical", minHeight: 60, fontFamily: "inherit" }}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Any additional notes..."
            />
          </section>

          {/* Error */}
          {error && (
            <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "10px 14px", borderRadius: 8, fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #E5E7EB", background: "#FAFAFA" }}>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 10, border: "none",
              background: saved ? "#10B981" : AMBER, color: "#fff",
              fontSize: 16, fontWeight: 700, cursor: saving || saved ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "background .2s",
            }}
          >
            {saved ? (
              <><CheckCircle size={18} /> Sale Recorded!</>
            ) : saving ? (
              "Saving…"
            ) : (
              <><Plus size={18} /> Record Sale</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TrunkShowPage() {
  const { user } = useUser();
  const [sales, setSales] = useState<TrunkShowSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchSales = useCallback(async () => {
    try {
      const res = await fetch("/api/trunk-show");
      const json = await res.json();
      setSales(json.sales ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  // ── Today's stats ────────────────────────────────────────────────────────────
  const todaySales = sales.filter((s) => isToday(s.created_at));
  const totalToday = todaySales.reduce((sum, s) => sum + (s.payment_amount ?? 0), 0);
  const cashToday  = todaySales.filter((s) => s.payment_method === "cash").reduce((sum, s) => sum + s.payment_amount, 0);
  const cardToday  = todaySales
    .filter((s) => ["visa", "mastercard", "amex", "eftpos"].includes(s.payment_method ?? ""))
    .reduce((sum, s) => sum + s.payment_amount, 0);

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const thStyle: React.CSSProperties = {
    padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#6B7280",
    textTransform: "uppercase", letterSpacing: "0.06em",
    background: "#F9FAFB", textAlign: "left", borderBottom: "1px solid #E5E7EB",
    whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: "12px 14px", fontSize: 13, color: "#1A1A2E", borderBottom: "1px solid #F3F4F6",
    verticalAlign: "middle",
  };

  return (
    <div style={{ minHeight: "100vh", background: AMBER_BG }}>

      {/* ── Hero header ─────────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, #1A1A2E 0%, #2D2A6E 100%)`,
        borderBottom: `3px solid ${AMBER}`,
        padding: "24px 32px",
      }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Tag size={20} color={AMBER} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: AMBER, textTransform: "uppercase" }}>
                Melbourne Trunk Show
              </span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0, lineHeight: 1.1 }}>
              Sales Logger
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => exportCSV(sales)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 18px", borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.08)", color: "#fff",
                fontSize: 14, fontWeight: 500, cursor: "pointer", transition: "all .15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)"; }}
            >
              <Download size={15} /> Export CSV
            </button>
            <button
              onClick={() => setDrawerOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 22px", borderRadius: 8, border: "none",
                background: AMBER, color: "#fff",
                fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "all .15s",
                boxShadow: `0 0 0 0 ${AMBER}`,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = AMBER_DARK; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = AMBER; }}
            >
              <Plus size={18} /> New Sale
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary bar ─────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "0 32px" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", display: "flex", gap: 0 }}>
          {[
            { label: "Total Today", value: fmtMoney(totalToday), color: AMBER_DARK, bg: AMBER_LIGHT },
            { label: "Cash", value: fmtMoney(cashToday), color: "#065F46", bg: "#D1FAE5" },
            { label: "Card", value: fmtMoney(cardToday), color: "#1E40AF", bg: "#DBEAFE" },
            { label: "Transactions", value: String(todaySales.length), color: "#7C3AED", bg: "#EDE9FE" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} style={{ padding: "18px 32px", borderRight: "1px solid #E5E7EB", minWidth: 150 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                {label}
              </div>
              <div style={{
                display: "inline-block", fontSize: 22, fontWeight: 800, color, background: bg,
                padding: "2px 10px", borderRadius: 8,
              }}>
                {value}
              </div>
            </div>
          ))}
          <div style={{ flex: 1, padding: "18px 32px", textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>
              {sales.length} total sale{sales.length !== 1 ? "s" : ""} recorded
            </span>
          </div>
        </div>
      </div>

      {/* ── Sales table ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "24px 32px" }}>
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "48px 0", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
              Loading sales…
            </div>
          ) : sales.length === 0 ? (
            <div style={{ padding: "64px 0", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏷️</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A2E", marginBottom: 6 }}>No sales yet</div>
              <div style={{ fontSize: 14, color: "#9CA3AF", marginBottom: 20 }}>Click New Sale to record the first transaction</div>
              <button
                onClick={() => setDrawerOpen(true)}
                style={{
                  padding: "11px 28px", borderRadius: 8, border: "none",
                  background: AMBER, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}
              >
                Record First Sale
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Time</th>
                    <th style={thStyle}>Customer</th>
                    <th style={thStyle}>Item</th>
                    <th style={thStyle}>SKU</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Payment</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Balance</th>
                    <th style={thStyle}>Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => {
                    const today = isToday(s.created_at);
                    const payBadge = s.payment_method ? (PAYMENT_BADGE[s.payment_method] ?? { bg: "#F3F4F6", fg: "#374151" }) : null;
                    return (
                      <tr
                        key={s.id}
                        style={{ background: today ? AMBER_BG : "#fff" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = today ? "#FEF3C7" : "#F9FAFB"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = today ? AMBER_BG : "#fff"; }}
                      >
                        <td style={{ ...tdStyle, color: "#6B7280", whiteSpace: "nowrap" }}>
                          <div style={{ fontSize: 12 }}>{fmtDate(s.created_at)}</div>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>{fmtTime(s.created_at)}</div>
                        </td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{s.customer_name}</div>
                          {s.customer_phone && <div style={{ fontSize: 12, color: "#6B7280" }}>{s.customer_phone}</div>}
                        </td>
                        <td style={{ ...tdStyle, maxWidth: 260 }}>
                          <div style={{ fontSize: 13, color: "#1A1A2E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.item_description}
                          </div>
                          {s.notes && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.notes}</div>}
                        </td>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 12, color: "#6B7280" }}>
                          {s.sku ?? "—"}
                        </td>
                        <td style={tdStyle}>
                          <span style={{
                            display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                            background: s.sale_type === "full_sale" ? "#D1FAE5" : AMBER_LIGHT,
                            color: s.sale_type === "full_sale" ? "#065F46" : AMBER_DARK,
                          }}>
                            {s.sale_type === "full_sale" ? "Full Sale" : "Deposit"}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {payBadge && s.payment_method ? (
                            <span style={{
                              display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                              background: payBadge.bg, color: payBadge.fg,
                            }}>
                              {PAYMENT_LABELS[s.payment_method] ?? s.payment_method}
                            </span>
                          ) : "—"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontSize: 15, color: "#065F46", whiteSpace: "nowrap" }}>
                          {fmtMoney(s.payment_amount)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                          {s.sale_type === "deposit" && (s.balance_owing ?? 0) > 0 ? (
                            <span style={{ color: "#EF4444", fontWeight: 600, fontSize: 13 }}>
                              {fmtMoney(s.balance_owing)}
                            </span>
                          ) : (
                            <span style={{ color: "#D1D5DB" }}>—</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, color: "#6B7280", fontSize: 12, whiteSpace: "nowrap" }}>
                          {s.staff_name ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── New Sale Drawer ──────────────────────────────────────────────────── */}
      {drawerOpen && (
        <NewSaleDrawer
          onClose={() => setDrawerOpen(false)}
          onSaved={() => { fetchSales(); setDrawerOpen(false); }}
          userId={user?.id ?? null}
        />
      )}
    </div>
  );
}
