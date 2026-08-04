"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { Plus, X, Package, ChevronRight, Upload } from "lucide-react";

export default function ProductsPage() {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const tenantId = user?.tenantId ?? "";
  const isManager = hydrated ? canManage(user?.role) : false;

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", category_id: "", collection: "" });
  const [newSaving, setNewSaving] = useState(false);
  const [newError, setNewError] = useState("");
  const [ref, setRef] = useState<any>(null);

  const headers = { "x-tenant-id": tenantId };

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [prodRes, refRes] = await Promise.all([
      fetch("/api/inventory/products", { headers }),
      fetch("/api/inventory/reference", { headers }),
    ]);
    if (prodRes.ok) setProducts((await prodRes.json()).products ?? []);
    if (refRes.ok) setRef(await refRes.json());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleCreate() {
    if (!newForm.name.trim()) { setNewError("Name is required"); return; }
    setNewSaving(true);
    setNewError("");
    const res = await fetch("/api/inventory/products", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(newForm),
    });
    const json = await res.json();
    setNewSaving(false);
    if (!res.ok) { setNewError(json.error ?? "Failed to create"); return; }
    setShowNew(false);
    setNewForm({ name: "", category_id: "", collection: "" });
    router.push(`/inventory/products/${json.product.id}`);
  }

  if (!hydrated) return null;

  const LF = { fontSize: 13, fontWeight: 500 as const, color: "#374151", display: "block" as const, marginBottom: 4 };
  const IF = { width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14 };

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>Products</h1>
          <p style={{ fontSize: 14, color: "#6B7280", margin: "4px 0 0" }}>
            {loading ? "Loading…" : `${products.length} product${products.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        {isManager && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => router.push("/inventory/import")}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 500, background: "#F9FAFB", color: "#374151", border: "1px solid #E5E7EB", cursor: "pointer" }}
            >
              <Upload size={15} /> Import CSV
            </button>
            <button
              onClick={() => { setShowNew(true); setNewError(""); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 500, background: "#111827", color: "#fff", border: "none", cursor: "pointer" }}
            >
              <Plus size={15} /> New Product
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>Loading…</div>
        ) : products.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center" }}>
            <Package size={40} style={{ color: "#E5E7EB", marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginBottom: 6 }}>No products yet</div>
            <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>
              Create a product to group and describe your stock by style.
            </div>
            {isManager && (
              <button
                onClick={() => setShowNew(true)}
                style={{ padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 500, background: "#111827", color: "#fff", border: "none", cursor: "pointer" }}
              >
                Create Product
              </button>
            )}
          </div>
        ) : (
          products.map((product, i) => {
            const catName = typeof product.category === "object" && product.category && "name" in product.category
              ? product.category.name : typeof product.category === "string" ? product.category : null;
            return (
              <div
                key={product.id}
                onClick={() => router.push(`/inventory/products/${product.id}`)}
                style={{
                  display: "flex", alignItems: "center", padding: "16px 20px",
                  borderBottom: i < products.length - 1 ? "1px solid #F3F4F6" : "none",
                  cursor: "pointer",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 16, flexShrink: 0 }}>
                  <Package size={18} style={{ color: "#635BFF" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{product.name}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                    {catName && (
                      <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 999, background: "#F3F4F6", color: "#6B7280", fontWeight: 500 }}>{catName}</span>
                    )}
                    {product.collection && (
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>{product.collection}</span>
                    )}
                    {product.style && (
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>{product.style}</span>
                    )}
                  </div>
                </div>
                <div style={{ marginRight: 16, flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{product.piece_count ?? 0}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>pieces</div>
                </div>
                <ChevronRight size={16} style={{ color: "#D1D5DB", flexShrink: 0 }} />
              </div>
            );
          })
        )}
      </div>

      {/* New Product Modal */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>New Product</h2>
              <button onClick={() => setShowNew(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={20} /></button>
            </div>
            {newError && <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{newError}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={LF}>Name <span style={{ color: "#EF4444" }}>*</span></label>
                <input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Diamond Solitaire Ring" style={IF} />
              </div>
              <div>
                <label style={LF}>Category</label>
                <select value={newForm.category_id} onChange={e => setNewForm(f => ({ ...f, category_id: e.target.value }))} style={{ ...IF, background: "#fff" }}>
                  <option value="">— None —</option>
                  {ref?.categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={LF}>Collection</label>
                <input value={newForm.collection} onChange={e => setNewForm(f => ({ ...f, collection: e.target.value }))} placeholder="e.g. Eternal" style={IF} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowNew(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleCreate} disabled={newSaving} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: newSaving ? "not-allowed" : "pointer", opacity: newSaving ? 0.7 : 1 }}>
                {newSaving ? "Creating…" : "Create & Open"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
