"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { InventorySupplier } from "@/lib/types";
import { color, radius, shadow, font } from "@/lib/theme";
import { Plus, Pencil, Trash2, X, Mail, Phone, Clock, Upload } from "lucide-react";

const BLANK_FORM = { name: "", contact_name: "", email: "", phone: "", lead_time_days: "", notes: "" };

interface SupplierDrawerProps {
  supplier: InventorySupplier | null;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
  isAdmin: boolean;
}

function SupplierDrawer({ supplier, isNew, onClose, onSaved, isAdmin }: SupplierDrawerProps) {
  const { user } = useUser();
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (supplier) {
      setForm({
        name: supplier.name ?? "",
        contact_name: supplier.contact_name ?? "",
        email: supplier.email ?? "",
        phone: supplier.phone ?? "",
        lead_time_days: supplier.lead_time_days != null ? String(supplier.lead_time_days) : "",
        notes: supplier.notes ?? "",
      });
    } else {
      setForm({ ...BLANK_FORM });
    }
  }, [supplier]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError("");
    const payload = {
      ...form,
      lead_time_days: form.lead_time_days !== "" ? parseInt(form.lead_time_days) : null,
    };
    const url = isNew ? "/api/inventory/suppliers" : `/api/inventory/suppliers/${supplier!.id}`;
    const method = isNew ? "POST" : "PATCH";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' }, body: JSON.stringify(payload) });
    const json = await res.json();
    setSaving(false);
    if (json.error) { setError(json.error); return; }
    onSaved();
  }

  async function handleDelete() {
    if (!supplier) return;
    if (!confirm(`Delete "${supplier.name}"? This cannot be undone.`)) return;
    await fetch(`/api/inventory/suppliers/${supplier.id}`, { method: "DELETE", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
    onSaved();
  }

  const inputStyle = { width: "100%", padding: "8px 10px", border: `1px solid ${color.line}`, borderRadius: radius.md, fontSize: 13, color: color.ink, background: color.white, boxSizing: "border-box" as const };
  const labelStyle = { fontSize: 12, fontWeight: 500 as const, color: color.textMuted, marginBottom: 4, display: "block" as const };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.35)", display: "flex", justifyContent: "flex-end" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 420, height: "100%", background: color.white, display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${color.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: color.ink }}>{isNew ? "New Supplier" : "Edit Supplier"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: color.textFaint, padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {error && <div style={{ padding: "10px 12px", background: color.dangerBg, color: color.danger, borderRadius: radius.md, fontSize: 13 }}>{error}</div>}
          <div>
            <label style={labelStyle}>Supplier Name *</label>
            <input style={inputStyle} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Palloys Pty Ltd" />
          </div>
          <div>
            <label style={labelStyle}>Contact Name</label>
            <input style={inputStyle} value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} placeholder="Account manager name" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="orders@supplier.com" />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="02 XXXX XXXX" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Lead Time (days)</label>
            <input style={inputStyle} type="number" value={form.lead_time_days} onChange={(e) => set("lead_time_days", e.target.value)} placeholder="e.g. 14" />
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, height: 80, resize: "vertical" }} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ordering notes, payment terms, etc." />
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${color.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div>
            {!isNew && isAdmin && (
              <button onClick={handleDelete} style={{ padding: "8px 14px", background: color.dangerBg, color: color.danger, border: "none", borderRadius: radius.pill, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                Delete
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ padding: "8px 16px", background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.pill, cursor: "pointer", fontSize: 13, color: color.ink }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: "8px 20px", background: color.ink, color: color.white, border: "none", borderRadius: radius.pill, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Saving…" : isNew ? "Create" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InventorySuppliersPage() {
  const { user } = useUser();
  const router = useRouter();
  const isManager = canManage(user?.role);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (user && !isManager) router.replace("/orders");
  }, [user, isManager, router]);

  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerSupplier, setDrawerSupplier] = useState<InventorySupplier | null>(null);
  const [drawerNew, setDrawerNew] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory/suppliers", { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
    const json = await res.json();
    setSuppliers(json.suppliers ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  function openNew() { setDrawerSupplier(null); setDrawerNew(true); }
  function openEdit(s: InventorySupplier) { setDrawerSupplier(s); setDrawerNew(false); }
  function closeDrawer() { setDrawerSupplier(null); setDrawerNew(false); }
  function handleSaved() { closeDrawer(); fetchSuppliers(); }

  const showDrawer = drawerNew || drawerSupplier != null;

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: color.ink }}>Suppliers</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: color.textMuted }}>
            {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/inventory/suppliers/import"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: color.white, color: color.ink, border: `1px solid ${color.line}`, borderRadius: radius.pill, cursor: "pointer", fontSize: 13, fontWeight: 500, textDecoration: "none" }}
          >
            <Upload size={14} />
            Import CSV
          </Link>
          <button onClick={openNew} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", background: color.ink, color: color.white, border: "none", borderRadius: radius.pill, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
            <Plus size={15} />
            New Supplier
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, overflow: "hidden", boxShadow: shadow.card }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: color.paper, borderBottom: `1px solid ${color.line}` }}>
              {["Name", "Contact", "Email", "Phone", "Lead Time", ""].map((h) => (
                <th key={h} style={{ padding: "10px 14px", fontFamily: font.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: color.textMuted, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: color.textFaint, fontSize: 14 }}>Loading…</td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: color.textFaint, fontSize: 14 }}>No suppliers yet. Add your first one.</td></tr>
            ) : suppliers.map((s) => (
              <tr key={s.id} style={{ borderBottom: `1px solid ${color.line}` }}>
                <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 500, color: color.ink }}>{s.name}</td>
                <td style={{ padding: "11px 14px", fontSize: 13, color: color.textMuted }}>{s.contact_name ?? "—"}</td>
                <td style={{ padding: "11px 14px", fontSize: 13, color: color.textMuted }}>
                  {s.email ? (
                    <a href={`mailto:${s.email}`} style={{ color: color.ink, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <Mail size={12} />{s.email}
                    </a>
                  ) : "—"}
                </td>
                <td style={{ padding: "11px 14px", fontSize: 13, color: color.textMuted }}>
                  {s.phone ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Phone size={12} />{s.phone}
                    </span>
                  ) : "—"}
                </td>
                <td style={{ padding: "11px 14px", fontSize: 13, color: color.textMuted }}>
                  {s.lead_time_days != null ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={12} />{s.lead_time_days}d
                    </span>
                  ) : "—"}
                </td>
                <td style={{ padding: "11px 14px" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => openEdit(s)}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.pill, cursor: "pointer", fontSize: 12, color: color.ink }}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    {isAdmin && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete "${s.name}"?`)) return;
                          await fetch(`/api/inventory/suppliers/${s.id}`, { method: "DELETE", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
                          fetchSuppliers();
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", background: color.dangerBg, border: "none", borderRadius: radius.pill, cursor: "pointer", fontSize: 12, color: color.danger }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showDrawer && (
        <SupplierDrawer
          supplier={drawerSupplier}
          isNew={drawerNew}
          onClose={closeDrawer}
          onSaved={handleSaved}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
