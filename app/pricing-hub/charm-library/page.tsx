"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CharmComponent {
  id: string;
  name: string;
  supplier_code: string | null;
  component_type: string;
  gram_weight: number | null;
  making_charge: number | null;
  averaged_cost_9y: number | null;
  averaged_cost_9w: number | null;
  averaged_cost_18y: number | null;
  averaged_cost_18w: number | null;
  available_for: string;
  product_status: string;
  labour_per_unit: number;
  sort_order: number;
  active: boolean;
  stock_count: number;
}

const TYPE_LABELS: Record<string, string> = {
  chain:                  "Chain",
  gold_initial:           "Gold Initial",
  diamond_initial:        "Diamond Initial",
  birthstone_colourstone: "Birthstone (Colour)",
  birthstone_diamond:     "Birthstone (Diamond)",
  diamond_pendant:        "Diamond Pendant",
  charm:                  "Charm",
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  in_stock:      { bg: "#DCFCE7", text: "#166534", label: "In Stock" },
  order_required:{ bg: "#FEF3C7", text: "#92400E", label: "Order Required" },
  custom_order:  { bg: "#EDE9FE", text: "#4C1D95", label: "Custom Order" },
};

const COMPONENT_TYPES = ["chain", "gold_initial", "diamond_initial", "birthstone_colourstone", "birthstone_diamond", "diamond_pendant", "charm"];
const STATUS_OPTIONS   = ["in_stock", "order_required", "custom_order"];
const AVAIL_OPTIONS    = ["both", "necklace", "bracelet"];

