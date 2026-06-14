"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { InventoryPiece, InventoryReferenceData } from "@/lib/types";
import { ArrowLeft, Edit2, Save, X, ArrowRight } from "lucide-react";

type Params = { params: { id: string } };

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

export default function InventoryItemPage({ params }: Params) {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const tenantId: string = (user as any)?.tenant_id ?? "";
  const isManager = hydrated ? canManage(user?.role) : false;

  const [piece, setPiece]     = useState<InventoryPiece | null>(null);
  const [ref, setRef]         = useState<InventoryReferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState<Partial<InventoryPiece>>({});
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const [showMove, setShowMove]     = useState(false);
  const [moveForm, setMoveForm]     = useState({ to_location_id: "", to_status_id: "", notes: "" });
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError]   = useState("");

  const [movements, setMovements] = useState<any[]>([]);

  const headers = { "x-tenant-id": tenantId };

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [pieceRes, refRes, movRes] = await Promise.all([
      fetch(`/api/inventory/pieces/${params.id}`, { headers }),
      fetch("/api/inventory/reference", { headers }),
      fetch(`/api/inventory/movements?piece_id=${params.id}&limit=20`, { headers }),
    ]);
    if (!pieceRes.ok) { setLoading(false); return; }
    const [pieceJson, refJson, movJson] = await Promise.all([
      pieceRes.json(), refRes.json(), movRes.json(),
    ]);
    setPiece(pieceJson.piece);
    setRef(refJson);
    setMovements(movJson.movements ?? []);
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

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 900, margin: "0 auto" }}>

      {/* Back */}
      <button
        onClick={() => router.push("/inventory")}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: 14, marginBottom: 20, padding: 0 }}
      >
        <ArrowLeft size={16} /> Stock Register
      </button>

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

      <SectionWrap title="Pricing & Valuation">
        <EF label="Cost Price" field="cost_price" type="number" />
        <EF label="Retail Price" field="retail_price" type="number" />
        <EF label="Valuation Number" field="valuation_number" />
        <EF label="Valuation Amount" field="valuation_amount" type="number" />
      </SectionWrap>

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
