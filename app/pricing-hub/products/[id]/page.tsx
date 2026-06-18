"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

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
  melee_quantity: number | null;
  melee_carat_weight: number | null;
  melee_colour_group: string | null;
  melee_clarity: string | null;
  pricing_build_components: BuildComponent[];
  pricing_supplier_costs: SupplierCost[];
}

interface Product {
  id: string;
  name: string;
  active: boolean;
  pricing_product_variants: Variant[];
}

const COLOUR_GROUPS    = ["D-F", "G-H", "I-J", "K-L", "M-N"];
const PARCEL_CLARITIES = ["VVS", "VS", "SI1", "SI2", "SI3", "I1", "I2", "I3"];

// Server-side calculation result shape (mirrors POST /api/pricing-hub/calculate response)
interface CalcResult {
  metalCost: number;
  labourCost: number;
  fixedCost: number;
  meleeCostAud: number;
  totalCost: number;
  multiplier: number | null;
  recommendedRetail: number | null;
  goldRatePerGram: number | null;
  pricingMode: string;
  breakdown: { type: string; label: string; amount: number }[];
  diamondNote: string | null;
  meleeNote: string | null;
}

// Per-variant calculation state
interface VariantCalc {
  loading: boolean;
  error: string | null;
  result: CalcResult | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const { user, hydrated } = useUser();
  const router  = useRouter();
  const params  = useParams();
  const id      = params?.id as string;

