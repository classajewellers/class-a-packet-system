"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

interface BuildComponent {
  id: string;
  component_type: string;
  description: string;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  is_dynamic: boolean;
}

interface SupplierCost {
  id: string;
  supplier_name: string;
  supplier_item_code: string | null;
  cost_ex_gst: number;
  currency: string;
  price_list_date: string;
  notes: string | null;
}

interface Variant {
  id: string;
  name: string;
  metal_type: string | null;
  metal_grams: number | null;
  active_pricing_mode: string;
  target_margin_multiplier: number;
  current_retail: number | null;
  notes: string | null;
  pricing_build_components: BuildComponent[];
  pricing_supplier_costs: SupplierCost[];
}

interface Product {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  active: boolean;
  pricing_product_variants: Variant[];
}

function totalBuildCost(comps: BuildComponent[]): number {
  return comps.reduce((s, c) => s + (c.total_cost != null ? Number(c.total_cost) : 0), 0);
}

function latestSupplierCost(costs: SupplierCost[]): SupplierCost | null {
  if (!costs.length) return null;
  return [...costs].sort((a, b) => b.price_list_date.localeCompare(a.price_list_date))[0];
}

export default function ProductDetailPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [product, setProduct]         = useState<Product | null>(null);
  const [loading, setLoading]         = useState(true);
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [showNewVariant, setShowNewVariant] = useState(false);

  // New variant form state
  const [vName, setVName]           = useState("");
  const [vMetal, setVMetal]         = useState("");
  const [vGrams, setVGrams]         = useState("");
  const [vMode, setVMode]           = useState("build");
  const [vMultiplier, setVMultiplier] = useState("2.5");
  const [vSaving, setVSaving]       = useState(false);
  const [vError, setVError]         = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && user && user.role !== "admin") router.replace("/");
  }, [hydrated, user, router]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await fetch(`/api/pricing-hub/products/${id}`, { credentials: "include" });
    if (!res.ok) { setProduct(null); setLoading(false); return; }
    const data = await res.json();
    setProduct(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!hydrated || !user || user.role !== "admin") return;
    load();
  }, [hydrated, user, load]);

  if (!hydrated || !user) return null;
  if (user.role !== "admin") return null;

  async function createVariant() {
    if (!vName.trim()) { setVError("Name is required"); return; }
    setVSaving(true); setVError(null);
    const res = await fetch("/api/pricing-hub/variants", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: id,
        name: vName.trim(),
        metal_type: vMetal.trim() || null,
        metal_grams: vGrams ? parseFloat(vGrams) : null,
        active_pricing_mode: vMode,
        target_margin_multiplier: parseFloat(vMultiplier) || 2.5,
      }),
    });
    const data = await res.json();
    setVSaving(false);
    if (!res.ok) { setVError(data.error ?? "Failed to create variant"); return; }
    setVName(""); setVMetal(""); setVGrams(""); setVMode("build"); setVMultiplier("2.5");
    setShowNewVariant(false);
    load();
  }

  const toggleExpand = (vid: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(vid) ? n.delete(vid) : n.add(vid); return n; });

  const thStyle: React.CSSProperties = {
    padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#6B7280",
    textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em",
    background: "#F9FAFB", borderBottom: "1px solid #E8E8F0",
  };

  if (loading) {
    return <div style={{ padding: "32px 40px", color: "#9CA3AF", fontSize: 14 }}>Loading…</div>;
  }

  if (!product) {
    return (
      <div style={{ padding: "32px 40px" }}>
        <p style={{ color: "#DC2626", fontSize: 14 }}>Product not found.</p>
        <Link href="/pricing-hub/products" style={{ color: "#635BFF", fontSize: 13 }}>← Back to Products</Link>
      </div>
    );
  }

  const variants = product.pricing_product_variants ?? [];

  return (
    <div style={{ padding: "32px 40px", maxWidth: 960 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 16 }}>
        <Link href="/pricing-hub/products" style={{ color: "#635BFF", textDecoration: "none" }}>Products</Link>
        <span style={{ margin: "0 6px" }}>›</span>
        <span>{product.name}</span>
      </div>

      {/* Product header */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A1760", marginBottom: 4 }}>{product.name}</h1>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {product.category && <span style={{ fontSize: 13, color: "#6B7280" }}>{product.category}</span>}
              <span style={{
                display: "inline-block", padding: "2px 10px", borderRadius: 20,
                fontSize: 11, fontWeight: 600,
                background: product.active ? "#F0FDF4" : "#F9FAFB",
                color: product.active ? "#16A34A" : "#9CA3AF",
              }}>
                {product.active ? "Active" : "Inactive"}
              </span>
            </div>
            {product.description && (
              <p style={{ fontSize: 13, color: "#6B7280", marginTop: 8 }}>{product.description}</p>
            )}
          </div>
          <div style={{ fontSize: 13, color: "#6B7280" }}>
            {variants.length} variant{variants.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      {/* Variants */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A1760" }}>Variants</h2>
        <button
          onClick={() => setShowNewVariant(v => !v)}
          style={{ padding: "8px 16px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          + Add Variant
        </button>
      </div>

      {/* New variant form */}
      {showNewVariant && (
        <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            {[
              { label: "Variant Name *", val: vName, set: setVName, placeholder: "e.g. 18ct Yellow Gold 3g" },
              { label: "Metal Type",     val: vMetal, set: setVMetal, placeholder: "e.g. 18ct Yellow" },
              { label: "Grams",          val: vGrams, set: setVGrams, placeholder: "3.00" },
              { label: "Target ×",       val: vMultiplier, set: setVMultiplier, placeholder: "2.5" },
            ].map(f => (
              <div key={f.label}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>{f.label}</label>
                <input
                  value={f.val} onChange={e => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Mode</label>
              <select
                value={vMode} onChange={e => setVMode(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13 }}
              >
                <option value="build">Build</option>
                <option value="supplier">Supplier</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={createVariant} disabled={vSaving}
              style={{ padding: "7px 16px", background: vSaving ? "#E8E8F0" : "#635BFF", color: vSaving ? "#9CA3AF" : "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: vSaving ? "wait" : "pointer" }}
            >
              {vSaving ? "Saving…" : "Create Variant"}
            </button>
            <button onClick={() => setShowNewVariant(false)} style={{ padding: "7px 14px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
          {vError && <p style={{ fontSize: 13, color: "#DC2626", marginTop: 8 }}>{vError}</p>}
        </div>
      )}

      {variants.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
          No variants yet. Click "+ Add Variant" to create one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {variants.map(v => {
            const isOpen = expanded.has(v.id);
            const buildCost = totalBuildCost(v.pricing_build_components ?? []);
            const latestSC  = latestSupplierCost(v.pricing_supplier_costs ?? []);
            const retail    = v.current_retail != null ? Number(v.current_retail) : null;
            const effectiveCost = v.active_pricing_mode === "supplier" && latestSC
              ? Number(latestSC.cost_ex_gst)
              : buildCost > 0 ? buildCost : null;
            const margin = retail && effectiveCost && effectiveCost > 0
              ? (retail / effectiveCost).toFixed(2) : null;

            return (
              <div key={v.id} style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 10, overflow: "hidden" }}>
                <div
                  onClick={() => toggleExpand(v.id)}
                  style={{ display: "flex", alignItems: "center", padding: "14px 18px", cursor: "pointer", gap: 14 }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1760" }}>{v.name}</div>
                    {v.metal_type && (
                      <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
                        {v.metal_type}{v.metal_grams ? ` · ${v.metal_grams}g` : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 13 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#6B7280", fontSize: 11 }}>Mode</div>
                      <div style={{ color: "#374151", fontWeight: 500, textTransform: "capitalize" }}>{v.active_pricing_mode}</div>
                    </div>
                    {effectiveCost != null && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#6B7280", fontSize: 11 }}>Cost</div>
                        <div style={{ color: "#374151", fontWeight: 500 }}>${effectiveCost.toFixed(2)}</div>
                      </div>
                    )}
                    {retail != null && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#6B7280", fontSize: 11 }}>Retail</div>
                        <div style={{ color: "#1A1760", fontWeight: 700 }}>${retail.toFixed(2)}</div>
                      </div>
                    )}
                    {margin && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: "#6B7280", fontSize: 11 }}>Margin</div>
                        <div style={{
                          fontWeight: 600,
                          color: Number(margin) >= 2 ? "#16A34A" : "#DC2626",
                        }}>{margin}×</div>
                      </div>
                    )}
                    <span style={{ color: "#9CA3AF", fontSize: 16 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ borderTop: "1px solid #F3F4F6", padding: "16px 18px", background: "#FAFAFA" }}>
                    {/* Build components */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Build Components ({v.pricing_build_components?.length ?? 0})
                      </div>
                      {(v.pricing_build_components?.length ?? 0) === 0 ? (
                        <p style={{ fontSize: 13, color: "#9CA3AF" }}>No build components. Add via the API.</p>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th style={thStyle}>Type</th>
                              <th style={thStyle}>Description</th>
                              <th style={{ ...thStyle, textAlign: "right" }}>Qty</th>
                              <th style={{ ...thStyle, textAlign: "right" }}>Unit Cost</th>
                              <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {v.pricing_build_components.map((c, ci) => (
                              <tr key={c.id} style={{ borderBottom: ci < v.pricing_build_components.length - 1 ? "1px solid #F3F4F6" : "none", background: "#fff" }}>
                                <td style={{ padding: "8px 12px", textTransform: "capitalize" }}>{c.component_type}</td>
                                <td style={{ padding: "8px 12px" }}>{c.description}</td>
                                <td style={{ padding: "8px 12px", textAlign: "right" }}>{c.quantity}</td>
                                <td style={{ padding: "8px 12px", textAlign: "right" }}>{c.unit_cost != null ? `$${Number(c.unit_cost).toFixed(2)}` : "—"}</td>
                                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600 }}>{c.total_cost != null ? `$${Number(c.total_cost).toFixed(2)}` : "—"}</td>
                              </tr>
                            ))}
                            <tr style={{ background: "#F9FAFB" }}>
                              <td colSpan={4} style={{ padding: "8px 12px", fontWeight: 700, textAlign: "right", color: "#374151" }}>Build Cost Total</td>
                              <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#1A1760" }}>${buildCost.toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Supplier costs */}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Supplier Costs ({v.pricing_supplier_costs?.length ?? 0})
                      </div>
                      {(v.pricing_supplier_costs?.length ?? 0) === 0 ? (
                        <p style={{ fontSize: 13, color: "#9CA3AF" }}>No supplier costs recorded.</p>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th style={thStyle}>Supplier</th>
                              <th style={thStyle}>Item Code</th>
                              <th style={{ ...thStyle, textAlign: "right" }}>Cost (ex GST)</th>
                              <th style={thStyle}>Quote Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {v.pricing_supplier_costs.map((sc, si) => (
                              <tr key={sc.id} style={{ borderBottom: si < v.pricing_supplier_costs.length - 1 ? "1px solid #F3F4F6" : "none", background: "#fff" }}>
                                <td style={{ padding: "8px 12px", fontWeight: 500 }}>{sc.supplier_name}</td>
                                <td style={{ padding: "8px 12px", color: "#9CA3AF" }}>{sc.supplier_item_code ?? "—"}</td>
                                <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#1A1760" }}>
                                  ${Number(sc.cost_ex_gst).toFixed(2)} <span style={{ color: "#9CA3AF", fontWeight: 400, fontSize: 11 }}>{sc.currency}</span>
                                </td>
                                <td style={{ padding: "8px 12px", color: "#6B7280" }}>
                                  {new Date(sc.price_list_date).toLocaleDateString("en-AU")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
