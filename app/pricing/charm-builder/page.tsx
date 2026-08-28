"use client";

import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CatalogItem {
  id: string;
  category: string;
  name: string;
  price: number;
  applies_to: string;
  month_number: number | null;
  sort_order: number;
  active: boolean;
}

interface BaseConfig {
  id: string;
  product_type: string;
  base_price: number | null;
  slot_fee_2: number | null;
  slot_fee_3: number | null;
  slot_fee_4: number | null;
  slot_fee_5: number | null;
  slot_fee_6: number | null;
  metal_surcharge_yellow: number | null;
  metal_surcharge_white: number | null;
  min_pendants: number;
  max_pendants: number;
}

interface AftermarketRate {
  id: string;
  charm_type: string;
  metal_colour: string;
  soldering_fee: number;
  charm_price: number;
  total_price: number;
  active: boolean;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E8E8F0",
  borderRadius: 10,
  padding: "18px 20px",
  marginBottom: 16,
};

const label: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#6B7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 10,
  display: "block",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 13,
  width: 90,
  textAlign: "right",
};

const badge = (active: boolean): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 12,
  fontSize: 11,
  fontWeight: 600,
  background: active ? "#D1FAE5" : "#F3F4F6",
  color:      active ? "#065F46" : "#6B7280",
});

// ── Field editor component ─────────────────────────────────────────────────────

