"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StageCategory {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  default_collapsed: boolean;
}

interface WorkshopStage {
  id: string;
  category_id: string | null;
  key: string;
  label: string;
  intake_substatus: string | null;
  sort_order: number;
  is_locked: boolean;
}

interface WorkshopLocation {
  id: string;
  name: string;
  job_types: string[];
  sort_order: number;
}

interface TeamMember {
  id: string;
  name: string;
  profile_id: string | null;
  sort_order: number;
  active: boolean;
}

interface Subcontractor {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLOR_OPTIONS = ["blue", "amber", "purple", "coral", "teal", "gray"] as const;
type ColorOption = typeof COLOR_OPTIONS[number];

const COLOR_HEX: Record<ColorOption, string> = {
  blue:   "#378ADD",
  amber:  "#BA7517",
  purple: "#7F77DD",
  coral:  "#D85A30",
  teal:   "#1D9E75",
  gray:   "#6B7280",
};

const JOB_TYPE_OPTIONS = [
  { value: "repair",           label: "Repair" },
  { value: "custom_order",     label: "Custom Order" },
  { value: "stock_work",       label: "Stock Work" },
  { value: "online_order",     label: "Online Order" },
  { value: "collection_order", label: "Collection Order" },
];

// ─── Shared styles ────────────────────────────────────────────────────────────

const s = {
  page: {
    minHeight: "100vh",
    background: "#F9FAFB",
    fontFamily: "Inter, sans-serif",
    padding: "32px 24px",
  } as React.CSSProperties,
  container: {
    maxWidth: 900,
    margin: "0 auto",
  } as React.CSSProperties,
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "#635BFF",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 24,
  } as React.CSSProperties,
  heading: {
    fontSize: 22,
    fontWeight: 700,
    color: "#1A1A2E",
    margin: 0,
  } as React.CSSProperties,
  subheading: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 24,
  } as React.CSSProperties,
  card: {
    background: "#fff",
    border: "1px solid #E8E8F0",
    borderRadius: 12,
    overflow: "hidden",
  } as React.CSSProperties,
  tabBar: {
    display: "flex",
    borderBottom: "1px solid #E8E8F0",
    background: "#fff",
    borderRadius: "12px 12px 0 0",
    overflow: "hidden",
  } as React.CSSProperties,
  tabBtn: (active: boolean): React.CSSProperties => ({
    padding: "12px 20px",
    border: "none",
    borderBottom: active ? "2px solid #635BFF" : "2px solid transparent",
    background: "transparent",
    color: active ? "#635BFF" : "#6B7280",
    fontFamily: "Inter, sans-serif",
    fontSize: 14,
    fontWeight: active ? 600 : 400,
    cursor: "pointer",
    transition: "color 0.15s",
  }),
  tabContent: {
    padding: 24,
  } as React.CSSProperties,
  row: (even: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 0",
    borderBottom: "1px solid #F3F4F6",
    background: even ? "#FAFAFA" : "#fff",
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 6,
    flexWrap: "wrap",
  }),
  editRow: {
    background: "#F0F0FF",
    border: "1px solid #C9C7FF",
    borderRadius: 8,
    padding: "16px",
    marginBottom: 8,
  } as React.CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#6B7280",
    marginBottom: 4,
    display: "block",
  } as React.CSSProperties,
  input: {
    padding: "6px 10px",
    border: "1px solid #D1D5DB",
    borderRadius: 6,
    fontSize: 14,
    fontFamily: "Inter, sans-serif",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  } as React.CSSProperties,
  select: {
    padding: "6px 10px",
    border: "1px solid #D1D5DB",
    borderRadius: 6,
    fontSize: 14,
    fontFamily: "Inter, sans-serif",
    outline: "none",
    width: "100%",
    background: "#fff",
    boxSizing: "border-box",
  } as React.CSSProperties,
  btnPrimary: {
    padding: "7px 16px",
    background: "#635BFF",
    color: "#fff",
    border: "none",
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "Inter, sans-serif",
  } as React.CSSProperties,
  btnSecondary: {
    padding: "7px 16px",
    background: "#fff",
    color: "#374151",
    border: "1px solid #D1D5DB",
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "Inter, sans-serif",
  } as React.CSSProperties,
  btnDanger: {
    padding: "6px 12px",
    background: "#FFF1F0",
    color: "#D85A30",
    border: "1px solid #FFCCC7",
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "Inter, sans-serif",
  } as React.CSSProperties,
  btnEdit: {
    padding: "6px 12px",
    background: "#F3F4F6",
    color: "#374151",
    border: "1px solid #E5E7EB",
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "Inter, sans-serif",
  } as React.CSSProperties,
  errorText: {
    color: "#D85A30",
    fontSize: 12,
    marginTop: 6,
  } as React.CSSProperties,
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    background: "#F3F4F6",
    color: "#6B7280",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#374151",
    marginBottom: 12,
    marginTop: 20,
    paddingBottom: 4,
    borderBottom: "1px solid #E8E8F0",
  } as React.CSSProperties,
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 12,
  } as React.CSSProperties,
  addFormCard: {
    background: "#F9FAFB",
    border: "1px solid #E8E8F0",
    borderRadius: 8,
    padding: 16,
    marginTop: 20,
  } as React.CSSProperties,
  colorSwatch: (color: ColorOption, selected: boolean): React.CSSProperties => ({
    width: 24,
    height: 24,
    borderRadius: "50%",
    background: COLOR_HEX[color],
    border: selected ? `3px solid #1A1A2E` : "3px solid transparent",
    cursor: "pointer",
    display: "inline-block",
    boxSizing: "border-box",
    outline: selected ? "2px solid #fff" : "none",
    outlineOffset: -4,
  }),
  colorDot: (hex: string): React.CSSProperties => ({
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: hex,
    display: "inline-block",
    flexShrink: 0,
  }),
  mono: {
    fontFamily: "monospace",
    fontSize: 12,
    background: "#F3F4F6",
    padding: "2px 6px",
    borderRadius: 4,
    color: "#374151",
  } as React.CSSProperties,
  tag: {
    display: "inline-block",
    padding: "2px 8px",
    background: "#EDE9FF",
    color: "#635BFF",
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 500,
    marginRight: 4,
  } as React.CSSProperties,
  loadingText: {
    color: "#9CA3AF",
    fontSize: 14,
    padding: "32px 0",
    textAlign: "center",
  } as React.CSSProperties,
  fieldGroup: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  } as React.CSSProperties,
  formRow: {
    display: "flex",
    gap: 12,
    alignItems: "flex-end",
    flexWrap: "wrap" as const,
    marginBottom: 12,
  } as React.CSSProperties,
  btnRow: {
    display: "flex",
    gap: 8,
    marginTop: 12,
    alignItems: "center",
  } as React.CSSProperties,
};

