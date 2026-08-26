"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

export const dynamic = "force-dynamic";

// ── Quote Builder types ──────────────────────────────────────────────────────

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

interface MarginRow { category: CategoryKey; margin_percent: number; hourly_rate: number | null; }

// ── Pricing Engine types ─────────────────────────────────────────────────────

interface ComponentRule {
  id: string;
  component_type: string;
  carat_min: number;
  carat_max: number | null;
  multiplier: number;
  notes: string | null;
}
interface Birthstone {
  id: string;
  month_number: number;
  stone_name: string;
  price_per_stone: number;
  fitting_fee: number;
  notes: string | null;
}
interface PersonalisationFee {
  id: string;
  fee_type: string;
  description: string | null;
  amount: number;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type ActiveTab = "quote_builder" | "pricing_engine";

// ── Shared styles ────────────────────────────────────────────────────────────

const card: React.CSSProperties = { background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" };
const th: React.CSSProperties = { padding: "10px 16px", fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase" as const, letterSpacing: "0.05em", background: "#F9FAFB", textAlign: "left" as const, borderBottom: "1px solid #E8E8F0" };
const td: React.CSSProperties = { padding: "12px 16px", fontSize: 14, color: "#1A1A2E", borderBottom: "1px solid #E8E8F0" };
const inp: React.CSSProperties = { border: "1px solid #D1D5DB", borderRadius: 6, padding: "5px 8px", fontSize: 14, outline: "none", fontFamily: "inherit" };
const inpFocus: React.CSSProperties = { ...inp, border: "1px solid #635BFF" };
const PRIMARY = "#635BFF";

function SaveBtn({ onClick, saving, saved }: { onClick: () => void; saving: boolean; saved?: boolean }) {
  return (
    <button onClick={onClick} disabled={saving} style={{
      padding: "4px 14px", background: saved ? "#10B981" : PRIMARY,
      color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
      cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
      transition: "background 0.2s",
    }}>
      {saving ? "…" : saved ? "Saved" : "Save"}
    </button>
  );
}

function IconBtn({ onClick, icon, danger }: { onClick: () => void; icon: string; danger?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} style={{
      background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px",
      color: hover ? (danger ? "#DC2626" : PRIMARY) : "#9CA3AF", fontSize: 15, transition: "color 0.15s",
    }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {icon}
    </button>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PricingMarginsPage() {
  const { user, hydrated } = useUser();
  const [activeTab, setActiveTab] = useState<ActiveTab>("quote_builder");

  // ── Quote Builder state ──
  const [rows, setRows] = useState<MarginRow[]>(CATEGORIES.map(c => ({ category: c.key, ...DEFAULTS[c.key] })));
  const [qbLoading, setQbLoading] = useState(true);
  const [qbSaving, setQbSaving] = useState(false);
  const [qbToast, setQbToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // ── Pricing Engine state ──
  const [rules, setRules] = useState<ComponentRule[]>([]);
  const [birthstones, setBirthstones] = useState<Birthstone[]>([]);
  const [fees, setFees] = useState<PersonalisationFee[]>([]);
  const [engLoading, setEngLoading] = useState(false);

  // Inline editing state
  const [editingRule, setEditingRule] = useState<string | null>(null);
  const [ruleBuf, setRuleBuf] = useState<{ multiplier: string; carat_min: string; carat_max: string }>({ multiplier: "", carat_min: "", carat_max: "" });
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleSaved, setRuleSaved] = useState<string | null>(null);

  const [editingBs, setEditingBs] = useState<string | null>(null);
  const [bsBuf, setBsBuf] = useState<{ stone_name: string; price_per_stone: string; fitting_fee: string }>({ stone_name: "", price_per_stone: "", fitting_fee: "" });
  const [bsSaving, setBsSaving] = useState(false);

  const [editingFee, setEditingFee] = useState<string | null>(null);
  const [feeBuf, setFeeBuf] = useState<{ description: string; amount: string }>({ description: "", amount: "" });
  const [feeSaving, setFeeSaving] = useState(false);

  // Add forms
  const [showAddTier, setShowAddTier] = useState(false);
  const [newTier, setNewTier] = useState({ carat_min: "", carat_max: "", multiplier: "" });
  const [addTierSaving, setAddTierSaving] = useState(false);

  const [showAddLabTier, setShowAddLabTier] = useState(false);
  const [newLabTier, setNewLabTier] = useState({ carat_min: "", carat_max: "", multiplier: "" });
  const [addLabTierSaving, setAddLabTierSaving] = useState(false);

  const [showAddBs, setShowAddBs] = useState(false);
  const [newBs, setNewBs] = useState({ month_number: "1", stone_name: "", price_per_stone: "", fitting_fee: "0" });
  const [addBsSaving, setAddBsSaving] = useState(false);

  const [showAddFee, setShowAddFee] = useState(false);
  const [newFee, setNewFee] = useState({ fee_type: "", description: "", amount: "" });
  const [addFeeSaving, setAddFeeSaving] = useState(false);

  const tid = user?.tenantId ?? "";

  // ── Load quote builder margins ────────────────────────────────────────────

  useEffect(() => {
    if (!hydrated || !tid) { setQbLoading(false); return; }
    fetch("/api/settings/pricing-margins", { headers: { "x-tenant-id": tid } })
      .then(r => r.json())
      .then((json: { rows?: MarginRow[] }) => {
        if (json.rows && json.rows.length > 0) {
          setRows(CATEGORIES.map(c => {
            const fetched = json.rows!.find(r => r.category === c.key);
            return fetched ?? { category: c.key, ...DEFAULTS[c.key] };
          }));
        }
      })
      .catch(() => {})
      .finally(() => setQbLoading(false));
  }, [tid, hydrated]);

  // ── Load pricing engine data ──────────────────────────────────────────────

  const loadEngine = useCallback(async () => {
    if (!tid) return;
    setEngLoading(true);
    try {
      const [rulesRes, bsRes, feesRes] = await Promise.all([
        fetch("/api/pricing-hub/component-rules", { headers: { "x-tenant-id": tid } }),
        fetch("/api/pricing-hub/birthstones", { headers: { "x-tenant-id": tid } }),
        fetch("/api/pricing-hub/personalisation-fees", { headers: { "x-tenant-id": tid } }),
      ]);
      setRules(rulesRes.ok ? await rulesRes.json() : []);
      setBirthstones(bsRes.ok ? await bsRes.json() : []);
      setFees(feesRes.ok ? await feesRes.json() : []);
    } finally {
      setEngLoading(false);
    }
  }, [tid]);

  useEffect(() => {
    if (hydrated && tid && activeTab === "pricing_engine") loadEngine();
  }, [hydrated, tid, activeTab, loadEngine]);

  if (!hydrated || !user) return null;
  if (!canManage(user.role)) return null;

  // ── Quote Builder handlers ────────────────────────────────────────────────

  function updateRow(category: CategoryKey, field: "margin_percent" | "hourly_rate", value: string) {
    setRows(prev => prev.map(r => r.category === category
      ? { ...r, [field]: value === "" ? (field === "hourly_rate" ? null : 0) : parseFloat(value) || 0 }
      : r
    ));
  }

  async function saveQb() {
    if (!tid) return;
    setQbSaving(true);
    try {
      const res = await fetch("/api/settings/pricing-margins", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tid },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) throw new Error();
      setQbToast({ msg: "Saved", ok: true });
    } catch {
      setQbToast({ msg: "Error saving", ok: false });
    } finally {
      setQbSaving(false);
      setTimeout(() => setQbToast(null), 3000);
    }
  }

  // ── Component rule handlers ───────────────────────────────────────────────

  async function saveRule(id: string) {
    setRuleSaving(true);
    const update: Record<string, unknown> = { multiplier: parseFloat(ruleBuf.multiplier) };
    if (ruleBuf.carat_min !== "") update.carat_min = parseFloat(ruleBuf.carat_min);
    if (ruleBuf.carat_max !== "") update.carat_max = parseFloat(ruleBuf.carat_max);
    else if ("carat_max" in ruleBuf) update.carat_max = null;
    await fetch(`/api/pricing-hub/component-rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify(update),
    });
    setRuleSaving(false);
    setEditingRule(null);
    setRuleSaved(id);
    setTimeout(() => setRuleSaved(null), 2000);
    loadEngine();
  }

  async function deleteRule(id: string) {
    if (!confirm("Delete this tier? This affects live price calculations.")) return;
    await fetch(`/api/pricing-hub/component-rules/${id}`, { method: "DELETE", headers: { "x-tenant-id": tid } });
    loadEngine();
  }

  async function addLabTier() {
    if (!newLabTier.carat_min || !newLabTier.multiplier) return;
    setAddLabTierSaving(true);
    await fetch("/api/pricing-hub/component-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({
        component_type: "lab_stone",
        carat_min: parseFloat(newLabTier.carat_min),
        carat_max: newLabTier.carat_max ? parseFloat(newLabTier.carat_max) : null,
        multiplier: parseFloat(newLabTier.multiplier),
      }),
    });
    setAddLabTierSaving(false);
    setShowAddLabTier(false);
    setNewLabTier({ carat_min: "", carat_max: "", multiplier: "" });
    loadEngine();
  }

  async function addNaturalTier() {
    if (!newTier.carat_min || !newTier.multiplier) return;
    setAddTierSaving(true);
    await fetch("/api/pricing-hub/component-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({
        component_type: "natural_stone",
        carat_min: parseFloat(newTier.carat_min),
        carat_max: newTier.carat_max ? parseFloat(newTier.carat_max) : null,
        multiplier: parseFloat(newTier.multiplier),
      }),
    });
    setAddTierSaving(false);
    setShowAddTier(false);
    setNewTier({ carat_min: "", carat_max: "", multiplier: "" });
    loadEngine();
  }

  // ── Birthstone handlers ───────────────────────────────────────────────────

  async function saveBs(id: string) {
    setBsSaving(true);
    await fetch(`/api/pricing-hub/birthstones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({
        stone_name: bsBuf.stone_name,
        price_per_stone: parseFloat(bsBuf.price_per_stone),
        fitting_fee: parseFloat(bsBuf.fitting_fee || "0"),
      }),
    });
    setBsSaving(false);
    setEditingBs(null);
    loadEngine();
  }

  async function deleteBs(id: string) {
    if (!confirm("Remove this birthstone entry?")) return;
    await fetch(`/api/pricing-hub/birthstones/${id}`, { method: "DELETE", headers: { "x-tenant-id": tid } });
    loadEngine();
  }

  async function addBs() {
    if (!newBs.stone_name.trim() || !newBs.price_per_stone) return;
    setAddBsSaving(true);
    await fetch("/api/pricing-hub/birthstones", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({
        month_number: parseInt(newBs.month_number),
        stone_name: newBs.stone_name.trim(),
        price_per_stone: parseFloat(newBs.price_per_stone),
        fitting_fee: parseFloat(newBs.fitting_fee || "0"),
      }),
    });
    setAddBsSaving(false);
    setShowAddBs(false);
    setNewBs({ month_number: "1", stone_name: "", price_per_stone: "", fitting_fee: "0" });
    loadEngine();
  }

  // ── Personalisation fee handlers ──────────────────────────────────────────

  async function saveFee(id: string) {
    setFeeSaving(true);
    await fetch(`/api/pricing-hub/personalisation-fees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({ description: feeBuf.description, amount: parseFloat(feeBuf.amount) }),
    });
    setFeeSaving(false);
    setEditingFee(null);
    loadEngine();
  }

  async function deleteFee(id: string) {
    if (!confirm("Remove this fee?")) return;
    await fetch(`/api/pricing-hub/personalisation-fees/${id}`, { method: "DELETE", headers: { "x-tenant-id": tid } });
    loadEngine();
  }

  async function addFee() {
    if (!newFee.fee_type.trim() || !newFee.amount) return;
    setAddFeeSaving(true);
    await fetch("/api/pricing-hub/personalisation-fees", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({
        fee_type: newFee.fee_type.trim(),
        description: newFee.description.trim() || null,
        amount: parseFloat(newFee.amount),
      }),
    });
    setAddFeeSaving(false);
    setShowAddFee(false);
    setNewFee({ fee_type: "", description: "", amount: "" });
    loadEngine();
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const flatRules  = rules.filter(r => r.component_type !== "natural_stone" && r.component_type !== "lab_stone");
  const labTiers   = rules.filter(r => r.component_type === "lab_stone").sort((a, b) => a.carat_min - b.carat_min);
  const stoneTiers = rules.filter(r => r.component_type === "natural_stone").sort((a, b) => a.carat_min - b.carat_min);

  const FLAT_LABELS: Record<string, string> = {
    metal:     "Metal markup",
    labour:    "Labour & setting markup",
    lab_stone: "Lab stone markup (flat)",
    melee:     "Melee markup",
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "32px 24px", fontFamily: "Inter, system-ui, sans-serif", maxWidth: 840 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: "0 0 4px" }}>Pricing</h1>
      <p style={{ fontSize: 14, color: "#6B7280", margin: "0 0 24px" }}>
        Configure markup multipliers, birthstone prices, and personalisation fees.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid #E8E8F0", marginBottom: 24 }}>
        {(["quote_builder", "pricing_engine"] as ActiveTab[]).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: "8px 18px", background: "transparent", border: "none", cursor: "pointer",
            fontSize: 14, fontWeight: activeTab === t ? 700 : 400,
            color: activeTab === t ? PRIMARY : "#6B7280",
            borderBottom: activeTab === t ? `2px solid ${PRIMARY}` : "2px solid transparent",
            marginBottom: -2, fontFamily: "inherit",
          }}>
            {t === "quote_builder" ? "Quote Builder" : "Pricing Engine"}
          </button>
        ))}
      </div>

      {/* ── Quote Builder tab ──────────────────────────────────────────────── */}
      {activeTab === "quote_builder" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginBottom: 16 }}>
            {qbToast && (
              <span style={{ fontSize: 13, fontWeight: 600, color: qbToast.ok ? "#10B981" : "#EF4444" }}>
                {qbToast.msg}
              </span>
            )}
            <button onClick={saveQb} disabled={qbSaving} style={{
              background: qbSaving ? "#9CA3AF" : PRIMARY, color: "#fff", border: "none",
              borderRadius: 8, padding: "9px 20px", fontSize: 14, fontWeight: 600,
              cursor: qbSaving ? "not-allowed" : "pointer", fontFamily: "inherit",
            }}>
              {qbSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>

          {qbLoading ? (
            <div style={{ color: "#9CA3AF", fontSize: 14 }}>Loading…</div>
          ) : (
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
                    const row = rows.find(r => r.category === cat.key) ?? { category: cat.key, ...DEFAULTS[cat.key] };
                    return (
                      <tr key={cat.key}>
                        <td style={td}><span style={{ fontWeight: 500 }}>{cat.label}</span></td>
                        <td style={{ ...td, textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                            <input type="number" min="0" max="999" step="0.1" value={row.margin_percent ?? 0}
                              onChange={e => updateRow(cat.key, "margin_percent", e.target.value)}
                              style={{ ...inpFocus, width: 80, textAlign: "right" }} />
                            <span style={{ fontSize: 13, color: "#6B7280" }}>%</span>
                          </div>
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>
                          {cat.hasRate ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                              <span style={{ fontSize: 13, color: "#6B7280" }}>$</span>
                              <input type="number" min="0" step="0.5" value={row.hourly_rate ?? ""}
                                onChange={e => updateRow(cat.key, "hourly_rate", e.target.value)}
                                style={{ ...inpFocus, width: 80, textAlign: "right" }} />
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
          )}

          <div style={{ marginTop: 16, padding: "14px 16px", background: "#F0F0FF", border: "1px solid #C7C5F8", borderRadius: 10 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#4338CA", lineHeight: 1.6 }}>
              <strong>Metal margins</strong> are applied to each metal component (weight × spot price × margin).{" "}
              <strong>Labour rates</strong> are charged per hour and already include your margin.
              These settings apply to the <strong>quote builder</strong> only.
            </p>
          </div>
        </>
      )}

      {/* ── Pricing Engine tab ─────────────────────────────────────────────── */}
      {activeTab === "pricing_engine" && (
        <>
          {engLoading ? (
            <div style={{ color: "#9CA3AF", fontSize: 14 }}>Loading…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

              {/* Flat multipliers */}
              <div style={card}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #E8E8F0" }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Multipliers</h2>
                  <p style={{ fontSize: 13, color: "#6B7280", marginTop: 3, marginBottom: 0 }}>
                    Applied by <code>calculate_price()</code>. Each retail price = wholesale cost × multiplier.
                  </p>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Component</th>
                      <th style={{ ...th, textAlign: "center" }}>Multiplier</th>
                      <th style={{ ...th, width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatRules.map(rule => {
                      const isEditing = editingRule === rule.id;
                      return (
                        <tr key={rule.id}>
                          <td style={td}>
                            <span style={{ fontWeight: 500 }}>{FLAT_LABELS[rule.component_type] ?? rule.component_type}</span>
                          </td>
                          <td style={{ ...td, textAlign: "center" }}>
                            {isEditing ? (
                              <input
                                type="number" min="1" step="0.01"
                                value={ruleBuf.multiplier}
                                onChange={e => setRuleBuf(b => ({ ...b, multiplier: e.target.value }))}
                                style={{ ...inpFocus, width: 90, textAlign: "center" }}
                                autoFocus
                              />
                            ) : (
                              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                                {rule.multiplier.toFixed(2)}×
                              </span>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            {isEditing ? (
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                <SaveBtn onClick={() => saveRule(rule.id)} saving={ruleSaving} saved={ruleSaved === rule.id} />
                                <button onClick={() => setEditingRule(null)} style={{ padding: "4px 8px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>✕</button>
                              </div>
                            ) : (
                              <IconBtn onClick={() => { setEditingRule(rule.id); setRuleBuf({ multiplier: String(rule.multiplier), carat_min: "", carat_max: "" }); }} icon="✎" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Lab stone tiers */}
              <div style={card}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #E8E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Lab Stone Tiers</h2>
                    <p style={{ fontSize: 13, color: "#6B7280", marginTop: 3, marginBottom: 0 }}>
                      Tiered markup by carat weight. Ranges are {">"}= min and {"<"} max.
                    </p>
                  </div>
                  <button onClick={() => setShowAddLabTier(v => !v)} style={{
                    background: showAddLabTier ? "#F3F4F6" : PRIMARY, color: showAddLabTier ? "#6B7280" : "#fff",
                    border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                    {showAddLabTier ? "Cancel" : "+ Add Tier"}
                  </button>
                </div>

                {showAddLabTier && (
                  <div style={{ padding: "14px 20px", background: "#F9FAFB", borderBottom: "1px solid #E8E8F0", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Min ct (incl.)</label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={newLabTier.carat_min}
                        onChange={e => setNewLabTier(t => ({ ...t, carat_min: e.target.value }))}
                        style={{ ...inp, width: 90 }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Max ct (excl.) — blank = no limit</label>
                      <input type="number" min="0" step="0.01" placeholder="none" value={newLabTier.carat_max}
                        onChange={e => setNewLabTier(t => ({ ...t, carat_max: e.target.value }))}
                        style={{ ...inp, width: 90 }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Multiplier</label>
                      <input type="number" min="1" step="0.01" placeholder="10.50" value={newLabTier.multiplier}
                        onChange={e => setNewLabTier(t => ({ ...t, multiplier: e.target.value }))}
                        style={{ ...inp, width: 90 }} />
                    </div>
                    <button onClick={addLabTier} disabled={addLabTierSaving} style={{
                      background: PRIMARY, color: "#fff", border: "none", borderRadius: 8,
                      padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}>
                      {addLabTierSaving ? "Adding…" : "Add"}
                    </button>
                  </div>
                )}

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Carat range</th>
                      <th style={{ ...th, textAlign: "center" }}>Multiplier</th>
                      <th style={{ ...th, width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {labTiers.length === 0 && (
                      <tr><td colSpan={3} style={{ ...td, color: "#9CA3AF", textAlign: "center" }}>No tiers configured.</td></tr>
                    )}
                    {labTiers.map(tier => {
                      const isEditing = editingRule === tier.id;
                      const rangeLabel = tier.carat_max != null
                        ? `${tier.carat_min}ct – ${tier.carat_max}ct`
                        : `${tier.carat_min}ct+`;
                      return (
                        <tr key={tier.id}>
                          <td style={td}>
                            {isEditing ? (
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
                                <input type="number" min="0" step="0.01" placeholder="min" value={ruleBuf.carat_min}
                                  onChange={e => setRuleBuf(b => ({ ...b, carat_min: e.target.value }))}
                                  style={{ ...inpFocus, width: 70 }} />
                                <span style={{ color: "#9CA3AF" }}>–</span>
                                <input type="number" min="0" step="0.01" placeholder="max" value={ruleBuf.carat_max}
                                  onChange={e => setRuleBuf(b => ({ ...b, carat_max: e.target.value }))}
                                  style={{ ...inpFocus, width: 70 }} />
                                <span style={{ fontSize: 12, color: "#9CA3AF" }}>ct (blank = ∞)</span>
                              </div>
                            ) : (
                              <span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{rangeLabel}</span>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: "center" }}>
                            {isEditing ? (
                              <input type="number" min="1" step="0.01"
                                value={ruleBuf.multiplier}
                                onChange={e => setRuleBuf(b => ({ ...b, multiplier: e.target.value }))}
                                style={{ ...inpFocus, width: 80, textAlign: "center" }}
                              />
                            ) : (
                              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{tier.multiplier.toFixed(2)}×</span>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            {isEditing ? (
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                <SaveBtn onClick={() => saveRule(tier.id)} saving={ruleSaving} saved={ruleSaved === tier.id} />
                                <button onClick={() => setEditingRule(null)} style={{ padding: "4px 8px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>✕</button>
                              </div>
                            ) : (
                              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <IconBtn onClick={() => { setEditingRule(tier.id); setRuleBuf({ multiplier: String(tier.multiplier), carat_min: String(tier.carat_min), carat_max: tier.carat_max != null ? String(tier.carat_max) : "" }); }} icon="✎" />
                                <IconBtn onClick={() => deleteRule(tier.id)} icon="✕" danger />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Natural stone tiers */}
              <div style={card}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #E8E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Natural Stone Tiers</h2>
                    <p style={{ fontSize: 13, color: "#6B7280", marginTop: 3, marginBottom: 0 }}>
                      Tiered markup by carat weight. Ranges are {">"}= min and {"<"} max.
                    </p>
                  </div>
                  <button onClick={() => setShowAddTier(v => !v)} style={{
                    background: showAddTier ? "#F3F4F6" : PRIMARY, color: showAddTier ? "#6B7280" : "#fff",
                    border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                    {showAddTier ? "Cancel" : "+ Add Tier"}
                  </button>
                </div>

                {showAddTier && (
                  <div style={{ padding: "14px 20px", background: "#F9FAFB", borderBottom: "1px solid #E8E8F0", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Min ct (incl.)</label>
                      <input type="number" min="0" step="0.01" placeholder="0.00" value={newTier.carat_min}
                        onChange={e => setNewTier(t => ({ ...t, carat_min: e.target.value }))}
                        style={{ ...inp, width: 90 }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Max ct (excl.) — blank = no limit</label>
                      <input type="number" min="0" step="0.01" placeholder="none" value={newTier.carat_max}
                        onChange={e => setNewTier(t => ({ ...t, carat_max: e.target.value }))}
                        style={{ ...inp, width: 90 }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Multiplier</label>
                      <input type="number" min="1" step="0.01" placeholder="2.50" value={newTier.multiplier}
                        onChange={e => setNewTier(t => ({ ...t, multiplier: e.target.value }))}
                        style={{ ...inp, width: 90 }} />
                    </div>
                    <button onClick={addNaturalTier} disabled={addTierSaving} style={{
                      background: PRIMARY, color: "#fff", border: "none", borderRadius: 8,
                      padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}>
                      {addTierSaving ? "Adding…" : "Add"}
                    </button>
                  </div>
                )}

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Carat range</th>
                      <th style={{ ...th, textAlign: "center" }}>Multiplier</th>
                      <th style={{ ...th, width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {stoneTiers.length === 0 && (
                      <tr><td colSpan={3} style={{ ...td, color: "#9CA3AF", textAlign: "center" }}>No tiers configured.</td></tr>
                    )}
                    {stoneTiers.map(tier => {
                      const isEditing = editingRule === tier.id;
                      const rangeLabel = tier.carat_max != null
                        ? `${tier.carat_min}ct – ${tier.carat_max}ct`
                        : `${tier.carat_min}ct+`;
                      return (
                        <tr key={tier.id}>
                          <td style={td}>
                            {isEditing ? (
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const }}>
                                <input type="number" min="0" step="0.01" placeholder="min" value={ruleBuf.carat_min}
                                  onChange={e => setRuleBuf(b => ({ ...b, carat_min: e.target.value }))}
                                  style={{ ...inpFocus, width: 70 }} />
                                <span style={{ color: "#9CA3AF" }}>–</span>
                                <input type="number" min="0" step="0.01" placeholder="max" value={ruleBuf.carat_max}
                                  onChange={e => setRuleBuf(b => ({ ...b, carat_max: e.target.value }))}
                                  style={{ ...inpFocus, width: 70 }} />
                                <span style={{ fontSize: 12, color: "#9CA3AF" }}>ct (blank = ∞)</span>
                              </div>
                            ) : (
                              <span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{rangeLabel}</span>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: "center" }}>
                            {isEditing ? (
                              <input type="number" min="1" step="0.01"
                                value={ruleBuf.multiplier}
                                onChange={e => setRuleBuf(b => ({ ...b, multiplier: e.target.value }))}
                                style={{ ...inpFocus, width: 80, textAlign: "center" }}
                              />
                            ) : (
                              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{tier.multiplier.toFixed(2)}×</span>
                            )}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            {isEditing ? (
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                <SaveBtn onClick={() => saveRule(tier.id)} saving={ruleSaving} saved={ruleSaved === tier.id} />
                                <button onClick={() => setEditingRule(null)} style={{ padding: "4px 8px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>✕</button>
                              </div>
                            ) : (
                              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <IconBtn onClick={() => { setEditingRule(tier.id); setRuleBuf({ multiplier: String(tier.multiplier), carat_min: String(tier.carat_min), carat_max: tier.carat_max != null ? String(tier.carat_max) : "" }); }} icon="✎" />
                                <IconBtn onClick={() => deleteRule(tier.id)} icon="✕" danger />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Birthstones */}
              <div style={card}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #E8E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Birthstone Prices</h2>
                    <p style={{ fontSize: 13, color: "#6B7280", marginTop: 3, marginBottom: 0 }}>
                      Retail price per stone (passed through to quotes, no additional markup applied).
                    </p>
                  </div>
                  <button onClick={() => setShowAddBs(v => !v)} style={{
                    background: showAddBs ? "#F3F4F6" : PRIMARY, color: showAddBs ? "#6B7280" : "#fff",
                    border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                    {showAddBs ? "Cancel" : "+ Add"}
                  </button>
                </div>

                {showAddBs && (
                  <div style={{ padding: "14px 20px", background: "#F9FAFB", borderBottom: "1px solid #E8E8F0", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Month</label>
                      <select value={newBs.month_number} onChange={e => setNewBs(b => ({ ...b, month_number: e.target.value }))}
                        style={{ ...inp, width: 130 }}>
                        {MONTHS.map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Stone name</label>
                      <input type="text" placeholder="e.g. Garnet" value={newBs.stone_name}
                        onChange={e => setNewBs(b => ({ ...b, stone_name: e.target.value }))}
                        style={{ ...inp, width: 120 }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Price/stone ($)</label>
                      <input type="number" min="0" step="0.01" placeholder="45.00" value={newBs.price_per_stone}
                        onChange={e => setNewBs(b => ({ ...b, price_per_stone: e.target.value }))}
                        style={{ ...inp, width: 90 }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Fitting fee ($)</label>
                      <input type="number" min="0" step="0.01" placeholder="25.00" value={newBs.fitting_fee}
                        onChange={e => setNewBs(b => ({ ...b, fitting_fee: e.target.value }))}
                        style={{ ...inp, width: 90 }} />
                    </div>
                    <button onClick={addBs} disabled={addBsSaving} style={{
                      background: PRIMARY, color: "#fff", border: "none", borderRadius: 8,
                      padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}>
                      {addBsSaving ? "Adding…" : "Add"}
                    </button>
                  </div>
                )}

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Month</th>
                      <th style={th}>Stone</th>
                      <th style={{ ...th, textAlign: "right" }}>Price/stone</th>
                      <th style={{ ...th, textAlign: "right" }}>Fitting fee</th>
                      <th style={{ ...th, width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {birthstones.length === 0 && (
                      <tr><td colSpan={5} style={{ ...td, color: "#9CA3AF", textAlign: "center" }}>No birthstones configured.</td></tr>
                    )}
                    {birthstones.map(bs => {
                      const isEditing = editingBs === bs.id;
                      return (
                        <tr key={bs.id}>
                          <td style={td}><span style={{ fontWeight: 500 }}>{MONTHS[bs.month_number - 1]}</span></td>
                          <td style={td}>
                            {isEditing
                              ? <input type="text" value={bsBuf.stone_name} onChange={e => setBsBuf(b => ({ ...b, stone_name: e.target.value }))} style={{ ...inpFocus, width: 120 }} autoFocus />
                              : bs.stone_name}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            {isEditing
                              ? <input type="number" min="0" step="0.01" value={bsBuf.price_per_stone} onChange={e => setBsBuf(b => ({ ...b, price_per_stone: e.target.value }))} style={{ ...inpFocus, width: 90, textAlign: "right" }} />
                              : <span style={{ fontVariantNumeric: "tabular-nums" }}>${Number(bs.price_per_stone).toFixed(2)}</span>}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            {isEditing
                              ? <input type="number" min="0" step="0.01" value={bsBuf.fitting_fee} onChange={e => setBsBuf(b => ({ ...b, fitting_fee: e.target.value }))} style={{ ...inpFocus, width: 90, textAlign: "right" }} />
                              : <span style={{ fontVariantNumeric: "tabular-nums" }}>${Number(bs.fitting_fee).toFixed(2)}</span>}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            {isEditing ? (
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                <SaveBtn onClick={() => saveBs(bs.id)} saving={bsSaving} />
                                <button onClick={() => setEditingBs(null)} style={{ padding: "4px 8px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>✕</button>
                              </div>
                            ) : (
                              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <IconBtn onClick={() => { setEditingBs(bs.id); setBsBuf({ stone_name: bs.stone_name, price_per_stone: String(bs.price_per_stone), fitting_fee: String(bs.fitting_fee) }); }} icon="✎" />
                                <IconBtn onClick={() => deleteBs(bs.id)} icon="✕" danger />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Personalisation fees */}
              <div style={card}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #E8E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Personalisation Fees</h2>
                    <p style={{ fontSize: 13, color: "#6B7280", marginTop: 3, marginBottom: 0 }}>
                      Fixed fees added to the total retail price (engraving, custom design, rush, etc.).
                    </p>
                  </div>
                  <button onClick={() => setShowAddFee(v => !v)} style={{
                    background: showAddFee ? "#F3F4F6" : PRIMARY, color: showAddFee ? "#6B7280" : "#fff",
                    border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>
                    {showAddFee ? "Cancel" : "+ Add"}
                  </button>
                </div>

                {showAddFee && (
                  <div style={{ padding: "14px 20px", background: "#F9FAFB", borderBottom: "1px solid #E8E8F0", display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Fee type (ID)</label>
                      <input type="text" placeholder="e.g. engraving" value={newFee.fee_type}
                        onChange={e => setNewFee(f => ({ ...f, fee_type: e.target.value }))}
                        style={{ ...inp, width: 140 }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Description</label>
                      <input type="text" placeholder="Shown on quote line" value={newFee.description}
                        onChange={e => setNewFee(f => ({ ...f, description: e.target.value }))}
                        style={{ ...inp, width: 200 }} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6B7280", marginBottom: 4 }}>Amount ($)</label>
                      <input type="number" min="0" step="0.01" placeholder="45.00" value={newFee.amount}
                        onChange={e => setNewFee(f => ({ ...f, amount: e.target.value }))}
                        style={{ ...inp, width: 90 }} />
                    </div>
                    <button onClick={addFee} disabled={addFeeSaving} style={{
                      background: PRIMARY, color: "#fff", border: "none", borderRadius: 8,
                      padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}>
                      {addFeeSaving ? "Adding…" : "Add"}
                    </button>
                  </div>
                )}

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Type</th>
                      <th style={th}>Description</th>
                      <th style={{ ...th, textAlign: "right" }}>Amount</th>
                      <th style={{ ...th, width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.length === 0 && (
                      <tr><td colSpan={4} style={{ ...td, color: "#9CA3AF", textAlign: "center" }}>No personalisation fees configured.</td></tr>
                    )}
                    {fees.map(fee => {
                      const isEditing = editingFee === fee.id;
                      return (
                        <tr key={fee.id}>
                          <td style={td}><code style={{ fontSize: 12, background: "#F3F4F6", padding: "2px 6px", borderRadius: 4 }}>{fee.fee_type}</code></td>
                          <td style={td}>
                            {isEditing
                              ? <input type="text" value={feeBuf.description} onChange={e => setFeeBuf(b => ({ ...b, description: e.target.value }))} style={{ ...inpFocus, width: 200 }} autoFocus />
                              : fee.description ?? <span style={{ color: "#9CA3AF" }}>—</span>}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            {isEditing
                              ? <input type="number" min="0" step="0.01" value={feeBuf.amount} onChange={e => setFeeBuf(b => ({ ...b, amount: e.target.value }))} style={{ ...inpFocus, width: 90, textAlign: "right" }} />
                              : <span style={{ fontVariantNumeric: "tabular-nums" }}>${Number(fee.amount).toFixed(2)}</span>}
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            {isEditing ? (
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                <SaveBtn onClick={() => saveFee(fee.id)} saving={feeSaving} />
                                <button onClick={() => setEditingFee(null)} style={{ padding: "4px 8px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>✕</button>
                              </div>
                            ) : (
                              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <IconBtn onClick={() => { setEditingFee(fee.id); setFeeBuf({ description: fee.description ?? "", amount: String(fee.amount) }); }} icon="✎" />
                                <IconBtn onClick={() => deleteFee(fee.id)} icon="✕" danger />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: "14px 16px", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 10 }}>
                <p style={{ margin: 0, fontSize: 13, color: "#92400E", lineHeight: 1.6 }}>
                  <strong>Changes take effect immediately.</strong> Multiplier changes affect all new price calculations via <code>calculate_price()</code>.
                  Existing accepted quotes are not retroactively updated.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
