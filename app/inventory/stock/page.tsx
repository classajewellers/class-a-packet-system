"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

interface Location { id: string; name: string; }
interface Level { location_id: string; location_name: string; quantity: number; }
interface StockData {
  variant: { id: string; name: string | null; tracking_mode: "serialized" | "quantity"; metal_karat: string; metal_colour: string };
  locations: Location[];
  levels: Level[];
  total_on_hand: number;
}

const ACCENT = "#635BFF";

function StockManager() {
  const { user } = useUser();
  const params = useSearchParams();
  const variantId = params.get("variant_id") ?? "";

  const [data, setData]     = useState<StockData | null>(null);
  const [loading, setLoad]  = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [busy, setBusy]     = useState(false);

  // draft quantities for inline grid edit, keyed by location_id
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // receive form
  const [rcvLoc, setRcvLoc]   = useState("");
  const [rcvQty, setRcvQty]   = useState("");
  const [rcvCost, setRcvCost] = useState("");

  // move form
  const [movFrom, setMovFrom] = useState("");
  const [movTo, setMovTo]     = useState("");
  const [movQty, setMovQty]   = useState("");

  const load = useCallback(async () => {
    if (!variantId) { setError("No variant_id provided"); setLoad(false); return; }
    setLoad(true);
    try {
      const res = await fetch(`/api/inventory/stock?variant_id=${encodeURIComponent(variantId)}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to load"); setData(null); }
      else { setData(json); setError(null); }
    } catch { setError("Network error"); }
    setLoad(false);
  }, [variantId]);

  useEffect(() => { void load(); }, [load]);

  async function post(url: string, body: unknown): Promise<boolean> {
    setBusy(true); setError(null);
    try {
      const res = await fetch(url, { method: url.includes("tracking-mode") ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Action failed"); setBusy(false); return false; }
      setBusy(false); return true;
    } catch { setError("Network error"); setBusy(false); return false; }
  }

  async function setTrackingMode(mode: "serialized" | "quantity") {
    if (await post("/api/inventory/stock/tracking-mode", { variant_id: variantId, tracking_mode: mode })) load();
  }
  async function saveLevel(locationId: string) {
    const raw = drafts[locationId];
    if (raw === undefined) return;
    const q = Number(raw);
    if (!Number.isInteger(q) || q < 0) { setError("Quantity must be a whole number ≥ 0"); return; }
    if (await post("/api/inventory/stock/set", { variant_id: variantId, location_id: locationId, quantity: q })) {
      setDrafts(d => { const n = { ...d }; delete n[locationId]; return n; });
      load();
    }
  }
  async function doReceive() {
    if (await post("/api/inventory/stock/receive", { variant_id: variantId, location_id: rcvLoc, quantity: Number(rcvQty), unit_cost: Number(rcvCost) })) {
      setRcvLoc(""); setRcvQty(""); setRcvCost(""); load();
    }
  }
  async function doMove() {
    if (await post("/api/inventory/stock/move", { variant_id: variantId, from_location_id: movFrom, to_location_id: movTo, quantity: Number(movQty) })) {
      setMovFrom(""); setMovTo(""); setMovQty(""); load();
    }
  }

  if (!user) return null;
  if (!canManage(user.role)) return <div style={wrap}><p style={{ color: "#6B7280" }}>Stock management is available to managers only.</p></div>;
  if (loading) return <div style={wrap}><p style={{ color: "#6B7280" }}>Loading…</p></div>;
  if (error && !data) return <div style={wrap}><div style={errBox}>{error}</div></div>;
  if (!data) return null;

  const { variant, locations, levels } = data;
  const qtyByLoc = new Map(levels.map(l => [l.location_id, l.quantity]));

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 2px" }}>
        Stock — {variant.name || `${variant.metal_karat} ${variant.metal_colour}`}
      </h1>
      <p style={{ color: "#6B7280", fontSize: 13, margin: "0 0 20px" }}>{variant.metal_karat} · {variant.metal_colour}</p>

      {error && <div style={errBox}>{error}</div>}

      {/* Tracking mode */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 10 }}>Tracking mode</div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["serialized", "quantity"] as const).map(mode => {
            const active = variant.tracking_mode === mode;
            return (
              <button key={mode} disabled={busy || active} onClick={() => setTrackingMode(mode)}
                style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: active ? "default" : "pointer",
                  border: `1px solid ${active ? ACCENT : "#D1D5DB"}`, background: active ? ACCENT : "#fff", color: active ? "#fff" : "#374151" }}>
                {mode === "serialized" ? "Serialized (one Piece per unit)" : "Quantity (count per location)"}
              </button>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: "#9CA3AF", margin: "10px 0 0" }}>
          A deliberate choice — never inferred. Serialized variants use individual Piece records exactly as before.
        </p>
      </div>

      {variant.tracking_mode === "serialized" ? (
        <div style={card}>
          <p style={{ fontSize: 14, color: "#374151", margin: 0 }}>
            This variant is <strong>serialized</strong> — stock is tracked as individual Piece records in the existing Pieces workflow. Switch to <strong>Quantity</strong> above to track it as a per-location count instead.
          </p>
        </div>
      ) : (
        <>
          {/* Grid */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>On-hand by location</div>
              <div style={{ fontSize: 13, color: "#374151" }}>Total: <strong>{data.total_on_hand}</strong></div>
            </div>
            {locations.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>No active locations. Add a location first.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={th}>Location</th><th style={{ ...th, width: 160 }}>Quantity</th><th style={{ ...th, width: 90 }}></th>
                </tr></thead>
                <tbody>
                  {locations.map(loc => {
                    const current = qtyByLoc.get(loc.id) ?? 0;
                    const draft = drafts[loc.id];
                    const dirty = draft !== undefined && Number(draft) !== current;
                    return (
                      <tr key={loc.id}>
                        <td style={td}>{loc.name}</td>
                        <td style={td}>
                          <input type="number" min={0} step={1}
                            value={draft ?? String(current)}
                            onChange={e => setDrafts(d => ({ ...d, [loc.id]: e.target.value }))}
                            style={{ width: 110, padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13 }} />
                        </td>
                        <td style={td}>
                          {dirty && (
                            <button disabled={busy} onClick={() => saveLevel(loc.id)}
                              style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: ACCENT, border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>
                              Save
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: "10px 0 0" }}>Editing a quantity here is a stock-take correction — it does not record a cost. Use “Receive stock” to log stock that arrived with its real cost.</p>
          </div>

          {/* Receive */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>Receive stock</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Field label="Location"><select value={rcvLoc} onChange={e => setRcvLoc(e.target.value)} style={inp}>
                <option value="">Select…</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></Field>
              <Field label="Quantity"><input type="number" min={1} step={1} value={rcvQty} onChange={e => setRcvQty(e.target.value)} style={{ ...inp, width: 100 }} /></Field>
              <Field label="Unit cost"><input type="number" min={0} step="0.01" value={rcvCost} onChange={e => setRcvCost(e.target.value)} style={{ ...inp, width: 110 }} /></Field>
              <button disabled={busy || !rcvLoc || !rcvQty || rcvCost === ""} onClick={doReceive}
                style={{ ...btn, opacity: (!rcvLoc || !rcvQty || rcvCost === "") ? 0.5 : 1 }}>Receive</button>
            </div>
          </div>

          {/* Move */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>Move stock between locations</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Field label="From"><select value={movFrom} onChange={e => setMovFrom(e.target.value)} style={inp}>
                <option value="">Select…</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></Field>
              <Field label="To"><select value={movTo} onChange={e => setMovTo(e.target.value)} style={inp}>
                <option value="">Select…</option>{locations.filter(l => l.id !== movFrom).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></Field>
              <Field label="Quantity"><input type="number" min={1} step={1} value={movQty} onChange={e => setMovQty(e.target.value)} style={{ ...inp, width: 100 }} /></Field>
              <button disabled={busy || !movFrom || !movTo || !movQty} onClick={doMove}
                style={{ ...btn, opacity: (!movFrom || !movTo || !movQty) ? 0.5 : 1 }}>Move</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "#6B7280" }}>{label}</span>
      {children}
    </div>
  );
}

const wrap:  React.CSSProperties = { maxWidth: 760, margin: "32px auto", padding: "0 20px" };
const card:  React.CSSProperties = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10, padding: 18, marginBottom: 16 };
const errBox:React.CSSProperties = { background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#B91C1C", fontSize: 13 };
const th:    React.CSSProperties = { textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", padding: "6px 8px", borderBottom: "1px solid #E5E7EB" };
const td:    React.CSSProperties = { padding: "8px 8px", fontSize: 13, color: "#111827", borderBottom: "1px solid #F3F4F6" };
const inp:   React.CSSProperties = { padding: "7px 9px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 13, color: "#111827" };
const btn:   React.CSSProperties = { padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: ACCENT, color: "#fff", border: "none", cursor: "pointer" };

export default function StockPage() {
  return (
    <Suspense fallback={<div style={wrap}><p style={{ color: "#6B7280" }}>Loading…</p></div>}>
      <StockManager />
    </Suspense>
  );
}
