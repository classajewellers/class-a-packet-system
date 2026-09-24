"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { collectingProgressLabel, type ReorderDraftResult, type ReorderSnapshot } from "@/lib/reorderTypes";

interface Location { id: string; name: string; }
interface Level { location_id: string; location_name: string; quantity: number; }
interface StockData {
  variant: {
    id: string;
    name: string | null;
    tracking_mode: "serialized" | "quantity";
    metal_karat: string;
    metal_colour: string;
    reorder_point: number | null;
    par_level: number | null;
    default_supplier_id: string | null;
    shopify_variant_id: string | null;
  };
  locations: Location[];
  levels: Level[];
  total_on_hand: number;
  reorder: ReorderSnapshot | null;
  reorder_error: string | null;
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

  // sale form
  const [sellLoc, setSellLoc] = useState("");
  const [sellQty, setSellQty] = useState("");

  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [draftPoId, setDraftPoId] = useState<string | null>(null);
  const [reorderForm, setReorderForm] = useState({
    default_supplier_id: "",
    par_level: "",
    reorder_point: "",
    shopify_variant_id: "",
  });

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

  const savedSupplier = data?.variant.default_supplier_id ?? "";
  const savedPar = data?.variant.par_level != null ? String(data.variant.par_level) : "";
  const savedManual = data?.variant.reorder_point != null ? String(data.variant.reorder_point) : "";
  const savedShopify = data?.variant.shopify_variant_id ?? "";
  useEffect(() => {
    setReorderForm({
      default_supplier_id: savedSupplier,
      par_level: savedPar,
      reorder_point: savedManual,
      shopify_variant_id: savedShopify,
    });
  }, [savedSupplier, savedPar, savedManual, savedShopify]);

  useEffect(() => {
    if (!user?.tenantId) return;
    fetch("/api/inventory/suppliers", { headers: { "x-tenant-id": user.tenantId } })
      .then((r) => r.json())
      .then((j) => setSuppliers(j.suppliers ?? []))
      .catch(() => { /* supplier list is optional for the rest of the page */ });
  }, [user?.tenantId]);

  async function post(url: string, body: unknown): Promise<Record<string, unknown> | null> {
    setBusy(true); setError(null);
    try {
      const method = url.includes("tracking-mode") || url.includes("/reorder") ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Action failed"); setBusy(false); return null; }
      setBusy(false); return json;
    } catch { setError("Network error"); setBusy(false); return null; }
  }

