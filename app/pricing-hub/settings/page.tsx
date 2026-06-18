"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";

// ── Types ────────────────────────────────────────────────────────────────────

interface GoldPrice {
  id: string; metal_type: string; price_per_gram: number; effective_date: string;
}
interface RateCard {
  id: string; card_type: string; label: string; amount: number; unit: string; sort_order: number;
}
interface RapEntry {
  id: string; shape: string; size_min: number; size_max: number;
  colour: string; clarity: string; price_hundreds_usd: number; rap_date: string;
}

type Tab = "gold" | "rates" | "rapaport";

const UNIT_OPTIONS = ["flat", "per_stone", "per_gram"];
const SHAPES = ["Round", "Princess", "Oval", "Cushion", "Pear", "Marquise", "Emerald", "Radiant", "Asscher", "Heart"];
const COLOURS = ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
const CLARITIES = ["IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "I2", "I3"];

// ── Inline edit helpers ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "5px 8px", border: "1px solid #D1D5DB", borderRadius: 6,
  fontSize: 13, boxSizing: "border-box" as const,
};
const thStyle: React.CSSProperties = {
  padding: "9px 12px", fontSize: 11, fontWeight: 600, color: "#6B7280",
  textAlign: "left" as const, textTransform: "uppercase" as const, letterSpacing: "0.04em",
  background: "#F9FAFB", borderBottom: "1px solid #E8E8F0",
};
const saveBtnStyle = (saved: boolean): React.CSSProperties => ({
  padding: "4px 12px", background: saved ? "#16A34A" : "#635BFF",
  color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
});

// ── Component ────────────────────────────────────────────────────────────────