  const [product, setProduct]       = useState<Product | null>(null);
  const [loading, setLoading]       = useState(true);
  const [pageError, setPageError]   = useState<string | null>(null);
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());

  // Server-side pricing results, keyed by variantId
  const [calcs, setCalcs] = useState<Map<string, VariantCalc>>(new Map());

  // Header inline edit
  const [editHeader, setEditHeader] = useState(false);
  const [hdrBuf, setHdrBuf]         = useState({ name: "" });
  const [hdrSaving, setHdrSaving]   = useState(false);

  // Variant edit
  const [editingVid, setEditingVid] = useState<string | null>(null);
  const [vBuf, setVBuf]             = useState<Partial<Variant>>({});
  const [vSaving, setVSaving]       = useState(false);

  // Add variant form
  const [showAdd, setShowAdd]       = useState(false);
  const [vNew, setVNew]             = useState({
    name: "", metal_type: "", metal_grams: "", diamond_type: "none", pricing_mode: "our_build",
    melee_quantity: "", melee_carat_weight: "", melee_colour_group: "G-H", melee_clarity: "SI1",
  });
  const [addSaving, setAddSaving]   = useState(false);
  const [addError, setAddError]     = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && user && user.role !== "admin") router.replace("/");
  }, [hydrated, user, router]);

  // Fetch pricing from the server-side engine for all variants
  const fetchCalcs = useCallback(async (variants: Variant[], tid: string) => {
    if (!variants.length) return;

    // Mark all variants as loading
    setCalcs(prev => {
      const next = new Map(prev);
      for (const v of variants) {
        next.set(v.id, { loading: true, error: null, result: null });
      }
      return next;
    });

    // Call calculate endpoint for each variant in parallel
    await Promise.all(
      variants.map(async (v) => {
        try {
          const res = await fetch("/api/pricing-hub/calculate", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "x-tenant-id": tid,
            },
            body: JSON.stringify({ variantId: v.id }),
          });
          const data = await res.json();

          if (!res.ok) {
            setCalcs(prev => {
              const next = new Map(prev);
              next.set(v.id, {
                loading: false,
                error: data.error ?? `Calculation failed (${res.status})`,
                result: null,
              });
              return next;
            });
          } else {
            setCalcs(prev => {
              const next = new Map(prev);
              next.set(v.id, { loading: false, error: null, result: data as CalcResult });
              return next;
            });
          }
        } catch {
          setCalcs(prev => {
            const next = new Map(prev);
            next.set(v.id, { loading: false, error: "Network error", result: null });
            return next;
          });
        }
      })
    );
  }, []);

  const load = useCallback(async () => {
    if (!id || !hydrated || !user || user.role !== "admin") return;
    setLoading(true);
    setPageError(null);
    const tid = user.tenantId ?? "";
    try {
      const res  = await fetch(`/api/pricing-hub/products/${id}`, {
        credentials: "include",
        headers: { "x-tenant-id": tid },
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[product-detail] fetch failed:", res.status, data);
        setPageError(data?.error ?? `Failed to load product (${res.status})`);
        setProduct(null);
        return;
      }
      const product: Product | null = data ?? null;
      setProduct(product);
      if (product) {
        fetchCalcs(product.pricing_product_variants ?? [], tid);
      }
    } catch (err) {
      console.error("[product-detail] load error:", err);
      setPageError("Failed to load product. Check console for details.");
    } finally {
      setLoading(false);
    }
  }, [id, hydrated, user, fetchCalcs]);

  useEffect(() => { load(); }, [load]);

  if (!hydrated || !user) return <div style={{ padding: "32px 40px", color: "#9CA3AF", fontSize: 14 }}>Loading…</div>;
  if (user.role !== "admin") return null;

  const tid = user.tenantId ?? "";

  async function saveHeader() {
    if (!product) return;
    setHdrSaving(true);
    await fetch(`/api/pricing-hub/products/${product.id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({ name: hdrBuf.name }),
    });
    setHdrSaving(false); setEditHeader(false);
    load();
  }

  function startEditHeader() {
    if (!product) return;
    setHdrBuf({ name: product.name });
    setEditHeader(true);
  }

  function startEditVariant(v: Variant) {
    setEditingVid(v.id);
    setVBuf({
      name: v.name, metal_type: v.metal_type, metal_grams: v.metal_grams,
      diamond_type: v.diamond_type, pricing_mode: v.pricing_mode,
      last_direct_cost: v.last_direct_cost,
      melee_quantity: v.melee_quantity, melee_carat_weight: v.melee_carat_weight,
      melee_colour_group: v.melee_colour_group ?? "G-H", melee_clarity: v.melee_clarity ?? "SI1",
    });
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
        product_id:          id,
        name:                vNew.name.trim(),
        metal_type:          vNew.metal_type          || null,
        metal_grams:         vNew.metal_grams         ? Number(vNew.metal_grams)        : null,
        diamond_type:        vNew.diamond_type,
        pricing_mode:        vNew.pricing_mode,
        melee_quantity:      vNew.melee_quantity      ? Number(vNew.melee_quantity)      : null,
        melee_carat_weight:  vNew.melee_carat_weight  ? Number(vNew.melee_carat_weight)  : null,
        melee_colour_group:  vNew.melee_colour_group  || null,
        melee_clarity:       vNew.melee_clarity       || null,
      }),
    });
    const data = await res.json();
    setAddSaving(false);
    if (!res.ok) { setAddError(data.error ?? "Failed"); return; }
    setVNew({ name: "", metal_type: "", metal_grams: "", diamond_type: "none", pricing_mode: "our_build", melee_quantity: "", melee_carat_weight: "", melee_colour_group: "G-H", melee_clarity: "SI1" });
    setShowAdd(false);
    load();
  }

  const toggleExpand = (vid: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(vid) ? n.delete(vid) : n.add(vid); return n; });

  const inputSm: React.CSSProperties = {
    padding: "4px 8px", border: "1px solid #D1D5DB", borderRadius: 6,
    fontSize: 12, boxSizing: "border-box" as const,
  };
  const thStyle: React.CSSProperties = {
    padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#6B7280",
    textAlign: "left" as const, textTransform: "uppercase" as const,
    letterSpacing: "0.04em", background: "#F9FAFB", borderBottom: "1px solid #E8E8F0",
  };

  if (loading) return <div style={{ padding: "32px 40px", color: "#9CA3AF", fontSize: 14 }}>Loading…</div>;
  if (pageError) return (
    <div style={{ padding: "32px 40px" }}>
      <p style={{ color: "#DC2626", fontSize: 14, marginBottom: 8 }}>Error: {pageError}</p>
      <Link href="/pricing-hub/products" style={{ color: "#635BFF", fontSize: 13 }}>← Back to Products</Link>
    </div>
  );
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
          <div style={{ display: "grid", gridTemplateColumns: "2fr auto auto", gap: 10, alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Product Name</label>
              <input
                value={hdrBuf.name}
                onChange={e => setHdrBuf(b => ({ ...b, name: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, boxSizing: "border-box" as const }}
                autoFocus
              />
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
              <span style={{
                display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: product.active ? "#F0FDF4" : "#F3F4F6",
                color: product.active ? "#16A34A" : "#6B7280",
              }}>
                {product.active ? "Active" : "Inactive"}
              </span>
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
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1A1760" }}>
          Variants <span style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 400 }}>({variants.length})</span>
        </h2>
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
              <input
                value={vNew.name}
                onChange={e => setVNew(v => ({ ...v, name: e.target.value }))}
                placeholder="e.g. 0.50ct RBC"
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, boxSizing: "border-box" as const }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Metal</label>
              <input
                value={vNew.metal_type}
                onChange={e => setVNew(v => ({ ...v, metal_type: e.target.value }))}
                placeholder="e.g. 18ct Yellow"
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, boxSizing: "border-box" as const }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Gram Weight</label>
              <input
                type="number" step="0.01" min="0"
                value={vNew.metal_grams}
                onChange={e => setVNew(v => ({ ...v, metal_grams: e.target.value }))}
                placeholder="e.g. 3.50"
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, boxSizing: "border-box" as const }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Diamond</label>
              <select
                value={vNew.diamond_type}
                onChange={e => setVNew(v => ({ ...v, diamond_type: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13 }}>
                <option value="none">None</option>
                <option value="natural">Natural</option>
                <option value="lab">Lab Grown</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Pricing Mode</label>
              <select
                value={vNew.pricing_mode}
                onChange={e => setVNew(v => ({ ...v, pricing_mode: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13 }}>
                <option value="our_build">Our Build</option>
                <option value="supplier">Supplier</option>
              </select>
            </div>
          </div>
          {/* Melee stone fields */}
          <div style={{ borderTop: "1px solid #E8E8F0", paddingTop: 10, marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 8 }}>
              Melee Stones (under 0.30ct) — optional
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "flex-end" }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Quantity</label>
                <input
                  type="number" step="1" min="0"
                  value={vNew.melee_quantity}
                  onChange={e => setVNew(v => ({ ...v, melee_quantity: e.target.value }))}
                  placeholder="e.g. 22"
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, boxSizing: "border-box" as const }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>ct / stone</label>
                <input
                  type="number" step="0.001" min="0"
                  value={vNew.melee_carat_weight}
                  onChange={e => setVNew(v => ({ ...v, melee_carat_weight: e.target.value }))}
                  placeholder="e.g. 0.010"
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, boxSizing: "border-box" as const }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Colour Group</label>
                <select
                  value={vNew.melee_colour_group}
                  onChange={e => setVNew(v => ({ ...v, melee_colour_group: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13 }}>
                  {COLOUR_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>Clarity</label>
                <select
                  value={vNew.melee_clarity}
                  onChange={e => setVNew(v => ({ ...v, melee_clarity: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13 }}>
                  {PARCEL_CLARITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {vNew.melee_quantity && vNew.melee_carat_weight && (
                <span style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap" as const, paddingBottom: 8 }}>
                  Total: {(Number(vNew.melee_quantity) * Number(vNew.melee_carat_weight)).toFixed(3)}ct
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
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
                <th style={{ ...thStyle, textAlign: "right" as const }}>Retail Est.</th>
                <th style={{ ...thStyle, textAlign: "right" as const }}>Last Direct</th>
                <th style={{ ...thStyle, width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => {
                const isEditing = editingVid === v.id;
                const isOpen    = expanded.has(v.id);
                const calc      = calcs.get(v.id);

                return (
                  <React.Fragment key={v.id}>
                    <tr
                      style={{ borderBottom: "1px solid #F3F4F6", cursor: "pointer" }}
                      onClick={() => !isEditing && toggleExpand(v.id)}
                    >
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
                          ? <input value={String(vBuf.metal_type ?? "")} onChange={e => setVBuf(b => ({ ...b, metal_type: e.target.value }))} style={{ ...inputSm, width: 120 }} />
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

                      {/* Live cost — from server */}
                      <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13 }}>
                        {!calc || calc.loading
                          ? <span style={{ color: "#D1D5DB", fontSize: 12 }}>…</span>
                          : calc.error
                          ? <span style={{ color: "#F59E0B", fontSize: 11 }} title={calc.error}>⚠</span>
                          : <span style={{ fontWeight: 600, color: "#1A1760" }}>${calc.result!.totalCost.toFixed(2)}</span>
                        }
                      </td>

                      {/* Recommended retail — from server */}
                      <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13 }}>
                        {!calc || calc.loading
                          ? <span style={{ color: "#D1D5DB", fontSize: 12 }}>…</span>
                          : calc.error || !calc.result?.recommendedRetail
                          ? <span style={{ color: "#9CA3AF" }}>—</span>
                          : <span style={{ color: "#374151" }}>${calc.result!.recommendedRetail.toFixed(2)}</span>
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

                    {/* Melee edit sub-row — shown when editing */}
                    {isEditing && (
                      <tr>
                        <td colSpan={9} style={{ padding: "0 14px 12px", background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                          <div style={{ paddingTop: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 8 }}>
                              Melee Stones (under 0.30ct)
                            </div>
                            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" as const }}>
                              <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Quantity</label>
                                <input type="number" step="1" min="0"
                                  value={String(vBuf.melee_quantity ?? "")}
                                  onChange={e => setVBuf(b => ({ ...b, melee_quantity: e.target.value === "" ? null : Number(e.target.value) }))}
                                  placeholder="e.g. 22"
                                  style={{ ...inputSm, width: 70 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>ct / stone</label>
                                <input type="number" step="0.001" min="0"
                                  value={String(vBuf.melee_carat_weight ?? "")}
                                  onChange={e => setVBuf(b => ({ ...b, melee_carat_weight: e.target.value === "" ? null : Number(e.target.value) }))}
                                  placeholder="0.010"
                                  style={{ ...inputSm, width: 75 }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Colour Group</label>
                                <select
                                  value={String(vBuf.melee_colour_group ?? "G-H")}
                                  onChange={e => setVBuf(b => ({ ...b, melee_colour_group: e.target.value }))}
                                  style={{ ...inputSm, width: 80 }}>
                                  {COLOUR_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                              </div>
                              <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Clarity</label>
                                <select
                                  value={String(vBuf.melee_clarity ?? "SI1")}
                                  onChange={e => setVBuf(b => ({ ...b, melee_clarity: e.target.value }))}
                                  style={{ ...inputSm, width: 72 }}>
                                  {PARCEL_CLARITIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </div>
                              {vBuf.melee_quantity != null && vBuf.melee_carat_weight != null &&
                               vBuf.melee_quantity > 0 && vBuf.melee_carat_weight > 0 && (
                                <span style={{ fontSize: 12, color: "#6B7280", paddingBottom: 4 }}>
                                  Total: {(vBuf.melee_quantity * vBuf.melee_carat_weight).toFixed(3)}ct
                                  ({vBuf.melee_quantity} × {vBuf.melee_carat_weight}ct)
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Expanded detail row */}
                    {isOpen && !isEditing && (
                      <tr>
                        <td colSpan={9} style={{ padding: "0 14px 14px", background: "#FAFAFA", borderBottom: "1px solid #E8E8F0" }}>
                          <div style={{ paddingTop: 12 }}>

                            {/* Server-side cost breakdown */}
                            {!calc || calc.loading ? (
                              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Calculating…</p>
                            ) : calc.error ? (
                              <div style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                background: "#FEF3C7", border: "1px solid #FDE68A",
                                borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "#92400E",
                              }}>
                                <span>⚠</span>
                                <span>{calc.error}</span>
                              </div>
                            ) : (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                                  Cost Breakdown
                                </div>
                                <table style={{ fontSize: 12, borderCollapse: "collapse", minWidth: 360, marginBottom: 8 }}>
                                  <tbody>
                                    {calc.result!.breakdown.map((item, i) => (
                                      <tr key={i}>
                                        <td style={{ padding: "3px 12px 3px 0", color: "#6B7280", width: 100, textTransform: "capitalize" as const }}>
                                          {item.type}
                                        </td>
                                        <td style={{ padding: "3px 12px 3px 0", color: "#374151" }}>{item.label}</td>
                                        <td style={{ padding: "3px 0", textAlign: "right" as const, fontWeight: 500, color: "#1A1760", fontFamily: "monospace" }}>
                                          ${item.amount.toFixed(2)}
                                        </td>
                                      </tr>
                                    ))}
                                    <tr>
                                      <td colSpan={2} style={{ padding: "6px 12px 3px 0", fontWeight: 700, color: "#1A1760", borderTop: "1px solid #E8E8F0" }}>
                                        Total Cost
                                      </td>
                                      <td style={{ padding: "6px 0 3px", textAlign: "right" as const, fontWeight: 700, color: "#1A1760", fontFamily: "monospace", borderTop: "1px solid #E8E8F0" }}>
                                        ${calc.result!.totalCost.toFixed(2)}
                                      </td>
                                    </tr>
                                    {calc.result!.multiplier != null && (
                                      <tr>
                                        <td colSpan={2} style={{ padding: "3px 12px 3px 0", color: "#6B7280" }}>
                                          Margin ({calc.result!.multiplier.toFixed(2)}×)
                                        </td>
                                        <td style={{ padding: "3px 0", textAlign: "right" as const, fontWeight: 600, color: "#059669", fontFamily: "monospace" }}>
                                          ${calc.result!.recommendedRetail!.toFixed(2)}
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                                {calc.result!.diamondNote && (
                                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 0", fontStyle: "italic" }}>
                                    {calc.result!.diamondNote}
                                  </p>
                                )}
                                {calc.result!.meleeNote && (
                                  <div style={{
                                    display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6,
                                    background: "#FEF3C7", border: "1px solid #FDE68A",
                                    borderRadius: 6, padding: "5px 10px", fontSize: 11, color: "#92400E",
                                  }}>
                                    <span>⚠</span><span>{calc.result!.meleeNote}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Build components */}
                            {v.pricing_build_components?.length > 0 && (
                              <div style={{ marginTop: 14 }}>
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

                            {/* Supplier costs */}
                            {v.pricing_supplier_costs?.length > 0 && (
                              <div style={{ marginTop: 14 }}>
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
                          </div>
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