const th: React.CSSProperties = {
  padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#6B7280",
  textTransform: "uppercase", letterSpacing: "0.04em",
  background: "#F9FAFB", borderBottom: "1px solid #E8E8F0", textAlign: "left",
};
const td: React.CSSProperties = { padding: "11px 12px", fontSize: 13, color: "#374151", borderBottom: "1px solid #F3F4F6" };
const inp: React.CSSProperties = { padding: "6px 9px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12, boxSizing: "border-box" as const, width: "100%" };

const EMPTY_NEW = {
  name: "", supplier_code: "", component_type: "charm",
  gram_weight: "", making_charge: "0",
  averaged_cost_9y: "", averaged_cost_9w: "", averaged_cost_18y: "", averaged_cost_18w: "",
  available_for: "both", product_status: "in_stock",
  labour_per_unit: "40", sort_order: "0",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function CharmLibraryPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  const [components, setComponents]     = useState<CharmComponent[]>([]);
  const [loading, setLoading]           = useState(true);
  const [pageError, setPageError]       = useState<string | null>(null);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editBuf, setEditBuf]           = useState<Record<string, string>>({});
  const [saving, setSaving]             = useState(false);
  const [showAdd, setShowAdd]           = useState(false);
  const [newComp, setNewComp]           = useState({ ...EMPTY_NEW });
  const [addSaving, setAddSaving]       = useState(false);
  const [addError, setAddError]         = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && user && user.role !== "admin") router.replace("/");
  }, [hydrated, user, router]);

  const tid = user?.tenantId ?? "";

  const load = useCallback(async () => {
    if (!hydrated || !user || user.role !== "admin") return;
    setLoading(true);
    setPageError(null);
    try {
      const res  = await fetch("/api/charm-components", { credentials: "include", headers: { "x-tenant-id": tid } });
      const data = await res.json();
      if (!res.ok) {
        setPageError(data?.error ?? `Failed to load (${res.status})`);
        return;
      }
      setComponents(data ?? []);
    } catch (err) {
      console.error("[charm-library] load error:", err);
      setPageError("Failed to load charm components.");
    } finally {
      setLoading(false);
    }
  }, [hydrated, user, tid]);

  useEffect(() => { load(); }, [load]);

  function startEdit(c: CharmComponent) {
    setEditingId(c.id);
    setEditBuf({
      name:              c.name,
      supplier_code:     c.supplier_code ?? "",
      component_type:    c.component_type,
      gram_weight:       c.gram_weight != null ? String(c.gram_weight) : "",
      making_charge:     c.making_charge != null ? String(c.making_charge) : "0",
      averaged_cost_9y:  c.averaged_cost_9y != null ? String(c.averaged_cost_9y) : "",
      averaged_cost_9w:  c.averaged_cost_9w != null ? String(c.averaged_cost_9w) : "",
      averaged_cost_18y: c.averaged_cost_18y != null ? String(c.averaged_cost_18y) : "",
      averaged_cost_18w: c.averaged_cost_18w != null ? String(c.averaged_cost_18w) : "",
      available_for:     c.available_for,
      product_status:    c.product_status,
      labour_per_unit:   String(c.labour_per_unit),
      sort_order:        String(c.sort_order),
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/charm-components/${editingId}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json", "x-tenant-id": tid },
        body: JSON.stringify({
          name:              editBuf.name,
          supplier_code:     editBuf.supplier_code || null,
          component_type:    editBuf.component_type,
          gram_weight:       editBuf.gram_weight ? Number(editBuf.gram_weight) : null,
          making_charge:     editBuf.making_charge ? Number(editBuf.making_charge) : 0,
          averaged_cost_9y:  editBuf.averaged_cost_9y ? Number(editBuf.averaged_cost_9y) : null,
          averaged_cost_9w:  editBuf.averaged_cost_9w ? Number(editBuf.averaged_cost_9w) : null,
          averaged_cost_18y: editBuf.averaged_cost_18y ? Number(editBuf.averaged_cost_18y) : null,
          averaged_cost_18w: editBuf.averaged_cost_18w ? Number(editBuf.averaged_cost_18w) : null,
          available_for:     editBuf.available_for,
          product_status:    editBuf.product_status,
          labour_per_unit:   editBuf.labour_per_unit ? Number(editBuf.labour_per_unit) : 40,
          sort_order:        editBuf.sort_order ? Number(editBuf.sort_order) : 0,
        }),
      });
      if (!res.ok) { const d = await res.json(); console.error(d.error); }
      setEditingId(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteComp(id: string) {
    if (!confirm("Remove this component from the library?")) return;
    await fetch(`/api/charm-components/${id}`, {
      method: "DELETE", credentials: "include", headers: { "x-tenant-id": tid },
    });
    load();
  }

  async function addComponent() {
    if (!newComp.name.trim()) { setAddError("Name is required"); return; }
    setAddSaving(true); setAddError(null);
    try {
      const res = await fetch("/api/charm-components", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "x-tenant-id": tid },
        body: JSON.stringify({
          name:              newComp.name.trim(),
          supplier_code:     newComp.supplier_code || null,
          component_type:    newComp.component_type,
          gram_weight:       newComp.gram_weight ? Number(newComp.gram_weight) : null,
          making_charge:     newComp.making_charge ? Number(newComp.making_charge) : 0,
          averaged_cost_9y:  newComp.averaged_cost_9y ? Number(newComp.averaged_cost_9y) : null,
          averaged_cost_9w:  newComp.averaged_cost_9w ? Number(newComp.averaged_cost_9w) : null,
          averaged_cost_18y: newComp.averaged_cost_18y ? Number(newComp.averaged_cost_18y) : null,
          averaged_cost_18w: newComp.averaged_cost_18w ? Number(newComp.averaged_cost_18w) : null,
          available_for:     newComp.available_for,
          product_status:    newComp.product_status,
          labour_per_unit:   newComp.labour_per_unit ? Number(newComp.labour_per_unit) : 40,
          sort_order:        newComp.sort_order ? Number(newComp.sort_order) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error ?? "Failed"); return; }
      setNewComp({ ...EMPTY_NEW });
      setShowAdd(false);
      load();
    } finally {
      setAddSaving(false);
    }
  }

  function fmtCost(v: number | null) {
    if (v == null) return <span style={{ color: "#F59E0B" }}>⚠</span>;
    return `$${Number(v).toFixed(2)}`;
  }

  if (!hydrated || !user) return <div style={{ padding: "32px 40px", color: "#9CA3AF", fontSize: 14 }}>Loading…</div>;
  if (user.role !== "admin") return null;
  if (loading) return <div style={{ padding: "32px 40px", color: "#9CA3AF", fontSize: 14 }}>Loading…</div>;
  if (pageError) return (
    <div style={{ padding: "32px 40px" }}>
      <p style={{ color: "#DC2626", fontSize: 14, marginBottom: 8 }}>Error: {pageError}</p>
      <Link href="/pricing-hub" style={{ color: "#635BFF", fontSize: 13 }}>← Back to Pricing Hub</Link>
    </div>
  );

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 6 }}>
            <Link href="/pricing-hub" style={{ color: "#635BFF", textDecoration: "none" }}>Pricing Hub</Link>
            <span style={{ margin: "0 6px" }}>›</span>Charm Library
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1760", margin: 0 }}>Charm Library</h1>
            <span style={{ padding: "3px 10px", background: "#EDE9FE", color: "#4C1D95", borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>
              CLASS A CUSTOM
            </span>
          </div>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            Manage charm components for Personalised Charm Necklace and Bracelet
          </p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          style={{ padding: "9px 18px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          + Add Component
        </button>
      </div>

      {/* Add Component Form */}
      {showAdd && (
        <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10, padding: 18, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 14 }}>New Component</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Name *</label>
              <input value={newComp.name} onChange={e => setNewComp(v => ({ ...v, name: e.target.value }))} style={inp} placeholder="e.g. North Star" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Supplier Code</label>
              <input value={newComp.supplier_code} onChange={e => setNewComp(v => ({ ...v, supplier_code: e.target.value }))} style={inp} placeholder="e.g. A9855P" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Type</label>
              <select value={newComp.component_type} onChange={e => setNewComp(v => ({ ...v, component_type: e.target.value }))} style={inp}>
                {COMPONENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Status</label>
              <select value={newComp.product_status} onChange={e => setNewComp(v => ({ ...v, product_status: e.target.value }))} style={inp}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            {[
              { label: "9YG Cost ($)", key: "averaged_cost_9y" },
              { label: "9WG Cost ($)", key: "averaged_cost_9w" },
              { label: "18YG Cost ($)", key: "averaged_cost_18y" },
              { label: "18WG Cost ($)", key: "averaged_cost_18w" },
              { label: "Gram Weight (g)", key: "gram_weight" },
              { label: "Making Charge ($)", key: "making_charge" },
            ].map(({ label, key }) => (
              <div key={key}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>{label}</label>
                <input type="number" step="0.01" min="0"
                  value={(newComp as Record<string, string>)[key]}
                  onChange={e => setNewComp(v => ({ ...v, [key]: e.target.value }))}
                  style={inp} placeholder="—" />
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Labour / Unit ($)</label>
              <input type="number" step="1" min="0" value={newComp.labour_per_unit} onChange={e => setNewComp(v => ({ ...v, labour_per_unit: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Available For</label>
              <select value={newComp.available_for} onChange={e => setNewComp(v => ({ ...v, available_for: e.target.value }))} style={inp}>
                {AVAIL_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Sort Order</label>
              <input type="number" step="1" min="0" value={newComp.sort_order} onChange={e => setNewComp(v => ({ ...v, sort_order: e.target.value }))} style={inp} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addComponent} disabled={addSaving}
              style={{ padding: "7px 16px", background: addSaving ? "#E8E8F0" : "#635BFF", color: addSaving ? "#9CA3AF" : "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {addSaving ? "Saving…" : "Add Component"}
            </button>
            <button onClick={() => { setShowAdd(false); setAddError(null); }}
              style={{ padding: "7px 12px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 13, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
          {addError && <p style={{ color: "#DC2626", fontSize: 13, marginTop: 8 }}>{addError}</p>}
        </div>
      )}

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Type</th>
              <th style={th}>Code</th>
              <th style={{ ...th, textAlign: "right" }}>9YG</th>
              <th style={{ ...th, textAlign: "right" }}>9WG</th>
              <th style={{ ...th, textAlign: "right" }}>Grams</th>
              <th style={{ ...th, textAlign: "right" }}>Labour</th>
              <th style={{ ...th, textAlign: "right" }}>Stock</th>
              <th style={th}>Status</th>
              <th style={{ ...th, width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {components.map(c => {
              const isEditing = editingId === c.id;
              const sc = STATUS_CONFIG[c.product_status] ?? STATUS_CONFIG.in_stock;
              return (
                <React.Fragment key={c.id}>
                  <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={td}>
                      {isEditing
                        ? <input value={editBuf.name} onChange={e => setEditBuf(b => ({ ...b, name: e.target.value }))} style={{ ...inp, width: 160 }} autoFocus />
                        : <span style={{ fontWeight: 600, color: "#1A1760" }}>{c.name}</span>
                      }
                    </td>
                    <td style={td}>
                      {isEditing
                        ? <select value={editBuf.component_type} onChange={e => setEditBuf(b => ({ ...b, component_type: e.target.value }))} style={{ ...inp, width: 140 }}>
                            {COMPONENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>)}
                          </select>
                        : <span style={{ color: "#6B7280" }}>{TYPE_LABELS[c.component_type] ?? c.component_type}</span>
                      }
                    </td>
                    <td style={td}>
                      {isEditing
                        ? <input value={editBuf.supplier_code} onChange={e => setEditBuf(b => ({ ...b, supplier_code: e.target.value }))} style={{ ...inp, width: 90 }} />
                        : <span style={{ fontSize: 12, fontFamily: "monospace", color: "#6B7280" }}>{c.supplier_code ?? "—"}</span>
                      }
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {isEditing
                        ? <input type="number" step="0.01" value={editBuf.averaged_cost_9y} onChange={e => setEditBuf(b => ({ ...b, averaged_cost_9y: e.target.value }))} style={{ ...inp, width: 70, textAlign: "right" }} />
                        : fmtCost(c.averaged_cost_9y)
                      }
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {isEditing
                        ? <input type="number" step="0.01" value={editBuf.averaged_cost_9w} onChange={e => setEditBuf(b => ({ ...b, averaged_cost_9w: e.target.value }))} style={{ ...inp, width: 70, textAlign: "right" }} />
                        : fmtCost(c.averaged_cost_9w)
                      }
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {isEditing
                        ? <input type="number" step="0.001" value={editBuf.gram_weight} onChange={e => setEditBuf(b => ({ ...b, gram_weight: e.target.value }))} style={{ ...inp, width: 60, textAlign: "right" }} />
                        : c.gram_weight != null ? `${Number(c.gram_weight).toFixed(3)}g` : <span style={{ color: "#9CA3AF" }}>—</span>
                      }
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {isEditing
                        ? <input type="number" step="1" value={editBuf.labour_per_unit} onChange={e => setEditBuf(b => ({ ...b, labour_per_unit: e.target.value }))} style={{ ...inp, width: 60, textAlign: "right" }} />
                        : `$${Number(c.labour_per_unit).toFixed(0)}`
                      }
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <span style={{ fontWeight: 600, color: c.stock_count > 0 ? "#16A34A" : "#9CA3AF" }}>
                        {c.stock_count > 0 ? c.stock_count : "—"}
                      </span>
                    </td>
                    <td style={td}>
                      {isEditing
                        ? <select value={editBuf.product_status} onChange={e => setEditBuf(b => ({ ...b, product_status: e.target.value }))} style={{ ...inp, width: 130 }}>
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_CONFIG[s]?.label ?? s}</option>)}
                          </select>
                        : <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.text }}>
                            {sc.label}
                          </span>
                      }
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        {isEditing ? (
                          <>
                            <button onClick={saveEdit} disabled={saving}
                              style={{ padding: "3px 10px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                              {saving ? "…" : "Save"}
                            </button>
                            <button onClick={() => setEditingId(null)}
                              style={{ padding: "3px 8px", background: "transparent", color: "#6B7280", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(c)} title="Edit"
                              style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 14 }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#635BFF")}
                              onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}>✎</button>
                            <button onClick={() => deleteComp(c.id)} title="Remove"
                              style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 14 }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#DC2626")}
                              onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}>✕</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Expanded edit rows for 18ct and extra fields */}
                  {isEditing && (
                    <tr>
                      <td colSpan={10} style={{ padding: "0 12px 12px", background: "#F9FAFB", borderBottom: "1px solid #F3F4F6" }}>
                        <div style={{ display: "flex", gap: 10, paddingTop: 10, flexWrap: "wrap" as const, alignItems: "flex-end" }}>
                          {[
                            { label: "18YG Cost ($)", key: "averaged_cost_18y" },
                            { label: "18WG Cost ($)", key: "averaged_cost_18w" },
                            { label: "Making Charge ($)", key: "making_charge" },
                          ].map(({ label, key }) => (
                            <div key={key}>
                              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>{label}</label>
                              <input type="number" step="0.01" value={editBuf[key]} onChange={e => setEditBuf(b => ({ ...b, [key]: e.target.value }))} style={{ ...inp, width: 90 }} />
                            </div>
                          ))}
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Available For</label>
                            <select value={editBuf.available_for} onChange={e => setEditBuf(b => ({ ...b, available_for: e.target.value }))} style={{ ...inp, width: 100 }}>
                              {AVAIL_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 3 }}>Sort Order</label>
                            <input type="number" step="1" min="0" value={editBuf.sort_order} onChange={e => setEditBuf(b => ({ ...b, sort_order: e.target.value }))} style={{ ...inp, width: 60 }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {components.length === 0 && (
          <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
            No components yet. Click "+ Add Component" to add your first charm.
          </div>
        )}
      </div>
    </div>
  );
}