  function noteDraft(draft: ReorderDraftResult | null | undefined) {
    if (!draft?.purchase_order_id || !draft.po_number) return;
    setDraftPoId(draft.purchase_order_id);
    setNotice(`Draft ${draft.po_number} created for ${draft.quantity}. It has not been sent.`);
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
  async function saveReorder() {
    const json = await post("/api/inventory/stock/reorder", {
      variant_id: variantId,
      default_supplier_id: reorderForm.default_supplier_id || null,
      par_level: reorderForm.par_level === "" ? null : Number(reorderForm.par_level),
      reorder_point: reorderForm.reorder_point === "" ? null : Number(reorderForm.reorder_point),
      shopify_variant_id: reorderForm.shopify_variant_id.trim() || null,
    });
    if (!json) return;
    noteDraft(json.draft_purchase_order as ReorderDraftResult | null);
    load();
  }
  async function doSell() {
    const json = await post("/api/inventory/stock/sell", {
      variant_id: variantId,
      location_id: sellLoc,
      quantity: Number(sellQty),
    });
    if (!json) return;
    setSellLoc(""); setSellQty("");
    noteDraft(json.draft_purchase_order as ReorderDraftResult | null);
    load();
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
      {notice && (
        <div style={{ background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#3730A3", fontSize: 13 }}>
          {notice}{" "}
          {draftPoId && <Link href={`/inventory/purchase-orders/${draftPoId}`} style={{ fontWeight: 600 }}>Open draft</Link>}
        </div>
      )}

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
          <ReorderCard
            reorder={data.reorder}
            reorderError={data.reorder_error}
            suppliers={suppliers}
            form={reorderForm}
            setForm={setReorderForm}
            busy={busy}
            onSave={saveReorder}
          />

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

          {/* Sell */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Record a sale</div>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 12px" }}>
              Writes a sales-ledger row from today and reduces on-hand at this location. Shopify orders do the same when the line&apos;s variant id matches the Shopify variant id below.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Field label="Location"><select value={sellLoc} onChange={e => setSellLoc(e.target.value)} style={inp}>
                <option value="">Select…</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></Field>
              <Field label="Quantity"><input type="number" min={1} step={1} value={sellQty} onChange={e => setSellQty(e.target.value)} style={{ ...inp, width: 100 }} /></Field>
              <button disabled={busy || !sellLoc || !sellQty} onClick={doSell}
                style={{ ...btn, opacity: (!sellLoc || !sellQty) ? 0.5 : 1 }}>Record sale</button>
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

function ReorderCard({
  reorder, reorderError, suppliers, form, setForm, busy, onSave,
}: {
  reorder: ReorderSnapshot | null;
  reorderError: string | null;
  suppliers: { id: string; name: string }[];
  form: { default_supplier_id: string; par_level: string; reorder_point: string; shopify_variant_id: string };
  setForm: React.Dispatch<React.SetStateAction<{ default_supplier_id: string; par_level: string; reorder_point: string; shopify_variant_id: string }>>;
  busy: boolean;
  onSave: () => void;
}) {
  const calculated = reorder?.state === "calculated";
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Reorder</div>
      {reorderError && (
        <p style={{ fontSize: 12, color: "#B91C1C", margin: "0 0 10px" }}>
          Reorder status is unavailable ({reorderError}). Apply migration 164 on staging, then reload.
        </p>
      )}
      {reorder?.state === "collecting" && (
        <p style={{ fontSize: 13, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 10px", margin: "0 0 12px" }}>
          Collecting data — {collectingProgressLabel(reorder.history_days, reorder.history_days_required)}. Set a temporary manual reorder point and a par level. Vault switches this variant to the calculated reorder point once history reaches 90 days.
        </p>
      )}
      {calculated && reorder?.calculated_reorder_point != null && (
        <div style={{ fontSize: 13, color: "#065F46", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, padding: "8px 10px", margin: "0 0 12px" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Calculated reorder point: {reorder.calculated_reorder_point}</div>
          <div>On hand {reorder.on_hand}. Average monthly sales {reorder.avg_monthly_sales} (trailing 3 months). Highest month {reorder.max_monthly_sales} (trailing 12 months). Safety stock {reorder.safety_stock}.</div>
          <div style={{ marginTop: 4 }}>Lead time is in days and is divided by 30 inside the formula so monthly sales × lead time is a quantity. Par level stays the number you enter. A draft purchase order is created when on-hand is at or below this reorder point. It is never sent automatically.</div>
          <div style={{ marginTop: 4, color: "#6B7280" }}>{reorder.history_days} days of sales history. The calculated number needs real accumulated sales before it can be checked against a spreadsheet.</div>
        </div>
      )}
      {calculated && reorder?.calculated_reorder_point == null && (
        <p style={{ fontSize: 13, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 10px", margin: "0 0 12px" }}>
          {reorder.history_days} days of sales history — this variant is on the calculated reorder point.
          {reorder.calc_block_reason === "no_supplier"
            ? " Choose a default supplier that has both an average and a maximum lead time."
            : " Set both an average and a maximum lead time on the default supplier."}
          {" "}The temporary manual reorder point is no longer the active threshold.
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Default supplier">
          <select value={form.default_supplier_id} onChange={e => set("default_supplier_id", e.target.value)} style={{ ...inp, minWidth: 180 }}>
            <option value="">None</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Par level">
          <input type="number" min={0} step={1} value={form.par_level} onChange={e => set("par_level", e.target.value)} style={{ ...inp, width: 100 }} />
        </Field>
        <Field label={calculated ? "Saved manual reorder point" : "Temporary manual reorder point"}>
          <input type="number" min={0} step={1} value={form.reorder_point} disabled={calculated}
            onChange={e => set("reorder_point", e.target.value)} style={{ ...inp, width: 120, background: calculated ? "#F3F4F6" : "#fff" }} />
        </Field>
        <Field label="Shopify variant ID">
          <input value={form.shopify_variant_id} onChange={e => set("shopify_variant_id", e.target.value)} placeholder="Linked Shopify variant" style={{ ...inp, width: 180 }} />
        </Field>
        <button disabled={busy} onClick={onSave} style={btn}>Save reorder setup</button>
      </div>
      <p style={{ fontSize: 12, color: "#9CA3AF", margin: "10px 0 0" }}>
        {calculated
          ? "The manual reorder point is kept for reference. The active threshold is the calculated number."
          : "The manual reorder point is only the active threshold while this variant is collecting data. Par level is always manual."}
        {" "}Shopify sales count only after this variant id is linked. Older Shopify orders are not imported.
      </p>
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
