"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";

interface VipTier {
  id: string;
  tier_name: string;
  tier_order: number;
  min_spend: number;
  min_orders: number;
  colour: string;
  discount_percent: number;
  eligible_ownership_only: boolean;
  manual_only: boolean;
}

interface EditState {
  tier_name: string;
  tier_order: number;
  min_spend: string;
  min_orders: string;
  colour: string;
  discount_percent: string;
  eligible_ownership_only: boolean;
}

const CARD: React.CSSProperties = { background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 24 };
const INPUT: React.CSSProperties = { border: "1px solid #E8E8F0", borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "#1A1A2E", outline: "none", background: "#fff", width: "100%" };
const BTN: React.CSSProperties = { background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const BTN_GHOST: React.CSSProperties = { background: "transparent", color: "#EF4444", border: "1px solid #FEE2E2", borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer" };
const BTN_OUTLINE: React.CSSProperties = { background: "transparent", color: "#635BFF", border: "1px solid #635BFF", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const SEC: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" };

function initEdit(t: VipTier): EditState {
  return {
    tier_name: t.tier_name,
    tier_order: t.tier_order,
    min_spend: String(t.min_spend),
    min_orders: String(t.min_orders),
    colour: t.colour,
    discount_percent: String(t.discount_percent ?? 0),
    eligible_ownership_only: t.eligible_ownership_only ?? false,
  };
}

export default function VipTiersPage() {
  const { user } = useUser();
  const [tiers, setTiers] = useState<VipTier[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [addingSpend, setAddingSpend] = useState(false);
  const [addingManual, setAddingManual] = useState(false);
  const [loading, setLoading] = useState(true);

  const headers = { "x-tenant-id": user?.tenantId ?? "" };

  useEffect(() => {
    fetch("/api/vip-tiers", { headers })
      .then(r => r.json())
      .then(json => {
        const loaded: VipTier[] = json.tiers ?? [];
        setTiers(loaded);
        const initEdits: Record<string, EditState> = {};
        for (const t of loaded) initEdits[t.id] = initEdit(t);
        setEdits(initEdits);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(id: string, field: keyof EditState, value: string | number | boolean) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveTier(id: string) {
    const e = edits[id];
    if (!e) return;
    setSaving(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch("/api/vip-tiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          id,
          tier_name: e.tier_name,
          tier_order: Number(e.tier_order),
          min_spend: Number(e.min_spend),
          min_orders: Number(e.min_orders),
          colour: e.colour,
          discount_percent: Number(e.discount_percent),
          eligible_ownership_only: e.eligible_ownership_only,
        }),
      });
      const json = await res.json();
      if (json.tier) setTiers(prev => prev.map(t => t.id === id ? json.tier : t));
    } catch { /* noop */ } finally {
      setSaving(prev => ({ ...prev, [id]: false }));
    }
  }

  async function deleteTier(id: string) {
    if (!confirm("Delete this tier?")) return;
    setDeleting(prev => ({ ...prev, [id]: true }));
    try {
      await fetch("/api/vip-tiers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ id }),
      });
      setTiers(prev => prev.filter(t => t.id !== id));
      setEdits(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch { /* noop */ } finally {
      setDeleting(prev => ({ ...prev, [id]: false }));
    }
  }

  async function addTier(manualOnly: boolean) {
    if (manualOnly) setAddingManual(true); else setAddingSpend(true);
    try {
      const existing = tiers.filter(t => t.manual_only === manualOnly);
      const maxOrder = existing.reduce((m, t) => Math.max(m, t.tier_order), manualOnly ? 99 : 0);
      const res = await fetch("/api/vip-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          tier_name: "New Tier",
          tier_order: maxOrder + 1,
          min_spend: manualOnly ? 999999999 : 0,
          min_orders: manualOnly ? 999999 : 0,
          colour: manualOnly ? "#9333EA" : "#9CA3AF",
          discount_percent: 0,
          eligible_ownership_only: false,
          manual_only: manualOnly,
        }),
      });
      const json = await res.json();
      if (json.tier) {
        setTiers(prev => [...prev, json.tier]);
        setEdits(prev => ({ ...prev, [json.tier.id]: initEdit(json.tier) }));
      }
    } catch { /* noop */ } finally {
      if (manualOnly) setAddingManual(false); else setAddingSpend(false);
    }
  }

  const spendTiers = [...tiers].filter(t => !t.manual_only).sort((a, b) => a.tier_order - b.tier_order);
  const manualTiers = [...tiers].filter(t => t.manual_only).sort((a, b) => a.tier_order - b.tier_order);

  function SpendTierRow({ t }: { t: VipTier }) {
    const e = edits[t.id];
    if (!e) return null;
    const isSaving = saving[t.id];
    const isDeleting = deleting[t.id];
    return (
      <tr style={{ borderBottom: "1px solid #F0F0F5" }}>
        <td style={{ padding: "10px 10px", width: 60 }}>
          <input type="number" value={e.tier_order} onChange={ev => setField(t.id, "tier_order", Number(ev.target.value))}
            style={{ ...INPUT, width: 52, textAlign: "center" }} />
        </td>
        <td style={{ padding: "10px 10px", minWidth: 120 }}>
          <input type="text" value={e.tier_name} onChange={ev => setField(t.id, "tier_name", ev.target.value)} style={INPUT} />
        </td>
        <td style={{ padding: "10px 10px", width: 90 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="color" value={e.colour} onChange={ev => setField(t.id, "colour", ev.target.value)}
              style={{ width: 32, height: 28, border: "1px solid #E8E8F0", borderRadius: 6, cursor: "pointer", padding: 2, background: "#fff" }} />
            <span style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "monospace" }}>{e.colour}</span>
          </div>
        </td>
        <td style={{ padding: "10px 10px", width: 120 }}>
          <input type="number" value={e.min_spend} onChange={ev => setField(t.id, "min_spend", ev.target.value)}
            style={INPUT} min={0} step={500} />
        </td>
        <td style={{ padding: "10px 10px", width: 100 }}>
          <input type="number" value={e.min_orders} onChange={ev => setField(t.id, "min_orders", ev.target.value)}
            style={INPUT} min={0} />
        </td>
        <td style={{ padding: "10px 10px", width: 80 }}>
          <input type="number" value={e.discount_percent} onChange={ev => setField(t.id, "discount_percent", ev.target.value)}
            style={INPUT} min={0} max={100} step={1} />
        </td>
        <td style={{ padding: "10px 10px", width: 80, textAlign: "center" }}>
          <input type="checkbox" checked={e.eligible_ownership_only}
            onChange={ev => setField(t.id, "eligible_ownership_only", ev.target.checked)} />
        </td>
        <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${e.colour}22`, color: e.colour, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {e.tier_name || "—"}
            </span>
            <button onClick={() => saveTier(t.id)} disabled={isSaving}
              style={{ ...BTN, padding: "5px 12px", fontSize: 12, opacity: isSaving ? 0.6 : 1 }}>
              {isSaving ? "…" : "Save"}
            </button>
            <button onClick={() => deleteTier(t.id)} disabled={isDeleting}
              style={{ ...BTN_GHOST, opacity: isDeleting ? 0.5 : 1 }}>
              {isDeleting ? "…" : "Delete"}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  function ManualTierRow({ t }: { t: VipTier }) {
    const e = edits[t.id];
    if (!e) return null;
    const isSaving = saving[t.id];
    const isDeleting = deleting[t.id];
    return (
      <tr style={{ borderBottom: "1px solid #F0F0F5" }}>
        <td style={{ padding: "10px 10px", minWidth: 120 }}>
          <input type="text" value={e.tier_name} onChange={ev => setField(t.id, "tier_name", ev.target.value)} style={INPUT} />
        </td>
        <td style={{ padding: "10px 10px", width: 90 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="color" value={e.colour} onChange={ev => setField(t.id, "colour", ev.target.value)}
              style={{ width: 32, height: 28, border: "1px solid #E8E8F0", borderRadius: 6, cursor: "pointer", padding: 2, background: "#fff" }} />
            <span style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "monospace" }}>{e.colour}</span>
          </div>
        </td>
        <td style={{ padding: "10px 10px", width: 80 }}>
          <input type="number" value={e.discount_percent} onChange={ev => setField(t.id, "discount_percent", ev.target.value)}
            style={INPUT} min={0} max={100} step={1} />
        </td>
        <td style={{ padding: "10px 10px", width: 80, textAlign: "center" }}>
          <input type="checkbox" checked={e.eligible_ownership_only}
            onChange={ev => setField(t.id, "eligible_ownership_only", ev.target.checked)} />
        </td>
        <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${e.colour}22`, color: e.colour, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {e.tier_name || "—"}
            </span>
            <button onClick={() => saveTier(t.id)} disabled={isSaving}
              style={{ ...BTN, padding: "5px 12px", fontSize: 12, opacity: isSaving ? 0.6 : 1 }}>
              {isSaving ? "…" : "Save"}
            </button>
            <button onClick={() => deleteTier(t.id)} disabled={isDeleting}
              style={{ ...BTN_GHOST, opacity: isDeleting ? 0.5 : 1 }}>
              {isDeleting ? "…" : "Delete"}
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Link href="/settings" style={{ fontSize: 13, color: "#9CA3AF", textDecoration: "none" }}>← Settings</Link>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>VIP Tier Configuration</h1>
        <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
          Configure automatic spend-based tiers and manual override tiers. Discount % is applied automatically in repair quotes.
        </p>
      </div>

      {/* Example defaults */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Example defaults
        </p>
        <div style={{ ...CARD, padding: 0, opacity: 0.4, pointerEvents: "none", overflow: "hidden" }}>
          <div className="overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #E8E8F0" }}>
                  {["Order", "Tier Name", "Colour", "Min Spend ($)", "Min Orders", "Discount %", "Owned Only", "Preview"].map(h => (
                    <th key={h} style={{ ...SEC, padding: "0 10px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { order: 1, name: "Silver",   colour: "#9CA3AF", spend: "5,000",  orders: 3,  discount: 0  },
                  { order: 2, name: "Gold",     colour: "#F59E0B", spend: "10,000", orders: 6,  discount: 5  },
                  { order: 3, name: "Platinum", colour: "#6366F1", spend: "15,000", orders: 10, discount: 10 },
                  { order: 4, name: "Diamond",  colour: "#06B6D4", spend: "20,000", orders: 15, discount: 15 },
                  { order: 5, name: "Argyle",   colour: "#F43F5E", spend: "30,000", orders: 20, discount: 20 },
                ].map(row => (
                  <tr key={row.name} style={{ borderBottom: "1px solid #F0F0F5" }}>
                    <td style={{ padding: "8px 10px", width: 60 }}><div style={{ ...INPUT, width: 40, textAlign: "center", display: "inline-block" }}>{row.order}</div></td>
                    <td style={{ padding: "8px 10px", minWidth: 100 }}><div style={INPUT}>{row.name}</div></td>
                    <td style={{ padding: "8px 10px", width: 90 }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 32, height: 28, border: "1px solid #E8E8F0", borderRadius: 6, background: row.colour }} /><span style={{ fontSize: 10, color: "#9CA3AF", fontFamily: "monospace" }}>{row.colour}</span></div></td>
                    <td style={{ padding: "8px 10px", width: 120 }}><div style={INPUT}>${row.spend}</div></td>
                    <td style={{ padding: "8px 10px", width: 100 }}><div style={INPUT}>{row.orders}</div></td>
                    <td style={{ padding: "8px 10px", width: 80 }}><div style={INPUT}>{row.discount}%</div></td>
                    <td style={{ padding: "8px 10px", width: 80, textAlign: "center" }}><input type="checkbox" disabled /></td>
                    <td style={{ padding: "8px 10px" }}><span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${row.colour}22`, color: row.colour, letterSpacing: "0.05em", textTransform: "uppercase" }}>{row.name}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Spend-Based Tiers ──────────────────────────────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E" }}>Spend-Based Tiers</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Assigned automatically when a customer meets the spend or order threshold.</div>
          </div>
          <button onClick={() => addTier(false)} disabled={addingSpend} style={{ ...BTN, opacity: addingSpend ? 0.6 : 1 }}>
            {addingSpend ? "Adding…" : "+ Add Spend Tier"}
          </button>
        </div>
        <div style={CARD}>
          {loading ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading…</div>
          ) : spendTiers.length === 0 ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>No spend-based tiers yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #E8E8F0" }}>
                    {["Order", "Tier Name", "Colour", "Min Spend ($)", "Min Orders", "Discount %", "Owned Only", ""].map(h => (
                      <th key={h} style={{ ...SEC, padding: "0 10px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spendTiers.map(t => <SpendTierRow key={t.id} t={t} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Manual Override Tiers ──────────────────────────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E" }}>Manual Override Tiers</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Assigned only via manager override in a repair quote (e.g. Trade, Staff, Wholesale). Never auto-applied by spend.</div>
          </div>
          <button onClick={() => addTier(true)} disabled={addingManual} style={{ ...BTN_OUTLINE, opacity: addingManual ? 0.6 : 1 }}>
            {addingManual ? "Adding…" : "+ Add Manual Tier"}
          </button>
        </div>
        <div style={CARD}>
          {loading ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading…</div>
          ) : manualTiers.length === 0 ? (
            <div style={{ padding: "30px 0", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>No manual tiers yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #E8E8F0" }}>
                    {["Tier Name", "Colour", "Discount %", "Owned Only", ""].map(h => (
                      <th key={h} style={{ ...SEC, padding: "0 10px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {manualTiers.map(t => <ManualTierRow key={t.id} t={t} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Help text */}
      <div style={{ ...CARD, background: "#F9FAFB", padding: "14px 20px" }}>
        <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: "#1A1A2E" }}>How tiers work:</strong> A customer is assigned the highest-order <em>spend-based</em> tier where their lifetime spend (excluding repairs) meets the minimum spend <strong>OR</strong> their non-repair order count meets the minimum orders threshold. A <em>manual override</em> tier set by a manager takes precedence over the computed tier. Discount % is applied automatically when a repair quote is built for a customer with an active tier.
        </p>
      </div>
    </div>
  );
}
