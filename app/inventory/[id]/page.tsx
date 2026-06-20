"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { InventoryPiece, InventoryReferenceData } from "@/lib/types";
import { calculateLivePricing, GoldRate, MarginBracket } from "@/lib/inventoryPricing";
import { ArrowLeft, Edit2, Save, X, ArrowRight, Lock, AlertTriangle, TrendingDown, Link2 } from "lucide-react";

type Params = { params: { id: string } };

const fmt = (n: number | null | undefined) =>
  n != null ? `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const fmtPct = (n: number | null | undefined) =>
  n != null ? `${Number(n).toFixed(1)}%` : "—";

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

function SectionWrap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 24, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 16px", fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{title}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>{children}</div>
    </div>
  );
}

function GpChip({ gp, pct }: { gp: number | null; pct: number | null }) {
  if (gp == null) return <span style={{ color: "#9CA3AF", fontSize: 13 }}>—</span>;
  const pctVal = pct ?? 0;
  const colour = pctVal >= 40 ? "#10B981" : pctVal >= 20 ? "#F59E0B" : "#EF4444";
  return (
    <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 600, color: colour }}>
      {fmt(gp)} <span style={{ fontSize: 12, fontWeight: 400 }}>({fmtPct(pct)})</span>
    </span>
  );
}

function LineItem({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", fontSize: 13 }}>
      <span style={{ color: "#6B7280" }}>{label}{sub && <span style={{ color: "#9CA3AF", marginLeft: 4, fontSize: 12 }}>{sub}</span>}</span>
      <span style={{ fontFamily: "monospace", fontWeight: 500, color: "#374151" }}>{value}</span>
    </div>
  );
}

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

  const [goldRates, setGoldRates]         = useState<GoldRate[]>([]);
  const [marginBrackets, setMarginBrackets] = useState<MarginBracket[]>([]);

  const [showMove, setShowMove]     = useState(false);
  const [moveForm, setMoveForm]     = useState({ to_location_id: "", to_status_id: "", notes: "" });
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError]   = useState("");

  const [movements, setMovements] = useState<any[]>([]);

  // Product link state
  const [products, setProducts]             = useState<any[]>([]);
  const [productVariants, setProductVariants] = useState<any[]>([]);
  const [linkEditing, setLinkEditing]       = useState(false);
  const [linkProductId, setLinkProductId]   = useState("");
  const [linkVariantId, setLinkVariantId]   = useState("");
  const [linkSaving, setLinkSaving]         = useState(false);
  const [linkError, setLinkError]           = useState("");

  const headers = { "x-tenant-id": tenantId };

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [pieceRes, refRes, movRes, pricingRes, prodRes] = await Promise.all([
      fetch(`/api/inventory/pieces/${params.id}`, { headers }),
      fetch("/api/inventory/reference", { headers }),
      fetch(`/api/inventory/movements?piece_id=${params.id}&limit=20`, { headers }),
      fetch("/api/pricing", { headers }),
      fetch("/api/inventory/products", { headers }),
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
    if (prodRes.ok) {
      const pj = await prodRes.json();
      setProducts(pj.products ?? []);
    }
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

  async function loadProductVariants(productId: string) {
    if (!productId) { setProductVariants([]); return; }
    const res = await fetch(`/api/inventory/variants?product_id=${productId}`, { headers });
    if (res.ok) setProductVariants((await res.json()).variants ?? []);
  }

  async function handleSaveLink() {
    if (!piece) return;
    setLinkSaving(true);
    setLinkError("");
    const payload: any = {
      product_id: linkProductId || null,
      variant_id: linkVariantId || null,
    };
    // Auto-fill empty fields from selected variant
    if (linkVariantId) {
      const v = productVariants.find((x: any) => x.id === linkVariantId);
      if (v) {
        if (!piece.metal_type   && v.metal_type)   payload.metal_type   = v.metal_type;
        if (!piece.metal_karat  && v.metal_karat)  payload.metal_karat  = v.metal_karat;
        if (!piece.metal_colour && v.metal_colour) payload.metal_colour = v.metal_colour;
        if (!piece.finger_size  && v.finger_size)  payload.finger_size  = v.finger_size;
        if (!piece.diamond_type && v.diamond_type) payload.diamond_type = v.diamond_type;
        if (!piece.diamond_carat && v.diamond_carat) payload.diamond_carat = v.diamond_carat;
        if (!piece.diamond_colour && v.diamond_colour) payload.diamond_colour = v.diamond_colour;
        if (!piece.diamond_clarity && v.diamond_clarity) payload.diamond_clarity = v.diamond_clarity;
      }
    }
    const res = await fetch(`/api/inventory/pieces/${piece.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setLinkSaving(false);
    if (!res.ok) { setLinkError(json.error ?? "Save failed"); return; }
    setPiece(json.piece);
    setLinkEditing(false);
  }

  function fv(key: keyof InventoryPiece): any {
    return editing ? (form[key] ?? "") : (piece?.[key] ?? "");
  }
  function setFv(key: keyof InventoryPiece, val: any) {
    setForm(f => ({ ...f, [key]: val === "" ? null : val }));
  }

  function EF({ label, field, type = "text", opts }: {
    label: string;
    field: keyof InventoryPiece;
    type?: string;
    opts?: { value: string; label: string }[];
  }) {
    if (!editing) {
      const raw = piece?.[field];
      return <FieldView label={label} value={raw as any} />;
    }
    if (opts) {
      return (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 3 }}>{label}</div>
          <select
            value={String(fv(field))}
            onChange={e => setFv(field, e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, background: "#fff" }}
          >
            <option value="">—</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 3 }}>{label}</div>
        <input
          type={type}
          value={String(fv(field))}
          onChange={e => setFv(field, e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14 }}
        />
      </div>
    );
  }

  if (!hydrated || loading) {
    return <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading…</div>;
  }

  if (!piece) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <p style={{ color: "#6B7280" }}>Item not found.</p>
        <button onClick={() => router.push("/inventory")} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 14 }}>
          Back to inventory
        </button>
      </div>
    );
  }

  const statusColour = piece.status?.colour ?? "#9CA3AF";

  // Compute live pricing (manager view only)
  const lp = isManager
    ? calculateLivePricing(piece, goldRates, marginBrackets)
    : null;

  // Underpriced warning: actual retail > 10% below live retail
  const underpriced = lp?.liveRetail != null && piece.retail_price != null
    && piece.retail_price < lp.liveRetail * 0.9;

  const gpColour = (pct: number | null | undefined) => {
    if (pct == null) return "#9CA3AF";
    if (pct >= 40) return "#10B981";
    if (pct >= 20) return "#F59E0B";
    return "#EF4444";
  };

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 900, margin: "0 auto" }}>

      {/* Back */}
      <button
        onClick={() => router.push("/inventory")}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: 14, marginBottom: 20, padding: 0 }}
      >
        <ArrowLeft size={16} /> Stock Register
      </button>

      {/* Product Link */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link2 size={14} style={{ color: "#9CA3AF" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Product Link</span>
          </div>
          {isManager && !linkEditing && (
            <button
              onClick={() => {
                setLinkProductId(piece.product_id ?? "");
                setLinkVariantId(piece.variant_id ?? "");
                setLinkError("");
                if (piece.product_id) loadProductVariants(piece.product_id);
                setLinkEditing(true);
              }}
              style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", fontSize: 12, cursor: "pointer", color: "#374151" }}
            >Edit</button>
          )}
        </div>

        {!linkEditing ? (
          <div style={{ marginTop: 10, display: "flex", gap: 24 }}>
            {piece.product_id ? (
              <>
                <div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 2 }}>Product</div>
                  <button
                    onClick={() => router.push(`/inventory/products/${piece.product_id}`)}
                    style={{ fontSize: 14, fontWeight: 600, color: "#635BFF", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    {products.find((p: any) => p.id === piece.product_id)?.title ?? piece.product_id}
                  </button>
                </div>
                {piece.variant_id && (
                  <div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 2 }}>Variant</div>
                    <div style={{ fontSize: 14, color: "#374151" }}>
                      {(() => {
                        const v = productVariants.find((x: any) => x.id === piece.variant_id);
                        return v?.title ?? [v?.metal_karat, v?.metal_colour, v?.metal_type].filter(Boolean).join(" ") ?? piece.variant_id;
                      })()}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#9CA3AF" }}>Not linked to any product</div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {linkError && <div style={{ padding: "8px 12px", background: "#FEF2F2", color: "#DC2626", borderRadius: 6, fontSize: 12, marginBottom: 10 }}>{linkError}</div>}
            <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Product</div>
                <select
                  value={linkProductId}
                  onChange={e => {
                    setLinkProductId(e.target.value);
                    setLinkVariantId("");
                    loadProductVariants(e.target.value);
                  }}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, background: "#fff" }}
                >
                  <option value="">— None —</option>
                  {products.map((p: any) => <option key={p.id} value={p.id}>{p.title ?? p.name}</option>)}
                </select>
              </div>
              {linkProductId && productVariants.length > 0 && (
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Variant</div>
                  <select
                    value={linkVariantId}
                    onChange={e => setLinkVariantId(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, background: "#fff" }}
                  >
                    <option value="">— None —</option>
                    {productVariants.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {v.title ?? ([v.metal_karat, v.metal_colour, v.metal_type, v.finger_size && `Size ${v.finger_size}`].filter(Boolean).join(" ") || v.id)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {linkVariantId && (
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, padding: "8px 12px", background: "#F0FDF4", borderRadius: 6, border: "1px solid #BBF7D0" }}>
                Any empty spec fields (metal, stone, size) will be auto-filled from the selected variant.
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setLinkEditing(false)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSaveLink} disabled={linkSaving} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 13, fontWeight: 500, cursor: linkSaving ? "not-allowed" : "pointer", opacity: linkSaving ? 0.7 : 1 }}>
                {linkSaving ? "Saving…" : "Save Link"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Title bar */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#111827" }}>{piece.sku}</span>
            {piece.status && (
              <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500, background: statusColour + "22", color: statusColour, border: `1px solid ${statusColour}44` }}>
                {piece.status.name}
              </span>
            )}
          </div>
          {piece.title && <div style={{ fontSize: 16, color: "#374151" }}>{piece.title}</div>}
          <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>
            {piece.category?.name ? `${piece.category.name} · ` : ""}
            {piece.location?.name ?? "No location"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {isManager && !editing && (
            <>
              <button
                onClick={() => setShowMove(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer", color: "#374151" }}
              >
                <ArrowRight size={14} /> Move
              </button>
              <button
                onClick={startEdit}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer", color: "#374151" }}
              >
                <Edit2 size={14} /> Edit
              </button>
            </>
          )}
          {editing && (
            <>
              <button
                onClick={() => setEditing(false)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer", color: "#374151" }}
              >
                <X size={14} /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
              >
                <Save size={14} /> {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <SectionWrap title="Identity">
        <EF label="SKU" field="sku" />
        <EF label="Title" field="title" />
        <EF label="Category" field="category_id" opts={ref?.categories.map(c => ({ value: c.id, label: c.name })) ?? []} />
        <EF label="Collection" field="collection" />
        <EF label="Status" field="status_id" opts={ref?.statuses.map(s => ({ value: s.id, label: s.name })) ?? []} />
        <EF label="Location" field="location_id" opts={ref?.locations.map(l => ({ value: l.id, label: l.name })) ?? []} />
        <EF label="Supplier" field="supplier_id" opts={ref?.suppliers.map(s => ({ value: s.id, label: s.name })) ?? []} />
        <EF label="Assigned To" field="assigned_to" />
      </SectionWrap>

      <SectionWrap title="Metal">
        <EF label="Metal Type" field="metal_type" />
        <EF label="Karat" field="metal_karat" />
        <EF label="Colour" field="metal_colour" />
        <EF label="Weight (g)" field="metal_weight_grams" type="number" />
      </SectionWrap>

      <SectionWrap title="Diamond">
        <EF label="Diamond Type" field="diamond_type" />
        <EF label="Carat" field="diamond_carat" type="number" />
        <EF label="Colour" field="diamond_colour" />
        <EF label="Clarity" field="diamond_clarity" />
        <EF label="Certificate" field="diamond_certificate" />
      </SectionWrap>

      <SectionWrap title="Specifications">
        <EF label="Finger Size" field="finger_size" />
        <EF label="Chain Length" field="chain_length" />
        <EF label="Dimensions" field="dimensions" />
      </SectionWrap>

      {/* ── Melee Stones ── */}
      {(editing || (piece.melee_quantity != null && piece.melee_quantity > 0)) && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
            Melee Stones (under 0.30ct)
          </h3>
          {!editing ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
              <FieldView label="Quantity" value={piece.melee_quantity} />
              <FieldView label="ct / stone" value={piece.melee_carat_weight} />
              <FieldView label="Colour Group" value={piece.melee_colour_group} />
              <FieldView label="Clarity" value={piece.melee_clarity} />
              {piece.melee_quantity != null && piece.melee_carat_weight != null && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 3 }}>Total Melee</div>
                  <div style={{ fontSize: 14, color: "#111827" }}>
                    {(Number(piece.melee_quantity) * Number(piece.melee_carat_weight)).toFixed(3)}ct
                    <span style={{ color: "#9CA3AF", marginLeft: 6, fontSize: 13 }}>
                      ({piece.melee_quantity} × {piece.melee_carat_weight}ct)
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
              <EF label="Quantity" field={"melee_quantity" as keyof InventoryPiece} type="number" />
              <EF label="ct / stone" field={"melee_carat_weight" as keyof InventoryPiece} type="number" />
              <EF
                label="Colour Group"
                field={"melee_colour_group" as keyof InventoryPiece}
                opts={["D-F", "G-H", "I-J", "K-L", "M-N"].map(g => ({ value: g, label: g }))}
              />
              <EF
                label="Clarity"
                field={"melee_clarity" as keyof InventoryPiece}
                opts={["VVS", "VS", "SI1", "SI2", "SI3", "I1", "I2", "I3"].map(c => ({ value: c, label: c }))}
              />
              {(form.melee_quantity as number) > 0 && (form.melee_carat_weight as number) > 0 && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 3 }}>Total Melee</div>
                  <div style={{ fontSize: 14, color: "#111827" }}>
                    {(Number(form.melee_quantity) * Number(form.melee_carat_weight)).toFixed(3)}ct
                    <span style={{ color: "#9CA3AF", marginLeft: 6, fontSize: 13 }}>
                      ({form.melee_quantity} × {form.melee_carat_weight}ct)
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Pricing & Valuation — manager only ── */}
      {isManager && (
        <>
          {/* Edit mode: all cost inputs */}
          {editing && (
            <SectionWrap title="Pricing & Certificate">
              <EF label="Locked cost (actual cost paid)" field="locked_cost" type="number" />
              <EF label="Stone cost" field="stone_cost" type="number" />
              <EF label="Labour cost" field="labour_cost" type="number" />
              <EF label="Retail Price" field="retail_price" type="number" />
              <EF label="Cost Price" field="cost_price" type="number" />
              <EF label="Certificate Number" field="valuation_number" />
              <EF label="Certificate Amount" field="valuation_amount" type="number" />
            </SectionWrap>
          )}

          {/* View mode: live pricing panels */}
          {!editing && (
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 24, marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 20px", fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Pricing &amp; Certificate
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

                {/* Panel A — Actual Cost (locked) */}
                <div style={{ background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 10, padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                    <Lock size={13} style={{ color: "#6B7280" }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Actual Cost</span>
                  </div>

                  {piece.locked_cost == null ? (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, marginBottom: 12 }}>
                      <AlertTriangle size={14} style={{ color: "#D97706", marginTop: 1, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#92400E", lineHeight: 1.4 }}>No locked cost recorded — gross profit unavailable</span>
                    </div>
                  ) : (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 3 }}>Locked cost</div>
                      <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#111827" }}>{fmt(piece.locked_cost)}</div>
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>Recorded at time of entry — never changes</div>
                    </div>
                  )}

                  <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 12 }}>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Retail Price</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#374151" }}>{fmt(piece.retail_price)}</div>
                  </div>

                  {lp?.lockedGrossProfit != null && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Locked gross profit</div>
                      <GpChip gp={lp.lockedGrossProfit} pct={lp.lockedGrossProfitPct} />
                    </div>
                  )}
                </div>

                {/* Panel B — Live Pricing */}
                <div style={{ background: "#FAFAFA", border: "1px solid #E5E7EB", borderRadius: 10, padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Live Pricing</span>
                    <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 400 }}>(auto-calculated)</span>
                  </div>

                  {lp == null || lp.liveCost == null ? (
                    <div style={{ fontSize: 13, color: "#9CA3AF" }}>
                      Set metal weight, stone cost, or labour cost to see live pricing.
                    </div>
                  ) : (
                    <>
                      {/* Cost breakdown */}
                      <div style={{ borderBottom: "1px solid #E5E7EB", paddingBottom: 10, marginBottom: 10 }}>
                        {lp.liveCostBreakdown.metalCost != null ? (
                          <LineItem
                            label="Metal"
                            value={fmt(lp.liveCostBreakdown.metalCost)}
                            sub={
                              lp.liveCostBreakdown.goldRatePerGram != null
                                ? `${piece.metal_weight_grams}g × $${Number(lp.liveCostBreakdown.goldRatePerGram).toFixed(2)}/g`
                                : piece.metal_weight_grams ? `${piece.metal_weight_grams}g — rate not found` : undefined
                            }
                          />
                        ) : (
                          <LineItem label="Metal" value="—" sub="weight not set" />
                        )}
                        <LineItem
                          label="Stones"
                          value={lp.liveCostBreakdown.stoneCost != null ? fmt(lp.liveCostBreakdown.stoneCost) : "—"}
                        />
                        <LineItem
                          label="Labour"
                          value={lp.liveCostBreakdown.labourCost != null ? fmt(lp.liveCostBreakdown.labourCost) : "—"}
                        />
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.04em" }}>Live cost</span>
                        <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#111827" }}>{fmt(lp.liveCost)}</span>
                      </div>

                      {lp.liveRetail != null && (
                        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 10, marginBottom: 12 }}>
                          <LineItem
                            label="Live retail (suggested)"
                            value={fmt(lp.liveRetail)}
                            sub={lp.liveMarginMultiplier != null ? `×${Number(lp.liveMarginMultiplier).toFixed(3)} margin` : undefined}
                          />
                          <LineItem label="Actual retail" value={fmt(piece.retail_price)} />

                          {underpriced && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, padding: "7px 10px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 7 }}>
                              <TrendingDown size={13} style={{ color: "#DC2626", flexShrink: 0 }} />
                              <span style={{ fontSize: 12, color: "#DC2626", fontWeight: 500 }}>Retail may be underpriced</span>
                            </div>
                          )}
                        </div>
                      )}

                      {lp.liveGrossProfit != null && (
                        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 10 }}>
                          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Live gross profit</div>
                          <GpChip gp={lp.liveGrossProfit} pct={lp.liveGrossProfitPct} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Valuation — below panels */}
              {(piece.valuation_number || piece.valuation_amount) && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #E5E7EB", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" }}>
                  <FieldView label="Certificate Number" value={piece.valuation_number} />
                  <FieldView label="Certificate Amount" value={piece.valuation_amount} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      <SectionWrap title="Dates">
        <EF label="Date Received" field="date_received" type="date" />
        <EF label="Date Sold" field="date_sold" type="date" />
      </SectionWrap>

      {/* Notes */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Notes</h3>
        {editing ? (
          <textarea
            value={String(fv("notes"))}
            onChange={e => setFv("notes", e.target.value)}
            rows={4}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, resize: "vertical" }}
          />
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: piece.notes ? "#374151" : "#D1D5DB", lineHeight: 1.6 }}>{piece.notes ?? "—"}</p>
        )}
      </div>

      {/* Movement history */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Movement History</h3>
        {movements.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF" }}>No movements recorded.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {movements.map((m: any) => (
              <div key={m.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 13 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#635BFF", marginTop: 4, flexShrink: 0 }} />
                <div>
                  <div style={{ color: "#374151" }}>
                    {m.from_location?.name && m.to_location?.name
                      ? `${m.from_location.name} → ${m.to_location.name}`
                      : m.to_location?.name
                      ? `Moved to ${m.to_location.name}`
                      : m.from_status?.name && m.to_status?.name
                      ? `${m.from_status.name} → ${m.to_status.name}`
                      : "Movement logged"}
                  </div>
                  {m.notes && <div style={{ color: "#6B7280", fontSize: 12, marginTop: 1 }}>{m.notes}</div>}
                  <div style={{ color: "#9CA3AF", fontSize: 11, marginTop: 2 }}>
                    {m.moved_by ? `${m.moved_by} · ` : ""}
                    {new Date(m.moved_at).toLocaleDateString("en-AU")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete */}
      {isManager && !editing && (
        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 16 }}>
          <button
            onClick={handleDelete}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 14, cursor: "pointer" }}
          >
            Delete Item
          </button>
        </div>
      )}

      {/* Move Modal */}
      {showMove && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>Move Item</h2>
              <button onClick={() => setShowMove(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={20} /></button>
            </div>
            {moveError && <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{moveError}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>New Location</label>
                <select
                  value={moveForm.to_location_id}
                  onChange={e => setMoveForm(f => ({ ...f, to_location_id: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, background: "#fff" }}
                >
                  <option value="">— Keep current —</option>
                  {ref?.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>New Status</label>
                <select
                  value={moveForm.to_status_id}
                  onChange={e => setMoveForm(f => ({ ...f, to_status_id: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, background: "#fff" }}
                >
                  <option value="">— Keep current —</option>
                  {ref?.statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>Notes</label>
                <input
                  value={moveForm.notes}
                  onChange={e => setMoveForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional reason…"
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14 }}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button onClick={() => setShowMove(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button
                onClick={handleMove}
                disabled={moveSaving}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: moveSaving ? "not-allowed" : "pointer", opacity: moveSaving ? 0.7 : 1 }}
              >
                {moveSaving ? "Saving…" : "Log Movement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
