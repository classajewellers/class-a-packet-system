"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { InventoryLocation, InventoryLocationType } from "@/lib/types";
import { Plus, Pencil, Trash2, X } from "lucide-react";

const LOCATION_TYPE_LABELS: Record<InventoryLocationType, string> = {
  display: "Display",
  storage: "Storage",
  workshop: "Workshop",
  transit: "Transit",
  consignment: "Consignment",
};

const LOCATION_TYPE_BADGE: Record<InventoryLocationType, { bg: string; fg: string }> = {
  display: { bg: "#EEF2FF", fg: "#4338CA" },
  storage: { bg: "#F3F4F6", fg: "#6B7280" },
  workshop: { bg: "#FEF3C7", fg: "#92400E" },
  transit: { bg: "#ECFDF5", fg: "#065F46" },
  consignment: { bg: "#FDF2F8", fg: "#9D174D" },
};

const BLANK_FORM = { name: "", type: "display" as InventoryLocationType, bin_code_format: "", shopify_visible: false };

interface LocationFormProps {
  initial?: InventoryLocation | null;
  onClose: () => void;
  onSaved: () => void;
}

function LocationForm({ initial, onClose, onSaved }: LocationFormProps) {
  const isNew = !initial;
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name,
        type: initial.type,
        bin_code_format: initial.bin_code_format ?? "",
        shopify_visible: initial.shopify_visible,
      });
    } else {
      setForm({ ...BLANK_FORM });
    }
  }, [initial]);

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError("");
    const url = isNew ? "/api/inventory/locations" : `/api/inventory/locations/${initial!.id}`;
    const method = isNew ? "POST" : "PATCH";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, bin_code_format: form.bin_code_format || null }) });
    const json = await res.json();
    setSaving(false);
    if (json.error) { setError(json.error); return; }
    onSaved();
  }

  const inputStyle = { width: "100%", padding: "8px 10px", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, color: "#1A1A2E", background: "#fff", boxSizing: "border-box" as const };
  const labelStyle = { fontSize: 12, fontWeight: 500 as const, color: "#6B7280", marginBottom: 4, display: "block" as const };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.35)", display: "flex", justifyContent: "flex-end" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 400, height: "100%", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#1A1A2E" }}>{isNew ? "New Location" : "Edit Location"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <div style={{ padding: "10px 12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 6, fontSize: 13 }}>{error}</div>}
          <div>
            <label style={labelStyle}>Name *</label>
            <input style={inputStyle} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Display Floor" />
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={form.type} onChange={(e) => set("type", e.target.value)}>
              {(Object.keys(LOCATION_TYPE_LABELS) as InventoryLocationType[]).map((t) => (
                <option key={t} value={t}>{LOCATION_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Bin Code Format</label>
            <input style={inputStyle} value={form.bin_code_format} onChange={(e) => set("bin_code_format", e.target.value)} placeholder="e.g. A{row}-{col}" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" id="shopify_visible" checked={form.shopify_visible} onChange={(e) => set("shopify_visible", e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
            <label htmlFor="shopify_visible" style={{ fontSize: 13, color: "#374151", cursor: "pointer" }}>Visible on Shopify</label>
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", background: "#F3F4F6", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "#374151" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "8px 20px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : isNew ? "Create" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [formTarget, setFormTarget] = useState<InventoryLocation | null | undefined>(undefined); // undefined=closed, null=new

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory/locations", { cache: "no-store" });
    const json = await res.json();
    setLocations(json.locations ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  async function handleDelete(loc: InventoryLocation) {
    if (!confirm(`Delete "${loc.name}"? This cannot be undone.`)) return;
    await fetch(`/api/inventory/locations/${loc.id}`, { method: "DELETE" });
    fetchLocations();
  }

  function handleSaved() { setFormTarget(undefined); fetchLocations(); }

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1A1A2E" }}>Locations</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>Manage storage and display locations for inventory</p>
        </div>
        <button
          onClick={() => setFormTarget(null)}
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {locations.map((loc) => {
            const badge = LOCATION_TYPE_BADGE[loc.type] ?? LOCATION_TYPE_BADGE.storage;
            return (
              <div
                key={loc.id}
                style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 10, padding: "20px 20px 16px", display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#1A1A2E" }}>{loc.name}</span>
                  <span style={{ ...badge, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500 }}>
                    {LOCATION_TYPE_LABELS[loc.type]}
                  </span>
                </div>
                {loc.bin_code_format && (
                  <p style={{ margin: 0, fontSize: 12, color: "#9CA3AF" }}>Bin format: <code style={{ background: "#F3F4F6", padding: "1px 5px", borderRadius: 3 }}>{loc.bin_code_format}</code></p>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: loc.shopify_visible ? "#10B981" : "#D1D5DB", display: "inline-block" }} />
                  <span style={{ fontSize: 12, color: loc.shopify_visible ? "#065F46" : "#9CA3AF" }}>
                    {loc.shopify_visible ? "Shopify visible" : "Not on Shopify"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button
                    onClick={() => setFormTarget(loc)}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#F3F4F6", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#374151" }}
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(loc)}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "#FEE2E2", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#991B1B" }}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formTarget !== undefined && (
        <LocationForm
          initial={formTarget}
          onClose={() => setFormTarget(undefined)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
