"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { InventorySupplier } from "@/lib/types";
import { Plus, Pencil, Trash2, X, Mail, Phone, Clock, Upload, RefreshCw } from "lucide-react";

const BLANK_FORM = { name: "", contact_name: "", email: "", phone: "", lead_time_days: "", notes: "", connector_type: "" };

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
        connector_type: supplier.connector_type ?? "",
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

  const inputStyle = { width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, color: "#1A1A2E", background: "#fff", boxSizing: "border-box" as const };
  const labelStyle = { fontSize: 12, fontWeight: 500 as const, color: "#6B7280", marginBottom: 4, display: "block" as const };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.35)", display: "flex", justifyContent: "flex-end" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 420, height: "100%", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#1A1A2E" }}>{isNew ? "New Supplier" : "Edit Supplier"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {error && <div style={{ padding: "10px 12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 6, fontSize: 13 }}>{error}</div>}
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
          <div>
            <label style={labelStyle}>Connector</label>
            <select style={inputStyle} value={form.connector_type} onChange={(e) => set("connector_type", e.target.value)}>
              <option value="">None (manual upload only)</option>
              <option value="prana_csv">Prana (monthly CSV price list)</option>
            </select>
            <p style={{ fontSize: 11.5, color: "#9CA3AF", marginTop: 4 }}>
              Enables a "Sync" action on this supplier for uploading their price-list file through a standardized preview-then-confirm flow, instead of the generic Melee import page.
            </p>
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div>
            {!isNew && isAdmin && (
              <button onClick={handleDelete} style={{ padding: "8px 14px", background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                Delete
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ padding: "8px 16px", background: "#F3F4F6", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#374151" }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: "8px 20px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Saving…" : isNew ? "Create" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SyncModalProps {
  supplier: InventorySupplier;
  onClose: () => void;
  onSynced: () => void;
}

function SyncModal({ supplier, onClose, onSynced }: SyncModalProps) {
  const { user } = useUser();
  const [preview, setPreview] = useState<{
    sync_log_id: string | null;
    rows_processed: number;
    rows_flagged: number;
    detail: { payload: unknown; rowIssues: Array<{ row: number; reason: string }> };
  } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setPreview(null);
    setError("");
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/inventory/suppliers/${supplier.id}/sync`, {
        method: "POST",
        headers: { "x-tenant-id": user?.tenantId ?? "" },
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error || "Sync preview failed"); return; }
      setPreview(j);
    } catch {
      setError("Sync preview failed");
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirm() {
    if (!preview) return;
    setConfirming(true);
    setError("");
    try {
      const res = await fetch(`/api/inventory/suppliers/${supplier.id}/sync/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
        body: JSON.stringify({ sync_log_id: preview.sync_log_id, payload: preview.detail.payload }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error || "Sync failed"); return; }
      onSynced();
    } catch {
      setError("Sync failed");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 480, maxHeight: "80vh", overflowY: "auto", background: "#fff", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.18)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#1A1A2E" }}>Sync {supplier.name}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
          {error && <div style={{ padding: "10px 12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 6, fontSize: 13 }}>{error}</div>}

          {!preview && (
            <>
              <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
                Upload this supplier's price-list CSV. This is a preview — nothing is written until you confirm the results below.
              </p>
              <input
                type="file"
                accept=".csv"
                disabled={parsing}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              />
              {parsing && <p style={{ fontSize: 13, color: "#6B7280" }}>Parsing…</p>}
            </>
          )}

          {preview && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase" }}>Rows to import</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A2E" }}>{preview.rows_processed}</div>
                </div>
                <div style={{ background: preview.rows_flagged > 0 ? "#FFFBEB" : "#F9FAFB", border: `1px solid ${preview.rows_flagged > 0 ? "#FDE68A" : "#E8E8F0"}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase" }}>Flagged rows</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: preview.rows_flagged > 0 ? "#B45309" : "#1A1A2E" }}>{preview.rows_flagged}</div>
                </div>
              </div>
              <p style={{ fontSize: 12.5, color: "#6B7280", margin: 0, background: "#FEF2F2", padding: "10px 12px", borderRadius: 6 }}>
                Confirming will replace the entire tenant melee price list with these rows — this matches Settings → Melee "Import CSV" behaviour exactly (melee pricing has no per-supplier concept).
              </p>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setPreview(null)} style={{ padding: "8px 16px", background: "#F3F4F6", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#374151" }}>
                  Back
                </button>
                <button onClick={handleConfirm} disabled={confirming} style={{ padding: "8px 20px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, cursor: confirming ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, opacity: confirming ? 0.7 : 1 }}>
                  {confirming ? "Importing…" : `Confirm Import (${preview.rows_processed} rows)`}
                </button>
              </div>
            </>
          )}
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
  const [syncSupplier, setSyncSupplier] = useState<InventorySupplier | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  function handleSynced() {
    setSyncSupplier(null);
    setToast("Sync complete — melee price list updated.");
    fetchSuppliers();
    setTimeout(() => setToast(null), 4000);
  }

  const showDrawer = drawerNew || drawerSupplier != null;

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1A1A2E" }}>Suppliers</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>
            {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/inventory/suppliers/import"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: "#fff", color: "#374151", border: "1px solid #E5E7EB", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, textDecoration: "none" }}
          >
            <Upload size={14} />
            Import CSV
          </Link>
          <button onClick={openNew} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
            <Plus size={15} />
            New Supplier
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E8E8F0" }}>
              {["Name", "Contact", "Email", "Phone", "Lead Time", ""].map((h) => (
                <th key={h} style={{ padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#6B7280", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading…</td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>No suppliers yet. Add your first one.</td></tr>
            ) : suppliers.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 500, color: "#1A1A2E" }}>{s.name}</td>
                <td style={{ padding: "11px 14px", fontSize: 13, color: "#6B7280" }}>{s.contact_name ?? "—"}</td>
                <td style={{ padding: "11px 14px", fontSize: 13, color: "#6B7280" }}>
                  {s.email ? (
                    <a href={`mailto:${s.email}`} style={{ color: "#635BFF", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                      <Mail size={12} />{s.email}
                    </a>
                  ) : "—"}
                </td>
                <td style={{ padding: "11px 14px", fontSize: 13, color: "#6B7280" }}>
                  {s.phone ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Phone size={12} />{s.phone}
                    </span>
                  ) : "—"}
                </td>
                <td style={{ padding: "11px 14px", fontSize: 13, color: "#6B7280" }}>
                  {s.lead_time_days != null ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Clock size={12} />{s.lead_time_days}d
                    </span>
                  ) : "—"}
                </td>
                <td style={{ padding: "11px 14px" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {s.connector_type && (
                      <button
                        onClick={() => setSyncSupplier(s)}
                        title={s.connector_last_synced_at ? `Last synced ${new Date(s.connector_last_synced_at).toLocaleString("en-AU")}` : "Never synced"}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#EEF2FF", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#635BFF" }}
                      >
                        <RefreshCw size={12} /> Sync
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(s)}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#F3F4F6", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#374151" }}
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
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#FEE2E2", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#991B1B" }}
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

      {syncSupplier && (
        <SyncModal
          supplier={syncSupplier}
          onClose={() => setSyncSupplier(null)}
          onSynced={handleSynced}
        />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#1A1A2E", color: "#fff", padding: "10px 18px", borderRadius: 8, fontSize: 13, zIndex: 70 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
