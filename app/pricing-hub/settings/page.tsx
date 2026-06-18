"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";

interface GoldPrice {
  id: string;
  metal_type: string;
  price_per_gram: number;
  effective_date: string;
  notes: string | null;
}

interface LabourRate {
  id: string;
  rate_name: string;
  supplier: string | null;
  rate_per_stone: number | null;
  rate_per_hour: number | null;
  rate_flat: number | null;
  notes: string | null;
}

export default function PricingSettingsPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  const [goldPrices, setGoldPrices]       = useState<GoldPrice[]>([]);
  const [labourRates, setLabourRates]     = useState<LabourRate[]>([]);
  const [loading, setLoading]             = useState(true);
  const [editGold, setEditGold]           = useState<Record<string, string>>({});
  const [editLabour, setEditLabour]       = useState<Record<string, Partial<LabourRate>>>({});
  const [saving, setSaving]               = useState<string | null>(null);
  const [saved, setSaved]                 = useState<Set<string>>(new Set());

  useEffect(() => {
    if (hydrated && user && user.role !== "admin") router.replace("/");
  }, [hydrated, user, router]);

  const load = useCallback(async () => {
    if (!hydrated || !user || user.role !== "admin") return;
    setLoading(true);
    const [g, l] = await Promise.all([
      fetch("/api/pricing-hub/gold-prices", { credentials: "include" }).then(r => r.json()),
      fetch("/api/pricing-hub/labour-rates", { credentials: "include" }).then(r => r.json()),
    ]);
    setGoldPrices(Array.isArray(g) ? g : []);
    setLabourRates(Array.isArray(l) ? l : []);
    setLoading(false);
  }, [hydrated, user]);

  useEffect(() => { load(); }, [load]);

  if (!hydrated || !user) return null;
  if (user.role !== "admin") return null;

  async function saveGoldPrice(g: GoldPrice) {
    const raw = editGold[g.id];
    const val = raw != null ? parseFloat(raw) : Number(g.price_per_gram);
    if (isNaN(val) || val <= 0) return;
    setSaving(g.id);
    await fetch("/api/pricing-hub/gold-prices", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: g.id, metal_type: g.metal_type, price_per_gram: val, effective_date: new Date().toISOString().slice(0, 10) }),
    });
    setSaving(null);
    setSaved(prev => { const n = new Set(prev); n.add(g.id); setTimeout(() => setSaved(p => { const c = new Set(p); c.delete(g.id); return c; }), 2000); return n; });
    setEditGold(prev => { const n = { ...prev }; delete n[g.id]; return n; });
    load();
  }

  async function saveLabourRate(r: LabourRate) {
    const patch = editLabour[r.id];
    if (!patch || Object.keys(patch).length === 0) return;
    setSaving(r.id);
    await fetch("/api/pricing-hub/labour-rates", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, ...patch }),
    });
    setSaving(null);
    setSaved(prev => { const n = new Set(prev); n.add(r.id); setTimeout(() => setSaved(p => { const c = new Set(p); c.delete(r.id); return c; }), 2000); return n; });
    setEditLabour(prev => { const n = { ...prev }; delete n[r.id]; return n; });
    load();
  }

  const thStyle: React.CSSProperties = {
    padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#6B7280",
    textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em",
    background: "#F9FAFB", borderBottom: "1px solid #E8E8F0",
  };

  const inputStyle: React.CSSProperties = {
    padding: "5px 8px", border: "1px solid #D1D5DB", borderRadius: 6,
    fontSize: 13, width: 80, boxSizing: "border-box",
  };

  const saveBtnStyle = (id: string): React.CSSProperties => ({
    padding: "4px 12px", background: saved.has(id) ? "#16A34A" : "#635BFF",
    color: "#fff", border: "none", borderRadius: 6, fontSize: 12,
    fontWeight: 600, cursor: saving === id ? "wait" : "pointer",
  });

  return (
    <div style={{ padding: "32px 40px", maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1760", marginBottom: 4 }}>Pricing Settings</h1>
      <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 32 }}>Manage metal prices and labour rates used in build cost calculations.</p>

      {/* Gold prices */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8F0" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A1760", margin: 0 }}>Metal Prices (per gram)</h2>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>Edit the price and click Save to update. Effective date resets to today.</p>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Metal Type</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Price / gram (AUD)</th>
              <th style={thStyle}>Effective Date</th>
              <th style={{ ...thStyle, width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ padding: 24, color: "#9CA3AF", fontSize: 13 }}>Loading…</td></tr>
            ) : goldPrices.map((g, i) => (
              <tr key={g.id} style={{ borderBottom: i < goldPrices.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#374151" }}>{g.metal_type}</td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "#9CA3AF" }}>$</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={editGold[g.id] ?? String(Number(g.price_per_gram).toFixed(2))}
                      onChange={e => setEditGold(prev => ({ ...prev, [g.id]: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                </td>
                <td style={{ padding: "10px 14px", fontSize: 13, color: "#6B7280" }}>
                  {new Date(g.effective_date).toLocaleDateString("en-AU")}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <button onClick={() => saveGoldPrice(g)} disabled={saving === g.id} style={saveBtnStyle(g.id)}>
                    {saved.has(g.id) ? "Saved ✓" : saving === g.id ? "…" : "Save"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Labour rates */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8F0" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A1760", margin: 0 }}>Labour Rates</h2>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>Per-stone, per-hour, or flat rates used in build cost breakdowns.</p>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Rate Name</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Per Stone</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Per Hour</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Flat</th>
              <th style={{ ...thStyle, width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 24, color: "#9CA3AF", fontSize: 13 }}>Loading…</td></tr>
            ) : labourRates.map((r, i) => {
              const patch = editLabour[r.id] ?? {};
              const val = (field: keyof LabourRate, fallback: number | null) =>
                field in patch ? String(patch[field] ?? "") : (fallback != null ? String(Number(fallback).toFixed(2)) : "");

              return (
                <tr key={r.id} style={{ borderBottom: i < labourRates.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                  <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#374151" }}>{r.rate_name}</td>
                  {(["rate_per_stone", "rate_per_hour", "rate_flat"] as const).map(field => (
                    <td key={field} style={{ padding: "10px 14px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "#9CA3AF" }}>$</span>
                        <input
                          type="number" step="0.01" min="0" placeholder="—"
                          value={val(field, r[field] as number | null)}
                          onChange={e => setEditLabour(prev => ({
                            ...prev,
                            [r.id]: { ...prev[r.id], [field]: e.target.value === "" ? null : parseFloat(e.target.value) },
                          }))}
                          style={{ ...inputStyle, width: 70 }}
                        />
                      </div>
                    </td>
                  ))}
                  <td style={{ padding: "10px 14px" }}>
                    <button onClick={() => saveLabourRate(r)} disabled={saving === r.id} style={saveBtnStyle(r.id)}>
                      {saved.has(r.id) ? "Saved ✓" : saving === r.id ? "…" : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Metal density reference */}
      <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 12, padding: "16px 20px" }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 12 }}>Metal Density Reference (g/cm³)</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {[
            ["9ct Yellow", "11.2"], ["9ct White", "11.6"], ["9ct Rose", "11.2"],
            ["18ct Yellow", "15.5"], ["18ct White", "15.8"], ["18ct Rose", "15.5"],
            ["Platinum 950", "21.5"], ["Sterling Silver", "10.4"],
          ].map(([m, d]) => (
            <div key={m} style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontSize: 12, color: "#6B7280" }}>{m}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1760" }}>{d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
