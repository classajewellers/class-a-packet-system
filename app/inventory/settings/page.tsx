"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { InventoryReferenceData } from "@/lib/types";
import { color, radius, shadow } from "@/lib/theme";
import { Plus, Edit2, Trash2, Save, X, Check } from "lucide-react";

type TabKey = "statuses" | "locations" | "categories" | "suppliers";

const TABS: { key: TabKey; label: string }[] = [
  { key: "statuses",   label: "Statuses"   },
  { key: "locations",  label: "Locations"  },
  { key: "categories", label: "Categories" },
  { key: "suppliers",  label: "Suppliers"  },
];

const STATUS_COLOURS = [
  "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#8B5CF6",
  "#EC4899", "#6B7280", "#F97316", "#06B6D4", "#84CC16",
];

const LOCATION_TYPES = ["Storage", "Display", "Service", "External", "Transit"];

function ColourDot({ colour, selected, onClick }: { colour: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ width: 24, height: 24, borderRadius: "50%", background: colour, border: selected ? `3px solid ${color.ink}` : "2px solid transparent", cursor: "pointer", outline: "none", position: "relative" }}
    >
      {selected && <Check size={12} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", color: "#fff" }} />}
    </button>
  );
}

export default function InventorySettingsPage() {
  const { user, hydrated } = useUser();
  const tenantId: string = user?.tenantId ?? "";
  const isManager = hydrated ? canManage(user?.role) : false;

  const [tab, setTab]     = useState<TabKey>("statuses");
  const [ref, setRef]     = useState<InventoryReferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState<string | null>(null);

  // Inline edit state
  const [editId, setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});

  // Add-new form
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, any>>({});
  const [addError, setAddError] = useState("");

  const headers = { "x-tenant-id": tenantId };

  const fetchRef = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const res = await fetch("/api/inventory/reference", { headers });
    if (res.ok) setRef(await res.json());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchRef(); }, [fetchRef]);

  function resetAdd() {
    setShowAdd(false);
    setAddForm({});
    setAddError("");
  }

  async function handleAdd() {
    if (!addForm.name?.trim()) { setAddError("Name is required"); return; }
    setSaving("add");
    setAddError("");
    const res = await fetch(`/api/inventory/reference?type=${tab}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ ...addForm, sort_order: addForm.sort_order ?? 0 }),
    });
    const json = await res.json();
    if (!res.ok) { setAddError(json.error ?? "Failed to create"); setSaving(null); return; }
    setSaving(null);
    resetAdd();
    fetchRef();
  }

  async function handleEdit(id: string) {
    if (!editForm.name?.trim()) return;
    setSaving(id);
    const res = await fetch(`/api/inventory/reference?type=${tab}&id=${id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      setEditId(null);
      setEditForm({});
      fetchRef();
    }
    setSaving(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this item? It will be hidden but not permanently deleted.")) return;
    setSaving(id);
    await fetch(`/api/inventory/reference?type=${tab}&id=${id}`, {
      method: "DELETE",
      headers,
    });
    setSaving(null);
    fetchRef();
  }

  function startEdit(item: any) {
    setEditId(item.id);
    setEditForm({ ...item });
  }

  if (!hydrated) return null;

  if (!isManager) {
    return <div style={{ padding: 48, textAlign: "center", color: color.textMuted, fontSize: 14 }}>Manager access required.</div>;
  }

  const items: any[] = ref?.[tab] ?? [];

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: color.ink, margin: 0 }}>Inventory Settings</h1>
        <p style={{ fontSize: 14, color: color.textMuted, margin: "6px 0 0" }}>Manage reference data used across the stock register.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${color.line}`, marginBottom: 24 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setEditId(null); setShowAdd(false); setAddForm({}); }}
            style={{
              padding: "10px 20px", background: "none", border: "none", cursor: "pointer",
              fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? color.ink : color.textMuted,
              borderBottom: tab === t.key ? `2px solid ${color.ink}` : "2px solid transparent",
              marginBottom: -1,
              transition: "color .15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: color.textFaint, fontSize: 14 }}>Loading…</div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {items.length === 0 && (
              <div style={{ padding: "24px", textAlign: "center", color: color.textFaint, fontSize: 14, background: color.paper, borderRadius: radius.lg, border: `1px dashed ${color.line}` }}>
                No {tab} yet. Add one below.
              </div>
            )}

            {items.map(item => {
              const isEditing = editId === item.id;
              return (
                <div key={item.id} style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: shadow.card }}>
                  {/* Colour dot for statuses */}
                  {tab === "statuses" && !isEditing && (
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: item.colour ?? "#9CA3AF", flexShrink: 0 }} />
                  )}

                  {isEditing ? (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <input
                          value={editForm.name ?? ""}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="Name"
                          style={{ flex: 1, minWidth: 160, padding: "7px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                        />
                        <input
                          type="number"
                          value={editForm.sort_order ?? 0}
                          onChange={e => setEditForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                          placeholder="Order"
                          style={{ width: 70, padding: "7px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                        />
                        {tab === "locations" && (
                          <select
                            value={editForm.type ?? "Storage"}
                            onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                            style={{ padding: "7px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14, background: "#fff" }}
                          >
                            {LOCATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        )}
                        {tab === "suppliers" && (
                          <>
                            <input
                              value={editForm.contact_name ?? ""}
                              onChange={e => setEditForm(f => ({ ...f, contact_name: e.target.value }))}
                              placeholder="Contact"
                              style={{ flex: 1, minWidth: 120, padding: "7px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                            />
                            <input
                              value={editForm.email ?? ""}
                              onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                              placeholder="Email"
                              style={{ flex: 1, minWidth: 150, padding: "7px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                            />
                            <input
                              value={editForm.phone ?? ""}
                              onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
                              placeholder="Phone"
                              style={{ flex: 1, minWidth: 110, padding: "7px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                            />
                          </>
                        )}
                      </div>
                      {tab === "statuses" && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {STATUS_COLOURS.map(c => (
                            <ColourDot key={c} colour={c} selected={editForm.colour === c} onClick={() => setEditForm(f => ({ ...f, colour: c }))} />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: color.ink }}>{item.name}</div>
                      <div style={{ fontSize: 12, color: color.textFaint, marginTop: 2 }}>
                        {tab === "locations" && item.type ? `${item.type} · ` : ""}
                        {tab === "suppliers" && item.contact_name ? `${item.contact_name} · ` : ""}
                        {tab === "suppliers" && item.email ? `${item.email} · ` : ""}
                        {tab === "suppliers" && item.phone ? item.phone : ""}
                        {tab !== "suppliers" && `Order: ${item.sort_order ?? 0}`}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => handleEdit(item.id)}
                          disabled={saving === item.id}
                          style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 14px", borderRadius: radius.pill, border: "none", background: color.ink, color: color.white, fontSize: 13, cursor: "pointer" }}
                        >
                          <Save size={13} /> {saving === item.id ? "…" : "Save"}
                        </button>
                        <button
                          onClick={() => { setEditId(null); setEditForm({}); }}
                          style={{ padding: "6px 12px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, color: color.textMuted, fontSize: 13, cursor: "pointer" }}
                        >
                          <X size={13} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(item)}
                          style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, color: color.ink, fontSize: 13, cursor: "pointer" }}
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={saving === item.id}
                          style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: radius.pill, border: "none", background: color.dangerBg, color: color.danger, fontSize: 13, cursor: "pointer" }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add new */}
          {showAdd ? (
            <div style={{ background: color.paper, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: 16 }}>
              {addError && <div style={{ padding: "8px 12px", background: color.dangerBg, color: color.danger, borderRadius: radius.md, fontSize: 13, marginBottom: 12 }}>{addError}</div>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <input
                  value={addForm.name ?? ""}
                  onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Name *"
                  style={{ flex: 1, minWidth: 160, padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                />
                <input
                  type="number"
                  value={addForm.sort_order ?? 0}
                  onChange={e => setAddForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                  placeholder="Order"
                  style={{ width: 70, padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                />
                {tab === "locations" && (
                  <select
                    value={addForm.type ?? "Storage"}
                    onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
                    style={{ padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14, background: "#fff" }}
                  >
                    {LOCATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
                {tab === "suppliers" && (
                  <>
                    <input
                      value={addForm.contact_name ?? ""}
                      onChange={e => setAddForm(f => ({ ...f, contact_name: e.target.value }))}
                      placeholder="Contact"
                      style={{ flex: 1, minWidth: 120, padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                    />
                    <input
                      value={addForm.email ?? ""}
                      onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="Email"
                      style={{ flex: 1, minWidth: 150, padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                    />
                    <input
                      value={addForm.phone ?? ""}
                      onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="Phone"
                      style={{ flex: 1, minWidth: 110, padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                    />
                  </>
                )}
              </div>
              {tab === "statuses" && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {STATUS_COLOURS.map(c => (
                    <ColourDot key={c} colour={c} selected={addForm.colour === c} onClick={() => setAddForm(f => ({ ...f, colour: c }))} />
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleAdd}
                  disabled={saving === "add"}
                  style={{ padding: "8px 18px", borderRadius: radius.pill, border: "none", background: color.ink, color: color.white, fontSize: 14, fontWeight: 500, cursor: "pointer" }}
                >
                  {saving === "add" ? "Adding…" : "Add"}
                </button>
                <button
                  onClick={resetAdd}
                  style={{ padding: "8px 16px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, fontSize: 14, cursor: "pointer", color: color.textMuted }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setShowAdd(true); setAddForm(tab === "statuses" ? { colour: STATUS_COLOURS[0] } : tab === "locations" ? { type: "Storage" } : {}); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: radius.pill, border: `1px dashed ${color.line}`, background: color.paper, color: color.textMuted, fontSize: 14, cursor: "pointer", width: "100%", justifyContent: "center" }}
            >
              <Plus size={15} /> Add {tab.slice(0, -1)}
            </button>
          )}
        </>
      )}
    </div>
  );
}
