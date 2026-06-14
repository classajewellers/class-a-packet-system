// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { InventoryLocation, InventoryLocationType } from "@/lib/types";
import { Plus, Pencil, Trash2, X } from "lucide-react";

// ─── constants ────────────────────────────────────────────────────────────────

const LOCATION_TYPE_LABELS: Record<InventoryLocationType, string> = {
  display: "Display",
  storage: "Storage",
  workshop: "Workshop",
  transit: "Transit",
  consignment: "Consignment",
};

const LOCATION_TYPE_BADGE: Record<InventoryLocationType, { bg: string; fg: string }> = {
  display:     { bg: "#EEF2FF", fg: "#4338CA" },
  storage:     { bg: "#F3F4F6", fg: "#6B7280" },
  workshop:    { bg: "#FEF3C7", fg: "#92400E" },
  transit:     { bg: "#ECFDF5", fg: "#065F46" },
  consignment: { bg: "#FDF2F8", fg: "#9D174D" },
};

// ─── form types ───────────────────────────────────────────────────────────────

interface LocationFormState {
  name: string;
  type: InventoryLocationType;
  bin_code_format: string;
  shopify_visible: boolean;
  parent_id: string; // "" means top-level
}

interface LocationFormProps {
  /** Location being edited; null = creating new */
  initial: InventoryLocation | null;
  /** Pre-fill and lock this parent (for "+ Add Sub-location") */
  prefillParentId?: string | null;
  /** All top-level locations available as parent options */
  parentOptions: InventoryLocation[];
  onClose: () => void;
  onSaved: () => void;
}

// ─── form drawer ──────────────────────────────────────────────────────────────