// ─── Color Swatch Picker ──────────────────────────────────────────────────────

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {COLOR_OPTIONS.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          onClick={() => onChange(c)}
          style={s.colorSwatch(c, value === c)}
        />
      ))}
    </div>
  );
}

// ─── Job Types Checkboxes ─────────────────────────────────────────────────────

function JobTypeCheckboxes({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (jt: string) => {
    onChange(value.includes(jt) ? value.filter((x) => x !== jt) : [...value, jt]);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {JOB_TYPE_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={value.includes(opt.value)}
            onChange={() => toggle(opt.value)}
            style={{ cursor: "pointer" }}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

// ─── Categories Tab ───────────────────────────────────────────────────────────

function CategoriesTab({ tenantId }: { tenantId: string }) {
  const [categories, setCategories] = useState<StageCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<StageCategory>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [addForm, setAddForm] = useState({ name: "", color: "blue", sort_order: 0 });
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const headers = { "Content-Type": "application/json", "x-tenant-id": tenantId };

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workshop/categories", { headers: { "x-tenant-id": tenantId } });
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : data.categories ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const startEdit = (cat: StageCategory) => {
    setEditingId(cat.id);
    setEditForm({ name: cat.name, color: cat.color, sort_order: cat.sort_order, default_collapsed: cat.default_collapsed });
    setEditError(null);
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); setEditError(null); };

  const saveEdit = async (id: string) => {
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/workshop/categories/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setEditError(d.error ?? d.message ?? "Failed to save");
        return;
      }
      await fetchCategories();
      cancelEdit();
    } catch {
      setEditError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    setDeleteErrors((p) => ({ ...p, [id]: "" }));
    try {
      const res = await fetch(`/api/workshop/categories/${id}`, { method: "DELETE", headers });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setDeleteErrors((p) => ({ ...p, [id]: d.error ?? d.message ?? "Failed to delete" }));
        return;
      }
      await fetchCategories();
    } catch {
      setDeleteErrors((p) => ({ ...p, [id]: "Network error" }));
    }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/workshop/categories", {
        method: "POST",
        headers,
        body: JSON.stringify(addForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAddError(d.error ?? d.message ?? "Failed to add");
        return;
      }
      setAddForm({ name: "", color: "blue", sort_order: 0 });
      await fetchCategories();
    } catch {
      setAddError("Network error");
    } finally {
      setAdding(false);
    }
  };

  if (loading) return <p style={s.loadingText}>Loading categories…</p>;

  return (
    <div>
      {categories.length === 0 && !loading && (
        <p style={{ color: "#9CA3AF", fontSize: 14 }}>No categories yet.</p>
      )}
      {categories.map((cat, i) => (
        <div key={cat.id}>
          {editingId === cat.id ? (
            <div style={s.editRow}>
              <div style={s.formGrid}>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Name</label>
                  <input
                    style={s.input}
                    value={editForm.name ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Sort Order</label>
                  <input
                    type="number"
                    style={s.input}
                    value={editForm.sort_order ?? 0}
                    onChange={(e) => setEditForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  />
                </div>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Default Collapsed</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={editForm.default_collapsed ?? false}
                      onChange={(e) => setEditForm((f) => ({ ...f, default_collapsed: e.target.checked }))}
                    />
                    Collapsed by default
                  </label>
                </div>
              </div>
              <div style={s.fieldGroup}>
                <label style={s.label}>Color</label>
                <ColorPicker
                  value={editForm.color ?? "blue"}
                  onChange={(c) => setEditForm((f) => ({ ...f, color: c }))}
                />
              </div>
              {editError && <p style={s.errorText}>{editError}</p>}
              <div style={s.btnRow}>
                <button style={s.btnPrimary} onClick={() => saveEdit(cat.id)} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button style={s.btnSecondary} onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={s.row(i % 2 === 1)}>
              <span
                style={{
                  ...s.colorDot(COLOR_HEX[(cat.color as ColorOption)] ?? "#6B7280"),
                  marginTop: 2,
                }}
              />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#1A1A2E" }}>{cat.name}</span>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>order {cat.sort_order}</span>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>{cat.default_collapsed ? "Collapsed" : "Expanded"}</span>
              <button style={s.btnEdit} onClick={() => startEdit(cat)}>Edit</button>
              <button style={s.btnDanger} onClick={() => deleteCategory(cat.id)}>Delete</button>
              {deleteErrors[cat.id] && (
                <span style={{ ...s.errorText, width: "100%" }}>{deleteErrors[cat.id]}</span>
              )}
            </div>
          )}
        </div>
      ))}

      <div style={s.addFormCard}>
        <p style={{ ...s.sectionTitle, marginTop: 0 }}>Add Category</p>
        <form onSubmit={submitAdd}>
          <div style={s.formGrid}>
            <div style={s.fieldGroup}>
              <label style={s.label}>Name *</label>
              <input
                style={s.input}
                required
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Sort Order</label>
              <input
                type="number"
                style={s.input}
                value={addForm.sort_order}
                onChange={(e) => setAddForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div style={s.fieldGroup}>
            <label style={s.label}>Color</label>
            <ColorPicker
              value={addForm.color}
              onChange={(c) => setAddForm((f) => ({ ...f, color: c }))}
            />
          </div>
          {addError && <p style={s.errorText}>{addError}</p>}
          <div style={s.btnRow}>
            <button type="submit" style={s.btnPrimary} disabled={adding}>
              {adding ? "Adding…" : "Add Category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stages Tab ───────────────────────────────────────────────────────────────

function StagesTab({ tenantId }: { tenantId: string }) {
  const [stages, setStages] = useState<WorkshopStage[]>([]);
  const [categories, setCategories] = useState<StageCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<WorkshopStage>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [addForm, setAddForm] = useState({
    key: "", label: "", intake_substatus: "", category_id: "", sort_order: 0,
  });
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const headers = { "Content-Type": "application/json", "x-tenant-id": tenantId };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([
        fetch("/api/workshop/stages", { headers: { "x-tenant-id": tenantId } }),
        fetch("/api/workshop/categories", { headers: { "x-tenant-id": tenantId } }),
      ]);
      const sData = await sRes.json();
      const cData = await cRes.json();
      setStages(Array.isArray(sData) ? sData : sData.stages ?? []);
      setCategories(Array.isArray(cData) ? cData : cData.categories ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const catName = (id: string | null) =>
    id ? (categories.find((c) => c.id === id)?.name ?? "—") : "—";

  const startEdit = (stage: WorkshopStage) => {
    setEditingId(stage.id);
    setEditForm({
      label: stage.label,
      category_id: stage.category_id ?? "",
      sort_order: stage.sort_order,
      key: stage.key,
      intake_substatus: stage.intake_substatus ?? "",
    });
    setEditError(null);
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); setEditError(null); };

  const saveEdit = async (stage: WorkshopStage) => {
    setSaving(true);
    setEditError(null);
    try {
      const body: Record<string, unknown> = {
        label: editForm.label,
        category_id: editForm.category_id || null,
        sort_order: editForm.sort_order,
      };
      if (!stage.is_locked) {
        body.key = editForm.key;
        body.intake_substatus = editForm.intake_substatus || null;
      }
      const res = await fetch(`/api/workshop/stages/${stage.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setEditError(d.error ?? d.message ?? "Failed to save");
        return;
      }
      await fetchAll();
      cancelEdit();
    } catch {
      setEditError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const deleteStage = async (id: string) => {
    if (!confirm("Delete this stage?")) return;
    setDeleteErrors((p) => ({ ...p, [id]: "" }));
    try {
      const res = await fetch(`/api/workshop/stages/${id}`, { method: "DELETE", headers });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setDeleteErrors((p) => ({ ...p, [id]: d.error ?? d.message ?? "Failed to delete" }));
        return;
      }
      await fetchAll();
    } catch {
      setDeleteErrors((p) => ({ ...p, [id]: "Network error" }));
    }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/workshop/stages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...addForm,
          category_id: addForm.category_id || null,
          intake_substatus: addForm.intake_substatus || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAddError(d.error ?? d.message ?? "Failed to add");
        return;
      }
      setAddForm({ key: "", label: "", intake_substatus: "", category_id: "", sort_order: 0 });
      await fetchAll();
    } catch {
      setAddError("Network error");
    } finally {
      setAdding(false);
    }
  };

  if (loading) return <p style={s.loadingText}>Loading stages…</p>;

  // Group by category
  const grouped: { cat: StageCategory | null; stages: WorkshopStage[] }[] = [];
  const byCatId: Record<string, WorkshopStage[]> = {};
  const uncategorised: WorkshopStage[] = [];

  for (const stage of stages) {
    if (stage.category_id) {
      if (!byCatId[stage.category_id]) byCatId[stage.category_id] = [];
      byCatId[stage.category_id].push(stage);
    } else {
      uncategorised.push(stage);
    }
  }
  for (const cat of categories) {
    if (byCatId[cat.id]) grouped.push({ cat, stages: byCatId[cat.id] });
  }
  if (uncategorised.length > 0) grouped.push({ cat: null, stages: uncategorised });

  return (
    <div>
      {stages.length === 0 && <p style={{ color: "#9CA3AF", fontSize: 14 }}>No stages yet.</p>}

      {grouped.map(({ cat, stages: groupStages }) => (
        <div key={cat?.id ?? "uncategorised"}>
          <div style={s.sectionTitle}>
            {cat ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={s.colorDot(COLOR_HEX[(cat.color as ColorOption)] ?? "#6B7280")} />
                {cat.name}
              </span>
            ) : (
              "Uncategorised"
            )}
          </div>
          {groupStages.map((stage, i) => (
            <div key={stage.id}>
              {editingId === stage.id ? (
                <div style={s.editRow}>
                  <div style={s.formGrid}>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Label</label>
                      <input
                        style={s.input}
                        value={editForm.label ?? ""}
                        onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                      />
                    </div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Key</label>
                      {stage.is_locked ? (
                        <span style={s.mono}>{stage.key}</span>
                      ) : (
                        <input
                          style={s.input}
                          value={editForm.key ?? ""}
                          onChange={(e) => setEditForm((f) => ({ ...f, key: e.target.value }))}
                        />
                      )}
                    </div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Intake Substatus</label>
                      {stage.is_locked ? (
                        <span style={{ fontSize: 13, color: "#9CA3AF" }}>{stage.intake_substatus ?? "—"}</span>
                      ) : (
                        <input
                          style={s.input}
                          value={editForm.intake_substatus ?? ""}
                          placeholder="Optional"
                          onChange={(e) => setEditForm((f) => ({ ...f, intake_substatus: e.target.value }))}
                        />
                      )}
                    </div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Category</label>
                      <select
                        style={s.select}
                        value={editForm.category_id ?? ""}
                        onChange={(e) => setEditForm((f) => ({ ...f, category_id: e.target.value }))}
                      >
                        <option value="">None</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div style={s.fieldGroup}>
                      <label style={s.label}>Sort Order</label>
                      <input
                        type="number"
                        style={s.input}
                        value={editForm.sort_order ?? 0}
                        onChange={(e) => setEditForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                  {editError && <p style={s.errorText}>{editError}</p>}
                  <div style={s.btnRow}>
                    <button style={s.btnPrimary} onClick={() => saveEdit(stage)} disabled={saving}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button style={s.btnSecondary} onClick={cancelEdit}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={s.row(i % 2 === 1)}>
                  {stage.is_locked && <span style={s.badge}>Locked</span>}
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#1A1A2E" }}>
                    {stage.label}
                  </span>
                  <span style={s.mono}>{stage.key}</span>
                  {stage.intake_substatus && (
                    <span style={{ fontSize: 12, color: "#6B7280" }}>{stage.intake_substatus}</span>
                  )}
                  <span style={{ fontSize: 12, color: "#9CA3AF" }}>order {stage.sort_order}</span>
                  <button style={s.btnEdit} onClick={() => startEdit(stage)}>Edit</button>
                  <div
                    title={stage.is_locked ? "Locked — cannot be deleted" : undefined}
                    style={{ display: "inline-block" }}
                  >
                    <button
                      style={{
                        ...s.btnDanger,
                        ...(stage.is_locked ? { opacity: 0.4, cursor: "not-allowed" } : {}),
                      }}
                      onClick={() => !stage.is_locked && deleteStage(stage.id)}
                      disabled={stage.is_locked}
                    >
                      Delete
                    </button>
                  </div>
                  {deleteErrors[stage.id] && (
                    <span style={{ ...s.errorText, width: "100%" }}>{deleteErrors[stage.id]}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      <div style={s.addFormCard}>
        <p style={{ ...s.sectionTitle, marginTop: 0 }}>Add Stage</p>
        <form onSubmit={submitAdd}>
          <div style={s.formGrid}>
            <div style={s.fieldGroup}>
              <label style={s.label}>Key *</label>
              <input
                style={s.input}
                required
                value={addForm.key}
                placeholder="e.g. in_progress"
                onChange={(e) => setAddForm((f) => ({ ...f, key: e.target.value }))}
              />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Label *</label>
              <input
                style={s.input}
                required
                value={addForm.label}
                onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Intake Substatus</label>
              <input
                style={s.input}
                value={addForm.intake_substatus}
                placeholder="Optional"
                onChange={(e) => setAddForm((f) => ({ ...f, intake_substatus: e.target.value }))}
              />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Category</label>
              <select
                style={s.select}
                value={addForm.category_id}
                onChange={(e) => setAddForm((f) => ({ ...f, category_id: e.target.value }))}
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Sort Order</label>
              <input
                type="number"
                style={s.input}
                value={addForm.sort_order}
                onChange={(e) => setAddForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
          </div>
          {addError && <p style={s.errorText}>{addError}</p>}
          <div style={s.btnRow}>
            <button type="submit" style={s.btnPrimary} disabled={adding}>
              {adding ? "Adding…" : "Add Stage"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Locations Tab ────────────────────────────────────────────────────────────

function LocationsTab({ tenantId }: { tenantId: string }) {
  const [locations, setLocations] = useState<WorkshopLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<WorkshopLocation>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [addForm, setAddForm] = useState({ name: "", job_types: [] as string[], sort_order: 0 });
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const headers = { "Content-Type": "application/json", "x-tenant-id": tenantId };

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workshop/locations", { headers: { "x-tenant-id": tenantId } });
      const data = await res.json();
      setLocations(Array.isArray(data) ? data : data.locations ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  const startEdit = (loc: WorkshopLocation) => {
    setEditingId(loc.id);
    setEditForm({ name: loc.name, job_types: [...loc.job_types], sort_order: loc.sort_order });
    setEditError(null);
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); setEditError(null); };

  const saveEdit = async (id: string) => {
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/workshop/locations/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setEditError(d.error ?? d.message ?? "Failed to save");
        return;
      }
      await fetchLocations();
      cancelEdit();
    } catch {
      setEditError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const deleteLocation = async (id: string) => {
    if (!confirm("Delete this location?")) return;
    setDeleteErrors((p) => ({ ...p, [id]: "" }));
    try {
      const res = await fetch(`/api/workshop/locations/${id}`, { method: "DELETE", headers });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setDeleteErrors((p) => ({ ...p, [id]: d.error ?? d.message ?? "Failed to delete" }));
        return;
      }
      await fetchLocations();
    } catch {
      setDeleteErrors((p) => ({ ...p, [id]: "Network error" }));
    }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/workshop/locations", {
        method: "POST",
        headers,
        body: JSON.stringify(addForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAddError(d.error ?? d.message ?? "Failed to add");
        return;
      }
      setAddForm({ name: "", job_types: [], sort_order: 0 });
      await fetchLocations();
    } catch {
      setAddError("Network error");
    } finally {
      setAdding(false);
    }
  };

  const jobTypeLabel = (v: string) => JOB_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;

  if (loading) return <p style={s.loadingText}>Loading locations…</p>;

  return (
    <div>
      {locations.length === 0 && <p style={{ color: "#9CA3AF", fontSize: 14 }}>No locations yet.</p>}

      {locations.map((loc, i) => (
        <div key={loc.id}>
          {editingId === loc.id ? (
            <div style={s.editRow}>
              <div style={s.formGrid}>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Name</label>
                  <input
                    style={s.input}
                    value={editForm.name ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Sort Order</label>
                  <input
                    type="number"
                    style={s.input}
                    value={editForm.sort_order ?? 0}
                    onChange={(e) => setEditForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div style={s.fieldGroup}>
                <label style={s.label}>Job Types</label>
                <JobTypeCheckboxes
                  value={editForm.job_types ?? []}
                  onChange={(v) => setEditForm((f) => ({ ...f, job_types: v }))}
                />
              </div>
              {editError && <p style={s.errorText}>{editError}</p>}
              <div style={s.btnRow}>
                <button style={s.btnPrimary} onClick={() => saveEdit(loc.id)} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button style={s.btnSecondary} onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={s.row(i % 2 === 1)}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#1A1A2E" }}>{loc.name}</span>
              <span style={{ flex: 2, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                {loc.job_types.length === 0 ? (
                  <span style={{ color: "#9CA3AF", fontSize: 12 }}>No job types</span>
                ) : (
                  loc.job_types.map((jt) => (
                    <span key={jt} style={s.tag}>{jobTypeLabel(jt)}</span>
                  ))
                )}
              </span>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>order {loc.sort_order}</span>
              <button style={s.btnEdit} onClick={() => startEdit(loc)}>Edit</button>
              <button style={s.btnDanger} onClick={() => deleteLocation(loc.id)}>Delete</button>
              {deleteErrors[loc.id] && (
                <span style={{ ...s.errorText, width: "100%" }}>{deleteErrors[loc.id]}</span>
              )}
            </div>
          )}
        </div>
      ))}

      <div style={s.addFormCard}>
        <p style={{ ...s.sectionTitle, marginTop: 0 }}>Add Location</p>
        <form onSubmit={submitAdd}>
          <div style={s.formGrid}>
            <div style={s.fieldGroup}>
              <label style={s.label}>Name *</label>
              <input
                style={s.input}
                required
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Sort Order</label>
              <input
                type="number"
                style={s.input}
                value={addForm.sort_order}
                onChange={(e) => setAddForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div style={s.fieldGroup}>
            <label style={s.label}>Job Types</label>
            <JobTypeCheckboxes
              value={addForm.job_types}
              onChange={(v) => setAddForm((f) => ({ ...f, job_types: v }))}
            />
          </div>
          {addError && <p style={s.errorText}>{addError}</p>}
          <div style={s.btnRow}>
            <button type="submit" style={s.btnPrimary} disabled={adding}>
              {adding ? "Adding…" : "Add Location"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Team Members Tab ─────────────────────────────────────────────────────────

function TeamMembersTab({ tenantId }: { tenantId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<TeamMember>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [addForm, setAddForm] = useState({ name: "", sort_order: 0, active: true });
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const headers = { "Content-Type": "application/json", "x-tenant-id": tenantId };

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workshop/team-members", { headers: { "x-tenant-id": tenantId } });
      const data = await res.json();
      setMembers(Array.isArray(data) ? data : data.members ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const startEdit = (m: TeamMember) => {
    setEditingId(m.id);
    setEditForm({ name: m.name, sort_order: m.sort_order, active: m.active });
    setEditError(null);
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); setEditError(null); };

  const saveEdit = async (id: string) => {
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/workshop/team-members/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setEditError(d.error ?? d.message ?? "Failed to save");
        return;
      }
      await fetchMembers();
      cancelEdit();
    } catch {
      setEditError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const deleteMember = async (id: string) => {
    if (!confirm("Delete this team member?")) return;
    setDeleteErrors((p) => ({ ...p, [id]: "" }));
    try {
      const res = await fetch(`/api/workshop/team-members/${id}`, { method: "DELETE", headers });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setDeleteErrors((p) => ({ ...p, [id]: d.error ?? d.message ?? "Failed to delete" }));
        return;
      }
      await fetchMembers();
    } catch {
      setDeleteErrors((p) => ({ ...p, [id]: "Network error" }));
    }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/workshop/team-members", {
        method: "POST",
        headers,
        body: JSON.stringify(addForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAddError(d.error ?? d.message ?? "Failed to add");
        return;
      }
      setAddForm({ name: "", sort_order: 0, active: true });
      await fetchMembers();
    } catch {
      setAddError("Network error");
    } finally {
      setAdding(false);
    }
  };

  if (loading) return <p style={s.loadingText}>Loading team members…</p>;

  return (
    <div>
      {members.length === 0 && <p style={{ color: "#9CA3AF", fontSize: 14 }}>No team members yet.</p>}

      {members.map((m, i) => (
        <div key={m.id}>
          {editingId === m.id ? (
            <div style={s.editRow}>
              <div style={s.formGrid}>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Name</label>
                  <input
                    style={s.input}
                    value={editForm.name ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Sort Order</label>
                  <input
                    type="number"
                    style={s.input}
                    value={editForm.sort_order ?? 0}
                    onChange={(e) => setEditForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  />
                </div>
                <div style={{ ...s.fieldGroup, justifyContent: "center" as const }}>
                  <label style={{ ...s.label, marginBottom: 8 }}>Active</label>
                  <input
                    type="checkbox"
                    checked={editForm.active ?? true}
                    onChange={(e) => setEditForm((f) => ({ ...f, active: e.target.checked }))}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                </div>
              </div>
              {editError && <p style={s.errorText}>{editError}</p>}
              <div style={s.btnRow}>
                <button style={s.btnPrimary} onClick={() => saveEdit(m.id)} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button style={s.btnSecondary} onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={s.row(i % 2 === 1)}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#1A1A2E" }}>{m.name}</span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                background: m.active ? "#D1FAE5" : "#F3F4F6",
                color: m.active ? "#065F46" : "#6B7280",
              }}>
                {m.active ? "Active" : "Inactive"}
              </span>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>order {m.sort_order}</span>
              <button style={s.btnEdit} onClick={() => startEdit(m)}>Edit</button>
              <button style={s.btnDanger} onClick={() => deleteMember(m.id)}>Delete</button>
              {deleteErrors[m.id] && (
                <span style={{ ...s.errorText, width: "100%" }}>{deleteErrors[m.id]}</span>
              )}
            </div>
          )}
        </div>
      ))}

      <div style={s.addFormCard}>
        <p style={{ ...s.sectionTitle, marginTop: 0 }}>Add Team Member</p>
        <form onSubmit={submitAdd}>
          <div style={s.formGrid}>
            <div style={s.fieldGroup}>
              <label style={s.label}>Name *</label>
              <input
                style={s.input}
                required
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Sort Order</label>
              <input
                type="number"
                style={s.input}
                value={addForm.sort_order}
                onChange={(e) => setAddForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
          </div>
          {addError && <p style={s.errorText}>{addError}</p>}
          <div style={s.btnRow}>
            <button type="submit" style={s.btnPrimary} disabled={adding}>
              {adding ? "Adding…" : "Add Team Member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Sub-contractors Tab ──────────────────────────────────────────────────────

function SubcontractorsTab({ tenantId }: { tenantId: string }) {
  const [subcontractors, setSubcontractors] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Subcontractor>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [addForm, setAddForm] = useState({ name: "", sort_order: 0, active: true });
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const headers = { "Content-Type": "application/json", "x-tenant-id": tenantId };

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workshop/subcontractors", { headers: { "x-tenant-id": tenantId } });
      const data = await res.json();
      setSubcontractors(Array.isArray(data) ? data : data.subcontractors ?? []);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  const startEdit = (sub: Subcontractor) => {
    setEditingId(sub.id);
    setEditForm({ name: sub.name, sort_order: sub.sort_order, active: sub.active });
    setEditError(null);
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); setEditError(null); };

  const saveEdit = async (id: string) => {
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/workshop/subcontractors/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setEditError(d.error ?? d.message ?? "Failed to save");
        return;
      }
      await fetchSubs();
      cancelEdit();
    } catch {
      setEditError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const deleteSub = async (id: string) => {
    if (!confirm("Delete this sub-contractor?")) return;
    setDeleteErrors((p) => ({ ...p, [id]: "" }));
    try {
      const res = await fetch(`/api/workshop/subcontractors/${id}`, { method: "DELETE", headers });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setDeleteErrors((p) => ({ ...p, [id]: d.error ?? d.message ?? "Failed to delete" }));
        return;
      }
      await fetchSubs();
    } catch {
      setDeleteErrors((p) => ({ ...p, [id]: "Network error" }));
    }
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/workshop/subcontractors", {
        method: "POST",
        headers,
        body: JSON.stringify(addForm),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAddError(d.error ?? d.message ?? "Failed to add");
        return;
      }
      setAddForm({ name: "", sort_order: 0, active: true });
      await fetchSubs();
    } catch {
      setAddError("Network error");
    } finally {
      setAdding(false);
    }
  };

  if (loading) return <p style={s.loadingText}>Loading sub-contractors…</p>;

  return (
    <div>
      {subcontractors.length === 0 && <p style={{ color: "#9CA3AF", fontSize: 14 }}>No sub-contractors yet.</p>}

      {subcontractors.map((sub, i) => (
        <div key={sub.id}>
          {editingId === sub.id ? (
            <div style={s.editRow}>
              <div style={s.formGrid}>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Name</label>
                  <input
                    style={s.input}
                    value={editForm.name ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div style={s.fieldGroup}>
                  <label style={s.label}>Sort Order</label>
                  <input
                    type="number"
                    style={s.input}
                    value={editForm.sort_order ?? 0}
                    onChange={(e) => setEditForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  />
                </div>
                <div style={{ ...s.fieldGroup, justifyContent: "center" as const }}>
                  <label style={{ ...s.label, marginBottom: 8 }}>Active</label>
                  <input
                    type="checkbox"
                    checked={editForm.active ?? true}
                    onChange={(e) => setEditForm((f) => ({ ...f, active: e.target.checked }))}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                </div>
              </div>
              {editError && <p style={s.errorText}>{editError}</p>}
              <div style={s.btnRow}>
                <button style={s.btnPrimary} onClick={() => saveEdit(sub.id)} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button style={s.btnSecondary} onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={s.row(i % 2 === 1)}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: "#1A1A2E" }}>{sub.name}</span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
                background: sub.active ? "#D1FAE5" : "#F3F4F6",
                color: sub.active ? "#065F46" : "#6B7280",
              }}>
                {sub.active ? "Active" : "Inactive"}
              </span>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>order {sub.sort_order}</span>
              <button style={s.btnEdit} onClick={() => startEdit(sub)}>Edit</button>
              <button style={s.btnDanger} onClick={() => deleteSub(sub.id)}>Delete</button>
              {deleteErrors[sub.id] && (
                <span style={{ ...s.errorText, width: "100%" }}>{deleteErrors[sub.id]}</span>
              )}
            </div>
          )}
        </div>
      ))}

      <div style={s.addFormCard}>
        <p style={{ ...s.sectionTitle, marginTop: 0 }}>Add Sub-contractor</p>
        <form onSubmit={submitAdd}>
          <div style={s.formGrid}>
            <div style={s.fieldGroup}>
              <label style={s.label}>Name *</label>
              <input
                style={s.input}
                required
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div style={s.fieldGroup}>
              <label style={s.label}>Sort Order</label>
              <input
                type="number"
                style={s.input}
                value={addForm.sort_order}
                onChange={(e) => setAddForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
          </div>
          {addError && <p style={s.errorText}>{addError}</p>}
          <div style={s.btnRow}>
            <button type="submit" style={s.btnPrimary} disabled={adding}>
              {adding ? "Adding…" : "Add Sub-contractor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "categories" | "stages" | "locations" | "team" | "subcontractors";

const TAB_LABELS: Record<Tab, string> = {
  categories:    "Categories",
  stages:        "Stages",
  locations:     "Locations",
  team:          "Team Members",
  subcontractors: "Sub-contractors",
};

export default function WorkshopSettingsPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("categories");

  useEffect(() => {
    if (!hydrated) return;
    if (!user || !canManage(user.role)) {
      router.replace("/workshop");
    }
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
        <a href="/workshop" style={s.backLink}>
          ← Back to Workshop
        </a>
        <h1 style={s.heading}>Workshop Settings</h1>
        <p style={s.subheading}>Configure categories, stages, and locations for your workshop.</p>

        <div style={s.card}>
          <div style={s.tabBar}>
            {(["categories", "stages", "locations", "team", "subcontractors"] as Tab[]).map((tab) => (
              <button
                key={tab}
                style={s.tabBtn(activeTab === tab)}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
          <div style={s.tabContent}>
            {activeTab === "categories"    && <CategoriesTab    tenantId={tenantId} />}
            {activeTab === "stages"        && <StagesTab        tenantId={tenantId} />}
            {activeTab === "locations"     && <LocationsTab     tenantId={tenantId} />}
            {activeTab === "team"          && <TeamMembersTab   tenantId={tenantId} />}
            {activeTab === "subcontractors" && <SubcontractorsTab tenantId={tenantId} />}
          </div>
        </div>
      </div>
    </div>
  );
}
