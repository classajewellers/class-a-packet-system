"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { InventoryItem, InventoryItemType, InventoryLocation, InventorySupplier } from "@/lib/types";
import { calculateMultiplier, multiplierColour } from "@/lib/marginCalculator";
import { Plus, Search, X, ChevronDown, Upload, Download, AlertCircle, CheckCircle2 } from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtCurrency = (v: number | null | undefined) =>
  v != null ? `$${v.toFixed(2)}` : "—";

/** Build a flat ordered list of { id, label } for location dropdowns.
 *  Sub-locations appear as "Parent → Child", sorted under their parent. */
function buildLocationOptions(locations: InventoryLocation[]): { id: string; label: string }[] {
  const parents = locations.filter((l) => !l.parent_id);
  const childrenByParent = new Map<string, InventoryLocation[]>();
  for (const l of locations) {
    if (l.parent_id) {
      const arr = childrenByParent.get(l.parent_id) ?? [];
      arr.push(l);
      childrenByParent.set(l.parent_id, arr);
    }
  }
  // Include lone sub-locations whose parent isn't in the list (edge case)
  const placedChildIds = new Set<string>();
  const result: { id: string; label: string }[] = [];
  for (const parent of parents) {
    result.push({ id: parent.id, label: parent.name });
    for (const child of childrenByParent.get(parent.id) ?? []) {
      result.push({ id: child.id, label: `${parent.name} → ${child.name}` });
      placedChildIds.add(child.id);
    }
  }
  // Orphans
  for (const l of locations) {
    if (l.parent_id && !placedChildIds.has(l.id)) {
      result.push({ id: l.id, label: l.name });
    }
  }
  return result;
}

/** Lookup label for a single location id given the full locations list. */
function locationLabel(locationId: string | null | undefined, locations: InventoryLocation[]): string {
  if (!locationId) return "—";
  const loc = locations.find((l) => l.id === locationId);
  if (!loc) return "—";
  if (loc.parent_id) {
    const parent = locations.find((l) => l.id === loc.parent_id);
    return parent ? `${parent.name} → ${loc.name}` : loc.name;
  }
  return loc.name;
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  retail: "Retail",
  internal: "Internal",
};

const TYPE_BADGE_STYLE: Record<string, { background: string; color: string }> = {
  retail: { background: "#EEF2FF", color: "#4338CA" },
  internal: { background: "#F3F4F6", color: "#6B7280" },
};

// ─── Drawer ────────────────────────────────────────────────────────────────────
interface DrawerProps {
  item: InventoryItem | null;
  isNew: boolean;
  locations: InventoryLocation[];
  suppliers: InventorySupplier[];
  onClose: () => void;
  onSaved: () => void;
  isManager: boolean;
}

interface ItemFormState {
  sku: string; name: string; description: string;
  item_type: InventoryItemType;
  category: string; department: string; supplier_id: string; supplier_code: string;
  cost_price: string; retail_price: string; packaging_cost: string; landed_cost: string;
  reorder_point: string; metal_type: string; metal_weight_grams: string;
  location_id: string; shopify_synced: boolean; notes: string;
}

const BLANK_ITEM: ItemFormState = {
  sku: "", name: "", description: "", item_type: "retail",
  category: "", department: "", supplier_id: "", supplier_code: "",
  cost_price: "", retail_price: "", packaging_cost: "", landed_cost: "",
  reorder_point: "", metal_type: "", metal_weight_grams: "",
  location_id: "", shopify_synced: false, notes: "",
};

