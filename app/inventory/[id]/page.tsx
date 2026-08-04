"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { InventoryPiece, InventoryReferenceData } from "@/lib/types";
import { calculateLivePricing, GoldRate, MarginBracket } from "@/lib/inventoryPricing";
import {
  ArrowLeft, Edit2, Save, X, ArrowRight,
  Lock, AlertTriangle, TrendingDown, Package, MapPin, Clock, DollarSign,
} from "lucide-react";

const PAYMENT_METHODS = ["Cash", "EFTPOS", "Credit Card", "Bank Transfer", "Layby", "Finance", "Other"];

type Params = { params: { id: string } };

// ── Formatters ───────────────────────────────────────────────────────────────

const fmtMoney = (n: number | null | undefined) =>
  n != null ? `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const fmtPct = (n: number | null | undefined) =>
  n != null ? `${Number(n).toFixed(1)}%` : "—";
function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// ── Shared micro-components ──────────────────────────────────────────────────

function FieldView({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: value != null && value !== "" ? "#111827" : "#D1D5DB" }}>
        {value != null && value !== "" ? String(value) : "—"}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{title}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>{children}</div>
    </div>
  );
}

function GpChip({ gp, pct }: { gp: number | null; pct: number | null }) {
  if (gp == null) return <span style={{ color: "#9CA3AF", fontSize: 13 }}>—</span>;
  const pctVal = pct ?? 0;
  const colour = pctVal >= 40 ? "#10B981" : pctVal >= 20 ? "#F59E0B" : "#EF4444";
  return (
    <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 600, color: colour }}>
      {fmtMoney(gp)} <span style={{ fontSize: 12, fontWeight: 400 }}>({fmtPct(pct)})</span>
    </span>
  );
}

function PricingLineItem({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0", fontSize: 13 }}>
      <span style={{ color: "#6B7280" }}>
        {label}{sub && <span style={{ color: "#9CA3AF", marginLeft: 4, fontSize: 12 }}>{sub}</span>}
      </span>
      <span style={{ fontFamily: "monospace", fontWeight: 500, color: "#374151" }}>{value}</span>
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

type TLEventType = "created" | "received" | "movement" | "sold";
type TLEvent = {
  id: string;
  type: TLEventType;
  label: string;
  by?: string | null;
  at: Date;
  notes?: string | null;
};

const TL_COLOUR: Record<TLEventType, string> = {
  created:  "#10B981",
  received: "#3B82F6",
  movement: "#635BFF",
  sold:     "#F59E0B",
};

function buildTimeline(piece: any, movements: any[]): TLEvent[] {
  const events: TLEvent[] = [];

  if (piece.created_at) {
    events.push({ id: "created", type: "created", label: "Added to inventory", at: new Date(piece.created_at) });
  }

  if (piece.date_received) {
    events.push({ id: "received", type: "received", label: "Received into stock", at: new Date(piece.date_received) });
  }

  for (const m of movements) {
    const parts: string[] = [];
    if (m.to_location?.name) {
      if (m.from_location?.name && m.from_location.name !== m.to_location.name) {
        parts.push(`${m.from_location.name} → ${m.to_location.name}`);
      } else if (!m.from_location?.name) {
        parts.push(`Moved to ${m.to_location.name}`);
      }
    }
    if (m.to_status?.name) {
      if (m.from_status?.name && m.from_status.name !== m.to_status.name) {
        parts.push(`${m.from_status.name} → ${m.to_status.name}`);
      } else if (!m.from_status?.name) {
        parts.push(`Status: ${m.to_status.name}`);
      }
    }
    events.push({
      id: m.id,
      type: "movement",
      label: parts.join("  ·  ") || "Movement recorded",
      by: m.moved_by,
      at: new Date(m.moved_at),
      notes: m.notes,
    });
  }

  if (piece.date_sold) {
    events.push({ id: "sold", type: "sold", label: "Sold", at: new Date(piece.date_sold) });
  }

  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function Timeline({ piece, movements }: { piece: any; movements: any[] }) {
  const events = buildTimeline(piece, movements);

  if (events.length === 0) {
    return <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF" }}>No history recorded yet.</p>;
  }

  return (
    <div>
      {events.map((ev, i) => {
        const colour = TL_COLOUR[ev.type];
        const isLast = i === events.length - 1;
        return (
          <div key={ev.id} style={{ display: "flex", gap: 12 }}>
            {/* Dot + connector */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{ width: 11, height: 11, borderRadius: "50%", background: colour, flexShrink: 0, marginTop: 3 }} />
              {!isLast && (
                <div style={{ width: 2, flex: 1, minHeight: 18, background: "#E5E7EB", margin: "4px 0" }} />
              )}
            </div>
            {/* Content */}
            <div style={{ paddingBottom: isLast ? 0 : 18, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", lineHeight: 1.4 }}>{ev.label}</div>
              {ev.notes && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{ev.notes}</div>}
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>
                {ev.by ? `${ev.by}  ·  ` : ""}{fmtDate(ev.at)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryItemPage({ params }: Params) {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const tenantId: string = user?.tenantId ?? "";
  const isManager = hydrated ? canManage(user?.role) : false;

  const [piece, setPiece]     = useState<InventoryPiece | null>(null);
  const [ref, setRef]         = useState<InventoryReferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState<Partial<InventoryPiece>>({});
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const [goldRates, setGoldRates]           = useState<GoldRate[]>([]);
  const [marginBrackets, setMarginBrackets] = useState<MarginBracket[]>([]);

  const [showMove, setShowMove]     = useState(false);
  const [moveForm, setMoveForm]     = useState({ to_location_id: "", to_status_id: "", notes: "" });
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError]   = useState("");

  const [movements, setMovements] = useState<any[]>([]);

  const [products, setProducts]           = useState<any[]>([]);
  const [linkEditing, setLinkEditing]     = useState(false);
  const [linkProductId, setLinkProductId] = useState("");
  const [linkSaving, setLinkSaving]       = useState(false);
  const [linkError, setLinkError]         = useState("");

  // ── Staff list for Mark as Sold modal ────────────────────────────────────────
  const [staffList, setStaffList] = useState<{ id: string; full_name: string }[]>([]);

  // ── Mark as Sold ─────────────────────────────────────────────────────────────
  const [showSell, setShowSell]   = useState(false);
  const [sellForm, setSellForm]   = useState({
    sold_price: "",
    discount_amount: "",
    payment_method: "",
    staff_id: "",
    customer_id: "",
    notes: "",
  });
  const [sellSaving, setSellSaving]   = useState(false);
  const [sellError, setSellError]     = useState("");
  const [sellSuccess, setSellSuccess] = useState<{ id: string; gross_profit: number | null; note: string | null } | null>(null);
  // Customer search state
  const [custSearch, setCustSearch]           = useState("");
  const [custResults, setCustResults]         = useState<{ id: string; first_name: string | null; last_name: string | null; email: string | null }[]>([]);
  const [custDropdown, setCustDropdown]       = useState(false);
  const [custDisplay, setCustDisplay]         = useState("");

  const headers = { "x-tenant-id": tenantId };

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [pieceRes, refRes, movRes, pricingRes, prodRes, staffRes] = await Promise.all([
      fetch(`/api/inventory/pieces/${params.id}`, { headers }),
      fetch("/api/inventory/reference", { headers }),
      fetch(`/api/inventory/movements?piece_id=${params.id}&limit=50`, { headers }),
      fetch("/api/pricing", { headers }),
      fetch("/api/inventory/products", { headers }),
      fetch("/api/settings/users/list", { headers }),
    ]);
    if (!pieceRes.ok) { setLoading(false); return; }
    const [pieceJson, refJson, movJson] = await Promise.all([
      pieceRes.json(), refRes.json(), movRes.json(),
    ]);
    setPiece(pieceJson.piece);
    setRef(refJson);
    setMovements(movJson.movements ?? []);
    if (pricingRes.ok) {
      const pj = await pricingRes.json();
      setGoldRates(pj.metalRates ?? []);
      setMarginBrackets(pj.marginBrackets ?? []);
    }
    if (prodRes.ok) setProducts((await prodRes.json()).products ?? []);
    if (staffRes.ok) setStaffList((await staffRes.json()).users ?? []);
    setLoading(false);
  }, [tenantId, params.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function startEdit() {
    if (!piece) return;
    setForm({ ...piece });
    setEditing(true);
    setError("");
  }

  async function handleSave() {
    if (!piece) return;
    setSaving(true);
    setError("");
    const { status: _s, location: _l, category: _c, supplier: _sp, ...payload } = form as any;
    const res = await fetch(`/api/inventory/pieces/${piece.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Save failed"); setSaving(false); return; }
    setPiece(json.piece);
    setEditing(false);
    setSaving(false);
  }

  async function handleMove() {
    if (!piece) return;
    if (!moveForm.to_location_id && !moveForm.to_status_id) {
      setMoveError("Select a new location or status");
      return;
    }
    setMoveSaving(true);
    setMoveError("");
    const res = await fetch("/api/inventory/movements", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ piece_id: piece.id, ...moveForm }),
    });
    const json = await res.json();
    if (!res.ok) { setMoveError(json.error ?? "Failed"); setMoveSaving(false); return; }
    setMoveSaving(false);
    setShowMove(false);
    setMoveForm({ to_location_id: "", to_status_id: "", notes: "" });
    fetchAll();
  }

  async function handleDelete() {
    if (!piece) return;
    if (!confirm(`Delete ${piece.sku}? This cannot be undone.`)) return;
    const res = await fetch(`/api/inventory/pieces/${piece.id}`, { method: "DELETE", headers });
    if (res.ok) router.push("/inventory");
  }

  async function handleSaveLink() {
    if (!piece) return;
    setLinkSaving(true);
    setLinkError("");
    const res = await fetch(`/api/inventory/pieces/${piece.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: linkProductId || null }),
    });
    const json = await res.json();
    setLinkSaving(false);
    if (!res.ok) { setLinkError(json.error ?? "Save failed"); return; }
    setPiece(json.piece);
    setLinkEditing(false);
  }

  // ── Customer search for sell modal ──────────────────────────────────────────
  useEffect(() => {
    if (custSearch.length < 2) { setCustResults([]); setCustDropdown(false); return; }
    const t = setTimeout(() => {
      fetch(`/api/customers/search?q=${encodeURIComponent(custSearch)}`, { headers })
        .then(r => r.json())
        .then(json => {
          setCustResults(json.results ?? []);
          setCustDropdown((json.results ?? []).length > 0);
        })
        .catch(() => setCustResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [custSearch, tenantId]);

  function selectCustomer(c: { id: string; first_name: string | null; last_name: string | null; email: string | null }) {
    setSellForm(f => ({ ...f, customer_id: c.id }));
    setCustDisplay(`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || c.id);
    setCustSearch("");
    setCustDropdown(false);
  }

  async function handleSell() {
    if (!piece) return;
    const price = parseFloat(sellForm.sold_price);
    if (!sellForm.sold_price || isNaN(price) || price <= 0) {
      setSellError("Sold price is required and must be greater than zero");
      return;
    }
    setSellSaving(true);
    setSellError("");
    const res = await fetch("/api/inventory/sales", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        piece_id:        piece.id,
        sold_price:      price,
        discount_amount: parseFloat(sellForm.discount_amount || "0") || 0,
        staff_id:        sellForm.staff_id   || null,
        customer_id:     sellForm.customer_id || null,
        payment_method:  sellForm.payment_method || null,
        notes:           sellForm.notes      || null,
        moved_by:        user?.name          || null,
      }),
    });
    const json = await res.json();
    setSellSaving(false);
    if (!res.ok) { setSellError(json.error ?? "Failed to record sale"); return; }
    setSellSuccess({
      id: json.sale?.id ?? "",
      gross_profit: json.gross_profit,
      note: json.gross_profit_note ?? null,
    });
    fetchAll();
  }

  function openSellModal() {
    setSellForm({
      sold_price: piece?.retail_price != null ? String(piece.retail_price) : "",
      discount_amount: "",
      payment_method: "",
      staff_id: user?.id ?? "",
      customer_id: "",
      notes: "",
    });
    setCustDisplay("");
    setCustSearch("");
    setCustResults([]);
    setSellError("");
    setSellSuccess(null);
    setShowSell(true);
  }

  function fv(key: keyof InventoryPiece): any {
    return editing ? (form[key] ?? "") : (piece?.[key] ?? "");
  }
  function setFv(key: keyof InventoryPiece, val: any) {
    setForm(f => ({ ...f, [key]: val === "" ? null : val }));
  }

  // EF must be declared as a function (not a component) to avoid hook rule violations
  function EF({ label, field, type = "text", opts }: {
    label: string;
    field: keyof InventoryPiece;
    type?: string;
    opts?: { value: string; label: string }[];
  }) {
    const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3, display: "block" };
    const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14 };

    if (!editing) return <FieldView label={label} value={piece?.[field] as any} />;
    if (opts) {
      return (
        <div>
          <div style={labelStyle}>{label}</div>
          <select value={String(fv(field))} onChange={e => setFv(field, e.target.value)}
            style={{ ...inputStyle, background: "#fff" }}>
            <option value="">—</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div>
        <div style={labelStyle}>{label}</div>
        <input type={type} value={String(fv(field))} onChange={e => setFv(field, e.target.value)} style={inputStyle} />
      </div>
    );
  }

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (!hydrated || loading) {
    return <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading…</div>;
  }
  if (!piece) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <p style={{ color: "#6B7280" }}>Item not found.</p>
        <button onClick={() => router.push("/inventory")}
          style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 14 }}>
          Back to Stock
        </button>
      </div>
    );
  }

  const statusColour = piece.status?.colour ?? "#9CA3AF";
  const lp = isManager ? calculateLivePricing(piece, goldRates, marginBrackets) : null;
  const underpriced = lp?.liveRetail != null && piece.retail_price != null && piece.retail_price < lp.liveRetail * 0.9;
  const linkedProduct = products.find((p: any) => p.id === piece.product_id);
  const meleeQty = (piece as any).melee_quantity;

  // Determine if already sold by checking current status name (case-insensitive)
  const isSold = (piece.status?.name ?? "").toLowerCase().includes("sold");

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Back */}
      <button onClick={() => router.push("/inventory")}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: 14, marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={16} /> Stock
      </button>

      {/* ── Header strip ── */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "16px 24px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: "#111827", flexShrink: 0 }}>{piece.sku}</span>
          {piece.status && (
            <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, flexShrink: 0, background: statusColour + "22", color: statusColour, border: `1px solid ${statusColour}44` }}>
              {piece.status.name}
            </span>
          )}
          {piece.location && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#6B7280", flexShrink: 0 }}>
              <MapPin size={13} /> {piece.location.name}
            </span>
          )}
          {piece.title && <span style={{ fontSize: 15, color: "#374151" }}>{piece.title}</span>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          {piece.retail_price != null && (
            <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#111827" }}>
              {fmtMoney(piece.retail_price)}
            </span>
          )}
          {isManager && !editing && (
            <div style={{ display: "flex", gap: 8 }}>
              {!isSold && (
                <button onClick={() => setShowMove(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 13, cursor: "pointer", color: "#374151", fontWeight: 500 }}>
                  <ArrowRight size={14} /> Move
                </button>
              )}
              {!isSold && (
                <button onClick={openSellModal}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "none", background: "#10B981", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                  <DollarSign size={14} /> Mark as Sold
                </button>
              )}
              <button onClick={startEdit}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                <Edit2 size={14} /> Edit
              </button>
            </div>
          )}
          {editing && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditing(false)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 13, cursor: "pointer", color: "#374151" }}>
                <X size={14} /> Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 13, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                <Save size={14} /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      {/* ── Two-column layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 20, alignItems: "start" }}>

        {/* ═══ LEFT: Detail sections ═══ */}
        <div>

          {/* Identity */}
          <SectionCard title="Identity">
            <EF label="SKU" field="sku" />
            <EF label="Title" field="title" />
            <EF label="Category" field="category_id" opts={ref?.categories.map(c => ({ value: c.id, label: c.name })) ?? []} />
            <EF label="Collection" field="collection" />
          </SectionCard>

          {/* Product blueprint */}
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Product Blueprint</h3>
              {isManager && !linkEditing && (
                <button
                  onClick={() => { setLinkProductId(piece.product_id ?? ""); setLinkError(""); setLinkEditing(true); }}
                  style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", fontSize: 12, cursor: "pointer", color: "#374151" }}>
                  {piece.product_id ? "Change" : "Link"}
                </button>
              )}
            </div>
            {!linkEditing ? (
              piece.product_id ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Package size={14} style={{ color: "#635BFF", flexShrink: 0 }} />
                  <button onClick={() => router.push(`/inventory/products/${piece.product_id}`)}
                    style={{ fontSize: 14, fontWeight: 600, color: "#635BFF", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" as const }}>
                    {linkedProduct?.name ?? piece.product_id}
                  </button>
                  {linkedProduct?.category?.name && (
                    <span style={{ fontSize: 12, color: "#9CA3AF" }}>{(linkedProduct.category as any).name}</span>
                  )}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF" }}>Not linked to a product blueprint</p>
              )
            ) : (
              <div>
                {linkError && <div style={{ padding: "8px 12px", background: "#FEF2F2", color: "#DC2626", borderRadius: 6, fontSize: 12, marginBottom: 10 }}>{linkError}</div>}
                <select value={linkProductId} onChange={e => setLinkProductId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, background: "#fff", marginBottom: 10 }}>
                  <option value="">— None —</option>
                  {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setLinkEditing(false)}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 13, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={handleSaveLink} disabled={linkSaving}
                    style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 13, fontWeight: 500, cursor: linkSaving ? "not-allowed" : "pointer", opacity: linkSaving ? 0.7 : 1 }}>
                    {linkSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Metal */}
          <SectionCard title="Metal">
            <EF label="Metal Type" field="metal_type" />
            <EF label="Karat" field="metal_karat" />
            <EF label="Colour" field="metal_colour" />
            <EF label="Weight (g)" field="metal_weight_grams" type="number" />
          </SectionCard>

          {/* Stone */}
          <SectionCard title="Stone">
            <EF label="Diamond Type" field="diamond_type" />
            <EF label="Carat" field="diamond_carat" type="number" />
            <EF label="Colour" field="diamond_colour" />
            <EF label="Clarity" field="diamond_clarity" />
            <EF label="Certificate" field="diamond_certificate" />
          </SectionCard>

          {/* Dimensions */}
          <SectionCard title="Dimensions">
            <EF label="Finger Size" field="finger_size" />
            <EF label="Chain Length" field="chain_length" />
            <EF label="Dimensions" field="dimensions" />
          </SectionCard>

          {/* Melee */}
          {(editing || (meleeQty != null && meleeQty > 0)) && (
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                Melee Stones
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
                <EF label="Quantity" field={"melee_quantity" as keyof InventoryPiece} type="number" />
                <EF label="ct / stone" field={"melee_carat_weight" as keyof InventoryPiece} type="number" />
                <EF label="Colour Group" field={"melee_colour_group" as keyof InventoryPiece}
                  opts={editing ? ["D-F","G-H","I-J","K-L","M-N"].map(g => ({ value: g, label: g })) : undefined} />
                <EF label="Clarity" field={"melee_clarity" as keyof InventoryPiece}
                  opts={editing ? ["VVS","VS","SI1","SI2","SI3","I1","I2","I3"].map(c => ({ value: c, label: c })) : undefined} />
                {!editing && meleeQty != null && (piece as any).melee_carat_weight != null && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 3 }}>Total Melee</div>
                    <div style={{ fontSize: 14, color: "#111827" }}>
                      {(Number(meleeQty) * Number((piece as any).melee_carat_weight)).toFixed(3)}ct
                      <span style={{ color: "#9CA3AF", marginLeft: 6, fontSize: 13 }}>
                        ({meleeQty} × {(piece as any).melee_carat_weight}ct)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pricing — manager only ── */}
          {isManager && (
            editing ? (
              <SectionCard title="Pricing & Certificate">
                <EF label="Locked cost" field="locked_cost" type="number" />
                <EF label="Stone cost" field="stone_cost" type="number" />
                <EF label="Labour cost" field="labour_cost" type="number" />
                <EF label="Retail Price" field="retail_price" type="number" />
                <EF label="Cost Price" field="cost_price" type="number" />
                <EF label="Certificate Number" field="valuation_number" />
                <EF label="Certificate Amount" field="valuation_amount" type="number" />
              </SectionCard>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Pricing</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

                  {/* Actual Cost */}
                  <div style={{ background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                      <Lock size={12} style={{ color: "#6B7280" }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Actual Cost</span>
                    </div>
                    {piece.locked_cost == null ? (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6 }}>
                        <AlertTriangle size={12} style={{ color: "#D97706", marginTop: 1, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "#92400E" }}>No locked cost recorded</span>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: "#111827" }}>{fmtMoney(piece.locked_cost)}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2, marginBottom: 10 }}>Recorded at entry — never changes</div>
                        {lp?.lockedGrossProfit != null && (
                          <div>
                            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 3 }}>Locked GP</div>
                            <GpChip gp={lp.lockedGrossProfit} pct={lp.lockedGrossProfitPct} />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Live Pricing */}
                  <div style={{ background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12 }}>Live Pricing</div>
                    {lp?.liveCost == null ? (
                      <div style={{ fontSize: 12, color: "#9CA3AF" }}>Set metal weight, stone or labour cost to see live pricing.</div>
                    ) : (
                      <>
                        <div style={{ borderBottom: "1px solid #E5E7EB", paddingBottom: 8, marginBottom: 8 }}>
                          <PricingLineItem label="Metal" value={fmtMoney(lp.liveCostBreakdown?.metalCost)} />
                          <PricingLineItem label="Stones" value={fmtMoney(lp.liveCostBreakdown?.stoneCost)} />
                          <PricingLineItem label="Labour" value={fmtMoney(lp.liveCostBreakdown?.labourCost)} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 12, fontWeight: 700 }}>
                          <span style={{ color: "#374151" }}>Live cost</span>
                          <span style={{ fontFamily: "monospace", fontSize: 14, color: "#111827" }}>{fmtMoney(lp.liveCost)}</span>
                        </div>
                        {lp.liveRetail != null && (
                          <>
                            <PricingLineItem label="Suggested retail" value={fmtMoney(lp.liveRetail)} />
                            <PricingLineItem label="Actual retail" value={fmtMoney(piece.retail_price)} />
                            {underpriced && (
                              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, padding: "5px 8px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6 }}>
                                <TrendingDown size={12} style={{ color: "#DC2626" }} />
                                <span style={{ fontSize: 11, color: "#DC2626", fontWeight: 500 }}>Retail may be underpriced</span>
                              </div>
                            )}
                            {lp.liveGrossProfit != null && (
                              <div style={{ marginTop: 8, borderTop: "1px solid #E5E7EB", paddingTop: 8 }}>
                                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 3 }}>Live GP</div>
                                <GpChip gp={lp.liveGrossProfit} pct={lp.liveGrossProfitPct} />
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {(piece.valuation_number || piece.valuation_amount) && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E5E7EB", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
                    <FieldView label="Certificate Number" value={piece.valuation_number} />
                    <FieldView label="Certificate Amount" value={piece.valuation_amount} />
                  </div>
                )}
              </div>
            )
          )}

          {/* Inventory state */}
          <SectionCard title="Inventory">
            <EF label="Status" field="status_id" opts={ref?.statuses.map(s => ({ value: s.id, label: s.name })) ?? []} />
            <EF label="Location" field="location_id" opts={ref?.locations.map(l => ({ value: l.id, label: l.name })) ?? []} />
            <EF label="Supplier" field="supplier_id" opts={ref?.suppliers.map(s => ({ value: s.id, label: s.name })) ?? []} />
            <EF label="Assigned To" field="assigned_to" />
          </SectionCard>

          {/* Dates */}
          <SectionCard title="Dates">
            <EF label="Date Received" field="date_received" type="date" />
            <EF label="Date Sold" field="date_sold" type="date" />
          </SectionCard>

          {/* Notes */}
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Notes</h3>
            {editing ? (
              <textarea value={String(fv("notes"))} onChange={e => setFv("notes", e.target.value)} rows={4}
                style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, resize: "vertical" as const }} />
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: piece.notes ? "#374151" : "#D1D5DB", lineHeight: 1.6 }}>{piece.notes ?? "—"}</p>
            )}
          </div>

          {/* Delete */}
          {isManager && !editing && (
            <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 16 }}>
              <button onClick={handleDelete}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 13, cursor: "pointer" }}>
                Delete Item
              </button>
            </div>
          )}
        </div>

        {/* ═══ RIGHT: Timeline ═══ */}
        <div style={{ position: "sticky", top: 24 }}>
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <Clock size={13} style={{ color: "#9CA3AF" }} />
              <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>History</h3>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#9CA3AF" }}>{movements.length} movement{movements.length !== 1 ? "s" : ""}</span>
            </div>
            <Timeline piece={piece} movements={movements} />
          </div>
        </div>
      </div>

      {/* ── Move Modal ── */}
      {showMove && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>Move Item</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9CA3AF" }}>
                  Currently: {piece.location?.name ?? "no location"} · {piece.status?.name ?? "no status"}
                </p>
              </div>
              <button onClick={() => setShowMove(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={20} /></button>
            </div>
            {moveError && <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{moveError}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>New Location</label>
                <select value={moveForm.to_location_id} onChange={e => setMoveForm(f => ({ ...f, to_location_id: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, background: "#fff" }}>
                  <option value="">— Keep current —</option>
                  {ref?.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>New Status</label>
                <select value={moveForm.to_status_id} onChange={e => setMoveForm(f => ({ ...f, to_status_id: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, background: "#fff" }}>
                  <option value="">— Keep current —</option>
                  {ref?.statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>Notes</label>
                <input value={moveForm.notes} onChange={e => setMoveForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional reason…"
                  style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14 }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button onClick={() => setShowMove(false)}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleMove} disabled={moveSaving}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: moveSaving ? "not-allowed" : "pointer", opacity: moveSaving ? 0.7 : 1 }}>
                {moveSaving ? "Saving…" : "Log Movement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark as Sold Modal ── */}
      {showSell && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" as const }}>

            {sellSuccess ? (
              /* ── Success state ── */
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <DollarSign size={24} style={{ color: "#10B981" }} />
                </div>
                <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#111827" }}>Sale Recorded</h2>
                <p style={{ margin: "0 0 16px", fontSize: 14, color: "#6B7280" }}>{piece.sku} has been marked as sold.</p>
                {sellSuccess.gross_profit != null && (
                  <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "10px 16px", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>Gross Profit</div>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", color: "#15803D" }}>{fmtMoney(sellSuccess.gross_profit)}</div>
                  </div>
                )}
                {sellSuccess.note && (
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 16px", marginBottom: 12, fontSize: 12, color: "#92400E", textAlign: "left" as const }}>
                    ⚠ {sellSuccess.note}
                  </div>
                )}
                <button onClick={() => { setShowSell(false); setSellSuccess(null); }}
                  style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer", marginTop: 8 }}>
                  Done
                </button>
              </div>
            ) : (
              /* ── Form state ── */
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>Mark as Sold</h2>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9CA3AF" }}>{piece.sku}{piece.title ? ` — ${piece.title}` : ""}</p>
                  </div>
                  <button onClick={() => setShowSell(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={20} /></button>
                </div>

                {sellError && (
                  <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{sellError}</div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Sold price + discount — side by side */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>
                        Sold Price <span style={{ color: "#EF4444" }}>*</span>
                      </label>
                      <input
                        type="number" min="0" step="0.01"
                        value={sellForm.sold_price}
                        onChange={e => setSellForm(f => ({ ...f, sold_price: e.target.value }))}
                        placeholder="0.00"
                        style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>Discount</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={sellForm.discount_amount}
                        onChange={e => setSellForm(f => ({ ...f, discount_amount: e.target.value }))}
                        placeholder="0.00"
                        style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14 }}
                      />
                    </div>
                  </div>

                  {/* Net price preview */}
                  {sellForm.sold_price && (
                    <div style={{ fontSize: 13, color: "#6B7280", padding: "6px 10px", background: "#F9FAFB", borderRadius: 6 }}>
                      Net: <strong style={{ fontFamily: "monospace", color: "#111827" }}>
                        {fmtMoney(parseFloat(sellForm.sold_price || "0") - parseFloat(sellForm.discount_amount || "0"))}
                      </strong>
                      {piece.retail_price != null && (
                        <span style={{ color: "#9CA3AF", marginLeft: 8 }}>
                          (listed at {fmtMoney(piece.retail_price)})
                        </span>
                      )}
                    </div>
                  )}

                  {/* Payment method */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>Payment Method</label>
                    <select
                      value={sellForm.payment_method}
                      onChange={e => setSellForm(f => ({ ...f, payment_method: e.target.value }))}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, background: "#fff" }}>
                      <option value="">— Select —</option>
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  {/* Customer — search/select */}
                  <div style={{ position: "relative" as const }}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>Customer</label>
                    {custDisplay ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#F9FAFB" }}>
                        <span style={{ flex: 1, fontSize: 14, color: "#111827" }}>{custDisplay}</span>
                        <button
                          onClick={() => { setSellForm(f => ({ ...f, customer_id: "" })); setCustDisplay(""); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 0 }}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={custSearch}
                          onChange={e => setCustSearch(e.target.value)}
                          onBlur={() => setTimeout(() => setCustDropdown(false), 200)}
                          placeholder="Search by name or email…"
                          style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14 }}
                        />
                        {custDropdown && custResults.length > 0 && (
                          <div style={{ position: "absolute" as const, top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 10, marginTop: 4, overflow: "hidden" }}>
                            {custResults.map(c => (
                              <div key={c.id}
                                onMouseDown={() => selectCustomer(c)}
                                style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14 }}
                                onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                                <div style={{ fontWeight: 500, color: "#111827" }}>{`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—"}</div>
                                {c.email && <div style={{ fontSize: 12, color: "#9CA3AF" }}>{c.email}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Salesperson */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>Salesperson</label>
                    <select
                      value={sellForm.staff_id}
                      onChange={e => setSellForm(f => ({ ...f, staff_id: e.target.value }))}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, background: "#fff" }}>
                      <option value="">— None —</option>
                      {staffList.map(s => (
                        <option key={s.id} value={s.id}>{s.full_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>Notes</label>
                    <input
                      type="text"
                      value={sellForm.notes}
                      onChange={e => setSellForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Optional — order ref, special instructions…"
                      style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14 }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
                  <button onClick={() => setShowSell(false)}
                    style={{ flex: 1, padding: "11px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={handleSell} disabled={sellSaving}
                    style={{ flex: 1, padding: "11px", borderRadius: 8, border: "none", background: "#10B981", color: "#fff", fontSize: 14, fontWeight: 600, cursor: sellSaving ? "not-allowed" : "pointer", opacity: sellSaving ? 0.7 : 1 }}>
                    {sellSaving ? "Recording…" : "Confirm Sale"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
