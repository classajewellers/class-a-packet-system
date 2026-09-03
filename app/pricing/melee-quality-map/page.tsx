"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

interface Combo {
  colour_group: string;
  clarity: string;
  count: number;
  mapped_quality: string | null;
}
interface Group {
  origin: "lab" | "natural";
  supplier_id: string | null;
  supplier_name: string;
  supplier_missing: boolean;
  available_qualities: string[];
  combos: Combo[];
}

export default function MeleeQualityMapPage() {
  const { user } = useUser();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const key = (s: string, c: string, cl: string) => `${s}|${c}|${cl}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pricing/melee-quality-map");
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); setGroups([]); }
      else { setGroups(json.groups ?? []); setError(null); }
    } catch { setError("Network error"); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(g: Group, c: Combo) {
    if (!g.supplier_id) return;
    const k = key(g.supplier_id, c.colour_group, c.clarity);
    const quality = drafts[k] ?? c.mapped_quality ?? "";
    if (!quality) { setError("Pick a quality string to confirm this mapping"); return; }
    setSavingKey(k); setError(null);
    try {
      const res = await fetch("/api/pricing/melee-quality-map", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: g.supplier_id, colour_group: c.colour_group, clarity: c.clarity, quality }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Save failed");
      else await load();
    } catch { setError("Network error"); }
    setSavingKey(null);
  }

  if (!user) return null;
  if (!canManage(user.role)) return <div style={{ padding: 32, color: "#6B7280" }}>Managers only.</div>;

  const th: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #E5E7EB" };
  const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#111827", borderBottom: "1px solid #F3F4F6", verticalAlign: "middle" };

  return (
    <div style={{ maxWidth: 900, margin: "32px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>Melee Quality Mapping</h1>
      <p style={{ color: "#6B7280", fontSize: 14, margin: "0 0 24px" }}>
        Confirm which price-list <strong>quality</strong> string each piece colour-group / clarity corresponds to,
        per supplier. Mappings are used for exact melee pricing — an unmapped combination is never priced by guesswork.
      </p>

      {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#B91C1C", fontSize: 13 }}>{error}</div>}
      {loading ? <div style={{ color: "#6B7280" }}>Loading…</div> : groups.map(g => (
        <div key={g.origin} style={{ marginBottom: 28, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontWeight: 600, color: "#111827" }}>{g.origin === "lab" ? "Lab-grown" : "Natural"} — {g.supplier_name}</div>
            <div style={{ fontSize: 12, color: "#9CA3AF" }}>{g.combos.length} combination{g.combos.length !== 1 ? "s" : ""} on pieces</div>
          </div>

          {g.supplier_missing ? (
            <div style={{ padding: 16, color: "#92400E", background: "#FEF3C7", fontSize: 13 }}>
              Supplier “{g.supplier_name}” not found for this tenant — add it (and import its melee price list) before mapping.
            </div>
          ) : g.combos.length === 0 ? (
            <div style={{ padding: 16, color: "#9CA3AF", fontSize: 13 }}>No pieces with melee for this origin yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>Colour group</th><th style={th}>Clarity</th><th style={th}>Pieces</th><th style={th}>Maps to quality</th><th style={th}></th></tr></thead>
              <tbody>
                {g.combos.map(c => {
                  const k = key(g.supplier_id!, c.colour_group, c.clarity);
                  const val = drafts[k] ?? c.mapped_quality ?? "";
                  const dirty = val !== (c.mapped_quality ?? "");
                  return (
                    <tr key={k} style={{ background: c.mapped_quality ? "#fff" : "#FFFBEB" }}>
                      <td style={td}>{c.colour_group}</td>
                      <td style={td}>{c.clarity}</td>
                      <td style={td}>{c.count}</td>
                      <td style={td}>
                        <select value={val} onChange={e => setDrafts(d => ({ ...d, [k]: e.target.value }))}
                          style={{ padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, minWidth: 200 }}>
                          <option value="">{g.available_qualities.length ? "— select confirmed quality —" : "— no price-list rows imported —"}</option>
                          {g.available_qualities.map(q => <option key={q} value={q}>{q}</option>)}
                        </select>
                        {!c.mapped_quality && <span style={{ marginLeft: 8, fontSize: 11, color: "#92400E" }}>unmapped</span>}
                      </td>
                      <td style={td}>
                        {dirty && val && (
                          <button disabled={savingKey === k} onClick={() => save(g, c)}
                            style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: "#111827", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
                            {savingKey === k ? "Saving…" : "Confirm"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
