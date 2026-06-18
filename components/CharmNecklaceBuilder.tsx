"use client";

import React, { useState, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CharmComponent {
  id: string;
  name: string;
  supplier_code: string | null;
  component_type: string;
  gram_weight: number | null;
  averaged_cost_9y: number | null;
  averaged_cost_9w: number | null;
  averaged_cost_18y: number | null;
  averaged_cost_18w: number | null;
  available_for: string;  // necklace / bracelet / both
  product_status: string; // in_stock / order_required / custom_order
  labour_per_unit: number;
  stock_count: number;
}

export interface CharmLineItem {
  id: string;              // local uid
  config_id: string;       // charm_necklace_configs.id
  product_type: "necklace" | "bracelet";
  description: string;
  retail_price: number;
  metal: string;
  selected_charms: Array<{ component_id: string; name: string; from_stock: boolean }>;
}

interface ConfigResult {
  config: { id: string };
  description: string;
  breakdown: {
    base_cost: number;
    charm_costs: number;
    labour_cost: number;
    white_gold_premium: number;
    total_cost: number;
    multiplier: number;
    retail_price: number;
    charms: Array<{ component_id: string; name: string; cost: number | null; from_stock: boolean }>;
  };
  stock_summary: { from_stock: string[]; to_order: string[] };
}

interface Props {
  open: boolean;
  productType: "necklace" | "bracelet";
  tenantId: string;
  isManager: boolean;
  quoteId?: string;
  onClose: () => void;
  onConfirm: (item: CharmLineItem) => void;
}

const METALS = [
  { key: "9ct_yellow",  label: "9ct Yellow Gold",  badge: null },
  { key: "9ct_white",   label: "9ct White Gold",    badge: null },
  { key: "18ct_yellow", label: "18ct Yellow Gold",  badge: "Custom Order" },
  { key: "18ct_white",  label: "18ct White Gold",   badge: "Custom Order" },
] as const;

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  in_stock:       { bg: "#DCFCE7", text: "#166534", label: "In Stock" },
  order_required: { bg: "#FEF3C7", text: "#92400E", label: "Order Required" },
  custom_order:   { bg: "#EDE9FE", text: "#4C1D95", label: "Custom Order" },
};

function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Component ─────────────────────────────────────────────────────────────────

