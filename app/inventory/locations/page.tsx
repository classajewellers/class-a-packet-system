// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { InventoryLocation, InventoryLocationType } from "@/lib/types";
import { Plus, Pencil, Trash2, X, ChevronRight } from "lucide-react";

// ─── constants ────────────────────────────────────────────────────────────────

const LOCATION_TYPE_LABELS: Record<InventoryLocationType, string> = {
  display:     "Display",
  storage:     "Storage",
  workshop:    "Workshop",
  transit:     "Transit",
  consignment: "Consignment",
};

const LOCATION_TYPE_BADGE: Record<InventoryLocationType, { bg: string; fg: string }> = {
  display:     { bg: "#EEF2FF", fg: "#4338CA" },
  storage:     { bg: "#F3F4F6", fg: "#6B7280" },
  workshop:    { bg: "#FEF3C7", fg: "#92400E" },
  transit:     { bg: "#ECFDF5", fg: "#065F46" },
  consignment: { bg: "#FDF2F8", fg: "#9D174D" },
};

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Collect the ids of all descendant locations (recursive). */
function getDescendantIds(id: string, childrenByParent: Map<string, InventoryLocation[]>): Set<string> {
  const result = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of childrenByParent.get(cur) ?? []) {
      if (!result.has(child.id)) {
        result.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return result;
}

/** Build the full ancestry breadcrumb for a location label in the parent picker. */
function buildPath(
  loc: InventoryLocation,
  byId: Map<string, InventoryLocation>,
  maxDepth = 10
): string {
  const parts: string[] = [];
  let cur: InventoryLocation | undefined = loc;
  let safety = 0;
  while (cur && safety++ < maxDepth) {
    parts.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return parts.join(" › ");
}

// ─── form types ───────────────────────────────────────────────────────────────

interface LocationFormState {
  name: string;
  type: InventoryLocationType;
  bin_code_format: string;
  shopify_visible: boolean;
  parent_id: string; // "" = top-level
}

interface LocationFormProps {
  initial: InventoryLocation | null;
  prefillParentId?: string | null;
  /** All locations — form filters out invalid parent options itself. */
  allLocations: InventoryLocation[];
  onClose: () => void;
  onSaved: () => void;
}

// ─── form drawer ──────────────────────────────────────────────────────────────

function LocationForm({ initial, prefillParentId, allLocations, onClose, onSaved }: LocationFormProps) {
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

  // Build children-by-parent for descendant detection
  const childrenByParent = new Map<string, InventoryLocation[]>();
  for (const loc of allLocations) {
    if (loc.parent_id) {
      const arr = childrenByParent.get(loc.parent_id) ?? [];
      arr.push(loc);
      childrenByParent.set(loc.parent_id, arr);
    }
  }

  // Locations excluded from the parent picker:
  // 1. The location itself (self-reference)
  // 2. All its descendants (would create a cycle)
  const forbiddenIds = initial
    ? new Set([initial.id, ...getDescendantIds(initial.id, childrenByParent)])
    : new Set<string>();

  const byId = new Map(allLocations.map(l => [l.id, l]));

  // Valid parent options: any location not in the forbidden set
  const parentOptions = allLocations.filter(l => !forbiddenIds.has(l.id));

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name,
        type: initial.type,
        bin_code_format: initial.bin_code_format ?? "",
        shopify_visible: initial.shopify_visible ?? false,
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
    // Cycle guard — if somehow a descendant was submitted
    if (form.parent_id && forbiddenIds.has(form.parent_id)) {
      setError("Cannot set a descendant as the parent (would create a cycle).");
      return;
    }
    setSaving(true); setError("");
    const payload = {
      name: form.name.trim(),
      type: form.type,
      bin_code_format: form.bin_code_format || null,
      shopify_visible: form.shopify_visible,
      parent_id: form.parent_id || null,
    };
    const url = isNew ? "/api/inventory/locations" : `/api/inventory/locations/${initial!.id}`;
    const method = isNew ? "POST" : "PATCH";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
      body: JSON.stringify(payload),
    });
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

  const lockedParentName = prefillParentId
    ? buildPath(byId.get(prefillParentId)!, byId)
    : null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.35)", display: "flex", justifyContent: "flex-end" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 420, height: "100%", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)" }}>
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
              <div style={{ ...inputStyle, background: "#F9FAFB", color: "#6B7280" }}>
                {lockedParentName ?? "—"}
              </div>
            ) : (
              <select
                style={inputStyle}
                value={form.parent_id}
                onChange={(e) => set("parent_id", e.target.value)}
              >
                <option value="">— None (top-level) —</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {buildPath(p, byId)}
                  </option>
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

          {/* Type — only shown for top-level; sub-locations inherit parent type conceptually */}
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
  editing: InventoryLocation | null;
  prefillParentId: string | null;
}
const CLOSED: DrawerState = { open: false, editing: null, prefillParentId: null };

// ─── recursive tree node ──────────────────────────────────────────────────────

interface TreeNodeProps {
  loc: InventoryLocation;
  depth: number;
  childrenByParent: Map<string, InventoryLocation[]>;
  isAdmin: boolean;
  onAdd: (parentId: string) => void;
  onEdit: (loc: InventoryLocation) => void;
  onDelete: (loc: InventoryLocation) => void;
}

