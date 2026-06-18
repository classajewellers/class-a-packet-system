"use client";

export const dynamic    = "force-dynamic";
export const revalidate = 0;

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

interface GoldPrice   { id: string; metal_type: string; price_per_gram: number; }
interface RateCard    { id: string; card_type: string; label: string; amount: number; unit: string; }

interface BuildComponent  { id: string; component_type: string; description: string; quantity: number; unit_cost: number | null; total_cost: number | null; }
interface SupplierCost    { id: string; supplier_name: string; cost_ex_gst: number; currency: string; price_list_date: string; }

interface Variant {
  id: string;
  name: string;
  metal_type: string | null;
  metal_grams: number | null;
  diamond_type: string | null;
  pricing_mode: string | null;
  last_direct_cost: number | null;
  current_retail: number | null;
  notes: string | null;
  pricing_build_components: BuildComponent[];
  pricing_supplier_costs: SupplierCost[];
}

interface Product {
  id: string;
  name: string;
  product_type: string | null;
  product_status: string | null;
  active: boolean;
  pricing_product_variants: Variant[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  in_stock: "In Stock", made_to_order: "Made to Order", custom_order: "Custom Order",
};

function findGoldPrice(goldPrices: GoldPrice[], metalType: string | null): GoldPrice | null {
  if (!metalType) return null;
  const exact = goldPrices.find(g => g.metal_type === metalType);
  if (exact) return exact;
  const lower = metalType.toLowerCase();
  return goldPrices.find(g =>
    lower.includes(g.metal_type.toLowerCase()) || g.metal_type.toLowerCase().includes(lower)
  ) ?? null;
}

function calcLiveCost(v: Variant, goldPrices: GoldPrice[], rateCards: RateCard[]): { total: number | null; breakdown: string } {
  if (!v.metal_grams) return { total: null, breakdown: "⚠ Weight needed" };

  const gp = findGoldPrice(goldPrices, v.metal_type);
  const goldCost = gp ? Number(v.metal_grams) * Number(gp.price_per_gram) : 0;

  const mode = v.pricing_mode ?? "our_build";
  const cards = rateCards.filter(r => r.card_type === mode);
  const rateCost = cards.reduce((s, r) => s + Number(r.amount), 0);

  let diamondNote = "";
  if (v.diamond_type === "natural") diamondNote = " + Rap TBC";
  else if (v.diamond_type === "lab")     diamondNote = " + Lab TBC";

  const total = goldCost + rateCost;
  const breakdown = `$${goldCost.toFixed(2)} metal + $${rateCost.toFixed(2)} rates${diamondNote}`;
  return { total, breakdown };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { user, hydrated } = useUser();
  const router  = useRouter();
  const params  = useParams();
  const id      = params?.id as string;

  const [product, setProduct]       = useState<Product | null>(null);
  const [goldPrices, setGoldPrices] = useState<GoldPrice[]>([]);
  const [rateCards, setRateCards]   = useState<RateCard[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());

  // Header inline edit
  const [editHeader, setEditHeader] = useState(false);
  const [hdrBuf, setHdrBuf]         = useState({ name: "", product_type: "", product_status: "in_stock" });
  const [hdrSaving, setHdrSaving]   = useState(false);

  // Variant edit
  const [editingVid, setEditingVid] = useState<string | null>(null);
  const [vBuf, setVBuf]             = useState<Partial<Variant>>({});
  const [vSaving, setVSaving]       = useState(false);

  // Add variant form
  const [showAdd, setShowAdd]       = useState(false);
  const [vNew, setVNew]             = useState({
    name: "", metal_type: "", metal_grams: "", diamond_type: "none", pricing_mode: "our_build",
  });
  const [addSaving, setAddSaving]   = useState(false);
  const [addError, setAddError]     = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && user && user.role !== "admin") router.replace("/");
  }, [hydrated, user, router]);

  const load = useCallback(async () => {
    if (!id || !hydrated || !user || user.role !== "admin") return;
    setLoading(true);
    const tid = user.tenantId ?? "";
    const [pRes, gRes, rRes] = await Promise.all([
      fetch(`/api/pricing-hub/products/${id}`,     { credentials: "include", headers: { "x-tenant-id": tid } }),
      fetch("/api/pricing-hub/gold-prices",         { credentials: "include", headers: { "x-tenant-id": tid } }),
      fetch("/api/pricing-hub/rate-cards",          { credentials: "include", headers: { "x-tenant-id": tid } }),
    ]);
    const [pData, gData, rData] = await Promise.all([pRes.json(), gRes.json(), rRes.json()]);
    setProduct(pRes.ok ? pData : null);
    setGoldPrices(Array.isArray(gData) ? gData : []);
    setRateCards(Array.isArray(rData) ? rData : []);
    setLoading(false);
  }, [id, hydrated, user]);

  useEffect(() => { load(); }, [load]);

  if (!hydrated || !user) return null;
  if (user.role !== "admin") return null;

  const tid = user.tenantId ?? "";

  async function saveHeader() {
    if (!product) return;
    setHdrSaving(true);
    await fetch(`/api/pricing-hub/products/${product.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({ name: hdrBuf.name, product_type: hdrBuf.product_type || null, product_status: hdrBuf.product_status }),
    });
    setHdrSaving(false); setEditHeader(false);
    load();
  }

  function startEditHeader() {
    if (!product) return;
    setHdrBuf({ name: product.name, product_type: product.product_type ?? "", product_status: product.product_status ?? "in_stock" });
    setEditHeader(true);
  }

  function startEditVariant(v: Variant) {
    setEditingVid(v.id);
    setVBuf({ name: v.name, metal_type: v.metal_type, metal_grams: v.metal_grams, diamond_type: v.diamond_type, pricing_mode: v.pricing_mode, last_direct_cost: v.last_direct_cost });
  }

  async function saveVariant(vid: string) {
    setVSaving(true);
    await fetch(`/api/pricing-hub/variants/${vid}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify(vBuf),
    });
    setVSaving(false); setEditingVid(null);
    load();
  }

  async function togglePricingMode(v: Variant) {
    const next = v.pricing_mode === "our_build" ? "supplier" : "our_build";
    await fetch(`/api/pricing-hub/variants/${v.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({ pricing_mode: next }),
    });
    load();
  }

  async function deleteVariant(vid: string) {
    if (!confirm("Delete this variant?")) return;
    await fetch(`/api/pricing-hub/variants/${vid}`, {
      method: "DELETE", credentials: "include",
      headers: { "x-tenant-id": tid },
    });
    load();
  }

  async function createVariant() {
    if (!vNew.name.trim()) { setAddError("Name / size descriptor required"); return; }
    setAddSaving(true); setAddError(null);
    const res = await fetch("/api/pricing-hub/variants", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({
        product_id:  id,
        name:        vNew.name.trim(),
        metal_type:  vNew.metal_type   || null,
        metal_grams: vNew.metal_grams  ? Number(vNew.metal_grams) : null,
        diamond_type: vNew.diamond_type,
        pricing_mode: vNew.pricing_mode,
      }),
    });
    const data = await res.json();
    setAddSaving(false);
    if (!res.ok) { setAddError(data.error ?? "Failed"); return; }
    setVNew({ name: "", metal_type: "", metal_grams: "", diamond_type: "none", pricing_mode: "our_build" });
    setShowAdd(false);
    load();
  }

  const toggleExpand = (vid: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(vid) ? n.delete(vid) : n.add(vid); return n; });

  const inputSm: React.CSSProperties = { padding: "4px 8px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, boxSizing: "border-box" as const };
  const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#6B7280", textAlign: "left" as const, textTransform: "uppercase" as const, letterSpacing: "0.04em", background: "#F9FAFB", borderBottom: "1px solid #E8E8F0" };

  const metalOptions = goldPrices.length
    ? goldPrices.map(g => g.metal_type)
    : ["9ct Yellow", "9ct White", "18ct Yellow", "18ct White", "Platinum"];

  if (loading) return <div style={{ padding: "32px 40px", color: "#9CA3AF", fontSize: 14 }}>Loading…</div>;
  if (!product) return (
    <div style={{ padding: "32px 40px" }}>
      <p style={{ color: "#DC2626", fontSize: 14 }}>Product not found.</p>
      <Link href="/pricing-hub/products" style={{ color: "#635BFF", fontSize: 13 }}>← Back to Products</Link>
    </div>
  );

  const variants = product.pricing_product_variants ?? [];

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1000 }}>
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 16 }}>
        <Link href="/pricing-hub/products" style={{ color: "#635BFF", textDecoration: "none" }}>Products</Link>
        <span style={{ margin: "0 6px" }}>›</span>
        <span>{product.name}</span>
      </div>

      {/* Product header */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        {editHeader ? (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto", gap: 10, alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Product Name</label>
              <input value={hdrBuf.name} onChange={e => setHdrBuf(b => ({ ...b, name: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, boxSizing: "border-box" as const }} autoFocus />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Type</label>
              <input value={hdrBuf.product_type} onChange={e => setHdrBuf(b => ({ ...b, product_type: e.target.value }))}
                placeholder="e.g. Ring" style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Status</label>
              <select value={hdrBuf.product_status} onChange={e => setHdrBuf(b => ({ ...b, product_status: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13 }}>
                <option value="in_stock">In Stock</option>
                <option value="made_to_order">Made to Order</option>
                <option value="custom_order">Custom Order</option>
              </select>
            </div>
            <button onClick={saveHeader} disabled={hdrSaving}
              style={{ padding: "7px 16px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {hdrSaving ? "…" : "Save"}
            </button>
            <button onClick={() => setEditHeader(false)}
              style={{ padding: "7px 12px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A1760", marginBottom: 6 }}>{product.name}</h1>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {product.product_type && <span style={{ fontSize: 13, color: "#6B7280" }}>{product.product_type}</span>}
                <span style={{
                  display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: product.product_status === "in_stock" ? "#F0FDF4" : product.product_status === "made_to_order" ? "#FFFBEB" : "#EEF2FF",
                  color: product.product_status === "in_stock" ? "#16A34A" : product.product_status === "made_to_order" ? "#D97706" : "#635BFF",
                }}>
                  {STATUS_LABELS[product.product_status ?? "in_stock"] ?? product.product_status}
                </span>
              </div>
            </div>
            <button onClick={startEditHeader}
              style={{ background: "transparent", border: "1px solid #E8E8F0", borderRadius: 8, padding: "6px 14px", fontSize: 13, color: "#6B7280", cursor: "pointer" }}>
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Variants */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A1760" }}>Variants <span style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 400 }}>({variants.length})</span></h2>
        <button onClick={() => setShowAdd(v => !v)}
          style={{ padding: "8px 16px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          + Add Variant
        </button>
      </div>

      {/* Add variant form */}
      {showAdd && (
        <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Size / Descriptor *</label>
              <input value={vNew.name} onChange={e => setVNew(v => ({ ...v, name: e.target.value }))} placeholder="e.g. 0.50ct RBC" style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, boxSizing: "border-box" as const }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Metal</label>
              <select value={vNew.metal_type} onChange={e => setVNew(v => ({ ...v, metal_type: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13 }}>
                <option value="">— Select —</option>
                {metalOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Gram Weight</label>
              <input type="number" step="0.01" min="0" value={vNew.metal_grams} onChange={e => setVNew(v => ({ ...v, metal_grams: e.target.value }))} placeholder="e.g. 3.50"
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, boxSizing: "border-box" as const }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Diamond</label>
              <select value={vNew.diamond_type} onChange={e => setVNew(v => ({ ...v, diamond_type: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13 }}>
                <option value="none">None</option>
                <option value="natural">Natural</option>
                <option value="lab">Lab Grown</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Pricing Mode</label>
              <select value={vNew.pricing_mode} onChange={e => setVNew(v => ({ ...v, pricing_mode: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13 }}>
                <option value="our_build">Our Build</option>
                <option value="supplier">Supplier</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={createVariant} disabled={addSaving}
              style={{ padding: "7px 16px", background: addSaving ? "#E8E8F0" : "#635BFF", color: addSaving ? "#9CA3AF" : "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: addSaving ? "wait" : "pointer" }}>
              {addSaving ? "Saving…" : "Add Variant"}
            </button>
            <button onClick={() => { setShowAdd(false); setAddError(null); }}
              style={{ padding: "7px 12px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
          {addError && <p style={{ fontSize: 13, color: "#DC2626", marginTop: 8 }}>{addError}</p>}
        </div>
      )}

      {variants.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
          No variants yet. Click "+ Add Variant" to create one.
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Size / Desc</th>
                <th style={thStyle}>Metal</th>
                <th style={{ ...thStyle, textAlign: "right" as const }}>Grams</th>
                <th style={thStyle}>Diamond</th>
                <th style={thStyle}>Mode</th>
                <th style={{ ...thStyle, textAlign: "right" as const }}>Live Cost</th>
                <th style={{ ...thStyle, textAlign: "right" as const }}>Last Direct</th>
                <th style={{ ...thStyle, width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => {
                const isEditing = editingVid === v.id;
                const isOpen    = expanded.has(v.id);
                const { total: liveCost, breakdown } = calcLiveCost(v, goldPrices, rateCards);

                return (
                  <React.Fragment key={v.id}>
                    <tr style={{ borderBottom: "1px solid #F3F4F6", cursor: "pointer" }}
                      onClick={() => !isEditing && toggleExpand(v.id)}>
                      {/* Size descriptor */}
                      <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 600, color: "#1A1760" }}
                        onClick={e => isEditing && e.stopPropagation()}>
                        {isEditing
                          ? <input value={String(vBuf.name ?? "")} onChange={e => setVBuf(b => ({ ...b, name: e.target.value }))} style={{ ...inputSm, width: 120 }} autoFocus />
                          : v.name}
                      </td>
                      {/* Metal */}
                      <td style={{ padding: "11px 14px", fontSize: 13, color: "#374151" }}
                        onClick={e => isEditing && e.stopPropagation()}>
                        {isEditing
                          ? <select value={String(vBuf.metal_type ?? "")} onChange={e => setVBuf(b => ({ ...b, metal_type: e.target.value }))} style={{ ...inputSm, width: 120 }}>
                              <option value="">—</option>
                              {metalOptions.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          : v.metal_type ?? "—"}
                      </td>
                      {/* Grams */}
                      <td style={{ padding: "11px 14px", fontSize: 13, color: "#374151", textAlign: "right" }}
                        onClick={e => isEditing && e.stopPropagation()}>
                        {isEditing
                          ? <input type="number" step="0.01" value={String(vBuf.metal_grams ?? "")} onChange={e => setVBuf(b => ({ ...b, metal_grams: e.target.value === "" ? null : Number(e.target.value) }))} style={{ ...inputSm, width: 60, textAlign: "right" as const }} />
                          : v.metal_grams != null ? `${Number(v.metal_grams).toFixed(2)}g` : <span style={{ color: "#F59E0B" }}>⚠</span>
                        }
                      </td>
                      {/* Diamond */}
                      <td style={{ padding: "11px 14px", fontSize: 13, color: "#374151" }}
                        onClick={e => isEditing && e.stopPropagation()}>
                        {isEditing
                          ? <select value={String(vBuf.diamond_type ?? "none")} onChange={e => setVBuf(b => ({ ...b, diamond_type: e.target.value }))} style={{ ...inputSm, width: 90 }}>
                              <option value="none">None</option>
                              <option value="natural">Natural</option>
                              <option value="lab">Lab</option>
                            </select>
                          : <span style={{ textTransform: "capitalize" as const }}>{v.diamond_type ?? "none"}</span>
                        }
                      </td>
                      {/* Mode toggle */}
                      <td style={{ padding: "11px 14px" }} onClick={e => { e.stopPropagation(); if (!isEditing) togglePricingMode(v); }}>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                          background: (v.pricing_mode ?? "our_build") === "our_build" ? "#EEF2FF" : "#F0FDF4",
                          color:      (v.pricing_mode ?? "our_build") === "our_build" ? "#635BFF"  : "#16A34A",
                        }}>
                          {(v.pricing_mode ?? "our_build") === "our_build" ? "Our Build" : "Supplier"}
                        </span>
                      </td>
                      {/* Live cost */}
                      <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13 }}>
                        {liveCost != null
                          ? <span style={{ fontWeight: 600, color: "#1A1760" }}>${liveCost.toFixed(2)}</span>
                          : <span style={{ color: "#F59E0B", fontSize: 12 }}>⚠ Weight needed</span>
                        }
                      </td>
                      {/* Last direct cost */}
                      <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13 }}
                        onClick={e => isEditing && e.stopPropagation()}>
                        {isEditing
                          ? <input type="number" step="0.01" value={String(vBuf.last_direct_cost ?? "")} onChange={e => setVBuf(b => ({ ...b, last_direct_cost: e.target.value === "" ? null : Number(e.target.value) }))} style={{ ...inputSm, width: 70, textAlign: "right" as const }} />
                          : v.last_direct_cost != null ? `$${Number(v.last_direct_cost).toFixed(2)}` : <span style={{ color: "#9CA3AF" }}>—</span>
                        }
                      </td>
                      {/* Actions */}
                      <td style={{ padding: "11px 14px" }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                          {isEditing ? (
                            <>
                              <button onClick={() => saveVariant(v.id)} disabled={vSaving}
                                style={{ padding: "3px 10px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                                {vSaving ? "…" : "Save"}
                              </button>
                              <button onClick={() => setEditingVid(null)}
                                style={{ padding: "3px 8px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
                                ✕
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEditVariant(v)} title="Edit"
                                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 14 }}
                                onMouseEnter={e => (e.currentTarget.style.color = "#635BFF")}
                                onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}>
                                ✎
                              </button>
                              <button onClick={() => deleteVariant(v.id)} title="Delete"
                                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 14 }}
                                onMouseEnter={e => (e.currentTarget.style.color = "#DC2626")}
                                onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}>
                                ✕
                              </button>
                              <span style={{ color: "#D1D5DB", fontSize: 14 }}>{isOpen ? "▲" : "▼"}</span>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {isOpen && !isEditing && (
                      <tr>
                        <td colSpan={8} style={{ padding: "0 14px 14px", background: "#FAFAFA", borderBottom: "1px solid #E8E8F0" }}>
                          <div style={{ paddingTop: 12, fontSize: 12, color: "#6B7280" }}>
                            <strong style={{ color: "#374151" }}>Cost breakdown:</strong> {breakdown}
                          </div>
                          {v.pricing_build_components?.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Build Components</div>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                  <tr>
                                    {["Type", "Description", "Qty", "Unit Cost", "Total"].map(h => (
                                      <th key={h} style={{ padding: "4px 8px", textAlign: h === "Total" || h === "Unit Cost" || h === "Qty" ? "right" as const : "left" as const, color: "#9CA3AF", fontWeight: 600 }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {v.pricing_build_components.map(c => (
                                    <tr key={c.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                                      <td style={{ padding: "4px 8px", textTransform: "capitalize" as const }}>{c.component_type}</td>
                                      <td style={{ padding: "4px 8px" }}>{c.description}</td>
                                      <td style={{ padding: "4px 8px", textAlign: "right" as const }}>{c.quantity}</td>
                                      <td style={{ padding: "4px 8px", textAlign: "right" as const }}>{c.unit_cost != null ? `$${Number(c.unit_cost).toFixed(2)}` : "—"}</td>
                                      <td style={{ padding: "4px 8px", textAlign: "right" as const, fontWeight: 600 }}>{c.total_cost != null ? `$${Number(c.total_cost).toFixed(2)}` : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {v.pricing_supplier_costs?.length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Supplier Costs</div>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                  <tr>
                                    {["Supplier", "Cost (ex GST)", "Date"].map(h => (
                                      <th key={h} style={{ padding: "4px 8px", textAlign: h !== "Supplier" ? "right" as const : "left" as const, color: "#9CA3AF", fontWeight: 600 }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {v.pricing_supplier_costs.map(sc => (
                                    <tr key={sc.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                                      <td style={{ padding: "4px 8px" }}>{sc.supplier_name}</td>
                                      <td style={{ padding: "4px 8px", textAlign: "right" as const, fontWeight: 600 }}>${Number(sc.cost_ex_gst).toFixed(2)} {sc.currency}</td>
                                      <td style={{ padding: "4px 8px", textAlign: "right" as const }}>{new Date(sc.price_list_date).toLocaleDateString("en-AU")}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