function LocationForm({ initial, prefillParentId, parentOptions, onClose, onSaved }: LocationFormProps) {
  const { user } = useUser();
  const isNew = !initial;
  const parentLocked = prefillParentId != null && isNew;

  const [form, setForm] = useState<LocationFormState>({
    name: "",
    type: "display",
    bin_code_format: "",
    shopify_visible: false,
    parent_id: prefillParentId ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name,
        type: initial.type,
        bin_code_format: initial.bin_code_format ?? "",
        shopify_visible: initial.shopify_visible,
        parent_id: initial.parent_id ?? "",
      });
    } else {
      setForm({
        name: "",
        type: "display",
        bin_code_format: "",
        shopify_visible: false,
        parent_id: prefillParentId ?? "",
      });
    }
  }, [initial, prefillParentId]);

  const set = <K extends keyof LocationFormState>(k: K, v: LocationFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError("");
    const payload = {
      name: form.name,
      type: form.type,
      bin_code_format: form.bin_code_format || null,
      shopify_visible: form.shopify_visible,
      parent_id: form.parent_id || null,
    };
    const url = isNew ? "/api/inventory/locations" : `/api/inventory/locations/${initial!.id}`;
    const method = isNew ? "POST" : "PATCH";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' }, body: JSON.stringify(payload) });
    const json = await res.json();
    setSaving(false);
    if (json.error) { setError(json.error); return; }
    onSaved();
  }

  const inputStyle = {
    width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB",
    borderRadius: 6, fontSize: 13, color: "#1A1A2E", background: "#fff",
    boxSizing: "border-box" as const,
  };
  const labelStyle = { fontSize: 12, fontWeight: 500 as const, color: "#6B7280", marginBottom: 4, display: "block" as const };

  const drawerTitle = isNew
    ? (prefillParentId ? "New Sub-location" : "New Location")
    : "Edit Location";

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.35)", display: "flex", justifyContent: "flex-end" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 400, height: "100%", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#1A1A2E" }}>{drawerTitle}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          {error && (
            <div style={{ padding: "10px 12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 6, fontSize: 13 }}>{error}</div>
          )}

          {/* Parent Location */}
          <div>
            <label style={labelStyle}>Parent Location</label>
            {parentLocked ? (
              // Locked: show read-only
              <div style={{ ...inputStyle, background: "#F9FAFB", color: "#6B7280" }}>
                {parentOptions.find((p) => p.id === prefillParentId)?.name ?? "—"}
              </div>
            ) : (
              <select
                style={inputStyle}
                value={form.parent_id}
                onChange={(e) => set("parent_id", e.target.value)}
              >
                <option value="">— None (top-level) —</option>
                {parentOptions
                  .filter((p) => p.id !== initial?.id) // can't be own parent
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
            )}
          </div>

          {/* Name */}
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={prefillParentId ? "e.g. Display Case 1" : "e.g. Showroom"}
              autoFocus
            />
          </div>

          {/* Type — only shown for top-level; sub-locations inherit parent type visually */}
          {!form.parent_id && (
            <div>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={form.type} onChange={(e) => set("type", e.target.value as InventoryLocationType)}>
                {(Object.keys(LOCATION_TYPE_LABELS) as InventoryLocationType[]).map((t) => (
                  <option key={t} value={t}>{LOCATION_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          )}

          {/* Bin Code Format */}
          <div>
            <label style={labelStyle}>Bin Code Format</label>
            <input
              style={inputStyle}
              value={form.bin_code_format}
              onChange={(e) => set("bin_code_format", e.target.value)}
              placeholder="e.g. A{row}-{col}"
            />
          </div>

          {/* Shopify visible */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              id="shopify_visible"
              checked={form.shopify_visible}
              onChange={(e) => set("shopify_visible", e.target.checked)}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <label htmlFor="shopify_visible" style={{ fontSize: 13, color: "#374151", cursor: "pointer" }}>Visible on Shopify</label>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 16px", background: "#F3F4F6", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#374151" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "8px 20px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Saving…" : isNew ? "Create" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── drawer state ─────────────────────────────────────────────────────────────

interface DrawerState {
  open: boolean;
  editing: InventoryLocation | null; // null = creating new
  prefillParentId: string | null;    // non-null = locked sub-location form
}

const CLOSED: DrawerState = { open: false, editing: null, prefillParentId: null };

// ─── page ─────────────────────────────────────────────────────────────────────

export default function InventoryLocationsPage() {
  const { user } = useUser();
  const router = useRouter();
  const isManager = canManage(user?.role);
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (user && !isManager) router.replace("/orders");
  }, [user, isManager, router]);

  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<DrawerState>(CLOSED);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory/locations", { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
    const json = await res.json();
    setLocations(json.locations ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  async function handleDelete(loc: InventoryLocation) {
    const childCount = locations.filter((l) => l.parent_id === loc.id).length;
    const msg = childCount > 0
      ? `Delete "${loc.name}" and its ${childCount} sub-location${childCount > 1 ? "s" : ""}? This cannot be undone.`
      : `Delete "${loc.name}"? This cannot be undone.`;
    if (!confirm(msg)) return;
    await fetch(`/api/inventory/locations/${loc.id}`, { method: "DELETE", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
    fetchLocations();
  }

  function handleSaved() { setDrawer(CLOSED); fetchLocations(); }

  // Split into parents and a children-by-parent map
  const parents = locations.filter((l) => !l.parent_id);
  const childrenByParent = new Map<string, InventoryLocation[]>();
  for (const loc of locations) {
    if (loc.parent_id) {
      const arr = childrenByParent.get(loc.parent_id) ?? [];
      arr.push(loc);
      childrenByParent.set(loc.parent_id, arr);
    }
  }

  return (
    <div style={{ padding: "32px 36px", maxWidth: 900, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1A1A2E" }}>Locations</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>
            Manage storage and display locations for inventory
          </p>
        </div>
        <button
          onClick={() => setDrawer({ open: true, editing: null, prefillParentId: null })}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}
        >
          <Plus size={15} />
          New Location
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <p style={{ color: "#9CA3AF", fontSize: 14 }}>Loading…</p>
      ) : locations.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
          No locations yet. Create your first one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {parents.map((parent) => {
            const badge = LOCATION_TYPE_BADGE[parent.type] ?? LOCATION_TYPE_BADGE.storage;
            const children = childrenByParent.get(parent.id) ?? [];
            return (
              <div
                key={parent.id}
                style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}
              >
                {/* Parent header row */}
                <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: children.length > 0 ? "1px solid #F3F4F6" : "none" }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#1A1A2E" }}>{parent.name}</span>
                    <span style={{ ...badge, padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 500 }}>
                      {LOCATION_TYPE_LABELS[parent.type]}
                    </span>
                    {parent.shopify_visible && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981", display: "inline-block" }} />
                        <span style={{ fontSize: 11, color: "#065F46" }}>Shopify</span>
                      </span>
                    )}
                    {parent.bin_code_format && (
                      <code style={{ fontSize: 11, background: "#F3F4F6", color: "#6B7280", padding: "1px 6px", borderRadius: 4 }}>
                        {parent.bin_code_format}
                      </code>
                    )}
                  </div>

                  {/* Parent actions */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      onClick={() => setDrawer({ open: true, editing: null, prefillParentId: parent.id })}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#EEF2FF", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#4338CA", fontWeight: 500 }}
                    >
                      <Plus size={12} /> Add Sub-location
                    </button>
                    <button
                      onClick={() => setDrawer({ open: true, editing: parent, prefillParentId: null })}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#F3F4F6", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#374151" }}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(parent)}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#FEE2E2", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#991B1B" }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Children */}
                {children.length > 0 && (
                  <div>
                    {children.map((child, idx) => (
                      <div
                        key={child.id}
                        style={{
                          padding: "11px 20px 11px 36px",
                          display: "flex", alignItems: "center", gap: 10,
                          borderBottom: idx < children.length - 1 ? "1px solid #F9FAFB" : "none",
                          background: "#FAFAFA",
                        }}
                      >
                        {/* Indent indicator */}
                        <span style={{ fontSize: 12, color: "#C4C4D4", flexShrink: 0 }}>↳</span>

                        <span style={{ fontSize: 13, fontWeight: 500, color: "#374151", flex: 1 }}>{child.name}</span>

                        {child.bin_code_format && (
                          <code style={{ fontSize: 11, background: "#F3F4F6", color: "#6B7280", padding: "1px 6px", borderRadius: 4 }}>
                            {child.bin_code_format}
                          </code>
                        )}

                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: child.shopify_visible ? "#10B981" : "#D1D5DB", display: "inline-block" }} />
                          <span style={{ fontSize: 11, color: child.shopify_visible ? "#065F46" : "#9CA3AF" }}>
                            {child.shopify_visible ? "Shopify" : "Not on Shopify"}
                          </span>
                        </span>

                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => setDrawer({ open: true, editing: child, prefillParentId: null })}
                            style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "#F3F4F6", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, color: "#374151" }}
                          >
                            <Pencil size={11} /> Edit
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleDelete(child)}
                              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "#FEE2E2", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, color: "#991B1B" }}
                            >
                              <Trash2 size={11} /> Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state for parent with no children */}
                {children.length === 0 && (
                  <div style={{ padding: "10px 20px 10px 36px", background: "#FAFAFA", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: "#C4C4D4" }}>↳</span>
                    <span style={{ fontSize: 12, color: "#C4C4D4", fontStyle: "italic" }}>No sub-locations yet</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Orphaned sub-locations (parent was deleted — shouldn't happen with cascade but just in case) */}
          {locations.filter((l) => l.parent_id && !parents.find((p) => p.id === l.parent_id)).length > 0 && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 10, padding: "12px 16px" }}>
              <p style={{ margin: 0, fontSize: 13, color: "#92400E" }}>Some sub-locations have missing parents.</p>
            </div>
          )}
        </div>
      )}

      {/* Drawer */}
      {drawer.open && (
        <LocationForm
          initial={drawer.editing}
          prefillParentId={drawer.prefillParentId}
          parentOptions={parents}
          onClose={() => setDrawer(CLOSED)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