function LocationTreeNode({ loc, depth, childrenByParent, isAdmin, onAdd, onEdit, onDelete }: TreeNodeProps) {
  const children = childrenByParent.get(loc.id) ?? [];
  const badge = LOCATION_TYPE_BADGE[loc.type as InventoryLocationType] ?? LOCATION_TYPE_BADGE.storage;
  const typeLabel = LOCATION_TYPE_LABELS[loc.type as InventoryLocationType];
  const isRoot = depth === 0;

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: `${isRoot ? 14 : 10}px 16px`,
    paddingLeft: 16 + depth * 20,
    borderBottom: "1px solid #F3F4F6",
    background: depth % 2 === 0 ? "#fff" : "#FAFAFA",
  };

  return (
    <>
      <div style={rowStyle}>
        {depth > 0 && (
          <span style={{ color: "#D1D5DB", fontSize: 12, flexShrink: 0, marginRight: 2 }}>↳</span>
        )}

        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: isRoot ? 14 : 13, fontWeight: isRoot ? 600 : 500, color: "#1A1A2E" }}>
            {loc.name}
          </span>
          {isRoot && typeLabel && (
            <span style={{ ...badge, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500 }}>
              {typeLabel}
            </span>
          )}
          {loc.shopify_visible && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "#065F46" }}>Shopify</span>
            </span>
          )}
          {loc.bin_code_format && (
            <code style={{ fontSize: 11, background: "#F3F4F6", color: "#6B7280", padding: "1px 6px", borderRadius: 4 }}>
              {loc.bin_code_format}
            </code>
          )}
        </div>

        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          <button
            onClick={() => onAdd(loc.id)}
            style={{ display: "flex", alignItems: "center", gap: 3, padding: "4px 8px", background: "#EEF2FF", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, color: "#4338CA", fontWeight: 500 }}
          >
            <Plus size={11} /> Sub-location
          </button>
          <button
            onClick={() => onEdit(loc)}
            style={{ display: "flex", alignItems: "center", gap: 3, padding: "4px 8px", background: "#F3F4F6", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, color: "#374151" }}
          >
            <Pencil size={11} /> Edit
          </button>
          {isAdmin && (
            <button
              onClick={() => onDelete(loc)}
              style={{ display: "flex", alignItems: "center", gap: 3, padding: "4px 8px", background: "#FEE2E2", border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11, color: "#991B1B" }}
            >
              <Trash2 size={11} /> Delete
            </button>
          )}
        </div>
      </div>

      {children.map((child) => (
        <LocationTreeNode
          key={child.id}
          loc={child}
          depth={depth + 1}
          childrenByParent={childrenByParent}
          isAdmin={isAdmin}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}

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
    const res = await fetch("/api/inventory/locations", {
      cache: "no-store",
      headers: { "x-tenant-id": user?.tenantId ?? "" },
    });
    const json = await res.json();
    setLocations(json.locations ?? []);
    setLoading(false);
  }, [user?.tenantId]);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  async function handleDelete(loc: InventoryLocation) {
    const childrenByParent = new Map<string, InventoryLocation[]>();
    for (const l of locations) {
      if (l.parent_id) {
        const arr = childrenByParent.get(l.parent_id) ?? [];
        arr.push(l);
        childrenByParent.set(l.parent_id, arr);
      }
    }
    const descendantCount = getDescendantIds(loc.id, childrenByParent).size;
    const msg = descendantCount > 0
      ? `Delete "${loc.name}" and its ${descendantCount} sub-location${descendantCount > 1 ? "s" : ""}? This cannot be undone.`
      : `Delete "${loc.name}"? This cannot be undone.`;
    if (!confirm(msg)) return;
    await fetch(`/api/inventory/locations/${loc.id}`, {
      method: "DELETE",
      headers: { "x-tenant-id": user?.tenantId ?? "" },
    });
    fetchLocations();
  }

  function handleSaved() { setDrawer(CLOSED); fetchLocations(); }

  // Build tree structure
  const childrenByParent = new Map<string, InventoryLocation[]>();
  for (const loc of locations) {
    if (loc.parent_id) {
      const arr = childrenByParent.get(loc.parent_id) ?? [];
      arr.push(loc);
      childrenByParent.set(loc.parent_id, arr);
    }
  }
  const roots = locations.filter((l) => !l.parent_id);

  return (
    <div style={{ padding: "32px 36px", maxWidth: 900, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1A1A2E" }}>Locations</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>
            Manage storage and display locations — supports Store → Area → Cabinet → Tray hierarchy
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

      {loading ? (
        <p style={{ color: "#9CA3AF", fontSize: 14 }}>Loading…</p>
      ) : locations.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
          No locations yet. Create your first one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {roots.map((root) => (
            <div
              key={root.id}
              style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}
            >
              <LocationTreeNode
                loc={root}
                depth={0}
                childrenByParent={childrenByParent}
                isAdmin={isAdmin}
                onAdd={(parentId) => setDrawer({ open: true, editing: null, prefillParentId: parentId })}
                onEdit={(loc) => setDrawer({ open: true, editing: loc, prefillParentId: null })}
                onDelete={handleDelete}
              />
            </div>
          ))}

          {/* Orphaned locations (parent deleted without cascade) */}
          {locations.filter(l => l.parent_id && !locations.find(p => p.id === l.parent_id)).length > 0 && (
            <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 10, padding: "12px 16px" }}>
              <p style={{ margin: 0, fontSize: 13, color: "#92400E" }}>
                Some sub-locations have missing parents — they will appear as top-level.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Drawer */}
      {drawer.open && (
        <LocationForm
          initial={drawer.editing}
          prefillParentId={drawer.prefillParentId}
          allLocations={locations}
          onClose={() => setDrawer(CLOSED)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
