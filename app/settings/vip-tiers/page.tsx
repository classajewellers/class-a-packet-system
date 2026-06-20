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
}

interface EditState {
  tier_name: string;
  tier_order: number;
  min_spend: string;
  min_orders: string;
  colour: string;
}

const CARD: React.CSSProperties = { background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 24 };
const INPUT: React.CSSProperties = { border: "1px solid #E8E8F0", borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "#1A1A2E", outline: "none", background: "#fff", width: "100%" };
const BTN: React.CSSProperties = { background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const BTN_GHOST: React.CSSProperties = { background: "transparent", color: "#EF4444", border: "1px solid #FEE2E2", borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer" };
const SEC: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" };

export default function VipTiersPage() {
  const { user } = useUser();
  const [tiers, setTiers] = useState<VipTier[]>([]);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const headers = { "x-tenant-id": user?.tenantId ?? "" };

  useEffect(() => {
    fetch("/api/vip-tiers", { headers })
      .then(r => r.json())
      .then(json => {
        const loaded: VipTier[] = json.tiers ?? [];
        setTiers(loaded);
        const initEdits: Record<string, EditState> = {};
        for (const t of loaded) {
          initEdits[t.id] = {
            tier_name: t.tier_name,
            tier_order: t.tier_order,
            min_spend: String(t.min_spend),
            min_orders: String(t.min_orders),
            colour: t.colour,
          };
        }
        setEdits(initEdits);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setField(id: string, field: keyof EditState, value: string | number) {
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
        }),
      });
      const json = await res.json();
      if (json.tier) {
        setTiers(prev => prev.map(t => t.id === id ? json.tier : t));
      }
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

  async function addTier() {
    setAdding(true);
    try {
      const maxOrder = tiers.reduce((m, t) => Math.max(m, t.tier_order), 0);
      const res = await fetch("/api/vip-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ tier_name: "New Tier", tier_order: maxOrder + 1, min_spend: 0, min_orders: 0, colour: "#9CA3AF" }),
      });
      const json = await res.json();
      if (json.tier) {
        setTiers(prev => [...prev, json.tier]);
        setEdits(prev => ({
          ...prev,
          [json.tier.id]: {
            tier_name: json.tier.tier_name,
            tier_order: json.tier.tier_order,
            min_spend: String(json.tier.min_spend),
            min_orders: String(json.tier.min_orders),
            colour: json.tier.colour,
          },
        }));
      }
    } catch { /* noop */ } finally {
      setAdding(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Link href="/settings" style={{ fontSize: 13, color: "#9CA3AF", textDecoration: "none" }}>← Settings</Link>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>VIP Tier Configuration</h1>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            Define spend and order thresholds for automatic tier assignment. Tiers are evaluated highest-order first.
          </p>
        </div>
        <button onClick={addTier} disabled={adding} style={{ ...BTN, opacity: adding ? 0.6 : 1 }}>
          {adding ? "Adding…" : "+ Add Tier"}
        </button>
      </div>

      {/* Tiers table */}
      <div style={CARD}>
        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading…</div>
        ) : tiers.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
            No tiers configured. Click &quot;+ Add Tier&quot; to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #E8E8F0" }}>
                  {["Order", "Tier Name", "Colour", "Min Spend ($)", "Min Orders", ""].map(h => (
                    <th key={h} style={{ ...SEC, padding: "0 12px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...tiers].sort((a, b) => a.tier_order - b.tier_order).map(t => {
                  const e = edits[t.id];
                  if (!e) return null;
                  const isSaving = saving[t.id];
                  const isDeleting = deleting[t.id];
                  return (
                    <tr key={t.id} style={{ borderBottom: "1px solid #F0F0F5" }}>
                      {/* Order */}
                      <td style={{ padding: "10px 12px", width: 60 }}>
                        <input
                          type="number"
                          value={e.tier_order}
                          onChange={ev => setField(t.id, "tier_order", Number(ev.target.value))}
                          style={{ ...INPUT, width: 52, textAlign: "center" }}
                        />
                      </td>
                      {/* Name */}
                      <td style={{ padding: "10px 12px", minWidth: 120 }}>
                        <input
                          type="text"
                          value={e.tier_name}
                          onChange={ev => setField(t.id, "tier_name", ev.target.value)}
                          style={INPUT}
                        />
                      </td>
                      {/* Colour */}
                      <td style={{ padding: "10px 12px", width: 100 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="color"
                            value={e.colour}
                            onChange={ev => setField(t.id, "colour", ev.target.value)}
                            style={{ width: 36, height: 30, border: "1px solid #E8E8F0", borderRadius: 6, cursor: "pointer", padding: 2, background: "#fff" }}
                          />
                          <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "monospace" }}>{e.colour}</span>
                        </div>
                      </td>
                      {/* Min spend */}
                      <td style={{ padding: "10px 12px", width: 130 }}>
                        <input
                          type="number"
                          value={e.min_spend}
                          onChange={ev => setField(t.id, "min_spend", ev.target.value)}
                          style={INPUT}
                          min={0}
                          step={500}
                        />
                      </td>
                      {/* Min orders */}
                      <td style={{ padding: "10px 12px", width: 110 }}>
                        <input
                          type="number"
                          value={e.min_orders}
                          onChange={ev => setField(t.id, "min_orders", ev.target.value)}
                          style={INPUT}
                          min={0}
                        />
                      </td>
                      {/* Actions */}
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          {/* Preview badge */}
                          <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${e.colour}22`, color: e.colour, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                            {e.tier_name || "—"}
                          </span>
                          <button
                            onClick={() => saveTier(t.id)}
                            disabled={isSaving}
                            style={{ ...BTN, padding: "6px 14px", fontSize: 12, opacity: isSaving ? 0.6 : 1 }}
                          >
                            {isSaving ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => deleteTier(t.id)}
                            disabled={isDeleting}
                            style={{ ...BTN_GHOST, opacity: isDeleting ? 0.5 : 1 }}
                          >
                            {isDeleting ? "…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Help text */}
      <div style={{ ...CARD, background: "#F9FAFB", padding: "14px 20px" }}>
        <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.7, margin: 0 }}>
          <strong style={{ color: "#1A1A2E" }}>How tiers work:</strong> A customer is assigned the highest-order tier where their lifetime spend (excluding repairs) meets the minimum spend <em>OR</em> their total non-repair order count meets the minimum orders threshold. Tiers are evaluated from highest to lowest order.
        </p>
      </div>
    </div>
  );
}