function ItemDrawer({ item, isNew, locations, suppliers, onClose, onSaved, isManager }: DrawerProps) {
  const [form, setForm] = useState<ItemFormState>({ ...BLANK_ITEM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (item) {
      setForm({
        sku: item.sku ?? "",
        name: item.name ?? "",
        description: item.description ?? "",
        item_type: item.item_type ?? "retail",
        category: item.category ?? "",
        department: item.department ?? "",
        supplier_id: item.supplier_id ?? "",
        supplier_code: item.supplier_code ?? "",
        cost_price: item.cost_price != null ? String(item.cost_price) : "",
        retail_price: item.retail_price != null ? String(item.retail_price) : "",
        packaging_cost: item.packaging_cost != null ? String(item.packaging_cost) : "",
        landed_cost: item.landed_cost != null ? String(item.landed_cost) : "",
        reorder_point: item.reorder_point != null ? String(item.reorder_point) : "",
        metal_type: item.metal_type ?? "",
        metal_weight_grams: item.metal_weight_grams != null ? String(item.metal_weight_grams) : "",
        location_id: item.location_id ?? "",
        shopify_synced: item.shopify_synced ?? false,
        notes: item.notes ?? "",
      });
    } else {
      setForm({ ...BLANK_ITEM });
    }
  }, [item]);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.sku.trim() || !form.name.trim()) { setError("SKU and Name are required."); return; }
    setSaving(true); setError("");
    const payload = {
      ...form,
      cost_price: form.cost_price !== "" ? parseFloat(form.cost_price) : null,
      retail_price: form.retail_price !== "" ? parseFloat(form.retail_price) : null,
      packaging_cost: form.packaging_cost !== "" ? parseFloat(form.packaging_cost) : null,
      landed_cost: form.landed_cost !== "" ? parseFloat(form.landed_cost) : null,
      reorder_point: form.reorder_point !== "" ? parseInt(form.reorder_point) : null,
      metal_weight_grams: form.metal_weight_grams !== "" ? parseFloat(form.metal_weight_grams) : null,
      supplier_id: form.supplier_id || null,
      location_id: form.location_id || null,
    };
    const url = isNew ? "/api/inventory/items" : `/api/inventory/items/${item!.id}`;
    const method = isNew ? "POST" : "PATCH";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json();
    setSaving(false);
    if (json.error) { setError(json.error); return; }
    onSaved();
  }

  async function handleDelete() {
    if (!item) return;
    if (!confirm("Delete this item? This cannot be undone.")) return;
    await fetch(`/api/inventory/items/${item.id}`, { method: "DELETE" });
    onSaved();
  }

  const costVal = parseFloat(form.cost_price) || 0;
  const retailVal = parseFloat(form.retail_price) || 0;
  const mult = calculateMultiplier(retailVal, costVal);
  const mColour = mult != null ? multiplierColour(mult) : null;
  const MULT_BADGE: Record<string, { bg: string; fg: string }> = {
    green: { bg: "#D1FAE5", fg: "#065F46" },
    orange: { bg: "#FEF3C7", fg: "#92400E" },
    red: { bg: "#FEE2E2", fg: "#991B1B" },
  };

  const inputStyle = {
    width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB",
    borderRadius: 6, fontSize: 13, color: "#1A1A2E", background: "#fff",
    boxSizing: "border-box" as const,
  };
  const labelStyle = { fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4, display: "block" as const };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.35)",
        display: "flex", justifyContent: "flex-end",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 480, height: "100%", background: "#fff",
          display: "flex", flexDirection: "column", overflowY: "auto",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#1A1A2E" }}>
            {isNew ? "New Item" : "Edit Item"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <div style={{ padding: "10px 12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 6, fontSize: 13 }}>{error}</div>}

          {/* SKU + Name */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>SKU *</label>
              <input style={inputStyle} value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="e.g. RNG-001" />
            </div>
            <div>
              <label style={labelStyle}>Name *</label>
              <input style={inputStyle} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Item name" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, height: 64, resize: "vertical" }} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Item description" />
          </div>

          {/* Type + Category + Department */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={form.item_type} onChange={(e) => set("item_type", e.target.value)}>
                <option value="retail">Retail</option>
                <option value="internal">Internal</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <input style={inputStyle} value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Rings" />
            </div>
            <div>
              <label style={labelStyle}>Department</label>
              <input style={inputStyle} value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Fine Jewellery" />
            </div>
          </div>

          {/* Supplier */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Supplier</label>
              <select style={inputStyle} value={form.supplier_id} onChange={(e) => set("supplier_id", e.target.value)}>
                <option value="">— None —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Supplier Code</label>
              <input style={inputStyle} value={form.supplier_code} onChange={(e) => set("supplier_code", e.target.value)} placeholder="Supplier ref" />
            </div>
          </div>

          {/* Pricing — manager only */}
          {isManager && (
            <>
              <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Pricing</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Cost Price</label>
                    <input style={inputStyle} type="number" step="0.01" value={form.cost_price} onChange={(e) => set("cost_price", e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <label style={labelStyle}>Retail Price</label>
                    <input style={inputStyle} type="number" step="0.01" value={form.retail_price} onChange={(e) => set("retail_price", e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <label style={labelStyle}>Packaging Cost</label>
                    <input style={inputStyle} type="number" step="0.01" value={form.packaging_cost} onChange={(e) => set("packaging_cost", e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <label style={labelStyle}>Landed Cost</label>
                    <input style={inputStyle} type="number" step="0.01" value={form.landed_cost} onChange={(e) => set("landed_cost", e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                {mult != null && mColour && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>Multiplier:</span>
                    <span style={{ ...MULT_BADGE[mColour], padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                      ×{mult.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Metal */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Metal Type</label>
              <input style={inputStyle} value={form.metal_type} onChange={(e) => set("metal_type", e.target.value)} placeholder="e.g. 18ct Yellow Gold" />
            </div>
            <div>
              <label style={labelStyle}>Metal Weight (g)</label>
              <input style={inputStyle} type="number" step="0.001" value={form.metal_weight_grams} onChange={(e) => set("metal_weight_grams", e.target.value)} placeholder="0.000" />
            </div>
          </div>

          {/* Location + Reorder */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Default Location</label>
              <select style={inputStyle} value={form.location_id} onChange={(e) => set("location_id", e.target.value)}>
                <option value="">— None —</option>
                {buildLocationOptions(locations).map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Reorder Point</label>
              <input style={inputStyle} type="number" value={form.reorder_point} onChange={(e) => set("reorder_point", e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* Shopify toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="shopify_synced" checked={form.shopify_synced} onChange={(e) => set("shopify_synced", e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
            <label htmlFor="shopify_synced" style={{ fontSize: 13, color: "#374151", cursor: "pointer" }}>Shopify synced</label>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, height: 64, resize: "vertical" }} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Internal notes" />
          </div>

          {/* TODO: wire up to quote builder — allow selecting stock items into quote line items */}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            {!isNew && isManager && (
              <button onClick={handleDelete} style={{ padding: "8px 14px", background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                Delete
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ padding: "8px 16px", background: "#F3F4F6", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#374151" }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: "8px 20px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Saving…" : isNew ? "Create Item" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

const CSV_TEMPLATE_HEADERS = [
  "sku", "name", "category", "department", "item_type",
  "supplier_code", "cost_price", "retail_price", "reorder_point", "notes",
];

function downloadTemplate() {
  const exampleRow = "RNG-001,Diamond Solitaire,Rings,Fine Jewellery,retail,SUP-001,2500.00,6500.00,2,18ct white gold";
  const blob = new Blob(
    [CSV_TEMPLATE_HEADERS.join(",") + "\n" + exampleRow],
    { type: "text/csv" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inventory_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/** Minimal CSV parser — handles quoted fields with commas inside. */
function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 1) return { headers: [], rows: [] };

  function splitLine(line: string): string[] {
    const cols: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
      cur += c;
    }
    cols.push(cur.trim());
    return cols;
  }

  const headers = splitLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = splitLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ""; });
    rows.push(row);
  }
  return { headers, rows };
}

// ─── CSV Import Modal ──────────────────────────────────────────────────────────

interface ImportResult {
  imported: number;
  failed: { row: number; reason: string }[];
}

interface CsvImportModalProps {
  onClose: () => void;
  onDone: () => void;
}

function CsvImportModal({ onClose, onDone }: CsvImportModalProps) {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileError, setFileError] = useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers: h, rows } = parseCSV(text);
      if (!h.includes("sku") || !h.includes("name")) {
        setFileError("CSV must include at least 'sku' and 'name' columns.");
        setCsvText(null); setHeaders([]); setPreview([]); setAllRows([]);
        return;
      }
      setCsvText(text);
      setHeaders(h);
      setAllRows(rows);
      setPreview(rows.slice(0, 5));
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!allRows.length) return;
    setImporting(true);
    let imported = 0;
    const failed: { row: number; reason: string }[] = [];

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      if (!row.sku?.trim() || !row.name?.trim()) {
        failed.push({ row: i + 2, reason: "Missing SKU or Name" });
        continue;
      }
      const payload = {
        sku: row.sku.trim(),
        name: row.name.trim(),
        category: row.category?.trim() || null,
        department: row.department?.trim() || null,
        item_type: row.item_type?.trim() === "internal" ? "internal" : "retail",
        supplier_code: row.supplier_code?.trim() || null,
        cost_price: row.cost_price ? parseFloat(row.cost_price) : null,
        retail_price: row.retail_price ? parseFloat(row.retail_price) : null,
        reorder_point: row.reorder_point ? parseInt(row.reorder_point) : null,
        notes: row.notes?.trim() || null,
      };
      try {
        const res = await fetch("/api/inventory/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.error) {
          failed.push({ row: i + 2, reason: json.error });
        } else {
          imported++;
        }
      } catch (err) {
        failed.push({ row: i + 2, reason: String(err) });
      }
    }

    setImporting(false);
    setResult({ imported, failed });
    if (imported > 0) onDone();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB",
    borderRadius: 6, fontSize: 13, color: "#1A1A2E", background: "#fff",
    boxSizing: "border-box",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 700, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#1A1A2E" }}>Import Stock from CSV</h2>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#6B7280" }}>Upload a CSV file to bulk-import inventory items</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Result view */}
          {result ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1, background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={20} color="#059669" />
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#065F46" }}>{result.imported}</div>
                    <div style={{ fontSize: 12, color: "#059669" }}>items imported</div>
                  </div>
                </div>
                {result.failed.length > 0 && (
                  <div style={{ flex: 1, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                    <AlertCircle size={20} color="#DC2626" />
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#991B1B" }}>{result.failed.length}</div>
                      <div style={{ fontSize: 12, color: "#DC2626" }}>failed</div>
                    </div>
                  </div>
                )}
              </div>
              {result.failed.length > 0 && (
                <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", background: "#F3F4F6", borderBottom: "1px solid #E5E7EB", fontSize: 12, fontWeight: 600, color: "#6B7280" }}>FAILED ROWS</div>
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {result.failed.map((f) => (
                      <div key={f.row} style={{ padding: "8px 14px", borderBottom: "1px solid #F3F4F6", fontSize: 13, display: "flex", gap: 12 }}>
                        <span style={{ color: "#9CA3AF", flexShrink: 0 }}>Row {f.row}</span>
                        <span style={{ color: "#991B1B" }}>{f.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Step 1: Download template / upload */}
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <button
                  onClick={downloadTemplate}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#374151", fontWeight: 500, whiteSpace: "nowrap" }}
                >
                  <Download size={14} />
                  Download Template
                </button>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block" }}>
                    <div style={{ ...inputStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: csvText ? "#1A1A2E" : "#9CA3AF" }}>
                      <Upload size={14} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {csvText ? `${allRows.length} rows ready to import` : "Choose CSV file…"}
                      </span>
                    </div>
                    <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "none" }} />
                  </label>
                  {fileError && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#DC2626" }}>{fileError}</p>}
                </div>
              </div>

              {/* Template columns info */}
              {!csvText && (
                <div style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "12px 14px" }}>
                  <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: "#6B7280" }}>EXPECTED COLUMNS</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {CSV_TEMPLATE_HEADERS.map((h) => (
                      <code key={h} style={{ fontSize: 11, background: "#EEF2FF", color: "#4338CA", padding: "2px 7px", borderRadius: 4 }}>{h}</code>
                    ))}
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9CA3AF" }}>
                    <code style={{ fontSize: 11 }}>item_type</code> must be <code style={{ fontSize: 11 }}>retail</code> or <code style={{ fontSize: 11 }}>internal</code> (defaults to retail if blank).
                    SKU and Name are required.
                  </p>
                </div>
              )}

              {/* Preview */}
              {preview.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#6B7280" }}>
                    PREVIEW — first {preview.length} of {allRows.length} rows
                  </p>
                  <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 8 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#F9FAFB" }}>
                          {headers.map((h) => (
                            <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap", borderBottom: "1px solid #E5E7EB" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #F3F4F6" }}>
                            {headers.map((h) => (
                              <td key={h} style={{ padding: "7px 12px", color: "#374151", whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
                                {row[h] || <span style={{ color: "#D1D5DB" }}>—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {result ? (
            <button
              onClick={onClose}
              style={{ padding: "8px 20px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500 }}
            >
              Done
            </button>
          ) : (
            <>
              <button onClick={onClose} style={{ padding: "8px 16px", background: "#F3F4F6", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#374151" }}>
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!csvText || importing || allRows.length === 0}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, cursor: (!csvText || importing) ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, opacity: (!csvText || importing) ? 0.6 : 1 }}
              >
                <Upload size={14} />
                {importing ? `Importing…` : `Import ${allRows.length > 0 ? allRows.length + " rows" : ""}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function InventoryStockPage() {
  const { user } = useUser();
  const router = useRouter();
  const isManager = canManage(user?.role);

  useEffect(() => {
    if (user && !isManager) router.replace("/orders");
  }, [user, isManager, router]);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");

  const [drawerItem, setDrawerItem] = useState<InventoryItem | null>(null);
  const [drawerNew, setDrawerNew] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterType) params.set("item_type", filterType);
    if (filterLocation) params.set("location_id", filterLocation);
    if (filterSupplier) params.set("supplier_id", filterSupplier);
    if (filterDepartment) params.set("department", filterDepartment);

    const [itemsRes, locRes, supRes] = await Promise.all([
      fetch(`/api/inventory/items?${params.toString()}`, { cache: "no-store" }),
      fetch("/api/inventory/locations", { cache: "no-store" }),
      fetch("/api/inventory/suppliers", { cache: "no-store" }),
    ]);
    const [iJson, lJson, sJson] = await Promise.all([itemsRes.json(), locRes.json(), supRes.json()]);
    setItems(iJson.items ?? []);
    setLocations(lJson.locations ?? []);
    setSuppliers(sJson.suppliers ?? []);
    setLoading(false);
  }, [search, filterType, filterLocation, filterSupplier, filterDepartment]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function openNew() { setDrawerItem(null); setDrawerNew(true); }
  function openItem(item: InventoryItem) { setDrawerItem(item); setDrawerNew(false); }
  function closeDrawer() { setDrawerItem(null); setDrawerNew(false); }
  function handleSaved() { closeDrawer(); fetchAll(); }

  const showDrawer = drawerNew || drawerItem != null;

  const MULT_BADGE: Record<string, { bg: string; fg: string }> = {
    green: { bg: "#D1FAE5", fg: "#065F46" },
    orange: { bg: "#FEF3C7", fg: "#92400E" },
    red: { bg: "#FEE2E2", fg: "#991B1B" },
  };

  const departments = Array.from(new Set(items.map((i) => i.department).filter(Boolean) as string[])).sort();

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1300, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1A1A2E" }}>Stock</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>
            {items.length} item{items.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowImport(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}
          >
            <Upload size={14} />
            Import CSV
          </button>
          <button
            onClick={openNew}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}
          >
            <Plus size={15} />
            New Item
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU, name, category…"
            style={{ width: "100%", paddingLeft: 30, paddingRight: search ? 28 : 10, padding: "8px 10px 8px 30px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, color: "#1A1A2E", background: "#fff", boxSizing: "border-box" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 0 }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Type filter */}
        <div style={{ position: "relative" }}>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ padding: "8px 28px 8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, color: filterType ? "#1A1A2E" : "#9CA3AF", background: "#fff", cursor: "pointer", appearance: "none" }}>
            <option value="">All types</option>
            <option value="retail">Retail</option>
            <option value="internal">Internal</option>
          </select>
          <ChevronDown size={12} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
        </div>

        {/* Location filter */}
        <div style={{ position: "relative" }}>
          <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} style={{ padding: "8px 28px 8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, color: filterLocation ? "#1A1A2E" : "#9CA3AF", background: "#fff", cursor: "pointer", appearance: "none" }}>
            <option value="">All locations</option>
            {buildLocationOptions(locations).map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown size={12} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
        </div>

        {/* Supplier filter */}
        <div style={{ position: "relative" }}>
          <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} style={{ padding: "8px 28px 8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, color: filterSupplier ? "#1A1A2E" : "#9CA3AF", background: "#fff", cursor: "pointer", appearance: "none" }}>
            <option value="">All suppliers</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <ChevronDown size={12} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
        </div>

        {/* Department filter */}
        {departments.length > 0 && (
          <div style={{ position: "relative" }}>
            <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)} style={{ padding: "8px 28px 8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, color: filterDepartment ? "#1A1A2E" : "#9CA3AF", background: "#fff", cursor: "pointer", appearance: "none" }}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E8E8F0" }}>
              {["SKU", "Name", "Category", "Type", "Supplier", "Location", "Qty", ...(isManager ? ["Cost", "Retail", "×"] : [])].map((h) => (
                <th key={h} style={{ padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#6B7280", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isManager ? 10 : 7} style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={isManager ? 10 : 7} style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>No items found</td></tr>
            ) : items.map((item) => {
              const mult = isManager && item.cost_price != null && item.retail_price != null
                ? calculateMultiplier(item.retail_price, item.cost_price)
                : null;
              const mColour = mult != null ? multiplierColour(mult) : null;
              return (
                <tr
                  key={item.id}
                  onClick={() => openItem(item)}
                  style={{ borderBottom: "1px solid #F3F4F6", cursor: "pointer", transition: "background .1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F9FAFB")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "11px 14px", fontSize: 13, color: "#6B7280", fontFamily: "monospace" }}>{item.sku}</td>
                  <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 500, color: "#1A1A2E" }}>{item.name}</td>
                  <td style={{ padding: "11px 14px", fontSize: 13, color: "#6B7280" }}>{item.category ?? "—"}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ ...(TYPE_BADGE_STYLE[item.item_type] ?? TYPE_BADGE_STYLE.retail), padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500 }}>
                      {ITEM_TYPE_LABEL[item.item_type] ?? item.item_type}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 13, color: "#6B7280" }}>
                    {item.supplier ? item.supplier.name : "—"}
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 13, color: "#6B7280" }}>
                    {locationLabel(item.location_id, locations)}
                  </td>
                  <td style={{ padding: "11px 14px", fontSize: 13, color: "#1A1A2E", fontWeight: 500 }}>
                    {item.total_stock ?? 0}
                  </td>
                  {isManager && (
                    <>
                      <td style={{ padding: "11px 14px", fontSize: 13, color: "#6B7280" }}>{fmtCurrency(item.cost_price)}</td>
                      <td style={{ padding: "11px 14px", fontSize: 13, color: "#1A1A2E" }}>{fmtCurrency(item.retail_price)}</td>
                      <td style={{ padding: "11px 14px" }}>
                        {mult != null && mColour ? (
                          <span style={{ ...MULT_BADGE[mColour], padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
                            ×{mult.toFixed(2)}
                          </span>
                        ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Item drawer */}
      {showDrawer && (
        <ItemDrawer
          item={drawerItem}
          isNew={drawerNew}
          locations={locations}
          suppliers={suppliers}
          onClose={closeDrawer}
          onSaved={handleSaved}
          isManager={isManager}
        />
      )}

      {/* CSV import modal */}
      {showImport && (
        <CsvImportModal
          onClose={() => setShowImport(false)}
          onDone={() => { fetchAll(); }}
        />
      )}
    </div>
  );
}