export default function PricingSettingsPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("gold");

  // Gold prices
  const [goldPrices, setGoldPrices]   = useState<GoldPrice[]>([]);
  const [editGold, setEditGold]       = useState<Record<string, string>>({});
  const [savingGold, setSavingGold]   = useState<string | null>(null);
  const [savedGold, setSavedGold]     = useState<Set<string>>(new Set());

  // Rate cards
  const [rateCards, setRateCards]     = useState<RateCard[]>([]);
  const [editingRid, setEditingRid]   = useState<string | null>(null);
  const [rBuf, setRBuf]               = useState({ label: "", amount: "", unit: "flat" });
  const [rSaving, setRSaving]         = useState(false);
  const [showAddRate, setShowAddRate] = useState<"our_build" | "supplier" | null>(null);
  const [newRate, setNewRate]         = useState({ label: "", amount: "", unit: "flat" });
  const [rateSaving, setRateSaving]   = useState(false);

  // Rapaport
  const [rapEntries, setRapEntries]   = useState<RapEntry[]>([]);
  const [editingRap, setEditingRap]   = useState<string | null>(null);
  const [rapBuf, setRapBuf]           = useState<Partial<RapEntry>>({});
  const [rapSaving, setRapSaving]     = useState(false);
  const [showAddRap, setShowAddRap]   = useState(false);
  const [newRap, setNewRap]           = useState({ shape: "Round", size_min: "", size_max: "", colour: "G", clarity: "VS1", price_hundreds_usd: "", rap_date: "" });
  const [addRapSaving, setAddRapSaving] = useState(false);

  useEffect(() => {
    if (hydrated && user && user.role !== "admin") router.replace("/");
  }, [hydrated, user, router]);

  const tid = user?.tenantId ?? "";

  const loadGold = useCallback(async () => {
    const res = await fetch("/api/pricing-hub/gold-prices", { credentials: "include", headers: { "x-tenant-id": tid } });
    const d = await res.json();
    setGoldPrices(Array.isArray(d) ? d : []);
  }, [tid]);

  const loadRates = useCallback(async () => {
    const res = await fetch("/api/pricing-hub/rate-cards", { credentials: "include", headers: { "x-tenant-id": tid } });
    const d = await res.json();
    setRateCards(Array.isArray(d) ? d : []);
  }, [tid]);

  const loadRap = useCallback(async () => {
    const res = await fetch("/api/pricing-hub/rapaport", { credentials: "include", headers: { "x-tenant-id": tid } });
    const d = await res.json();
    setRapEntries(Array.isArray(d) ? d : []);
  }, [tid]);

  useEffect(() => {
    if (!hydrated || !user || user.role !== "admin") return;
    loadGold(); loadRates(); loadRap();
  }, [hydrated, user, loadGold, loadRates, loadRap]);

  if (!hydrated || !user) return null;
  if (user.role !== "admin") return null;

  // ── Gold price handlers ────────────────────────────────────────────────────

  async function saveGoldPrice(g: GoldPrice) {
    const raw = editGold[g.id];
    const val = raw != null ? parseFloat(raw) : Number(g.price_per_gram);
    if (isNaN(val) || val <= 0) return;
    setSavingGold(g.id);
    await fetch("/api/pricing-hub/gold-prices", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({ id: g.id, metal_type: g.metal_type, price_per_gram: val, effective_date: new Date().toISOString().slice(0, 10) }),
    });
    setSavingGold(null);
    setSavedGold(prev => { const n = new Set(prev); n.add(g.id); setTimeout(() => setSavedGold(p => { const c = new Set(p); c.delete(g.id); return c; }), 2000); return n; });
    setEditGold(prev => { const n = { ...prev }; delete n[g.id]; return n; });
    loadGold();
  }

  // ── Rate card handlers ─────────────────────────────────────────────────────

  async function saveRate(id: string) {
    setRSaving(true);
    await fetch(`/api/pricing-hub/rate-cards/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({ label: rBuf.label, amount: parseFloat(rBuf.amount), unit: rBuf.unit }),
    });
    setRSaving(false); setEditingRid(null);
    loadRates();
  }

  async function deleteRate(id: string) {
    if (!confirm("Delete this rate?")) return;
    await fetch(`/api/pricing-hub/rate-cards/${id}`, { method: "DELETE", credentials: "include", headers: { "x-tenant-id": tid } });
    loadRates();
  }

  async function addRate(cardType: "our_build" | "supplier") {
    if (!newRate.label.trim() || !newRate.amount) return;
    setRateSaving(true);
    await fetch("/api/pricing-hub/rate-cards", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({ card_type: cardType, label: newRate.label.trim(), amount: parseFloat(newRate.amount), unit: newRate.unit }),
    });
    setRateSaving(false); setShowAddRate(null); setNewRate({ label: "", amount: "", unit: "flat" });
    loadRates();
  }

  // ── Rapaport handlers ──────────────────────────────────────────────────────

  async function saveRap(id: string) {
    setRapSaving(true);
    await fetch(`/api/pricing-hub/rapaport/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify(rapBuf),
    });
    setRapSaving(false); setEditingRap(null);
    loadRap();
  }

  async function deleteRap(id: string) {
    if (!confirm("Delete this Rapaport entry?")) return;
    await fetch(`/api/pricing-hub/rapaport/${id}`, { method: "DELETE", credentials: "include", headers: { "x-tenant-id": tid } });
    loadRap();
  }

  async function addRap() {
    if (!newRap.shape || !newRap.size_min || !newRap.size_max || !newRap.price_hundreds_usd || !newRap.rap_date) return;
    setAddRapSaving(true);
    await fetch("/api/pricing-hub/rapaport", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({
        shape: newRap.shape, size_min: parseFloat(newRap.size_min), size_max: parseFloat(newRap.size_max),
        colour: newRap.colour, clarity: newRap.clarity,
        price_hundreds_usd: parseFloat(newRap.price_hundreds_usd), rap_date: newRap.rap_date,
      }),
    });
    setAddRapSaving(false); setShowAddRap(false);
    setNewRap({ shape: "Round", size_min: "", size_max: "", colour: "G", clarity: "VS1", price_hundreds_usd: "", rap_date: "" });
    loadRap();
  }

  // ── Tab bar ────────────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: "gold",    label: "Gold Prices" },
    { key: "rates",   label: "Rate Cards" },
    { key: "rapaport",label: "Rapaport" },
  ];

  const RateSection = ({ cardType, title }: { cardType: "our_build" | "supplier"; title: string }) => {
    const cards = rateCards.filter(r => r.card_type === cardType);
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>{title}</h3>
          <button onClick={() => setShowAddRate(cardType)} style={{ padding: "5px 12px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            + Add Rate
          </button>
        </div>

        {showAddRate === cardType && (
          <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto auto", gap: 8, alignItems: "flex-end" }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Label</label>
                <input value={newRate.label} onChange={e => setNewRate(r => ({ ...r, label: e.target.value }))} placeholder="e.g. Setting — Claw" style={{ ...inputStyle, width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Amount ($)</label>
                <input type="number" step="0.01" value={newRate.amount} onChange={e => setNewRate(r => ({ ...r, amount: e.target.value }))} style={{ ...inputStyle, width: "100%" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Unit</label>
                <select value={newRate.unit} onChange={e => setNewRate(r => ({ ...r, unit: e.target.value }))} style={{ ...inputStyle, width: "100%" }}>
                  {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <button onClick={() => addRate(cardType)} disabled={rateSaving} style={{ ...saveBtnStyle(false), whiteSpace: "nowrap" as const }}>{rateSaving ? "…" : "Add"}</button>
              <button onClick={() => { setShowAddRate(null); setNewRate({ label: "", amount: "", unit: "flat" }); }}
                style={{ padding: "4px 10px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          </div>
        )}

        {cards.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9CA3AF", padding: "8px 0" }}>No rates yet. Click "+ Add Rate" to add one.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Label</th>
                <th style={{ ...thStyle, textAlign: "right" as const }}>Amount</th>
                <th style={thStyle}>Unit</th>
                <th style={{ ...thStyle, width: 130 }}></th>
              </tr>
            </thead>
            <tbody>
              {cards.map((r, i) => {
                const isEditing = editingRid === r.id;
                return (
                  <tr key={r.id} style={{ borderBottom: i < cards.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                    <td style={{ padding: "9px 12px" }}>
                      {isEditing ? <input value={rBuf.label} onChange={e => setRBuf(b => ({ ...b, label: e.target.value }))} style={{ ...inputStyle, width: 200 }} autoFocus /> : <span style={{ fontSize: 13, color: "#374151" }}>{r.label}</span>}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "right" as const }}>
                      {isEditing
                        ? <input type="number" step="0.01" value={rBuf.amount} onChange={e => setRBuf(b => ({ ...b, amount: e.target.value }))} style={{ ...inputStyle, width: 70, textAlign: "right" as const }} />
                        : <span style={{ fontSize: 13, fontWeight: 600, color: "#1A1760" }}>${Number(r.amount).toFixed(2)}</span>
                      }
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      {isEditing
                        ? <select value={rBuf.unit} onChange={e => setRBuf(b => ({ ...b, unit: e.target.value }))} style={{ ...inputStyle, width: 100 }}>
                            {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        : <span style={{ fontSize: 12, color: "#6B7280" }}>{r.unit}</span>
                      }
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        {isEditing ? (
                          <>
                            <button onClick={() => saveRate(r.id)} disabled={rSaving} style={saveBtnStyle(false)}>{rSaving ? "…" : "Save"}</button>
                            <button onClick={() => setEditingRid(null)} style={{ padding: "4px 8px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>✕</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingRid(r.id); setRBuf({ label: r.label, amount: String(r.amount), unit: r.unit }); }}
                              style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 13 }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#635BFF")} onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}>✎</button>
                            <button onClick={() => deleteRate(r.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 13 }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#DC2626")} onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}>✕</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 960 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1760", marginBottom: 4 }}>Pricing Settings</h1>
      <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 28 }}>Manage metal prices, rate cards, and Rapaport data.</p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid #E8E8F0", paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "8px 18px", background: "transparent", border: "none", cursor: "pointer",
            fontSize: 14, fontWeight: tab === t.key ? 700 : 400,
            color: tab === t.key ? "#635BFF" : "#6B7280",
            borderBottom: tab === t.key ? "2px solid #635BFF" : "2px solid transparent",
            marginBottom: -2,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Gold Prices tab ─────────────────────────────────────────────────── */}
      {tab === "gold" && (
        <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8F0" }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A1760", margin: 0 }}>Metal Prices (per gram, AUD)</h2>
            <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>Edit the price and click Save. Effective date resets to today on save.</p>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Metal Type</th>
                <th style={{ ...thStyle, textAlign: "right" as const }}>Price / gram</th>
                <th style={thStyle}>Effective Date</th>
                <th style={{ ...thStyle, width: 110 }}></th>
              </tr>
            </thead>
            <tbody>
              {goldPrices.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 24, color: "#9CA3AF", fontSize: 13 }}>No metal prices found.</td></tr>
              ) : goldPrices.map((g, i) => (
                <tr key={g.id} style={{ borderBottom: i < goldPrices.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#374151" }}>{g.metal_type}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right" as const }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "#9CA3AF" }}>$</span>
                      <input type="number" step="0.01" min="0"
                        value={editGold[g.id] ?? String(Number(g.price_per_gram).toFixed(2))}
                        onChange={e => setEditGold(prev => ({ ...prev, [g.id]: e.target.value }))}
                        style={{ ...inputStyle, width: 80, textAlign: "right" as const }} />
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 13, color: "#6B7280" }}>
                    {new Date(g.effective_date).toLocaleDateString("en-AU")}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <button onClick={() => saveGoldPrice(g)} disabled={savingGold === g.id} style={saveBtnStyle(savedGold.has(g.id))}>
                      {savedGold.has(g.id) ? "Saved ✓" : savingGold === g.id ? "…" : "Save"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Rate Cards tab ──────────────────────────────────────────────────── */}
      {tab === "rates" && (
        <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 24 }}>
          <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20 }}>
            Rate cards determine the additional costs added to each variant's live cost calculation based on its pricing mode.
          </p>
          <RateSection cardType="our_build" title="Our Build Rates" />
          <div style={{ borderTop: "1px solid #E8E8F0", paddingTop: 20 }}>
            <RateSection cardType="supplier" title="Supplier Rates" />
          </div>
        </div>
      )}

      {/* ── Rapaport tab ────────────────────────────────────────────────────── */}
      {tab === "rapaport" && (
        <div>
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#92400E" }}>
            Rapaport API integration pending — enter prices manually until API access is confirmed.
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#374151" }}>Rapaport Prices</h3>
            <button onClick={() => setShowAddRap(v => !v)} style={{ padding: "7px 14px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              + Add Entry
            </button>
          </div>

          {showAddRap && (
            <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                {[
                  { label: "Shape", el: <select value={newRap.shape} onChange={e => setNewRap(r => ({ ...r, shape: e.target.value }))} style={{ ...inputStyle, width: "100%" }}>{SHAPES.map(s => <option key={s} value={s}>{s}</option>)}</select> },
                  { label: "Min ct", el: <input type="number" step="0.01" value={newRap.size_min} onChange={e => setNewRap(r => ({ ...r, size_min: e.target.value }))} placeholder="0.30" style={{ ...inputStyle, width: "100%" }} /> },
                  { label: "Max ct", el: <input type="number" step="0.01" value={newRap.size_max} onChange={e => setNewRap(r => ({ ...r, size_max: e.target.value }))} placeholder="0.39" style={{ ...inputStyle, width: "100%" }} /> },
                  { label: "Colour", el: <select value={newRap.colour} onChange={e => setNewRap(r => ({ ...r, colour: e.target.value }))} style={{ ...inputStyle, width: "100%" }}>{COLOURS.map(c => <option key={c} value={c}>{c}</option>)}</select> },
                  { label: "Clarity", el: <select value={newRap.clarity} onChange={e => setNewRap(r => ({ ...r, clarity: e.target.value }))} style={{ ...inputStyle, width: "100%" }}>{CLARITIES.map(c => <option key={c} value={c}>{c}</option>)}</select> },
                  { label: "Price/100 USD", el: <input type="number" step="0.01" value={newRap.price_hundreds_usd} onChange={e => setNewRap(r => ({ ...r, price_hundreds_usd: e.target.value }))} placeholder="85" style={{ ...inputStyle, width: "100%" }} /> },
                  { label: "Rap Date", el: <input type="date" value={newRap.rap_date} onChange={e => setNewRap(r => ({ ...r, rap_date: e.target.value }))} style={{ ...inputStyle, width: "100%" }} /> },
                ].map(({ label, el }) => (
                  <div key={label}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>{label}</label>
                    {el}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={addRap} disabled={addRapSaving} style={saveBtnStyle(false)}>{addRapSaving ? "Saving…" : "Add"}</button>
                <button onClick={() => setShowAddRap(false)} style={{ padding: "4px 12px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Shape", "Size (ct)", "Colour", "Clarity", "$/100 USD", "Rap Date", ""].map(h => (
                    <th key={h} style={{ ...thStyle, textAlign: h === "$/100 USD" ? "right" as const : "left" as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rapEntries.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No Rapaport entries yet.</td></tr>
                ) : rapEntries.map((r, i) => {
                  const isEditing = editingRap === r.id;
                  return (
                    <tr key={r.id} style={{ borderBottom: i < rapEntries.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                      <td style={{ padding: "9px 12px", fontSize: 13 }}>
                        {isEditing ? <select value={String(rapBuf.shape ?? r.shape)} onChange={e => setRapBuf(b => ({ ...b, shape: e.target.value }))} style={{ ...inputStyle, width: 90 }}>{SHAPES.map(s => <option key={s} value={s}>{s}</option>)}</select> : r.shape}
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: 13 }}>
                        {isEditing
                          ? <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <input type="number" step="0.01" value={String(rapBuf.size_min ?? r.size_min)} onChange={e => setRapBuf(b => ({ ...b, size_min: parseFloat(e.target.value) }))} style={{ ...inputStyle, width: 55 }} />
                              –
                              <input type="number" step="0.01" value={String(rapBuf.size_max ?? r.size_max)} onChange={e => setRapBuf(b => ({ ...b, size_max: parseFloat(e.target.value) }))} style={{ ...inputStyle, width: 55 }} />
                            </span>
                          : `${Number(r.size_min).toFixed(2)}–${Number(r.size_max).toFixed(2)}`
                        }
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: 13 }}>
                        {isEditing ? <select value={String(rapBuf.colour ?? r.colour)} onChange={e => setRapBuf(b => ({ ...b, colour: e.target.value }))} style={{ ...inputStyle, width: 60 }}>{COLOURS.map(c => <option key={c} value={c}>{c}</option>)}</select> : r.colour}
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: 13 }}>
                        {isEditing ? <select value={String(rapBuf.clarity ?? r.clarity)} onChange={e => setRapBuf(b => ({ ...b, clarity: e.target.value }))} style={{ ...inputStyle, width: 70 }}>{CLARITIES.map(c => <option key={c} value={c}>{c}</option>)}</select> : r.clarity}
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: 13, textAlign: "right" as const, fontWeight: 600 }}>
                        {isEditing ? <input type="number" step="0.01" value={String(rapBuf.price_hundreds_usd ?? r.price_hundreds_usd)} onChange={e => setRapBuf(b => ({ ...b, price_hundreds_usd: parseFloat(e.target.value) }))} style={{ ...inputStyle, width: 70, textAlign: "right" as const }} /> : `$${Number(r.price_hundreds_usd).toFixed(2)}`}
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: 13, color: "#6B7280" }}>
                        {isEditing ? <input type="date" value={String(rapBuf.rap_date ?? r.rap_date)} onChange={e => setRapBuf(b => ({ ...b, rap_date: e.target.value }))} style={{ ...inputStyle, width: 120 }} /> : new Date(r.rap_date).toLocaleDateString("en-AU")}
                      </td>
                      <td style={{ padding: "9px 12px" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          {isEditing ? (
                            <>
                              <button onClick={() => saveRap(r.id)} disabled={rapSaving} style={saveBtnStyle(false)}>{rapSaving ? "…" : "Save"}</button>
                              <button onClick={() => setEditingRap(null)} style={{ padding: "3px 8px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>✕</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setEditingRap(r.id); setRapBuf({}); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 13 }}
                                onMouseEnter={e => (e.currentTarget.style.color = "#635BFF")} onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}>✎</button>
                              <button onClick={() => deleteRap(r.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 13 }}
                                onMouseEnter={e => (e.currentTarget.style.color = "#DC2626")} onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}>✕</button>
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
      )}
    </div>
  );
}
