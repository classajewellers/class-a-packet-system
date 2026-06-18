"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

interface Variant { id: string; pricing_mode: string | null; }

interface Product {
  id: string;
  name: string;
  product_type: string | null;
  product_status: string | null;
  active: boolean;
  pricing_product_variants: Variant[];
}

const STATUS_OPTIONS = ["in_stock", "made_to_order", "custom_order"] as const;
type Status = typeof STATUS_OPTIONS[number];

const STATUS_LABELS: Record<Status, string> = {
  in_stock:      "In Stock",
  made_to_order: "Made to Order",
  custom_order:  "Custom Order",
};

const STATUS_COLORS: Record<Status, { bg: string; color: string }> = {
  in_stock:      { bg: "#F0FDF4", color: "#16A34A" },
  made_to_order: { bg: "#FFFBEB", color: "#D97706" },
  custom_order:  { bg: "#EEF2FF", color: "#635BFF" },
};

function statusBadge(status: string | null) {
  const s = (status ?? "in_stock") as Status;
  const c = STATUS_COLORS[s] ?? STATUS_COLORS.in_stock;
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>
      {STATUS_LABELS[s] ?? s}
    </span>
  );
}

function modeDisplay(variants: Variant[]): string {
  if (!variants.length) return "—";
  const seen = new Set<string>(); const modes: string[] = [];
  for (const v of variants) { const m = v.pricing_mode ?? "our_build"; if (!seen.has(m)) { seen.add(m); modes.push(m); } }
  return modes.length === 1 ? modes[0].replace("_", " ") : "Mixed";
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#6B7280",
  textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em",
  background: "#F9FAFB", borderBottom: "1px solid #E8E8F0",
};

const inputStyle: React.CSSProperties = {
  padding: "5px 8px", border: "1px solid #D1D5DB", borderRadius: 6,
  fontSize: 13, width: "100%", boxSizing: "border-box",
};

