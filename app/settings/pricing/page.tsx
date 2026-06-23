"use client";

import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";

const CATEGORIES = [
  { key: "gold_9ct",        label: "9ct Yellow Gold",   hasRate: false },
  { key: "gold_18ct",       label: "18ct Yellow Gold",  hasRate: false },
  { key: "silver",          label: "Sterling Silver",   hasRate: false },
  { key: "platinum",        label: "Platinum",          hasRate: false },
  { key: "labour_standard", label: "Labour (Standard)", hasRate: true  },
  { key: "labour_repair",   label: "Labour (Repair)",   hasRate: true  },
] as const;

type CategoryKey = typeof CATEGORIES[number]["key"];

const DEFAULTS: Record<CategoryKey, { margin_percent: number; hourly_rate: number | null }> = {
  gold_9ct:        { margin_percent: 45, hourly_rate: null },
  gold_18ct:       { margin_percent: 45, hourly_rate: null },
  silver:          { margin_percent: 40, hourly_rate: null },
  platinum:        { margin_percent: 40, hourly_rate: null },
  labour_standard: { margin_percent: 0,  hourly_rate: 85   },
  labour_repair:   { margin_percent: 0,  hourly_rate: 65   },
};

interface MarginRow {
  category: CategoryKey;
  margin_percent: number;
  hourly_rate: number | null;
}

export default function PricingMarginsPage() {
  const { user, hydrated } = useUser();
  const [rows, setRows] = useState<MarginRow[]>(
    CATEGORIES.map(c => ({ category: c.key, ...DEFAULTS[c.key] }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!user?.tenantId) { setLoading(false); return; }
    fetch("/api/settings/pricing-margins", {
      headers: { "x-tenant-id": user.tenantId },
    })
      .then(r => r.json())
      .then((json: { rows?: MarginRow[] }) => {
        if (json.rows && json.rows.length > 0) {
          setRows(
            CATEGORIES.map(c => {
              const fetched = json.rows!.find(r => r.category === c.key);
              return fetched ?? { category: c.key, ...DEFAULTS[c.key] };
            })
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.tenantId, hydrated]);

  function updateRow(category: CategoryKey, field: "margin_percent" | "hourly_rate", value: string) {
    setRows(prev =>
      prev.map(r =>
        r.category === category
          ? {
              ...r,
              [field]:
                value === ""
                  ? field === "hourly_rate" ? null : 0
                  : parseFloat(value) || 0,
            }
          : r
      )
    );
  }

  async function save() {
    if (!user?.tenantId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/pricing-margins", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": user.tenantId },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) throw new Error("Save failed");
      setToast({ msg: "Saved", ok: true });
    } catch {
      setToast({ msg: "Error saving", ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  const card: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #E8E8F0",
    borderRadius: 12,
    overflow: "hidden",
  };

  const th: React.CSSProperties = {
    padding: "10px 16px",
    fontSize: 12,
    fontWeight: 600,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    background: "#F9FAFB",
    textAlign: "left",
    borderBottom: "1px solid #E8E8F0",
  };

  const td: React.CSSProperties = {
    padding: "12px 16px",
    fontSize: 14,
    color: "#1A1A2E",
    borderBottom: "1px solid #E8E8F0",
  };

  const inp: React.CSSProperties = {
    border: "1px solid #635BFF",
    borderRadius: 6,
    padding: "5px 8px",
    fontSize: 14,
    width: 90,
    outline: "none",
    fontFamily: "inherit",
    textAlign: "right",
  };

  if (loading) {
    return (
      <div style={{ padding: 32, fontFamily: "Inter, system-ui, sans-serif", color: "#9CA3AF", fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 24px", fontFamily: "Inter, system-ui, sans-serif", maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>
            Pricing Margins
          </h1>
          <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 0 }}>
            Per-category markup and labour rates applied in the quote builder.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {toast && (
            <span style={{ fontSize: 13, fontWeight: 600, color: toast.ok ? "#10B981" : "#EF4444" }}>
              {toast.msg}
            </span>
          )}
          <button
            onClick={save}
            disabled={saving}
            style={{
              background: saving ? "#9CA3AF" : "#635BFF",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "9px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Category</th>
              <th style={{ ...th, textAlign: "right" }}>Margin %</th>
              <th style={{ ...th, textAlign: "right" }}>Hourly Rate</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map(cat => {
              const row = rows.find(r => r.category === cat.key) ?? {
                category: cat.key,
                ...DEFAULTS[cat.key],
              };
              return (
                <tr key={cat.key}>
                  <td style={td}>
                    <span style={{ fontWeight: 500 }}>{cat.label}</span>
                  </td>

                  <td style={{ ...td, textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                      <input
                        type="number"
                        min="0"
                        max="999"
                        step="0.1"
                        value={row.margin_percent ?? 0}
                        onChange={e => updateRow(cat.key, "margin_percent", e.target.value)}
                        style={inp}
                      />
                      <span style={{ fontSize: 13, color: "#6B7280" }}>%</span>
                    </div>
                  </td>

                  <td style={{ ...td, textAlign: "right" }}>
                    {cat.hasRate ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                        <span style={{ fontSize: 13, color: "#6B7280" }}>$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={row.hourly_rate ?? ""}
                          onChange={e => updateRow(cat.key, "hourly_rate", e.target.value)}
                          style={inp}
                        />
                        <span style={{ fontSize: 12, color: "#9CA3AF" }}>/hr</span>
                      </div>
                    ) : (
                      <span style={{ color: "#D1D5DB" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Explainer */}
      <div
        style={{
          marginTop: 16,
          padding: "14px 16px",
          background: "#F0F0FF",
          border: "1px solid #C7C5F8",
          borderRadius: 10,
        }}
      >
        <p style={{ margin: 0, fontSize: 13, color: "#4338CA", lineHeight: 1.6 }}>
          <strong>Metal margins</strong> are applied to each metal component (weight × spot price × margin).{" "}
          <strong>Labour rates</strong> are charged per hour and already include your margin.{" "}
          Stones use the 9ct Gold margin as the default category markup.
        </p>
      </div>
    </div>
  );
}
