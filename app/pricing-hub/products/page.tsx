"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

interface Variant { id: string; pricing_mode: string | null; }

interface Product {
  id: string;
  name: string;
  category: string | null;
  active: boolean;
  pricing_product_variants: Variant[];
}

function statusBadge(active: boolean) {
  return active
    ? <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#F0FDF4", color: "#16A34A" }}>Active</span>
    : <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#F3F4F6", color: "#6B7280" }}>Inactive</span>;
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
  const [refreshKey, setRefreshKey]   = useState(0);
  const [showForm, setShowForm]       = useState(false);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);

  // New product form
  const [newName, setNewName]         = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newActive, setNewActive]     = useState(true);

  // Inline edit state
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editBuf, setEditBuf]         = useState({ name: "", category: "", active: true });
  const [editSaving, setEditSaving]   = useState(false);

  useEffect(() => {
    if (hydrated && user && user.role !== "admin") router.replace("/");
  }, [hydrated, user, router]);

  // Fetch products whenever refreshKey bumps — cache: no-store prevents stale GET responses
  // Derive stable primitives so the effect doesn't re-run on every render due
  // to the user object being a new reference each time useUser() is called.
  const userRole     = user?.role ?? "";
  const userTenantId = user?.tenantId ?? "";

  useEffect(() => {
    if (!hydrated || userRole !== "admin") return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/pricing-hub/products", {
      credentials: "include",
      cache: "no-store",
      headers: { "x-tenant-id": userTenantId },
    })
      .then(r => r.json())
      .then(data => { if (!cancelled) { setProducts(Array.isArray(data) ? data : []); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hydrated, userRole, userTenantId, refreshKey]);

  if (!hydrated || !user) return null;
  if (user.role !== "admin") return null;

  async function createProduct() {
    if (!newName.trim()) { setFormError("Name is required"); return; }
    setSaving(true); setFormError(null);
    const res = await fetch("/api/pricing-hub/products", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
      body: JSON.stringify({ name: newName.trim(), category: newCategory.trim() || null, active: newActive }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setFormError(data.error ?? "Failed"); return; }
    setNewName(""); setNewCategory(""); setNewActive(true); setShowForm(false);
    setRefreshKey(k => k + 1);
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setEditBuf({ name: p.name, category: p.category ?? "", active: p.active });
  }

  async function saveEdit(id: string) {
    setEditSaving(true);
    await fetch(`/api/pricing-hub/products/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
      body: JSON.stringify({ name: editBuf.name, category: editBuf.category || null, active: editBuf.active }),
    });
    setEditSaving(false); setEditingId(null);
    setRefreshKey(k => k + 1);
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete this product and all its variants?")) return;
    await fetch(`/api/pricing-hub/products/${id}`, {
      method: "DELETE", credentials: "include",
      headers: { "x-tenant-id": user?.tenantId ?? "" },
    });
    setRefreshKey(k => k + 1);
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
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Category</label>
              <input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="e.g. Ring" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Status</label>
              <select value={newActive ? "active" : "inactive"} onChange={e => setNewActive(e.target.value === "active")} style={{ ...inputStyle, width: "100%" }}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
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
              <th style={thStyle}>Category</th>
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
                      ? <input value={editBuf.category} onChange={e => setEditBuf(b => ({ ...b, category: e.target.value }))} placeholder="Category" style={{ ...inputStyle, width: 100 }} />
                      : <span style={{ fontSize: 13, color: "#6B7280" }}>{p.category ?? "—"}</span>
                    }
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {isEditing
                      ? <select value={editBuf.active ? "active" : "inactive"} onChange={e => setEditBuf(b => ({ ...b, active: e.target.value === "active" }))} style={{ ...inputStyle, width: 110 }}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      : statusBadge(p.active)
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