function PriceField({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(String(value ?? ""));
  const [saving,  setSaving]  = useState(false);

  async function commit() {
    const n = parseFloat(draft);
    if (isNaN(n)) { setEditing(false); return; }
    setSaving(true);
    await onSave(n);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", gap: 4 }}>
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          style={inputStyle}
        />
        <button onClick={commit} disabled={saving} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 5, border: "none", background: "#635BFF", color: "#fff", cursor: "pointer" }}>
          {saving ? "…" : "Save"}
        </button>
        <button onClick={() => setEditing(false)} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 5, border: "1px solid #D1D5DB", background: "#fff", cursor: "pointer" }}>
          ✕
        </button>
      </span>
    );
  }

  return (
    <span
      onClick={() => { setDraft(String(value ?? "")); setEditing(true); }}
      style={{ cursor: "pointer", textDecoration: "underline dotted", color: "#374151" }}
      title="Click to edit"
    >
      {value != null ? `$${Number(value).toFixed(0)}` : <em style={{ color: "#9CA3AF" }}>not set</em>}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CharmBuilderSettingsPage() {
  const { user } = useUser();
  const tenantId = user?.tenantId ?? "";

  const [catalog,     setCatalog]     = useState<CatalogItem[]>([]);
  const [baseConfigs, setBaseConfigs] = useState<BaseConfig[]>([]);
  const [aftermarket, setAftermarket] = useState<AftermarketRate[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [saveError,   setSaveError]   = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    fetch("/api/charm-builder/settings", { headers: { "x-tenant-id": tenantId } })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setCatalog(d.catalog ?? []);
        setBaseConfigs(d.baseConfigs ?? []);
        setAftermarket(d.aftermarket ?? []);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [tenantId]);

  async function patch(type: "catalog_item" | "base_config" | "aftermarket_rate", id: string, updates: Record<string, unknown>) {
    setSaveError(null);
    const res = await fetch("/api/charm-builder/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
      body: JSON.stringify({ type, id, updates }),
    });
    const json = await res.json();
    if (!res.ok) { setSaveError(json.error ?? "Save failed"); throw new Error(json.error); }
  }

  async function updateCatalog(id: string, field: string, value: unknown) {
    await patch("catalog_item", id, { [field]: value });
    setCatalog(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  }

  async function updateConfig(id: string, field: string, value: unknown) {
    await patch("base_config", id, { [field]: value });
    setBaseConfigs(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  }

  async function updateAftermarket(id: string, field: string, value: unknown) {
    await patch("aftermarket_rate", id, { [field]: value });
    // Recalculate total_price if charm_price or soldering_fee changes
    setAftermarket(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      if (field === "charm_price" || field === "soldering_fee") {
        updated.total_price = Number(updated.charm_price) + Number(updated.soldering_fee);
      }
      return updated;
    }));
  }

  if (loading) return <div style={{ padding: 40, color: "#6B7280", fontSize: 14 }}>Loading…</div>;
  if (error)   return <div style={{ padding: 40, color: "#DC2626", fontSize: 14 }}>Error: {error}</div>;

  // Group catalog by category
  const categories = Array.from(new Set(catalog.map(c => c.category)));

  const CATEGORY_LABEL: Record<string, string> = {
    alphabet:        "Initials (Plain)",
    diamond_alphabet:"Initials (Diamond-Set)",
    named_charm:     "Named Charms",
    birthstone:      "Birthstones",
    diamond_shape:   "Diamond Shapes",
  };

  return (
    <div style={{ padding: "24px 28px", maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0, marginBottom: 4 }}>
        Charm Builder Settings
      </h1>
      <p style={{ fontSize: 13, color: "#6B7280", margin: 0, marginBottom: 24 }}>
        Edit catalog item prices, base configs, and aftermarket rates. Changes take effect immediately.
      </p>

      {saveError && (
        <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 7, marginBottom: 16, fontSize: 13, color: "#991B1B" }}>
          {saveError}
        </div>
      )}

      {/* ── Base Configs ───────────────────────────────────────────────── */}
      <div style={card}>
        <span style={label}>Base Configuration</span>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "#6B7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                <th style={{ textAlign: "left", paddingBottom: 8, fontWeight: 600 }}>Product</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 600 }}>Base</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 600 }}>2 Slots</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 600 }}>3 Slots</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 600 }}>4 Slots</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 600 }}>5 Slots</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 600 }}>6 Slots</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 600 }}>YG +</th>
                <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 600 }}>WG +</th>
              </tr>
            </thead>
            <tbody>
              {baseConfigs.map((cfg, i) => (
                <tr key={cfg.id} style={{ borderTop: i > 0 ? "1px solid #F3F4F6" : undefined }}>
                  <td style={{ padding: "8px 0", fontWeight: 600, textTransform: "capitalize" }}>{cfg.product_type}</td>
                  {(["base_price","slot_fee_2","slot_fee_3","slot_fee_4","slot_fee_5","slot_fee_6","metal_surcharge_yellow","metal_surcharge_white"] as const).map(field => (
                    <td key={field} style={{ textAlign: "right", padding: "8px 0 8px 12px" }}>
                      <PriceField
                        value={cfg[field] as number | null}
                        onSave={v => updateConfig(cfg.id, field, v)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 10 }}>
          Bracelet values shown as "not set" are unconfirmed — do not populate until real bracelet pricing is confirmed with Class A.
        </p>
      </div>

      {/* ── Catalog Items ─────────────────────────────────────────────── */}
      <div style={card}>
        <span style={label}>Pendant Catalog</span>
        {categories.map(cat => {
          const items = catalog.filter(c => c.category === cat);
          return (
            <div key={cat} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                {CATEGORY_LABEL[cat] ?? cat}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "#9CA3AF", fontSize: 11 }}>
                    <th style={{ textAlign: "left", paddingBottom: 6, fontWeight: 600 }}>Name</th>
                    <th style={{ textAlign: "right", paddingBottom: 6, fontWeight: 600 }}>Price</th>
                    <th style={{ textAlign: "center", paddingBottom: 6, fontWeight: 600 }}>Active</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.id} style={{ borderTop: i > 0 ? "1px solid #F9FAFB" : undefined }}>
                      <td style={{ padding: "6px 0", color: "#374151" }}>{item.name}</td>
                      <td style={{ textAlign: "right", padding: "6px 0" }}>
                        <PriceField
                          value={Number(item.price)}
                          onSave={v => updateCatalog(item.id, "price", v)}
                        />
                      </td>
                      <td style={{ textAlign: "center", padding: "6px 0" }}>
                        <span
                          style={{ ...badge(item.active), cursor: "pointer" }}
                          onClick={() => updateCatalog(item.id, "active", !item.active)}
                          title="Click to toggle"
                        >
                          {item.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {/* ── Aftermarket Rates ─────────────────────────────────────────── */}
      <div style={card}>
        <span style={label}>Aftermarket Rates (Add Charm to Existing Piece)</span>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#9CA3AF", fontSize: 11 }}>
              <th style={{ textAlign: "left", paddingBottom: 8, fontWeight: 600 }}>Charm Type</th>
              <th style={{ textAlign: "left", paddingBottom: 8, fontWeight: 600 }}>Metal</th>
              <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 600 }}>Charm Price</th>
              <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 600 }}>Soldering</th>
              <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 600 }}>Total</th>
              <th style={{ textAlign: "center", paddingBottom: 8, fontWeight: 600 }}>Active</th>
            </tr>
          </thead>
          <tbody>
            {aftermarket.map((rate, i) => (
              <tr key={rate.id} style={{ borderTop: i > 0 ? "1px solid #F9FAFB" : undefined }}>
                <td style={{ padding: "7px 0", color: "#374151", textTransform: "capitalize" }}>
                  {rate.charm_type.replace(/_/g, " ")}
                </td>
                <td style={{ padding: "7px 0", textTransform: "capitalize" }}>{rate.metal_colour}</td>
                <td style={{ textAlign: "right", padding: "7px 0" }}>
                  <PriceField
                    value={Number(rate.charm_price)}
                    onSave={async v => {
                      const newTotal = v + Number(rate.soldering_fee);
                      await patch("aftermarket_rate", rate.id, { charm_price: v, total_price: newTotal });
                      setAftermarket(prev => prev.map(r => r.id === rate.id ? { ...r, charm_price: v, total_price: newTotal } : r));
                    }}
                  />
                </td>
                <td style={{ textAlign: "right", padding: "7px 0" }}>
                  <PriceField
                    value={Number(rate.soldering_fee)}
                    onSave={async v => {
                      const newTotal = Number(rate.charm_price) + v;
                      await patch("aftermarket_rate", rate.id, { soldering_fee: v, total_price: newTotal });
                      setAftermarket(prev => prev.map(r => r.id === rate.id ? { ...r, soldering_fee: v, total_price: newTotal } : r));
                    }}
                  />
                </td>
                <td style={{ textAlign: "right", padding: "7px 0", fontWeight: 600, color: "#111827" }}>
                  ${Number(rate.total_price).toFixed(0)}
                </td>
                <td style={{ textAlign: "center", padding: "7px 0" }}>
                  <span
                    style={{ ...badge(rate.active), cursor: "pointer" }}
                    onClick={() => updateAftermarket(rate.id, "active", !rate.active)}
                    title="Click to toggle"
                  >
                    {rate.active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
          Total = Charm Price + Soldering. Editing either price auto-updates the total.
        </p>
      </div>
    </div>
  );
}