export default function CharmNecklaceBuilder({ open, productType, tenantId, isManager, quoteId, onClose, onConfirm }: Props) {
  const [components, setComponents] = useState<CharmComponent[]>([]);
  const [loadingComps, setLoadingComps] = useState(false);

  const [metal, setMetal] = useState<string>("9ct_yellow");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [configuring, setConfiguring] = useState(false);
  const [configResult, setConfigResult] = useState<ConfigResult | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // Load components when modal opens
  useEffect(() => {
    if (!open) return;
    setMetal("9ct_yellow");
    setSelectedIds([]);
    setConfigResult(null);
    setConfigError(null);

    setLoadingComps(true);
    fetch("/api/charm-components", {
      credentials: "include",
      headers: { "x-tenant-id": tenantId },
    })
      .then(r => r.json())
      .then(data => setComponents(Array.isArray(data) ? data : []))
      .catch(() => setComponents([]))
      .finally(() => setLoadingComps(false));
  }, [open, tenantId]);

  if (!open) return null;

  // Filter to selectable charms (not chain — auto-included)
  const selectable = components.filter(c =>
    c.component_type !== "chain" &&
    (c.available_for === "both" || c.available_for === productType)
  );

  function toggleCharm(id: string) {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 6) return prev; // max 6
      return [...prev, id];
    });
    setConfigResult(null);
    setConfigError(null);
  }

  async function handleConfirm() {
    if (selectedIds.length < 2) {
      setConfigError("Please select at least 2 charms.");
      return;
    }
    setConfiguring(true);
    setConfigError(null);
    try {
      const res = await fetch("/api/charm-necklace/configure", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({
          metal,
          product_type: productType,
          selected_charm_ids: selectedIds,
          quote_id: quoteId ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConfigError(data.error ?? "Failed to configure");
        return;
      }
      setConfigResult(data as ConfigResult);
    } catch (err) {
      setConfigError("Network error. Please try again.");
      console.error("[CharmNecklaceBuilder] configure error:", err);
    } finally {
      setConfiguring(false);
    }
  }

  function handleAddToQuote() {
    if (!configResult) return;
    const item: CharmLineItem = {
      id:              uid(),
      config_id:       configResult.config.id,
      product_type:    productType,
      description:     configResult.description,
      retail_price:    configResult.breakdown.retail_price,
      metal,
      selected_charms: configResult.breakdown.charms.map(c => ({
        component_id: c.component_id,
        name:         c.name,
        from_stock:   c.from_stock,
      })),
    };
    onConfirm(item);
    onClose();
  }

  const productLabel = productType === "bracelet" ? "Charm Bracelet" : "Charm Necklace";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {/* Panel */}
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: "#fff", borderRadius: 16, width: "min(780px, 96vw)",
            maxHeight: "92vh", overflowY: "auto", padding: 28,
            boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
            zIndex: 1001,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1A1760", margin: 0 }}>
                Configure Personalised {productLabel}
              </h2>
              <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>
                Select metal then choose 2–6 charms
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ background: "#F3F4F6", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16, color: "#6B7280" }}
            >✕</button>
          </div>

          {/* Step 1 — Metal */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 10 }}>
              Metal
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              {METALS.map(m => (
                <button
                  key={m.key}
                  onClick={() => { setMetal(m.key); setConfigResult(null); setConfigError(null); }}
                  style={{
                    padding: "9px 16px", borderRadius: 8, border: "2px solid",
                    borderColor: metal === m.key ? "#635BFF" : "#E8E8F0",
                    background:  metal === m.key ? "#EEF2FF" : "#fff",
                    color:       metal === m.key ? "#635BFF" : "#374151",
                    fontWeight:  metal === m.key ? 700 : 400,
                    fontSize: 13, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {m.label}
                  {m.badge && (
                    <span style={{ fontSize: 10, background: "#EDE9FE", color: "#4C1D95", padding: "1px 6px", borderRadius: 10, fontWeight: 600 }}>
                      {m.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2 — Charm selection */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                Charms
              </span>
              <span style={{ fontSize: 12, color: "#6B7280" }}>
                {selectedIds.length}/6 selected
              </span>
              {selectedIds.length < 2 && selectedIds.length > 0 && (
                <span style={{ fontSize: 12, color: "#F59E0B" }}>⚠ Minimum 2 required</span>
              )}
              {selectedIds.length >= 6 && (
                <span style={{ fontSize: 12, color: "#6B7280" }}>Maximum reached</span>
              )}
            </div>

            {loadingComps ? (
              <div style={{ padding: "20px 0", color: "#9CA3AF", fontSize: 13 }}>Loading components…</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
                {selectable.map(c => {
                  const selected = selectedIds.includes(c.id);
                  const sc = STATUS_CONFIG[c.product_status] ?? STATUS_CONFIG.in_stock;

                  // Cost for selected metal
                  const costMap: Record<string, number | null> = {
                    "9ct_yellow":  c.averaged_cost_9y,
                    "9ct_white":   c.averaged_cost_9w,
                    "18ct_yellow": c.averaged_cost_18y,
                    "18ct_white":  c.averaged_cost_18w,
                  };
                  const cost = costMap[metal];

                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCharm(c.id)}
                      disabled={!selected && selectedIds.length >= 6}
                      style={{
                        padding: "10px 12px", borderRadius: 8, border: "2px solid",
                        borderColor: selected ? "#635BFF" : "#E8E8F0",
                        background:  selected ? "#EEF2FF" : "#fff",
                        cursor: (!selected && selectedIds.length >= 6) ? "not-allowed" : "pointer",
                        opacity: (!selected && selectedIds.length >= 6) ? 0.5 : 1,
                        textAlign: "left" as const,
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13, color: selected ? "#635BFF" : "#1A1760", marginBottom: 4 }}>
                        {c.name}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
                        <span style={{ fontSize: 10, background: sc.bg, color: sc.text, padding: "1px 6px", borderRadius: 10, fontWeight: 600 }}>
                          {c.stock_count > 0 ? `${c.stock_count} in stock` : sc.label}
                        </span>
                        {isManager && cost != null && (
                          <span style={{ fontSize: 11, color: "#6B7280" }}>${Number(cost).toFixed(2)}</span>
                        )}
                        {isManager && cost == null && (
                          <span style={{ fontSize: 11, color: "#F59E0B" }}>⚠ Cost pending</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 3 — Summary (shown after configure or when ≥2 selected) */}
          {configResult ? (
            <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1760", marginBottom: 12 }}>Summary</div>

              <p style={{ fontSize: 13, color: "#374151", marginBottom: 12 }}>{configResult.description}</p>

              {isManager && (
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", marginBottom: 12 }}>
                  <tbody>
                    {configResult.breakdown.base_cost > 0 && (
                      <tr>
                        <td style={{ padding: "3px 0", color: "#6B7280" }}>Chain</td>
                        <td style={{ padding: "3px 0", textAlign: "right" as const, color: "#374151" }}>${Number(configResult.breakdown.base_cost).toFixed(2)}</td>
                      </tr>
                    )}
                    <tr>
                      <td style={{ padding: "3px 0", color: "#6B7280" }}>Charms ({configResult.breakdown.charms.length})</td>
                      <td style={{ padding: "3px 0", textAlign: "right" as const, color: "#374151" }}>${Number(configResult.breakdown.charm_costs).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "3px 0", color: "#6B7280" }}>Labour (solder)</td>
                      <td style={{ padding: "3px 0", textAlign: "right" as const, color: "#374151" }}>${Number(configResult.breakdown.labour_cost).toFixed(2)}</td>
                    </tr>
                    {configResult.breakdown.white_gold_premium > 0 && (
                      <tr>
                        <td style={{ padding: "3px 0", color: "#6B7280" }}>White Gold Premium</td>
                        <td style={{ padding: "3px 0", textAlign: "right" as const, color: "#374151" }}>${Number(configResult.breakdown.white_gold_premium).toFixed(2)}</td>
                      </tr>
                    )}
                    <tr style={{ borderTop: "1px solid #E8E8F0" }}>
                      <td style={{ padding: "6px 0 3px", fontWeight: 700, color: "#374151" }}>Total Cost</td>
                      <td style={{ padding: "6px 0 3px", textAlign: "right" as const, fontWeight: 700, color: "#374151" }}>${Number(configResult.breakdown.total_cost).toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "3px 0", color: "#6B7280" }}>Margin ({Number(configResult.breakdown.multiplier).toFixed(2)}×)</td>
                      <td style={{ padding: "3px 0", textAlign: "right" as const, fontWeight: 700, color: "#059669" }}>${Number(configResult.breakdown.retail_price).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid #E8E8F0" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Retail Price</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#1A1760" }}>${Number(configResult.breakdown.retail_price).toLocaleString("en-AU")}</span>
              </div>

              {/* Stock summary */}
              {(configResult.stock_summary.from_stock.length > 0 || configResult.stock_summary.to_order.length > 0) && (
                <div style={{ marginTop: 12, fontSize: 12 }}>
                  {configResult.stock_summary.from_stock.length > 0 && (
                    <p style={{ margin: "0 0 4px", color: "#16A34A" }}>
                      ✓ From stock: {configResult.stock_summary.from_stock.join(", ")}
                    </p>
                  )}
                  {configResult.stock_summary.to_order.length > 0 && (
                    <p style={{ margin: 0, color: "#D97706" }}>
                      ⚑ To order from McCaskills: {configResult.stock_summary.to_order.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : selectedIds.length >= 2 && (
            <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10, padding: 14, marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
                {selectedIds.length} charm{selectedIds.length !== 1 ? "s" : ""} selected — click Confirm & Price to calculate retail price.
              </p>
            </div>
          )}

          {configError && (
            <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#DC2626" }}>
              {configError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onClose}
              style={{ padding: "9px 18px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
            {!configResult ? (
              <button
                onClick={handleConfirm}
                disabled={configuring || selectedIds.length < 2}
                style={{
                  padding: "9px 20px", background: (configuring || selectedIds.length < 2) ? "#E8E8F0" : "#635BFF",
                  color: (configuring || selectedIds.length < 2) ? "#9CA3AF" : "#fff",
                  border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: (configuring || selectedIds.length < 2) ? "not-allowed" : "pointer",
                }}
              >
                {configuring ? "Pricing…" : "Confirm & Price"}
              </button>
            ) : (
              <button
                onClick={handleAddToQuote}
                style={{ padding: "9px 20px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Add to Quote — ${Number(configResult.breakdown.retail_price).toLocaleString("en-AU")}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
