"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Part {
  id: string; product_code: string | null; category: string; material: string;
  name: string; size: string | null; cost: number; fittable: boolean;
  is_estimated: boolean; data_note: string | null; active: boolean;
}
interface ClawRate { id: string; metal_name: string; price_per_claw: number; is_confirmed: boolean }
interface SettingTier { id: string; tier_key: string; label: string; fee: number; sort_order: number }
interface RestringPrice {
  id: string; length_label: string; unknotted_straight: number; unknotted_graduated: number;
  knotted_straight: number; knotted_graduated: number; sort_order: number;
}
interface RepairAction {
  id: string; name: string; pricing_mode: string; guide_key: string | null;
  default_price: number | null; default_minutes: number | null; hint: string | null;
  active: boolean; sort_order: number;
}
interface ServiceAction {
  id: string; name: string; pricing_mode: string; default_price: number | null;
  default_minutes: number | null; hint: string | null; active: boolean; sort_order: number;
}
interface PricingBracket { id: string; bracket_type: string; cost_lower_bound: number; multiplier: number | null; sort_order: number }
interface DiscountTier { id: string; name: string; discount_percent: number; eligible_ownership_only: boolean; sort_order: number }
interface FittingFeeConfig { fee_per_end: number }

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  page: { minHeight: "100vh", background: "#F9FAFB", fontFamily: "Inter, sans-serif", padding: "32px 24px" } as React.CSSProperties,
  container: { maxWidth: 1100, margin: "0 auto" } as React.CSSProperties,
  heading: { fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: 0 } as React.CSSProperties,
  subheading: { fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 24 } as React.CSSProperties,
  card: { background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" } as React.CSSProperties,
  tabBar: { display: "flex", borderBottom: "1px solid #E8E8F0", background: "#fff", borderRadius: "12px 12px 0 0", overflowX: "auto" as const } as React.CSSProperties,
  tabBtn: (active: boolean): React.CSSProperties => ({
    padding: "12px 16px", border: "none", borderBottom: active ? "2px solid #635BFF" : "2px solid transparent",
    background: "transparent", color: active ? "#635BFF" : "#6B7280",
    fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: active ? 600 : 400,
    cursor: "pointer", whiteSpace: "nowrap" as const, flexShrink: 0,
  }),
  tabContent: { padding: 24 } as React.CSSProperties,
  row: (even: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 8px",
    borderBottom: "1px solid #F3F4F6", background: even ? "#FAFAFA" : "#fff",
    borderRadius: 6, flexWrap: "wrap" as const,
  }),
  editRow: { background: "#F0F0FF", border: "1px solid #C9C7FF", borderRadius: 8, padding: 16, marginBottom: 8 } as React.CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 4, display: "block", textTransform: "uppercase" as const, letterSpacing: "0.04em" } as React.CSSProperties,
  input: { padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 14, fontFamily: "Inter, sans-serif", outline: "none", width: "100%", boxSizing: "border-box" as const } as React.CSSProperties,
  select: { padding: "6px 10px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 14, fontFamily: "Inter, sans-serif", outline: "none", width: "100%", background: "#fff", boxSizing: "border-box" as const } as React.CSSProperties,
  btnPrimary: { padding: "7px 16px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif" } as React.CSSProperties,
  btnSecondary: { padding: "7px 14px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "Inter, sans-serif" } as React.CSSProperties,
  btnDanger: { padding: "6px 12px", background: "#FFF1F0", color: "#D85A30", border: "1px solid #FFCCC7", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "Inter, sans-serif" } as React.CSSProperties,
  btnEdit: { padding: "6px 12px", background: "#F3F4F6", color: "#374151", border: "1px solid #E5E7EB", borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "Inter, sans-serif" } as React.CSSProperties,
  btnAdd: { padding: "7px 14px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif" } as React.CSSProperties,
  errorText: { color: "#D85A30", fontSize: 12, marginTop: 6 } as React.CSSProperties,
  loadingText: { color: "#9CA3AF", fontSize: 14, padding: "32px 0", textAlign: "center" as const } as React.CSSProperties,
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 } as React.CSSProperties,
  addFormCard: { background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 8, padding: 16, marginBottom: 16 } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 10, marginTop: 20, paddingBottom: 4, borderBottom: "1px solid #E8E8F0" } as React.CSSProperties,
  formGrid: (cols?: number): React.CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(${cols ?? 3}, 1fr)`, gap: 10, marginBottom: 10 }),
  btnRow: { display: "flex", gap: 8, marginTop: 12 } as React.CSSProperties,
  fieldGroup: { display: "flex", flexDirection: "column" as const, gap: 4 } as React.CSSProperties,
};

const fmtNum = (v: number | null | undefined) => v != null ? `$${Number(v).toFixed(2)}` : "—";

// ─── Parts Catalogue Tab ──────────────────────────────────────────────────────

function PartsTab({ tenantId }: { tenantId: string }) {
  const h = (extra?: Record<string, string>) => ({ "x-tenant-id": tenantId, "Content-Type": "application/json", ...extra });

  const [parts, setParts] = useState<Part[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [categories, setCategories] = useState<string[]>([]);
  const [materials, setMaterials] = useState<string[]>([]);
  const [filterCat, setFilterCat] = useState("");
  const [filterMat, setFilterMat] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Part>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Partial<Part>>({ active: true, fittable: false, is_estimated: false });
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [adjustPct, setAdjustPct] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [expandedNote, setExpandedNote] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMeta = useCallback(async () => {
    const res = await fetch(`/api/quotes/settings/parts-catalogue?mode=meta`, { headers: { "x-tenant-id": tenantId } });
    const data = await res.json();
    setCategories(data.categories ?? []);
    setMaterials(data.materials ?? []);
  }, [tenantId]);

  const fetchParts = useCallback(async (pg: number, cat: string, mat: string, search: string) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pg), pageSize: String(pageSize), active: "all" });
    if (cat) params.set("category", cat);
    if (mat) params.set("material", mat);
    if (search) params.set("search", search);
    const res = await fetch(`/api/quotes/settings/parts-catalogue?${params}`, { headers: { "x-tenant-id": tenantId } });
    const data = await res.json();
    setParts(data.data ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [tenantId, pageSize]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); fetchParts(1, filterCat, filterMat, filterSearch); }, 350);
  }, [filterCat, filterMat, filterSearch, fetchParts]);
  useEffect(() => { fetchParts(page, filterCat, filterMat, filterSearch); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const startEdit = (p: Part) => {
    setEditingId(p.id);
    setEditForm({ product_code: p.product_code ?? "", category: p.category, material: p.material, name: p.name, size: p.size ?? "", cost: p.cost, fittable: p.fittable, is_estimated: p.is_estimated, data_note: p.data_note ?? "", active: p.active });
    setEditError(null);
  };
  const cancelEdit = () => { setEditingId(null); setEditForm({}); setEditError(null); };

  const saveEdit = async (id: string) => {
    setSaving(true); setEditError(null);
    try {
      const res = await fetch(`/api/quotes/settings/parts-catalogue/${id}`, { method: "PATCH", headers: h(), body: JSON.stringify({ ...editForm, cost: Number(editForm.cost) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setEditError(d.error ?? "Failed to save"); return; }
      await fetchParts(page, filterCat, filterMat, filterSearch);
      cancelEdit();
    } catch { setEditError("Network error"); } finally { setSaving(false); }
  };

  const deletePart = async (id: string) => {
    if (!confirm("Delete this part from the catalogue?")) return;
    try {
      const res = await fetch(`/api/quotes/settings/parts-catalogue/${id}`, { method: "DELETE", headers: h() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setDeleteErrors(p => ({ ...p, [id]: d.error ?? "Failed to delete" })); return; }
      await fetchParts(page, filterCat, filterMat, filterSearch);
    } catch { setDeleteErrors(p => ({ ...p, [id]: "Network error" })); }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setAdding(true); setAddError(null);
    try {
      const res = await fetch("/api/quotes/settings/parts-catalogue", { method: "POST", headers: h(), body: JSON.stringify({ ...addForm, cost: Number(addForm.cost) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAddError(d.error ?? "Failed to add"); return; }
      setAddForm({ active: true, fittable: false, is_estimated: false });
      setAddOpen(false);
      await fetchMeta();
      await fetchParts(1, filterCat, filterMat, filterSearch);
    } catch { setAddError("Network error"); } finally { setAdding(false); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.length === parts.length ? [] : parts.map(p => p.id));
  };

  const applyBulkAdjust = async () => {
    const pct = parseFloat(adjustPct);
    if (isNaN(pct)) { setAdjustError("Enter a valid number"); return; }
    const multiplier = 1 + pct / 100;
    if (multiplier <= 0) { setAdjustError("Result would be ≤ 0"); return; }
    setAdjusting(true); setAdjustError(null);
    try {
      const res = await fetch("/api/quotes/settings/parts-catalogue/bulk-adjust", { method: "POST", headers: h(), body: JSON.stringify({ ids: selectedIds, cost_multiplier: multiplier }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAdjustError(d.error ?? "Failed to adjust"); return; }
      setSelectedIds([]); setBulkOpen(false); setAdjustPct("");
      await fetchParts(page, filterCat, filterMat, filterSearch);
    } catch { setAdjustError("Network error"); } finally { setAdjusting(false); }
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 14 }}>
        The parts catalogue contains {total} entries. Edit cost and toggles inline; use bulk adjust to reprice after metal movements.
      </p>

      {/* Filter bar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 160px auto", gap: 8, marginBottom: 12 }}>
        <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Search name…" style={s.input} />
        <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }} style={s.select}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterMat} onChange={e => { setFilterMat(e.target.value); setPage(1); }} style={s.select}>
          <option value="">All materials</option>
          {materials.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button style={s.btnAdd} onClick={() => { setAddOpen(o => !o); setAddError(null); }}>
          {addOpen ? "Cancel" : "+ Add Part"}
        </button>
      </div>

      {/* Bulk adjust bar */}
      {selectedIds.length > 0 && (
        <div style={{ background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 8, padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#635BFF" }}>{selectedIds.length} row{selectedIds.length !== 1 ? "s" : ""} selected</span>
          {!bulkOpen ? (
            <button style={{ ...s.btnPrimary, padding: "5px 12px", fontSize: 12 }} onClick={() => setBulkOpen(true)}>Adjust Cost…</button>
          ) : (
            <>
              <span style={{ fontSize: 13, color: "#374151" }}>Adjust cost by</span>
              <input type="number" step="0.1" value={adjustPct} onChange={e => setAdjustPct(e.target.value)} placeholder="e.g. 10 or -5" style={{ ...s.input, width: 110, padding: "5px 8px" }} />
              <span style={{ fontSize: 13, color: "#374151" }}>%</span>
              <button style={{ ...s.btnPrimary, padding: "5px 12px", fontSize: 12 }} onClick={applyBulkAdjust} disabled={adjusting}>{adjusting ? "Applying…" : "Apply"}</button>
              <button style={{ ...s.btnSecondary, padding: "5px 10px", fontSize: 12 }} onClick={() => { setBulkOpen(false); setAdjustPct(""); setAdjustError(null); }}>Cancel</button>
            </>
          )}
          {adjustError && <span style={{ fontSize: 12, color: "#D85A30" }}>⚠ {adjustError}</span>}
          <button style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 12 }} onClick={() => { setSelectedIds([]); setBulkOpen(false); }}>Clear selection</button>
        </div>
      )}

      {/* Add form */}
      {addOpen && (
        <div style={s.addFormCard}>
          <form onSubmit={submitAdd}>
            <div style={s.formGrid(4)}>
              <div style={s.fieldGroup}><label style={s.label}>Category *</label><input required value={addForm.category ?? ""} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={s.input} /></div>
              <div style={s.fieldGroup}><label style={s.label}>Material *</label><input required value={addForm.material ?? ""} onChange={e => setAddForm(f => ({ ...f, material: e.target.value }))} style={s.input} /></div>
              <div style={s.fieldGroup}><label style={s.label}>Name *</label><input required autoFocus value={addForm.name ?? ""} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} style={s.input} /></div>
              <div style={s.fieldGroup}><label style={s.label}>Size</label><input value={addForm.size ?? ""} onChange={e => setAddForm(f => ({ ...f, size: e.target.value }))} style={s.input} /></div>
            </div>
            <div style={s.formGrid(4)}>
              <div style={s.fieldGroup}><label style={s.label}>Cost ($) *</label><input required type="number" min="0" step="0.01" value={addForm.cost ?? ""} onChange={e => setAddForm(f => ({ ...f, cost: parseFloat(e.target.value) }))} style={s.input} /></div>
              <div style={s.fieldGroup}><label style={s.label}>Product code</label><input value={addForm.product_code ?? ""} onChange={e => setAddForm(f => ({ ...f, product_code: e.target.value }))} style={s.input} /></div>
              <div style={s.fieldGroup}><label style={s.label}>Data note</label><input value={addForm.data_note ?? ""} onChange={e => setAddForm(f => ({ ...f, data_note: e.target.value }))} style={s.input} /></div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", paddingTop: 20 }}>
                <label style={{ display: "flex", gap: 5, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!addForm.fittable} onChange={e => setAddForm(f => ({ ...f, fittable: e.target.checked }))} />Fittable</label>
                <label style={{ display: "flex", gap: 5, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!addForm.is_estimated} onChange={e => setAddForm(f => ({ ...f, is_estimated: e.target.checked }))} />Estimated</label>
              </div>
            </div>
            {addError && <p style={s.errorText}>{addError}</p>}
            <div style={s.btnRow}>
              <button type="submit" style={s.btnPrimary} disabled={adding}>{adding ? "Adding…" : "Add Part"}</button>
              <button type="button" style={s.btnSecondary} onClick={() => setAddOpen(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? <p style={s.loadingText}>Loading…</p> : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E8E8F0" }}>
                  <th style={{ width: 30, padding: "8px 6px" }}>
                    <input type="checkbox" checked={selectedIds.length === parts.length && parts.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th style={{ textAlign: "left", padding: "8px 8px", color: "#6B7280", fontWeight: 600 }}>Category</th>
                  <th style={{ textAlign: "left", padding: "8px 8px", color: "#6B7280", fontWeight: 600 }}>Name</th>
                  <th style={{ textAlign: "left", padding: "8px 8px", color: "#6B7280", fontWeight: 600 }}>Material / Size</th>
                  <th style={{ textAlign: "right", padding: "8px 8px", color: "#6B7280", fontWeight: 600 }}>Cost</th>
                  <th style={{ textAlign: "center", padding: "8px 4px", color: "#6B7280", fontWeight: 600 }}>Fit</th>
                  <th style={{ textAlign: "center", padding: "8px 4px", color: "#6B7280", fontWeight: 600 }}>Est.</th>
                  <th style={{ textAlign: "center", padding: "8px 4px", color: "#6B7280", fontWeight: 600 }}>Active</th>
                  <th style={{ width: 140 }} />
                </tr>
              </thead>
              <tbody>
                {parts.map((p, i) => (
                  <>
                    {editingId === p.id ? (
                      <tr key={p.id + "_edit"}>
                        <td colSpan={9} style={{ padding: "8px 0" }}>
                          <div style={s.editRow}>
                            <div style={s.formGrid(4)}>
                              <div style={s.fieldGroup}><label style={s.label}>Category</label><input value={editForm.category ?? ""} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={s.input} /></div>
                              <div style={s.fieldGroup}><label style={s.label}>Material</label><input value={editForm.material ?? ""} onChange={e => setEditForm(f => ({ ...f, material: e.target.value }))} style={s.input} /></div>
                              <div style={s.fieldGroup}><label style={s.label}>Name</label><input value={editForm.name ?? ""} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={s.input} /></div>
                              <div style={s.fieldGroup}><label style={s.label}>Size</label><input value={editForm.size ?? ""} onChange={e => setEditForm(f => ({ ...f, size: e.target.value }))} style={s.input} /></div>
                            </div>
                            <div style={s.formGrid(4)}>
                              <div style={s.fieldGroup}><label style={s.label}>Cost ($)</label><input type="number" min="0" step="0.01" value={editForm.cost ?? ""} onChange={e => setEditForm(f => ({ ...f, cost: parseFloat(e.target.value) }))} style={s.input} /></div>
                              <div style={s.fieldGroup}><label style={s.label}>Product code</label><input value={editForm.product_code ?? ""} onChange={e => setEditForm(f => ({ ...f, product_code: e.target.value }))} style={s.input} /></div>
                              <div style={s.fieldGroup}><label style={s.label}>Data note</label><input value={editForm.data_note ?? ""} onChange={e => setEditForm(f => ({ ...f, data_note: e.target.value }))} style={s.input} /></div>
                              <div style={{ display: "flex", gap: 14, alignItems: "center", paddingTop: 20 }}>
                                <label style={{ display: "flex", gap: 5, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!editForm.fittable} onChange={e => setEditForm(f => ({ ...f, fittable: e.target.checked }))} />Fittable</label>
                                <label style={{ display: "flex", gap: 5, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!editForm.is_estimated} onChange={e => setEditForm(f => ({ ...f, is_estimated: e.target.checked }))} />Estimated</label>
                                <label style={{ display: "flex", gap: 5, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!editForm.active} onChange={e => setEditForm(f => ({ ...f, active: e.target.checked }))} />Active</label>
                              </div>
                            </div>
                            {editError && <p style={s.errorText}>{editError}</p>}
                            <div style={s.btnRow}>
                              <button style={s.btnPrimary} onClick={() => saveEdit(p.id)} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                              <button style={s.btnSecondary} onClick={cancelEdit}>Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.id} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 1 ? "#FAFAFA" : "#fff" }}>
                        <td style={{ padding: "8px 6px", textAlign: "center" }}>
                          <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                        </td>
                        <td style={{ padding: "8px", color: "#6B7280", fontSize: 12 }}>{p.category}</td>
                        <td style={{ padding: "8px" }}>
                          <div style={{ fontWeight: 500, color: "#1A1A2E" }}>{p.name}</div>
                          {p.data_note && (
                            <div>
                              <button
                                onClick={() => setExpandedNote(expandedNote === p.id ? null : p.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#9CA3AF", padding: 0, marginTop: 2 }}
                              >
                                ℹ {expandedNote === p.id ? "Hide note" : "Note"}
                              </button>
                              {expandedNote === p.id && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3, fontStyle: "italic" }}>{p.data_note}</div>}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "8px", color: "#6B7280", fontSize: 12 }}>{p.material}{p.size ? ` · ${p.size}` : ""}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: 600, color: "#1A1A2E" }}>{fmtNum(p.cost)}</td>
                        <td style={{ padding: "8px", textAlign: "center" }}>{p.fittable ? <span style={{ color: "#059669", fontSize: 12, fontWeight: 600 }}>✓</span> : <span style={{ color: "#D1D5DB" }}>—</span>}</td>
                        <td style={{ padding: "8px", textAlign: "center" }}>
                          {p.is_estimated ? <span style={{ fontSize: 11, background: "#FEF3C7", color: "#92400E", padding: "1px 6px", borderRadius: 10, fontWeight: 600 }}>Est.</span> : <span style={{ color: "#D1D5DB" }}>—</span>}
                        </td>
                        <td style={{ padding: "8px", textAlign: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: p.active ? "#D1FAE5" : "#F3F4F6", color: p.active ? "#065F46" : "#9CA3AF" }}>{p.active ? "Yes" : "No"}</span>
                        </td>
                        <td style={{ padding: "8px", textAlign: "right" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button style={s.btnEdit} onClick={() => startEdit(p)}>Edit</button>
                            <button style={s.btnDanger} onClick={() => deletePart(p.id)}>Delete</button>
                          </div>
                          {deleteErrors[p.id] && <span style={{ ...s.errorText, display: "block" }}>⚠ {deleteErrors[p.id]}</span>}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, fontSize: 13, color: "#6B7280" }}>
            <span>Showing {parts.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ ...s.btnSecondary, padding: "5px 12px", opacity: page === 1 ? 0.4 : 1 }}>← Prev</button>
              <span style={{ padding: "6px 10px" }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ ...s.btnSecondary, padding: "5px 12px", opacity: page === totalPages ? 0.4 : 1 }}>Next →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Claw Rates Tab ───────────────────────────────────────────────────────────

function ClawRatesTab({ tenantId }: { tenantId: string }) {
  const h = (extra?: Record<string, string>) => ({ "x-tenant-id": tenantId, "Content-Type": "application/json", ...extra });
  const [rows, setRows] = useState<ClawRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ClawRate>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Partial<ClawRate>>({ is_confirmed: false });
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false); const [adding, setAdding] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/quotes/settings/claw-rates", { headers: { "x-tenant-id": tenantId } });
    const d = await res.json();
    setRows(Array.isArray(d) ? d : []);
    setLoading(false);
  }, [tenantId]);
  useEffect(() => { fetch_(); }, [fetch_]);

  const startEdit = (r: ClawRate) => { setEditingId(r.id); setEditForm({ metal_name: r.metal_name, price_per_claw: r.price_per_claw, is_confirmed: r.is_confirmed }); setEditError(null); };
  const cancelEdit = () => { setEditingId(null); setEditForm({}); setEditError(null); };

  const saveEdit = async (id: string) => {
    setSaving(true); setEditError(null);
    try {
      const res = await fetch(`/api/quotes/settings/claw-rates/${id}`, { method: "PATCH", headers: h(), body: JSON.stringify({ ...editForm, price_per_claw: Number(editForm.price_per_claw) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setEditError(d.error ?? "Failed"); return; }
      await fetch_(); cancelEdit();
    } catch { setEditError("Network error"); } finally { setSaving(false); }
  };

  const deleteRow = async (id: string) => {
    if (!confirm("Delete this claw rate?")) return;
    try {
      const res = await fetch(`/api/quotes/settings/claw-rates/${id}`, { method: "DELETE", headers: h() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setDeleteErrors(p => ({ ...p, [id]: d.error ?? "Failed" })); return; }
      await fetch_();
    } catch { setDeleteErrors(p => ({ ...p, [id]: "Network error" })); }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setAdding(true); setAddError(null);
    try {
      const res = await fetch("/api/quotes/settings/claw-rates", { method: "POST", headers: h(), body: JSON.stringify({ ...addForm, price_per_claw: Number(addForm.price_per_claw) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAddError(d.error ?? "Failed"); return; }
      setAddForm({ is_confirmed: false }); setAddOpen(false); await fetch_();
    } catch { setAddError("Network error"); } finally { setAdding(false); }
  };

  if (loading) return <p style={s.loadingText}>Loading…</p>;
  return (
    <div>
      <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 14 }}>Price per individual claw tip by metal. Unconfirmed rows are marked as estimated — confirm once you have a real quote from your supplier.</p>
      <div style={s.topBar}>
        <span style={{ fontSize: 13, color: "#6B7280" }}>{rows.length} metal{rows.length !== 1 ? "s" : ""}</span>
        <button style={s.btnAdd} onClick={() => { setAddOpen(o => !o); setAddError(null); }}>{addOpen ? "Cancel" : "+ Add Metal"}</button>
      </div>
      {addOpen && (
        <div style={s.addFormCard}>
          <form onSubmit={submitAdd}>
            <div style={s.formGrid(3)}>
              <div style={s.fieldGroup}><label style={s.label}>Metal name *</label><input required autoFocus value={addForm.metal_name ?? ""} onChange={e => setAddForm(f => ({ ...f, metal_name: e.target.value }))} style={s.input} /></div>
              <div style={s.fieldGroup}><label style={s.label}>Price per claw ($) *</label><input required type="number" min="0" step="0.01" value={addForm.price_per_claw ?? ""} onChange={e => setAddForm(f => ({ ...f, price_per_claw: parseFloat(e.target.value) }))} style={s.input} /></div>
              <div style={{ display: "flex", alignItems: "center", paddingTop: 20 }}>
                <label style={{ display: "flex", gap: 6, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!addForm.is_confirmed} onChange={e => setAddForm(f => ({ ...f, is_confirmed: e.target.checked }))} />Confirmed (not estimated)</label>
              </div>
            </div>
            {addError && <p style={s.errorText}>{addError}</p>}
            <div style={s.btnRow}><button type="submit" style={s.btnPrimary} disabled={adding}>{adding ? "Adding…" : "Add"}</button><button type="button" style={s.btnSecondary} onClick={() => setAddOpen(false)}>Cancel</button></div>
          </form>
        </div>
      )}
      {rows.map((r, i) => (
        <div key={r.id}>
          {editingId === r.id ? (
            <div style={s.editRow}>
              <div style={s.formGrid(3)}>
                <div style={s.fieldGroup}><label style={s.label}>Metal name</label><input autoFocus value={editForm.metal_name ?? ""} onChange={e => setEditForm(f => ({ ...f, metal_name: e.target.value }))} style={s.input} /></div>
                <div style={s.fieldGroup}><label style={s.label}>Price per claw ($)</label><input type="number" min="0" step="0.01" value={editForm.price_per_claw ?? ""} onChange={e => setEditForm(f => ({ ...f, price_per_claw: parseFloat(e.target.value) }))} style={s.input} /></div>
                <div style={{ display: "flex", alignItems: "center", paddingTop: 20 }}><label style={{ display: "flex", gap: 6, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!editForm.is_confirmed} onChange={e => setEditForm(f => ({ ...f, is_confirmed: e.target.checked }))} />Confirmed</label></div>
              </div>
              {editError && <p style={s.errorText}>{editError}</p>}
              <div style={s.btnRow}><button style={s.btnPrimary} onClick={() => saveEdit(r.id)} disabled={saving}>{saving ? "Saving…" : "Save"}</button><button style={s.btnSecondary} onClick={cancelEdit}>Cancel</button></div>
            </div>
          ) : (
            <div style={{ ...s.row(i % 2 === 1), alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E" }}>{r.metal_name}</span>
                {!r.is_confirmed && <span style={{ marginLeft: 8, fontSize: 11, background: "#FEF3C7", color: "#92400E", padding: "1px 7px", borderRadius: 10, fontWeight: 600 }}>Unconfirmed</span>}
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: r.is_confirmed ? "#1A1A2E" : "#9CA3AF" }}>{fmtNum(r.price_per_claw)} / claw</span>
              <button style={s.btnEdit} onClick={() => startEdit(r)}>Edit</button>
              <button style={s.btnDanger} onClick={() => deleteRow(r.id)}>Delete</button>
              {deleteErrors[r.id] && <span style={{ ...s.errorText, width: "100%", marginTop: 0, fontWeight: 500 }}>⚠ {deleteErrors[r.id]}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Setting Tiers Tab ────────────────────────────────────────────────────────

function SettingTiersTab({ tenantId }: { tenantId: string }) {
  const h = (extra?: Record<string, string>) => ({ "x-tenant-id": tenantId, "Content-Type": "application/json", ...extra });
  const [rows, setRows] = useState<SettingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<SettingTier>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Partial<SettingTier>>({ sort_order: 0 });
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false); const [adding, setAdding] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/quotes/settings/setting-tiers", { headers: { "x-tenant-id": tenantId } });
    setRows(await res.json().then((d: any) => Array.isArray(d) ? d : []));
    setLoading(false);
  }, [tenantId]);
  useEffect(() => { fetch_(); }, [fetch_]);

  const saveEdit = async (id: string) => {
    setSaving(true); setEditError(null);
    try {
      const res = await fetch(`/api/quotes/settings/setting-tiers/${id}`, { method: "PATCH", headers: h(), body: JSON.stringify({ ...editForm, fee: Number(editForm.fee) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setEditError(d.error ?? "Failed"); return; }
      await fetch_(); setEditingId(null); setEditForm({});
    } catch { setEditError("Network error"); } finally { setSaving(false); }
  };

  const deleteRow = async (id: string) => {
    if (!confirm("Delete this setting tier?")) return;
    try {
      const res = await fetch(`/api/quotes/settings/setting-tiers/${id}`, { method: "DELETE", headers: h() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setDeleteErrors(p => ({ ...p, [id]: d.error ?? "Failed" })); return; }
      await fetch_();
    } catch { setDeleteErrors(p => ({ ...p, [id]: "Network error" })); }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setAdding(true); setAddError(null);
    try {
      const res = await fetch("/api/quotes/settings/setting-tiers", { method: "POST", headers: h(), body: JSON.stringify({ ...addForm, fee: Number(addForm.fee) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAddError(d.error ?? "Failed"); return; }
      setAddForm({ sort_order: 0 }); setAddOpen(false); await fetch_();
    } catch { setAddError("Network error"); } finally { setAdding(false); }
  };

  if (loading) return <p style={s.loadingText}>Loading…</p>;
  return (
    <div>
      <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 14 }}>Setting complexity tiers define the base fee for stone-setting work. e.g. Simple, Moderate, Complex.</p>
      <div style={s.topBar}>
        <span />
        <button style={s.btnAdd} onClick={() => { setAddOpen(o => !o); setAddError(null); }}>{addOpen ? "Cancel" : "+ Add Tier"}</button>
      </div>
      {addOpen && (
        <div style={s.addFormCard}>
          <form onSubmit={submitAdd}>
            <div style={s.formGrid(3)}>
              <div style={s.fieldGroup}><label style={s.label}>Tier key *</label><input required autoFocus value={addForm.tier_key ?? ""} onChange={e => setAddForm(f => ({ ...f, tier_key: e.target.value }))} style={s.input} placeholder="e.g. simple" /></div>
              <div style={s.fieldGroup}><label style={s.label}>Label *</label><input required value={addForm.label ?? ""} onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))} style={s.input} placeholder="e.g. Simple Setting" /></div>
              <div style={s.fieldGroup}><label style={s.label}>Fee ($) *</label><input required type="number" min="0" step="0.01" value={addForm.fee ?? ""} onChange={e => setAddForm(f => ({ ...f, fee: parseFloat(e.target.value) }))} style={s.input} /></div>
            </div>
            {addError && <p style={s.errorText}>{addError}</p>}
            <div style={s.btnRow}><button type="submit" style={s.btnPrimary} disabled={adding}>{adding ? "Adding…" : "Add"}</button><button type="button" style={s.btnSecondary} onClick={() => setAddOpen(false)}>Cancel</button></div>
          </form>
        </div>
      )}
      {rows.map((r, i) => (
        <div key={r.id}>
          {editingId === r.id ? (
            <div style={s.editRow}>
              <div style={s.formGrid(3)}>
                <div style={s.fieldGroup}><label style={s.label}>Tier key</label><input autoFocus value={editForm.tier_key ?? ""} onChange={e => setEditForm(f => ({ ...f, tier_key: e.target.value }))} style={s.input} /></div>
                <div style={s.fieldGroup}><label style={s.label}>Label</label><input value={editForm.label ?? ""} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} style={s.input} /></div>
                <div style={s.fieldGroup}><label style={s.label}>Fee ($)</label><input type="number" min="0" step="0.01" value={editForm.fee ?? ""} onChange={e => setEditForm(f => ({ ...f, fee: parseFloat(e.target.value) }))} style={s.input} /></div>
              </div>
              {editError && <p style={s.errorText}>{editError}</p>}
              <div style={s.btnRow}><button style={s.btnPrimary} onClick={() => saveEdit(r.id)} disabled={saving}>{saving ? "Saving…" : "Save"}</button><button style={s.btnSecondary} onClick={() => { setEditingId(null); setEditForm({}); }}>Cancel</button></div>
            </div>
          ) : (
            <div style={{ ...s.row(i % 2 === 1), alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E" }}>{r.label}</span>
                <span style={{ marginLeft: 8, fontSize: 12, color: "#9CA3AF", fontFamily: "monospace" }}>{r.tier_key}</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#635BFF" }}>{fmtNum(r.fee)}</span>
              <button style={s.btnEdit} onClick={() => { setEditingId(r.id); setEditForm({ tier_key: r.tier_key, label: r.label, fee: r.fee, sort_order: r.sort_order }); setEditError(null); }}>Edit</button>
              <button style={s.btnDanger} onClick={() => deleteRow(r.id)}>Delete</button>
              {deleteErrors[r.id] && <span style={{ ...s.errorText, width: "100%", fontWeight: 500 }}>⚠ {deleteErrors[r.id]}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Restring Matrix Tab ──────────────────────────────────────────────────────

const RESTRING_COLS: { key: keyof RestringPrice; label: string }[] = [
  { key: "unknotted_straight",   label: "Unknotted straight" },
  { key: "unknotted_graduated",  label: "Unknotted graduated" },
  { key: "knotted_straight",     label: "Knotted straight" },
  { key: "knotted_graduated",    label: "Knotted graduated" },
];

function RestringTab({ tenantId }: { tenantId: string }) {
  const h = (extra?: Record<string, string>) => ({ "x-tenant-id": tenantId, "Content-Type": "application/json", ...extra });
  const [rows, setRows] = useState<RestringPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<RestringPrice>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Partial<RestringPrice>>({ sort_order: 0 });
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false); const [adding, setAdding] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/quotes/settings/restring-prices", { headers: { "x-tenant-id": tenantId } });
    setRows(await res.json().then((d: any) => Array.isArray(d) ? d : []));
    setLoading(false);
  }, [tenantId]);
  useEffect(() => { fetch_(); }, [fetch_]);

  const saveEdit = async (id: string) => {
    setSaving(true); setEditError(null);
    try {
      const res = await fetch(`/api/quotes/settings/restring-prices/${id}`, { method: "PATCH", headers: h(), body: JSON.stringify({ length_label: editForm.length_label, unknotted_straight: Number(editForm.unknotted_straight), unknotted_graduated: Number(editForm.unknotted_graduated), knotted_straight: Number(editForm.knotted_straight), knotted_graduated: Number(editForm.knotted_graduated) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setEditError(d.error ?? "Failed"); return; }
      await fetch_(); setEditingId(null);
    } catch { setEditError("Network error"); } finally { setSaving(false); }
  };

  const deleteRow = async (id: string) => {
    if (!confirm("Delete this restring length?")) return;
    try {
      const res = await fetch(`/api/quotes/settings/restring-prices/${id}`, { method: "DELETE", headers: h() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setDeleteErrors(p => ({ ...p, [id]: d.error ?? "Failed" })); return; }
      await fetch_();
    } catch { setDeleteErrors(p => ({ ...p, [id]: "Network error" })); }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setAdding(true); setAddError(null);
    try {
      const res = await fetch("/api/quotes/settings/restring-prices", { method: "POST", headers: h(), body: JSON.stringify({ length_label: addForm.length_label, unknotted_straight: Number(addForm.unknotted_straight), unknotted_graduated: Number(addForm.unknotted_graduated), knotted_straight: Number(addForm.knotted_straight), knotted_graduated: Number(addForm.knotted_graduated), sort_order: Number(addForm.sort_order) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAddError(d.error ?? "Failed"); return; }
      setAddForm({ sort_order: 0 }); setAddOpen(false); await fetch_();
    } catch { setAddError("Network error"); } finally { setAdding(false); }
  };

  if (loading) return <p style={s.loadingText}>Loading…</p>;
  return (
    <div>
      <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 14 }}>Retail prices for each length × knotting style combination. All values in dollars.</p>
      <div style={s.topBar}><span /><button style={s.btnAdd} onClick={() => { setAddOpen(o => !o); setAddError(null); }}>{addOpen ? "Cancel" : "+ Add Length"}</button></div>
      {addOpen && (
        <div style={s.addFormCard}>
          <form onSubmit={submitAdd}>
            <div style={s.formGrid(3)}>
              <div style={s.fieldGroup}><label style={s.label}>Length label *</label><input required autoFocus value={addForm.length_label ?? ""} onChange={e => setAddForm(f => ({ ...f, length_label: e.target.value }))} style={s.input} placeholder="e.g. 45cm" /></div>
              {RESTRING_COLS.map(col => (
                <div key={col.key} style={s.fieldGroup}><label style={s.label}>{col.label} ($)*</label><input required type="number" min="0" step="0.01" value={(addForm as any)[col.key] ?? ""} onChange={e => setAddForm(f => ({ ...f, [col.key]: parseFloat(e.target.value) }))} style={s.input} /></div>
              ))}
            </div>
            {addError && <p style={s.errorText}>{addError}</p>}
            <div style={s.btnRow}><button type="submit" style={s.btnPrimary} disabled={adding}>{adding ? "Adding…" : "Add"}</button><button type="button" style={s.btnSecondary} onClick={() => setAddOpen(false)}>Cancel</button></div>
          </form>
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #E8E8F0" }}>
              <th style={{ textAlign: "left", padding: "8px 10px", color: "#6B7280", fontWeight: 600 }}>Length</th>
              {RESTRING_COLS.map(c => <th key={c.key} style={{ textAlign: "right", padding: "8px 10px", color: "#6B7280", fontWeight: 600 }}>{c.label}</th>)}
              <th style={{ width: 130 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              editingId === r.id ? (
                <tr key={r.id + "_edit"}>
                  <td colSpan={6} style={{ padding: "8px 0" }}>
                    <div style={s.editRow}>
                      <div style={s.formGrid(3)}>
                        <div style={s.fieldGroup}><label style={s.label}>Length label</label><input autoFocus value={editForm.length_label ?? ""} onChange={e => setEditForm(f => ({ ...f, length_label: e.target.value }))} style={s.input} /></div>
                        {RESTRING_COLS.map(col => (
                          <div key={col.key} style={s.fieldGroup}><label style={s.label}>{col.label} ($)</label><input type="number" min="0" step="0.01" value={(editForm as any)[col.key] ?? ""} onChange={e => setEditForm(f => ({ ...f, [col.key]: parseFloat(e.target.value) }))} style={s.input} /></div>
                        ))}
                      </div>
                      {editError && <p style={s.errorText}>{editError}</p>}
                      <div style={s.btnRow}><button style={s.btnPrimary} onClick={() => saveEdit(r.id)} disabled={saving}>{saving ? "Saving…" : "Save"}</button><button style={s.btnSecondary} onClick={() => { setEditingId(null); setEditForm({}); }}>Cancel</button></div>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.id} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 1 ? "#FAFAFA" : "#fff" }}>
                  <td style={{ padding: "10px 10px", fontWeight: 600, color: "#1A1A2E" }}>{r.length_label}</td>
                  {RESTRING_COLS.map(c => <td key={c.key} style={{ padding: "10px 10px", textAlign: "right", color: "#374151" }}>{fmtNum(Number(r[c.key]))}</td>)}
                  <td style={{ padding: "10px 10px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button style={s.btnEdit} onClick={() => { setEditingId(r.id); setEditForm({ length_label: r.length_label, unknotted_straight: r.unknotted_straight, unknotted_graduated: r.unknotted_graduated, knotted_straight: r.knotted_straight, knotted_graduated: r.knotted_graduated }); setEditError(null); }}>Edit</button>
                      <button style={s.btnDanger} onClick={() => deleteRow(r.id)}>Delete</button>
                    </div>
                    {deleteErrors[r.id] && <div style={{ ...s.errorText, marginTop: 4 }}>⚠ {deleteErrors[r.id]}</div>}
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Actions Tab (Repair + Service) ───────────────────────────────────────────

const PRICING_MODES = [
  { value: "flat",               label: "Flat fee" },
  { value: "minutes",            label: "Labour (minutes)" },
  { value: "manual",             label: "Manual entry" },
  { value: "description_labour", label: "Labour w/ description" },
  { value: "guided",             label: "Guided calculator (Phase 2)" },
];

function ActionsSection<T extends RepairAction | ServiceAction>({
  title, desc, apiBase, tenantId,
}: { title: string; desc: string; apiBase: string; tenantId: string }) {
  const h = (extra?: Record<string, string>) => ({ "x-tenant-id": tenantId, "Content-Type": "application/json", ...extra });
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<T>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Partial<T>>({ active: true, sort_order: 0 } as Partial<T>);
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false); const [adding, setAdding] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const res = await fetch(apiBase, { headers: { "x-tenant-id": tenantId } });
    setRows(await res.json().then((d: any) => Array.isArray(d) ? d : []));
    setLoading(false);
  }, [tenantId, apiBase]);
  useEffect(() => { fetch_(); }, [fetch_]);

  const saveEdit = async (id: string) => {
    setSaving(true); setEditError(null);
    try {
      const res = await fetch(`${apiBase}/${id}`, { method: "PATCH", headers: h(), body: JSON.stringify({ ...editForm, default_price: editForm.default_price != null ? Number(editForm.default_price) : null, default_minutes: editForm.default_minutes != null ? Number(editForm.default_minutes) : null }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setEditError(d.error ?? "Failed"); return; }
      await fetch_(); setEditingId(null); setEditForm({});
    } catch { setEditError("Network error"); } finally { setSaving(false); }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setAdding(true); setAddError(null);
    try {
      const res = await fetch(apiBase, { method: "POST", headers: h(), body: JSON.stringify({ ...addForm, default_price: addForm.default_price != null ? Number(addForm.default_price) : null, default_minutes: addForm.default_minutes != null ? Number(addForm.default_minutes) : null }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAddError(d.error ?? "Failed"); return; }
      setAddForm({ active: true, sort_order: 0 } as Partial<T>); setAddOpen(false); await fetch_();
    } catch { setAddError("Network error"); } finally { setAdding(false); }
  };

  const modeLabel = (m: string) => PRICING_MODES.find(p => p.value === m)?.label ?? m;

  if (loading) return <p style={s.loadingText}>Loading…</p>;
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={s.sectionTitle}>{title}</p>
      <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>{desc}</p>
      <div style={s.topBar}>
        <span style={{ fontSize: 13, color: "#6B7280" }}>{rows.length} action{rows.length !== 1 ? "s" : ""}</span>
        <button style={s.btnAdd} onClick={() => { setAddOpen(o => !o); setAddError(null); }}>{addOpen ? "Cancel" : `+ Add Action`}</button>
      </div>
      {addOpen && (
        <div style={s.addFormCard}>
          <form onSubmit={submitAdd}>
            <div style={s.formGrid(3)}>
              <div style={s.fieldGroup}><label style={s.label}>Name *</label><input required autoFocus value={(addForm as any).name ?? ""} onChange={e => setAddForm(f => ({ ...f, name: e.target.value } as Partial<T>))} style={s.input} /></div>
              <div style={s.fieldGroup}><label style={s.label}>Pricing mode *</label>
                <select required value={(addForm as any).pricing_mode ?? ""} onChange={e => setAddForm(f => ({ ...f, pricing_mode: e.target.value } as Partial<T>))} style={s.select}>
                  <option value="">Select…</option>
                  {PRICING_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div style={s.fieldGroup}><label style={s.label}>Hint (customer-facing)</label><input value={(addForm as any).hint ?? ""} onChange={e => setAddForm(f => ({ ...f, hint: e.target.value || null } as Partial<T>))} style={s.input} /></div>
            </div>
            <div style={s.formGrid(3)}>
              <div style={s.fieldGroup}><label style={s.label}>Default price ($)</label><input type="number" min="0" step="0.01" value={(addForm as any).default_price ?? ""} onChange={e => setAddForm(f => ({ ...f, default_price: e.target.value ? parseFloat(e.target.value) : null } as Partial<T>))} style={s.input} /></div>
              <div style={s.fieldGroup}><label style={s.label}>Default minutes</label><input type="number" min="0" step="1" value={(addForm as any).default_minutes ?? ""} onChange={e => setAddForm(f => ({ ...f, default_minutes: e.target.value ? parseInt(e.target.value) : null } as Partial<T>))} style={s.input} /></div>
              <div style={{ display: "flex", alignItems: "center", paddingTop: 20 }}><label style={{ display: "flex", gap: 6, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!(addForm as any).active} onChange={e => setAddForm(f => ({ ...f, active: e.target.checked } as Partial<T>))} />Active</label></div>
            </div>
            {addError && <p style={s.errorText}>{addError}</p>}
            <div style={s.btnRow}><button type="submit" style={s.btnPrimary} disabled={adding}>{adding ? "Adding…" : "Add"}</button><button type="button" style={s.btnSecondary} onClick={() => setAddOpen(false)}>Cancel</button></div>
          </form>
        </div>
      )}
      {rows.map((r, i) => {
        const ra = r as any;
        return (
          <div key={ra.id}>
            {editingId === ra.id ? (
              <div style={s.editRow}>
                <div style={s.formGrid(3)}>
                  <div style={s.fieldGroup}><label style={s.label}>Name</label><input autoFocus value={(editForm as any).name ?? ""} onChange={e => setEditForm(f => ({ ...f, name: e.target.value } as Partial<T>))} style={s.input} /></div>
                  <div style={s.fieldGroup}><label style={s.label}>Pricing mode</label>
                    <select value={(editForm as any).pricing_mode ?? ""} onChange={e => setEditForm(f => ({ ...f, pricing_mode: e.target.value } as Partial<T>))} style={s.select}>
                      {PRICING_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div style={s.fieldGroup}><label style={s.label}>Hint</label><input value={(editForm as any).hint ?? ""} onChange={e => setEditForm(f => ({ ...f, hint: e.target.value || null } as Partial<T>))} style={s.input} /></div>
                </div>
                <div style={s.formGrid(3)}>
                  <div style={s.fieldGroup}><label style={s.label}>Default price ($)</label><input type="number" min="0" step="0.01" value={(editForm as any).default_price ?? ""} onChange={e => setEditForm(f => ({ ...f, default_price: e.target.value ? parseFloat(e.target.value) : null } as Partial<T>))} style={s.input} /></div>
                  <div style={s.fieldGroup}><label style={s.label}>Default minutes</label><input type="number" min="0" step="1" value={(editForm as any).default_minutes ?? ""} onChange={e => setEditForm(f => ({ ...f, default_minutes: e.target.value ? parseInt(e.target.value) : null } as Partial<T>))} style={s.input} /></div>
                  <div style={{ display: "flex", alignItems: "center", paddingTop: 20 }}><label style={{ display: "flex", gap: 6, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!(editForm as any).active} onChange={e => setEditForm(f => ({ ...f, active: e.target.checked } as Partial<T>))} />Active</label></div>
                </div>
                {editError && <p style={s.errorText}>{editError}</p>}
                <div style={s.btnRow}><button style={s.btnPrimary} onClick={() => saveEdit(ra.id)} disabled={saving}>{saving ? "Saving…" : "Save"}</button><button style={s.btnSecondary} onClick={() => { setEditingId(null); setEditForm({}); }}>Cancel</button></div>
              </div>
            ) : (
              <div style={{ ...s.row(i % 2 === 1), alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E" }}>{ra.name}</span>
                  {ra.hint && <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2, fontStyle: "italic" }}>{ra.hint}</div>}
                </div>
                <span style={{ fontSize: 12, background: "#F3F4F6", color: "#374151", padding: "2px 8px", borderRadius: 4, flexShrink: 0 }}>{modeLabel(ra.pricing_mode)}</span>
                {ra.default_price != null && <span style={{ fontSize: 13, color: "#635BFF", fontWeight: 600, flexShrink: 0 }}>{fmtNum(ra.default_price)}</span>}
                {ra.default_minutes != null && <span style={{ fontSize: 12, color: "#6B7280", flexShrink: 0 }}>{ra.default_minutes} min</span>}
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 10, background: ra.active ? "#D1FAE5" : "#F3F4F6", color: ra.active ? "#065F46" : "#9CA3AF", flexShrink: 0 }}>{ra.active ? "Active" : "Inactive"}</span>
                <button style={s.btnEdit} onClick={() => { setEditingId(ra.id); setEditForm({ name: ra.name, pricing_mode: ra.pricing_mode, hint: ra.hint, default_price: ra.default_price, default_minutes: ra.default_minutes, active: ra.active } as Partial<T>); setEditError(null); }}>Edit</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActionsTab({ tenantId }: { tenantId: string }) {
  return (
    <div>
      <ActionsSection<RepairAction> title="Repair Actions" desc="Actions available under the Repairs tab in the quote builder. Guided actions are disabled (Phase 2). Cannot delete — deactivate instead." apiBase="/api/quotes/settings/repair-actions" tenantId={tenantId} />
      <ActionsSection<ServiceAction> title="Service Actions" desc="Actions available under the Services tab in the quote builder." apiBase="/api/quotes/settings/service-actions" tenantId={tenantId} />
    </div>
  );
}

// ─── Pricing Brackets Tab ─────────────────────────────────────────────────────

function BracketsSection({ bracketType, title, desc, tenantId }: { bracketType: string; title: string; desc: string; tenantId: string }) {
  const h = (extra?: Record<string, string>) => ({ "x-tenant-id": tenantId, "Content-Type": "application/json", ...extra });
  const [rows, setRows] = useState<PricingBracket[]>([]);
  const [allRows, setAllRows] = useState<PricingBracket[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PricingBracket>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Partial<PricingBracket>>({ multiplier: null });
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false); const [adding, setAdding] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/quotes/settings/pricing-brackets", { headers: { "x-tenant-id": tenantId } });
    const all = await res.json().then((d: any) => Array.isArray(d) ? d : []);
    setAllRows(all);
    setRows(all.filter((r: PricingBracket) => r.bracket_type === bracketType));
    setLoading(false);
  }, [tenantId, bracketType]);
  useEffect(() => { fetch_(); }, [fetch_]);

  const saveEdit = async (id: string) => {
    setSaving(true); setEditError(null);
    try {
      const res = await fetch(`/api/quotes/settings/pricing-brackets/${id}`, { method: "PATCH", headers: h(), body: JSON.stringify({ cost_lower_bound: Number(editForm.cost_lower_bound), multiplier: editForm.multiplier != null ? Number(editForm.multiplier) : null }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setEditError(d.error ?? "Failed"); return; }
      await fetch_(); setEditingId(null);
    } catch { setEditError("Network error"); } finally { setSaving(false); }
  };

  const deleteRow = async (id: string) => {
    if (!confirm("Delete this pricing bracket?")) return;
    try {
      const res = await fetch(`/api/quotes/settings/pricing-brackets/${id}`, { method: "DELETE", headers: h() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setDeleteErrors(p => ({ ...p, [id]: d.error ?? "Failed" })); return; }
      await fetch_();
    } catch { setDeleteErrors(p => ({ ...p, [id]: "Network error" })); }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setAdding(true); setAddError(null);
    try {
      const res = await fetch("/api/quotes/settings/pricing-brackets", { method: "POST", headers: h(), body: JSON.stringify({ bracket_type: bracketType, cost_lower_bound: Number(addForm.cost_lower_bound), multiplier: addForm.multiplier != null ? Number(addForm.multiplier) : null, sort_order: rows.length }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAddError(d.error ?? "Failed"); return; }
      setAddForm({ multiplier: null }); setAddOpen(false); await fetch_();
    } catch { setAddError("Network error"); } finally { setAdding(false); }
  };

  if (loading) return <p style={s.loadingText}>Loading…</p>;
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={s.sectionTitle}>{title}</p>
      <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>{desc}</p>
      <div style={s.topBar}>
        <span style={{ fontSize: 13, color: "#6B7280" }}>{rows.length} band{rows.length !== 1 ? "s" : ""}</span>
        <button style={s.btnAdd} onClick={() => { setAddOpen(o => !o); setAddError(null); }}>{addOpen ? "Cancel" : "+ Add Band"}</button>
      </div>
      {addOpen && (
        <div style={s.addFormCard}>
          <form onSubmit={submitAdd}>
            <div style={s.formGrid(2)}>
              <div style={s.fieldGroup}><label style={s.label}>Cost lower bound ($) *</label><input required type="number" min="0" step="0.01" autoFocus value={addForm.cost_lower_bound ?? ""} onChange={e => setAddForm(f => ({ ...f, cost_lower_bound: parseFloat(e.target.value) }))} style={s.input} /></div>
              <div style={s.fieldGroup}><label style={s.label}>Multiplier (leave blank = POA)</label><input type="number" min="0" step="0.01" placeholder="e.g. 2.5 (blank = POA)" value={addForm.multiplier ?? ""} onChange={e => setAddForm(f => ({ ...f, multiplier: e.target.value ? parseFloat(e.target.value) : null }))} style={s.input} /></div>
            </div>
            {addError && <p style={s.errorText}>{addError}</p>}
            <div style={s.btnRow}><button type="submit" style={s.btnPrimary} disabled={adding}>{adding ? "Adding…" : "Add Band"}</button><button type="button" style={s.btnSecondary} onClick={() => setAddOpen(false)}>Cancel</button></div>
          </form>
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr style={{ borderBottom: "2px solid #E8E8F0" }}>
          <th style={{ textAlign: "left", padding: "8px 10px", color: "#6B7280", fontWeight: 600 }}>Cost ≥</th>
          <th style={{ textAlign: "left", padding: "8px 10px", color: "#6B7280", fontWeight: 600 }}>Multiplier</th>
          <th style={{ textAlign: "left", padding: "8px 10px", color: "#6B7280", fontWeight: 600 }}>Example (cost $10)</th>
          <th style={{ width: 130 }} />
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            editingId === r.id ? (
              <tr key={r.id + "_edit"}><td colSpan={4} style={{ padding: "8px 0" }}>
                <div style={s.editRow}>
                  <div style={s.formGrid(2)}>
                    <div style={s.fieldGroup}><label style={s.label}>Cost lower bound ($)</label><input autoFocus type="number" min="0" step="0.01" value={editForm.cost_lower_bound ?? ""} onChange={e => setEditForm(f => ({ ...f, cost_lower_bound: parseFloat(e.target.value) }))} style={s.input} /></div>
                    <div style={s.fieldGroup}><label style={s.label}>Multiplier (blank = POA)</label><input type="number" min="0" step="0.01" placeholder="blank = POA" value={editForm.multiplier ?? ""} onChange={e => setEditForm(f => ({ ...f, multiplier: e.target.value ? parseFloat(e.target.value) : null }))} style={s.input} /></div>
                  </div>
                  {editError && <p style={s.errorText}>{editError}</p>}
                  <div style={s.btnRow}><button style={s.btnPrimary} onClick={() => saveEdit(r.id)} disabled={saving}>{saving ? "Saving…" : "Save"}</button><button style={s.btnSecondary} onClick={() => { setEditingId(null); }}>Cancel</button></div>
                </div>
              </td></tr>
            ) : (
              <tr key={r.id} style={{ borderBottom: "1px solid #F3F4F6", background: i % 2 === 1 ? "#FAFAFA" : "#fff" }}>
                <td style={{ padding: "10px 10px", fontWeight: 600, color: "#1A1A2E" }}>${Number(r.cost_lower_bound).toFixed(2)}</td>
                <td style={{ padding: "10px 10px" }}>{r.multiplier == null ? <span style={{ color: "#D85A30", fontWeight: 600 }}>POA</span> : <span style={{ color: "#635BFF", fontWeight: 600 }}>{Number(r.multiplier).toFixed(2)}×</span>}</td>
                <td style={{ padding: "10px 10px", color: "#6B7280" }}>{r.multiplier == null ? "POA" : `$${(10 * Number(r.multiplier)).toFixed(2)}`}</td>
                <td style={{ padding: "10px 10px", textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button style={s.btnEdit} onClick={() => { setEditingId(r.id); setEditForm({ cost_lower_bound: r.cost_lower_bound, multiplier: r.multiplier }); setEditError(null); }}>Edit</button>
                    <button style={s.btnDanger} onClick={() => deleteRow(r.id)}>Delete</button>
                  </div>
                  {deleteErrors[r.id] && <div style={{ ...s.errorText, marginTop: 4 }}>⚠ {deleteErrors[r.id]}</div>}
                </td>
              </tr>
            )
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BracketsTab({ tenantId }: { tenantId: string }) {
  return (
    <div>
      <BracketsSection bracketType="parts_metal" title="Parts & Metal" desc="Multiplier applied to part cost to calculate retail price. Blank multiplier = Price on Application (POA). System uses the highest bracket whose lower bound ≤ the item cost." tenantId={tenantId} />
      <BracketsSection bracketType="labour" title="Labour" desc="Multiplier applied to calculated labour cost (minutes × rate) to get retail price." tenantId={tenantId} />
    </div>
  );
}

// ─── Discount Tiers Tab ───────────────────────────────────────────────────────

function DiscountTiersTab({ tenantId }: { tenantId: string }) {
  const h = (extra?: Record<string, string>) => ({ "x-tenant-id": tenantId, "Content-Type": "application/json", ...extra });
  const [rows, setRows] = useState<DiscountTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<DiscountTier>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<Partial<DiscountTier>>({ eligible_ownership_only: false, sort_order: 0 });
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false); const [adding, setAdding] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/quotes/settings/discount-tiers", { headers: { "x-tenant-id": tenantId } });
    setRows(await res.json().then((d: any) => Array.isArray(d) ? d : []));
    setLoading(false);
  }, [tenantId]);
  useEffect(() => { fetch_(); }, [fetch_]);

  const saveEdit = async (id: string) => {
    setSaving(true); setEditError(null);
    try {
      const res = await fetch(`/api/quotes/settings/discount-tiers/${id}`, { method: "PATCH", headers: h(), body: JSON.stringify({ ...editForm, discount_percent: Number(editForm.discount_percent) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setEditError(d.error ?? "Failed"); return; }
      await fetch_(); setEditingId(null);
    } catch { setEditError("Network error"); } finally { setSaving(false); }
  };

  const deleteRow = async (id: string) => {
    if (!confirm("Delete this discount tier?")) return;
    try {
      const res = await fetch(`/api/quotes/settings/discount-tiers/${id}`, { method: "DELETE", headers: h() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setDeleteErrors(p => ({ ...p, [id]: d.error ?? "Failed to delete. It may be assigned to active quotes or customers." })); return; }
      await fetch_();
    } catch { setDeleteErrors(p => ({ ...p, [id]: "Network error" })); }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setAdding(true); setAddError(null);
    try {
      const res = await fetch("/api/quotes/settings/discount-tiers", { method: "POST", headers: h(), body: JSON.stringify({ ...addForm, discount_percent: Number(addForm.discount_percent) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setAddError(d.error ?? "Failed"); return; }
      setAddForm({ eligible_ownership_only: false, sort_order: 0 }); setAddOpen(false); await fetch_();
    } catch { setAddError("Network error"); } finally { setAdding(false); }
  };

  if (loading) return <p style={s.loadingText}>Loading…</p>;
  return (
    <div>
      <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 14 }}>Customer discount tiers applied at the quote level. "Owned items only" restricts the discount to items the customer purchased from you.</p>
      <div style={s.topBar}><span /><button style={s.btnAdd} onClick={() => { setAddOpen(o => !o); setAddError(null); }}>{addOpen ? "Cancel" : "+ Add Tier"}</button></div>
      {addOpen && (
        <div style={s.addFormCard}>
          <form onSubmit={submitAdd}>
            <div style={s.formGrid(3)}>
              <div style={s.fieldGroup}><label style={s.label}>Name *</label><input required autoFocus value={addForm.name ?? ""} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} style={s.input} /></div>
              <div style={s.fieldGroup}><label style={s.label}>Discount % *</label><input required type="number" min="0" max="100" step="0.1" value={addForm.discount_percent ?? ""} onChange={e => setAddForm(f => ({ ...f, discount_percent: parseFloat(e.target.value) }))} style={s.input} /></div>
              <div style={{ display: "flex", alignItems: "center", paddingTop: 20 }}><label style={{ display: "flex", gap: 6, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!addForm.eligible_ownership_only} onChange={e => setAddForm(f => ({ ...f, eligible_ownership_only: e.target.checked }))} />Apply to owned items only</label></div>
            </div>
            {addError && <p style={s.errorText}>{addError}</p>}
            <div style={s.btnRow}><button type="submit" style={s.btnPrimary} disabled={adding}>{adding ? "Adding…" : "Add"}</button><button type="button" style={s.btnSecondary} onClick={() => setAddOpen(false)}>Cancel</button></div>
          </form>
        </div>
      )}
      {rows.map((r, i) => (
        <div key={r.id}>
          {editingId === r.id ? (
            <div style={s.editRow}>
              <div style={s.formGrid(3)}>
                <div style={s.fieldGroup}><label style={s.label}>Name</label><input autoFocus value={editForm.name ?? ""} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={s.input} /></div>
                <div style={s.fieldGroup}><label style={s.label}>Discount %</label><input type="number" min="0" max="100" step="0.1" value={editForm.discount_percent ?? ""} onChange={e => setEditForm(f => ({ ...f, discount_percent: parseFloat(e.target.value) }))} style={s.input} /></div>
                <div style={{ display: "flex", alignItems: "center", paddingTop: 20 }}><label style={{ display: "flex", gap: 6, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!editForm.eligible_ownership_only} onChange={e => setEditForm(f => ({ ...f, eligible_ownership_only: e.target.checked }))} />Owned items only</label></div>
              </div>
              {editError && <p style={s.errorText}>{editError}</p>}
              <div style={s.btnRow}><button style={s.btnPrimary} onClick={() => saveEdit(r.id)} disabled={saving}>{saving ? "Saving…" : "Save"}</button><button style={s.btnSecondary} onClick={() => { setEditingId(null); }}>Cancel</button></div>
            </div>
          ) : (
            <div style={{ ...s.row(i % 2 === 1), alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E" }}>{r.name}</span>
                {r.eligible_ownership_only && <span style={{ marginLeft: 8, fontSize: 11, background: "#EEF2FF", color: "#635BFF", padding: "1px 7px", borderRadius: 10, fontWeight: 600 }}>Owned items only</span>}
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#635BFF" }}>{Number(r.discount_percent)}%</span>
              <button style={s.btnEdit} onClick={() => { setEditingId(r.id); setEditForm({ name: r.name, discount_percent: r.discount_percent, eligible_ownership_only: r.eligible_ownership_only }); setEditError(null); }}>Edit</button>
              <button style={s.btnDanger} onClick={() => deleteRow(r.id)}>Delete</button>
              {deleteErrors[r.id] && <span style={{ ...s.errorText, width: "100%", fontWeight: 500 }}>⚠ {deleteErrors[r.id]}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Fitting Fee Tab ──────────────────────────────────────────────────────────

function FittingFeeTab({ tenantId }: { tenantId: string }) {
  const h = () => ({ "x-tenant-id": tenantId, "Content-Type": "application/json" });
  const [config, setConfig] = useState<FittingFeeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/quotes/settings/fitting-fee", { headers: { "x-tenant-id": tenantId } });
    const d = await res.json();
    setConfig(d ?? { fee_per_end: 35 });
    setLoading(false);
  }, [tenantId]);
  useEffect(() => { fetch_(); }, [fetch_]);

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/quotes/settings/fitting-fee", { method: "PATCH", headers: h(), body: JSON.stringify({ fee_per_end: parseFloat(value) }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Failed"); return; }
      await fetch_(); setEditing(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch { setError("Network error"); } finally { setSaving(false); }
  };

  if (loading) return <p style={s.loadingText}>Loading…</p>;
  return (
    <div style={{ maxWidth: 480 }}>
      <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20 }}>
        The fitting fee is added automatically per end when a fittable part (e.g. lobster clasp) is added to a quote line.
      </p>
      {!editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 20px", background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Fee per end</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#635BFF" }}>{fmtNum(Number(config?.fee_per_end ?? 35))}</div>
          </div>
          <button style={{ ...s.btnEdit, marginLeft: "auto" }} onClick={() => { setEditing(true); setValue(String(config?.fee_per_end ?? 35)); setError(null); }}>Edit</button>
          {saved && <span style={{ fontSize: 13, color: "#059669" }}>✓ Saved</span>}
        </div>
      ) : (
        <div style={s.editRow}>
          <div style={s.fieldGroup}>
            <label style={s.label}>Fee per end ($)</label>
            <input autoFocus type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} style={{ ...s.input, maxWidth: 180 }} />
          </div>
          {error && <p style={s.errorText}>{error}</p>}
          <div style={s.btnRow}><button style={s.btnPrimary} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button><button style={s.btnSecondary} onClick={() => setEditing(false)}>Cancel</button></div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "parts" | "claw" | "tiers" | "restring" | "actions" | "brackets" | "discount" | "fitting";

const TAB_LABELS: Record<Tab, string> = {
  parts:    "Parts Catalogue",
  claw:     "Claw Rates",
  tiers:    "Setting Tiers",
  restring: "Restring Matrix",
  actions:  "Repair & Services",
  brackets: "Pricing Brackets",
  discount: "Discount Tiers",
  fitting:  "Fitting Fee",
};

export default function RepairQuotingSettingsPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("parts");

  useEffect(() => {
    if (!hydrated) return;
    if (!user || !canManage(user.role)) router.replace("/quotes");
  }, [user, hydrated, router]);

  if (!hydrated || !user || !canManage(user.role)) {
    return (
      <div style={{ ...s.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#9CA3AF", fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  const tenantId = user.tenantId ?? "";

  return (
    <div style={s.page}>
      <div style={s.container}>
        <h1 style={s.heading}>Repair Quoting Settings</h1>
        <p style={s.subheading}>Configure parts catalogue, rates, pricing brackets, and discount tiers for repair quotes.</p>

        <div style={s.card}>
          <div style={s.tabBar}>
            {(Object.keys(TAB_LABELS) as Tab[]).map(tab => (
              <button key={tab} style={s.tabBtn(activeTab === tab)} onClick={() => setActiveTab(tab)}>
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
          <div style={s.tabContent}>
            {activeTab === "parts"    && <PartsTab       tenantId={tenantId} />}
            {activeTab === "claw"     && <ClawRatesTab   tenantId={tenantId} />}
            {activeTab === "tiers"    && <SettingTiersTab tenantId={tenantId} />}
            {activeTab === "restring" && <RestringTab    tenantId={tenantId} />}
            {activeTab === "actions"  && <ActionsTab     tenantId={tenantId} />}
            {activeTab === "brackets" && <BracketsTab    tenantId={tenantId} />}
            {activeTab === "discount" && <DiscountTiersTab tenantId={tenantId} />}
            {activeTab === "fitting"  && <FittingFeeTab  tenantId={tenantId} />}
          </div>
        </div>
      </div>
    </div>
  );
}
