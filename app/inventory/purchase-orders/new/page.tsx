"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { InventoryReferenceData } from "@/lib/types";
import { ArrowLeft, Plus, X, Sparkles, Loader } from "lucide-react";

interface PoLine {
  _id: string; // local only
  title: string;
  category_id: string;
  metal_type: string;
  metal_karat: string;
  metal_colour: string;
  stone_type: string;
  stone_carat: string;
  stone_colour: string;
  stone_clarity: string;
  finger_size: string;
  quantity: string;
  estimated_cost: string;
  notes: string;
  // AI state
  aiDesc: string;
  aiLoading: boolean;
}

function blankLine(): PoLine {
  return {
    _id: crypto.randomUUID(),
    title: "", category_id: "", metal_type: "", metal_karat: "", metal_colour: "",
    stone_type: "", stone_carat: "", stone_colour: "", stone_clarity: "",
    finger_size: "", quantity: "1", estimated_cost: "", notes: "",
    aiDesc: "", aiLoading: false,
  };
}

const LF = { fontSize: 13, fontWeight: 500 as const, color: "#374151", display: "block" as const, marginBottom: 3 };
const IF = { width: "100%", boxSizing: "border-box" as const, padding: "7px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13 };

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const tenantId: string = user?.tenantId ?? "";

  const [ref, setRef]             = useState<InventoryReferenceData | null>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [poNumber, setPoNumber]         = useState("");
  const [supplierId, setSupplierId]     = useState("");
  const [supplierName, setSupplierName] = useState(""); // free-text fallback
  const [orderDate, setOrderDate]       = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes]               = useState("");
  const [lines, setLines]               = useState<PoLine[]>([blankLine()]);

  const [saving, setSaving]     = useState(false);
  const [saveAs, setSaveAs]     = useState<"draft" | "ordered">("draft");
  const [error, setError]       = useState("");

  const headers = { "x-tenant-id": tenantId };

  const fetchRef = useCallback(async () => {
    if (!tenantId) return;
    const res = await fetch("/api/inventory/reference", { headers });
    if (res.ok) {
      const json = await res.json();
      setRef(json);
      setSuppliers(json.suppliers ?? []);
    }
  }, [tenantId]);

  useEffect(() => { fetchRef(); }, [fetchRef]);

  function updateLine(id: string, patch: Partial<PoLine>) {
    setLines(ls => ls.map(l => l._id === id ? { ...l, ...patch } : l));
  }

  function removeLine(id: string) {
    setLines(ls => ls.filter(l => l._id !== id));
  }

  async function parseLineWithAI(id: string) {
    const line = lines.find(l => l._id === id);
    if (!line || !line.aiDesc.trim()) return;
    updateLine(id, { aiLoading: true });

    const res = await fetch("/api/inventory/ai-parse", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ description: line.aiDesc }),
    });

    updateLine(id, { aiLoading: false });
    if (!res.ok) return;
    const json = await res.json();
    const f = json.fields ?? {};

    const patch: Partial<PoLine> = {};
    if (f.title          && !line.title)        patch.title        = f.title;
    if (f.metal_type     && !line.metal_type)    patch.metal_type   = f.metal_type;
    if (f.metal_karat    && !line.metal_karat)   patch.metal_karat  = f.metal_karat;
    if (f.metal_colour   && !line.metal_colour)  patch.metal_colour = f.metal_colour;
    if (f.diamond_type   && !line.stone_type)    patch.stone_type   = f.diamond_type;
    if (f.diamond_carat  && !line.stone_carat)   patch.stone_carat  = String(f.diamond_carat);
    if (f.diamond_colour && !line.stone_colour)  patch.stone_colour = f.diamond_colour;
    if (f.diamond_clarity && !line.stone_clarity) patch.stone_clarity = f.diamond_clarity;
    if (f.finger_size    && !line.finger_size)   patch.finger_size  = f.finger_size;
    if (f.notes          && !line.notes)         patch.notes        = f.notes;
    updateLine(id, patch);
  }

  async function handleSave(status: "draft" | "ordered") {
    setSaving(true);
    setSaveAs(status);
    setError("");

    const payload = {
      po_number:     poNumber || undefined,
      supplier_id:   supplierId || null,
      supplier_name: supplierId ? null : (supplierName || null),
      order_date:    orderDate || null,
      expected_date: expectedDate || null,
      notes:         notes || null,
      status,
      lines: lines.map(l => ({
        title:       l.title      || null,
        category_id: l.category_id || null,
        metal_type:  l.metal_type  || null,
        metal_karat: l.metal_karat || null,
        metal_colour: l.metal_colour || null,
        stone_type:  l.stone_type  || null,
        stone_carat: l.stone_carat ? parseFloat(l.stone_carat) : null,
        stone_colour:    l.stone_colour    || null,
        stone_clarity:   l.stone_clarity   || null,
        finger_size:     l.finger_size     || null,
        quantity:        parseInt(l.quantity) || 1,
        estimated_cost:  l.estimated_cost ? parseFloat(l.estimated_cost) : null,
        notes:           l.notes || null,
      })),
    };

    const res = await fetch("/api/inventory/purchase-orders", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Failed to save"); return; }
    router.push(`/inventory/purchase-orders/${json.purchase_order.id}`);
  }

  if (!hydrated) return null;

  return (
    <div style={{ padding: "32px 32px 80px", maxWidth: 900, margin: "0 auto" }}>
      {/* Back */}
      <button
        onClick={() => router.push("/inventory/purchase-orders")}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: 14, marginBottom: 20, padding: 0 }}
      >
        <ArrowLeft size={16} /> Purchase Orders
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: "0 0 24px" }}>New Purchase Order</h1>

      {error && <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {/* PO Header */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Order Details</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 24px" }}>
          <div>
            <label style={LF}>PO Number</label>
            <input
              value={poNumber}
              onChange={e => setPoNumber(e.target.value)}
              placeholder="Auto-generated if left blank"
              style={IF}
            />
          </div>
          <div>
            <label style={LF}>Supplier</label>
            <select
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              style={{ ...IF, background: "#fff" }}
            >
              <option value="">— Select supplier or enter below —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {!supplierId && (
            <div>
              <label style={LF}>Supplier Name (informal)</label>
              <input
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                placeholder="e.g. Argyle Diamonds"
                style={IF}
              />
            </div>
          )}
          <div>
            <label style={LF}>Order Date</label>
            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} style={IF} />
          </div>
          <div>
            <label style={LF}>Expected Delivery</label>
            <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} style={IF} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LF}>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{ ...IF, resize: "vertical" }}
            />
          </div>
        </div>
      </div>

      {/* Lines */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Line Items ({lines.length})
          </h3>
          <button
            onClick={() => setLines(ls => [...ls, blankLine()])}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px dashed #D1D5DB", background: "#F9FAFB", color: "#6B7280", fontSize: 13, cursor: "pointer" }}
          >
            <Plus size={13} /> Add line item
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {lines.map((line, idx) => (
            <div key={line._id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Item {idx + 1}</span>
                {lines.length > 1 && (
                  <button onClick={() => removeLine(line._id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}>
                    <X size={15} />
                  </button>
                )}
              </div>

              {/* AI parse row */}
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <input
                    value={line.aiDesc}
                    onChange={e => updateLine(line._id, { aiDesc: e.target.value })}
                    placeholder="Describe the item for AI to fill the fields…"
                    style={{ ...IF, paddingRight: 120 }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); parseLineWithAI(line._id); } }}
                  />
                </div>
                <button
                  onClick={() => parseLineWithAI(line._id)}
                  disabled={line.aiLoading || !line.aiDesc.trim()}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                    background: "#635BFF", color: "#fff", border: "none",
                    cursor: line.aiLoading || !line.aiDesc.trim() ? "not-allowed" : "pointer",
                    opacity: !line.aiDesc.trim() ? 0.5 : 1, whiteSpace: "nowrap",
                  }}
                >
                  {line.aiLoading ? <Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} />}
                  Parse with AI
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 16px" }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={LF}>Title</label>
                  <input value={line.title} onChange={e => updateLine(line._id, { title: e.target.value })} placeholder="e.g. Round Brilliant Diamond Ring" style={IF} />
                </div>
                <div>
                  <label style={LF}>Category</label>
                  <select value={line.category_id} onChange={e => updateLine(line._id, { category_id: e.target.value })} style={{ ...IF, background: "#fff" }}>
                    <option value="">—</option>
                    {ref?.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LF}>Metal Type</label>
                  <input value={line.metal_type} onChange={e => updateLine(line._id, { metal_type: e.target.value })} placeholder="e.g. Yellow Gold" style={IF} />
                </div>
                <div>
                  <label style={LF}>Carat</label>
                  <input value={line.metal_karat} onChange={e => updateLine(line._id, { metal_karat: e.target.value })} placeholder="e.g. 18ct" style={IF} />
                </div>
                <div>
                  <label style={LF}>Metal Colour</label>
                  <input value={line.metal_colour} onChange={e => updateLine(line._id, { metal_colour: e.target.value })} placeholder="e.g. Yellow" style={IF} />
                </div>
                <div>
                  <label style={LF}>Stone Type</label>
                  <input value={line.stone_type} onChange={e => updateLine(line._id, { stone_type: e.target.value })} placeholder="e.g. Natural" style={IF} />
                </div>
                <div>
                  <label style={LF}>Stone Carat</label>
                  <input type="number" step="0.01" value={line.stone_carat} onChange={e => updateLine(line._id, { stone_carat: e.target.value })} placeholder="e.g. 0.50" style={IF} />
                </div>
                <div>
                  <label style={LF}>Stone Colour</label>
                  <input value={line.stone_colour} onChange={e => updateLine(line._id, { stone_colour: e.target.value })} placeholder="e.g. G" style={IF} />
                </div>
                <div>
                  <label style={LF}>Stone Clarity</label>
                  <input value={line.stone_clarity} onChange={e => updateLine(line._id, { stone_clarity: e.target.value })} placeholder="e.g. VS1" style={IF} />
                </div>
                <div>
                  <label style={LF}>Finger Size</label>
                  <input value={line.finger_size} onChange={e => updateLine(line._id, { finger_size: e.target.value })} placeholder="e.g. N" style={IF} />
                </div>
                <div>
                  <label style={LF}>Qty</label>
                  <input type="number" min="1" value={line.quantity} onChange={e => updateLine(line._id, { quantity: e.target.value })} style={IF} />
                </div>
                <div>
                  <label style={LF}>Estimated Cost ($)</label>
                  <input type="number" step="0.01" value={line.estimated_cost} onChange={e => updateLine(line._id, { estimated_cost: e.target.value })} placeholder="0.00" style={IF} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={LF}>Notes</label>
                  <input value={line.notes} onChange={e => updateLine(line._id, { notes: e.target.value })} placeholder="Optional…" style={IF} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button
          onClick={() => router.push("/inventory/purchase-orders")}
          style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer", color: "#374151" }}
        >
          Cancel
        </button>
        <button
          onClick={() => handleSave("draft")}
          disabled={saving}
          style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#F9FAFB", fontSize: 14, cursor: saving && saveAs === "draft" ? "not-allowed" : "pointer", color: "#374151", opacity: saving && saveAs === "draft" ? 0.7 : 1 }}
        >
          {saving && saveAs === "draft" ? "Saving…" : "Save as Draft"}
        </button>
        <button
          onClick={() => handleSave("ordered")}
          disabled={saving}
          style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: saving && saveAs === "ordered" ? "not-allowed" : "pointer", opacity: saving && saveAs === "ordered" ? 0.7 : 1 }}
        >
          {saving && saveAs === "ordered" ? "Saving…" : "Save + Mark as Ordered"}
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
