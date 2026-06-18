"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  active: boolean;
  created_at: string;
  pricing_product_variants: { id: string }[];
}

export default function PricingProductsPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  const [products, setProducts]   = useState<ProductRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [name, setName]           = useState("");
  const [category, setCategory]   = useState("");
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && user && user.role !== "admin") router.replace("/");
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!hydrated || !user || user.role !== "admin") return;
    load();
  }, [hydrated, user]);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/pricing-hub/products", { credentials: "include" });
    const data = await res.json();
    setProducts(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function createProduct() {
    if (!name.trim()) { setFormError("Name is required"); return; }
    setSaving(true);
    setFormError(null);
    const res = await fetch("/api/pricing-hub/products", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), category: category.trim() || null }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setFormError(data.error ?? "Failed to create product"); return; }
    setName(""); setCategory(""); setShowForm(false);
    load();
  }

  if (!hydrated || !user) return null;
  if (user.role !== "admin") return null;

  const thStyle: React.CSSProperties = {
    padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#6B7280",
    textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em",
    background: "#F9FAFB", borderBottom: "1px solid #E8E8F0",
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 880 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1760", marginBottom: 4 }}>Products</h1>
          <p style={{ fontSize: 14, color: "#6B7280" }}>Product catalog with variants and pricing modes.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{ padding: "9px 18px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          + New Product
        </button>
      </div>

      {/* New product form */}
      {showForm && (
        <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Name *</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Diamond Solitaire Ring"
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Category</label>
              <input
                value={category} onChange={e => setCategory(e.target.value)}
                placeholder="e.g. Rings"
                style={{ width: "100%", padding: "8px 12px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
            <button
              onClick={createProduct} disabled={saving}
              style={{ padding: "8px 18px", background: saving ? "#E8E8F0" : "#635BFF", color: saving ? "#9CA3AF" : "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? "wait" : "pointer", flexShrink: 0 }}
            >
              {saving ? "Saving…" : "Create"}
            </button>
            <button
              onClick={() => { setShowForm(false); setName(""); setCategory(""); setFormError(null); }}
              style={{ padding: "8px 14px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, cursor: "pointer", flexShrink: 0 }}
            >
              Cancel
            </button>
          </div>
          {formError && <p style={{ fontSize: 13, color: "#DC2626", marginTop: 10 }}>{formError}</p>}
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Product</th>
              <th style={thStyle}>Category</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Variants</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
              <th style={{ ...thStyle, width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading…</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>No products yet. Click "+ New Product" to add one.</td></tr>
            ) : products.map((p, i) => (
              <tr key={p.id} style={{ borderBottom: i < products.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                <td style={{ padding: "12px 14px", fontSize: 14, color: "#1A1760", fontWeight: 600 }}>{p.name}</td>
                <td style={{ padding: "12px 14px", fontSize: 13, color: "#6B7280" }}>{p.category ?? "—"}</td>
                <td style={{ padding: "12px 14px", fontSize: 13, color: "#374151", textAlign: "center" }}>
                  {p.pricing_product_variants?.length ?? 0}
                </td>
                <td style={{ padding: "12px 14px", textAlign: "center" }}>
                  <span style={{
                    display: "inline-block", padding: "2px 10px", borderRadius: 20,
                    fontSize: 11, fontWeight: 600,
                    background: p.active ? "#F0FDF4" : "#F9FAFB",
                    color: p.active ? "#16A34A" : "#9CA3AF",
                  }}>
                    {p.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <Link
                    href={`/pricing-hub/products/${p.id}`}
                    style={{ fontSize: 13, color: "#635BFF", textDecoration: "none", fontWeight: 500 }}
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