export default function PricingProductsPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  const [products, setProducts]       = useState<Product[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);

  // New product form
  const [newName, setNewName]         = useState("");
  const [newType, setNewType]         = useState("");
  const [newStatus, setNewStatus]     = useState<Status>("in_stock");

  // Inline edit state
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editBuf, setEditBuf]         = useState({ name: "", product_type: "", product_status: "in_stock" as Status });
  const [editSaving, setEditSaving]   = useState(false);

  useEffect(() => {
    if (hydrated && user && user.role !== "admin") router.replace("/");
  }, [hydrated, user, router]);

  const load = useCallback(async () => {
    if (!hydrated || !user || user.role !== "admin") return;
    setLoading(true);
    const res = await fetch("/api/pricing-hub/products", {
      credentials: "include",
      headers: { "x-tenant-id": user.tenantId ?? "" },
    });
    const data = await res.json();
    setProducts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [hydrated, user]);

  useEffect(() => { load(); }, [load]);

  if (!hydrated || !user) return null;
  if (user.role !== "admin") return null;

  async function createProduct() {
    if (!newName.trim()) { setFormError("Name is required"); return; }
    setSaving(true); setFormError(null);
    const res = await fetch("/api/pricing-hub/products", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
      body: JSON.stringify({ name: newName.trim(), product_type: newType.trim() || null, product_status: newStatus }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setFormError(data.error ?? "Failed"); return; }
    setNewName(""); setNewType(""); setNewStatus("in_stock"); setShowForm(false);
    load();
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setEditBuf({ name: p.name, product_type: p.product_type ?? "", product_status: (p.product_status ?? "in_stock") as Status });
  }

  async function saveEdit(id: string) {
    setEditSaving(true);
    await fetch(`/api/pricing-hub/products/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
      body: JSON.stringify({ name: editBuf.name, product_type: editBuf.product_type || null, product_status: editBuf.product_status }),
    });
    setEditSaving(false); setEditingId(null);
    load();
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete this product and all its variants?")) return;
    await fetch(`/api/pricing-hub/products/${id}`, {
      method: "DELETE", credentials: "include",
      headers: { "x-tenant-id": user?.tenantId ?? "" },
    });
    load();
  }

  const PencilIcon = () => (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
  const TrashIcon = () => (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );

  return (
    <div style={{ padding: "32px 40px", maxWidth: 920 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1760", marginBottom: 4 }}>Products</h1>
          <p style={{ fontSize: 14, color: "#6B7280" }}>Product catalog with pricing variants.</p>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setFormError(null); }}
          style={{ padding: "9px 18px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          + New Product
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto", gap: 10, alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Name *</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Diamond Solitaire Ring" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Type</label>
              <input value={newType} onChange={e => setNewType(e.target.value)} placeholder="e.g. Ring" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Status</label>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value as Status)} style={{ ...inputStyle, width: "100%" }}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <button onClick={createProduct} disabled={saving} style={{ padding: "7px 16px", background: saving ? "#E8E8F0" : "#635BFF", color: saving ? "#9CA3AF" : "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: saving ? "wait" : "pointer", whiteSpace: "nowrap" as const }}>
              {saving ? "Saving…" : "Create"}
            </button>
            <button onClick={() => { setShowForm(false); setFormError(null); }} style={{ padding: "7px 12px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
          {formError && <p style={{ fontSize: 13, color: "#DC2626", marginTop: 8 }}>{formError}</p>}
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Product</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Status</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Variants</th>
              <th style={thStyle}>Pricing Mode</th>
              <th style={{ ...thStyle, width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading…</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>No products yet.</td></tr>
            ) : products.map((p, i) => {
              const isEditing = editingId === p.id;
              return (
                <tr key={p.id} style={{ borderBottom: i < products.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                  <td style={{ padding: "10px 14px" }}>
                    {isEditing
                      ? <input value={editBuf.name} onChange={e => setEditBuf(b => ({ ...b, name: e.target.value }))} style={{ ...inputStyle, width: 180 }} autoFocus />
                      : <Link href={`/pricing-hub/products/${p.id}`} style={{ fontSize: 14, fontWeight: 600, color: "#1A1760", textDecoration: "none" }}>{p.name}</Link>
                    }
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {isEditing
                      ? <input value={editBuf.product_type} onChange={e => setEditBuf(b => ({ ...b, product_type: e.target.value }))} placeholder="Type" style={{ ...inputStyle, width: 100 }} />
                      : <span style={{ fontSize: 13, color: "#6B7280" }}>{p.product_type ?? "—"}</span>
                    }
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {isEditing
                      ? <select value={editBuf.product_status} onChange={e => setEditBuf(b => ({ ...b, product_status: e.target.value as Status }))} style={{ ...inputStyle, width: 140 }}>
                          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                        </select>
                      : statusBadge(p.product_status)
                    }
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 13, color: "#374151" }}>
                    {p.pricing_product_variants?.length ?? 0}
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#6B7280", textTransform: "capitalize" as const }}>
                    {modeDisplay(p.pricing_product_variants ?? [])}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(p.id)} disabled={editSaving} style={{ padding: "4px 12px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            {editSaving ? "…" : "Save"}
                          </button>
                          <button onClick={() => setEditingId(null)} style={{ padding: "4px 10px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(p)} title="Edit" style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 4, display: "flex", alignItems: "center" }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#635BFF")}
                            onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
                          ><PencilIcon /></button>
                          <button onClick={() => deleteProduct(p.id)} title="Delete" style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 4, display: "flex", alignItems: "center" }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#DC2626")}
                            onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
                          ><TrashIcon /></button>
                          <Link href={`/pricing-hub/products/${p.id}`} style={{ fontSize: 12, color: "#635BFF", textDecoration: "none", fontWeight: 500 }}>
                            Open →
                          </Link>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
