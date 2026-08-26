"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { ArrowLeft, Check, Plus, ChevronDown, Search, Loader } from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const METAL_KARATS   = ["9K", "18K", "Platinum", "Silver"] as const;
const METAL_COLOURS  = ["Yellow", "White", "Rose", "N/A"] as const;
const STONE_TYPES    = ["Natural", "Lab Grown", "None"] as const;
const STONE_SHAPES   = ["Round", "Oval", "Princess", "Cushion", "Emerald", "Pear", "Marquise", "Radiant", "Asscher", "Heart", "Other"] as const;
const COLOUR_GRADES  = ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O–Z"] as const;
const CLARITY_GRADES = ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1", "I2", "I3"] as const;
const STATUSES       = [
  { value: "in_stock",    label: "In Stock" },
  { value: "on_order",    label: "On Order" },
  { value: "workshop",    label: "Workshop" },
  { value: "consignment", label: "Consignment" },
] as const;

const BLANK_PIECE = {
  metal_weight_grams: "",
  diamond_type: "Natural" as string,
  diamond_carat: "",
  stone_cost: "",
  diamond_colour: "",
  diamond_clarity: "",
  stone_shape: "",
  certificate_number: "",
  finger_size: "",
  actual_cost: "",
  retail_price: "",
  status_id: "",
  location_id: "",
  notes: "",
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  label:   { fontSize: 12, fontWeight: 600 as const, color: "#6B7280", display: "block" as const, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.04em" },
  input:   { width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, color: "#111827", background: "#fff", outline: "none" },
  select:  { width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, color: "#111827", background: "#fff", outline: "none", appearance: "none" as const },
  section: { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "20px 24px", marginBottom: 16 },
  h2:      { fontSize: 11, fontWeight: 700 as const, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.07em", margin: "0 0 16px" },
  grid2:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" },
  grid3:   { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px" },
};

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div style={span ? { gridColumn: "1 / -1" } : {}}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

// ─── Design search typeahead ──────────────────────────────────────────────────

function DesignSearch({
  tenantId, value, onChange, onCreate,
}: {
  tenantId: string;
  value: any | null;
  onChange: (d: any | null) => void;
  onCreate: (name: string) => void;
}) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!query.trim() || !tenantId) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await fetch(
        `/api/inventory/products?search=${encodeURIComponent(query)}&per_page=20`,
        { headers: { "x-tenant-id": tenantId } }
      );
      if (res.ok) setResults((await res.json()).products ?? []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, tenantId]);

  if (value) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: "1px solid #C7D2FE", background: "#EEF2FF" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#3730A3", flex: 1 }}>{value.name}</span>
        {value.category && <span style={{ fontSize: 11, color: "#6366F1", background: "#E0E7FF", padding: "2px 8px", borderRadius: 999 }}>{value.category}</span>}
        {value.collection && <span style={{ fontSize: 11, color: "#6B7280" }}>{value.collection}</span>}
        <button onClick={() => { onChange(null); setQuery(""); }} style={{ fontSize: 12, color: "#6366F1", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search designs by name…"
          style={{ ...S.input, paddingLeft: 32 }}
          autoFocus
        />
        {loading && <Loader size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", animation: "spin 1s linear infinite" }} />}
      </div>
      {open && (query.length > 0) && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, boxShadow: "0 4px 16px #0001", zIndex: 50, maxHeight: 280, overflowY: "auto", marginTop: 4 }}>
          {results.length === 0 && !loading && (
            <div style={{ padding: "10px 14px", fontSize: 13, color: "#6B7280" }}>
              No designs found for "{query}"
            </div>
          )}
          {results.map(d => (
            <button key={d.id} onClick={() => { onChange(d); setOpen(false); setQuery(""); }}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", textAlign: "left", borderBottom: "1px solid #F3F4F6" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <span style={{ fontSize: 14, fontWeight: 500, color: "#111827", flex: 1 }}>{d.name}</span>
              {d.category && <span style={{ fontSize: 11, color: "#6366F1", background: "#EEF2FF", padding: "2px 7px", borderRadius: 999 }}>{d.category}</span>}
              {d.collection && <span style={{ fontSize: 11, color: "#9CA3AF" }}>{d.collection}</span>}
            </button>
          ))}
          {query.trim() && (
            <button
              onClick={() => { onCreate(query.trim()); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", border: "none", borderTop: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", fontSize: 13, color: "#635BFF", fontWeight: 600 }}
            >
              <Plus size={14} /> Create new design "{query.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NewPiecePage() {
  const router    = useRouter();
  const { user, hydrated } = useUser();
  const tenantId  = user?.tenantId ?? "";
  const isManager = hydrated ? canManage(user?.role) : false;
  const headers   = { "x-tenant-id": tenantId };

  // Reference data
  const [locations, setLocations]   = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [statuses, setStatuses]     = useState<any[]>([]);

  // Design selection / creation
  const [design, setDesign]           = useState<any | null>(null);
  const [creatingDesign, setCreatingDesign] = useState(false);
  const [newDesign, setNewDesign]     = useState({ name: "", category: "", collection: "", labour_cost: "", setting_cost: "" });
  const [designSaving, setDesignSaving] = useState(false);
  const [designError, setDesignError] = useState("");

  // Variant selection / creation
  const [variants, setVariants]         = useState<any[]>([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variant, setVariant]           = useState<any | null>(null);
  const [creatingVariant, setCreatingVariant] = useState(false);
  const [newVariant, setNewVariant]     = useState({ metal_karat: "18K", metal_colour: "Yellow", band_width_mm: "", claw_config: "", name: "" });
  const [variantSaving, setVariantSaving] = useState(false);
  const [variantError, setVariantError] = useState("");

  // Piece form
  const [piece, setPiece]   = useState({ ...BLANK_PIECE });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [lastSaved, setLastSaved] = useState<{ sku: string; name: string } | null>(null);

  // Load reference data once
  useEffect(() => {
    if (!tenantId) return;
    fetch("/api/inventory/reference", { headers }).then(async r => {
      if (!r.ok) return;
      const json = await r.json();
      setLocations(json.locations   ?? []);
      setCategories(json.categories ?? []);
      setStatuses(json.statuses     ?? []);
    });
  }, [tenantId]);

  // Load variants when design changes
  useEffect(() => {
    if (!design) { setVariants([]); setVariant(null); setCreatingVariant(false); return; }
    setVariantsLoading(true);
    fetch(`/api/inventory/products/${design.id}/variants`, { headers }).then(async r => {
      if (!r.ok) { setVariantsLoading(false); return; }
      const json = await r.json();
      const v = json.variants ?? [];
      setVariants(v);
      setVariantsLoading(false);
      // If only one variant exists, auto-select it
      if (v.length === 1) setVariant(v[0]);
      else setVariant(null);
      setCreatingVariant(v.length === 0);
    });
  }, [design?.id]);

  // ── Design creation ──────────────────────────────────────────────────────────

  async function handleCreateDesign() {
    if (!newDesign.name.trim()) { setDesignError("Name is required"); return; }
    setDesignSaving(true);
    setDesignError("");
    const res = await fetch("/api/inventory/products", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        name:         newDesign.name.trim(),
        category:     newDesign.category || null,
        collection:   newDesign.collection || null,
        labour_cost:  newDesign.labour_cost  ? Number(newDesign.labour_cost)  : null,
        setting_cost: newDesign.setting_cost ? Number(newDesign.setting_cost) : null,
      }),
    });
    const json = await res.json();
    setDesignSaving(false);
    if (!res.ok) { setDesignError(json.error ?? "Failed to create design"); return; }
    setDesign({ ...json.product, category: newDesign.category || null, collection: newDesign.collection || null });
    setCreatingDesign(false);
    setNewDesign({ name: "", category: "", collection: "", labour_cost: "", setting_cost: "" });
  }

  // ── Variant creation ─────────────────────────────────────────────────────────

  async function handleCreateVariant() {
    if (!design) return;
    setVariantSaving(true);
    setVariantError("");
    const res = await fetch(`/api/inventory/products/${design.id}/variants`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(newVariant),
    });
    const json = await res.json();
    setVariantSaving(false);
    if (!res.ok) { setVariantError(json.error ?? "Failed to create variant"); return; }
    setVariant(json.variant);
    setVariants(prev => [...prev, json.variant]);
    setCreatingVariant(false);
  }

  // ── Piece save ───────────────────────────────────────────────────────────────

  function buildTitle(): string {
    const metal = `${variant!.metal_karat} ${variant!.metal_colour}`;
    if (!piece.diamond_type || piece.diamond_type === "None") {
      return `${design!.name} – ${metal}`;
    }
    const parts: string[] = [];
    if (piece.diamond_carat) parts.push(`${piece.diamond_carat}ct`);
    if (piece.stone_shape)   parts.push(piece.stone_shape);
    parts.push(piece.diamond_type);
    return `${design!.name} – ${metal} – ${parts.join(" ")}`;
  }

  async function handleSave() {
    if (!design) { setError("Select or create a design first"); return; }
    if (!variant) { setError("Select or create a variant first"); return; }
    setSaving(true);
    setError("");

    // Derive category_id from the design's category text (case-insensitive name match)
    const matchedCategory = categories.find(
      c => c.name?.toLowerCase() === design.category?.toLowerCase()
    ) ?? categories.find(
      c => design.category && c.name?.toLowerCase().includes(design.category.toLowerCase())
    );

    const payload: Record<string, any> = {
      product_id:         design.id,
      variant_id:         variant.id,
      title:              buildTitle(),
      category_id:        matchedCategory?.id ?? null,
      // Metal — use variant values as defaults, override with actual weighed weight
      metal_karat:        variant.metal_karat,
      metal_colour:       variant.metal_colour,
      metal_weight_grams: piece.metal_weight_grams ? Number(piece.metal_weight_grams) : null,
      // Stone
      diamond_type:       piece.diamond_type === "None" ? null : piece.diamond_type,
      diamond_carat:      piece.diamond_carat     ? Number(piece.diamond_carat)     : null,
      stone_cost:         piece.stone_cost        ? Number(piece.stone_cost)        : null,
      diamond_colour:     piece.diamond_colour    || null,
      diamond_clarity:    piece.diamond_clarity   || null,
      stone_shape:        piece.stone_shape        || null,
      certificate_number: piece.certificate_number || null,
      // Physical
      finger_size:        piece.finger_size    || null,
      location_id:        piece.location_id    || null,
      status_id:          piece.status_id      || null,
      notes:              piece.notes          || null,
      // Costs (sent regardless of role — the API doesn't filter; display is role-gated)
      actual_cost:        piece.actual_cost    ? Number(piece.actual_cost)    : null,
      retail_price:       piece.retail_price   ? Number(piece.retail_price)  : null,
    };

    const res = await fetch("/api/inventory/pieces", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error ?? "Save failed"); return; }

    setLastSaved({ sku: json.piece.sku, name: design.name });
    // Clear piece fields, keep design + variant selected for next entry
    setPiece({ ...BLANK_PIECE });
  }

  if (!hydrated) return null;

  // ── Render ───────────────────────────────────────────────────────────────────

  const btnPrimary: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px",
    background: "#635BFF", color: "#fff", border: "none", borderRadius: 8,
    fontSize: 14, fontWeight: 600, cursor: "pointer",
  };
  const btnGhost: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px",
    background: "none", color: "#635BFF", border: "1px solid #C7D2FE", borderRadius: 8,
    fontSize: 14, fontWeight: 500, cursor: "pointer",
  };

  const showVariantSection  = !!design && !creatingDesign;
  const showPieceSection    = !!variant && !creatingVariant;

  return (
    <div style={{ padding: "28px 32px 80px", maxWidth: 760, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => router.push("/inventory")} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", padding: 4 }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Add Piece</h1>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: "2px 0 0" }}>
            Select a design, configure the variant, then enter the physical piece details.
          </p>
        </div>
      </div>

      {/* Last saved confirmation */}
      {lastSaved && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 10, marginBottom: 20 }}>
          <Check size={16} color="#10B981" />
          <span style={{ fontSize: 14, color: "#065F46" }}>
            <strong>{lastSaved.sku}</strong> saved — {lastSaved.name}. Ready for next piece.
          </span>
          <button
            onClick={() => router.push("/inventory")}
            style={{ marginLeft: "auto", fontSize: 13, color: "#10B981", background: "none", border: "none", cursor: "pointer" }}
          >
            Done
          </button>
        </div>
      )}

      {/* ── Section 1: Design ─────────────────────────────────────────────────── */}
      <div style={S.section}>
        <h2 style={S.h2}>1 · Design</h2>

        {!creatingDesign ? (
          <DesignSearch
            tenantId={tenantId}
            value={design}
            onChange={d => { setDesign(d); setLastSaved(null); }}
            onCreate={name => {
              setCreatingDesign(true);
              setNewDesign(prev => ({ ...prev, name }));
              setDesign(null);
            }}
          />
        ) : (
          <div>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 16px" }}>
              New design — fill in the details below, then save to continue.
            </p>
            <div style={S.grid2}>
              <Field label="Design name *">
                <input value={newDesign.name} onChange={e => setNewDesign(p => ({ ...p, name: e.target.value }))} style={S.input} placeholder="e.g. Grace Engagement Ring" autoFocus />
              </Field>
              <Field label="Category">
                <div style={{ position: "relative" }}>
                  <select value={newDesign.category} onChange={e => setNewDesign(p => ({ ...p, category: e.target.value }))} style={S.select}>
                    <option value="">— Select category —</option>
                    <option>Engagement Ring</option>
                    <option>Wedding Band</option>
                    <option>Ring</option>
                    <option>Earrings</option>
                    <option>Necklace</option>
                    <option>Bracelet</option>
                    <option>Pendant</option>
                    <option>Loose Stone</option>
                    <option>Other</option>
                  </select>
                  <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                </div>
              </Field>
              <Field label="Collection">
                <input value={newDesign.collection} onChange={e => setNewDesign(p => ({ ...p, collection: e.target.value }))} style={S.input} placeholder="e.g. Signature, Petite, Bridal" />
              </Field>
              {isManager && <>
                <Field label="Labour cost (wholesale $)">
                  <input type="number" min="0" step="0.01" value={newDesign.labour_cost} onChange={e => setNewDesign(p => ({ ...p, labour_cost: e.target.value }))} style={S.input} placeholder="0.00" />
                </Field>
                <Field label="Setting cost (wholesale $)">
                  <input type="number" min="0" step="0.01" value={newDesign.setting_cost} onChange={e => setNewDesign(p => ({ ...p, setting_cost: e.target.value }))} style={S.input} placeholder="0.00" />
                </Field>
              </>}
            </div>
            {designError && <p style={{ color: "#EF4444", fontSize: 13, margin: "12px 0 0" }}>{designError}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={handleCreateDesign} disabled={designSaving} style={btnPrimary}>
                {designSaving ? <Loader size={14} /> : <Check size={14} />} Save design
              </button>
              <button onClick={() => { setCreatingDesign(false); setDesignError(""); }} style={btnGhost}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Section 2: Variant ────────────────────────────────────────────────── */}
      {showVariantSection && (
        <div style={S.section}>
          <h2 style={S.h2}>2 · Variant</h2>

          {variantsLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9CA3AF", fontSize: 13 }}>
              <Loader size={13} /> Loading variants…
            </div>
          ) : !creatingVariant ? (
            <div>
              {variants.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: variant ? 0 : 12 }}>
                  {variants.map(v => (
                    <button key={v.id} onClick={() => setVariant(v)}
                      style={{
                        padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                        border: variant?.id === v.id ? "2px solid #635BFF" : "1px solid #E5E7EB",
                        background: variant?.id === v.id ? "#EEF2FF" : "#fff",
                        color: variant?.id === v.id ? "#3730A3" : "#374151",
                      }}
                    >
                      {v.name ?? `${v.metal_karat} ${v.metal_colour}`}
                      {v.band_width_mm ? ` · ${v.band_width_mm}mm` : ""}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setCreatingVariant(true)} style={{ ...btnGhost, marginTop: variants.length > 0 ? 12 : 0, fontSize: 13 }}>
                <Plus size={13} /> Add new variant
              </button>
            </div>
          ) : (
            <div>
              {variants.length > 0 && (
                <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 14px" }}>
                  Adding a new metal option for this design.
                </p>
              )}
              <div style={S.grid3}>
                <Field label="Metal karat *">
                  <div style={{ position: "relative" }}>
                    <select value={newVariant.metal_karat} onChange={e => setNewVariant(p => ({ ...p, metal_karat: e.target.value }))} style={S.select}>
                      {METAL_KARATS.map(k => <option key={k}>{k}</option>)}
                    </select>
                    <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                  </div>
                </Field>
                <Field label="Metal colour *">
                  <div style={{ position: "relative" }}>
                    <select value={newVariant.metal_colour} onChange={e => setNewVariant(p => ({ ...p, metal_colour: e.target.value }))} style={S.select}>
                      {METAL_COLOURS.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                  </div>
                </Field>
                <Field label="Band width (mm)">
                  <input type="number" min="0" step="0.5" value={newVariant.band_width_mm} onChange={e => setNewVariant(p => ({ ...p, band_width_mm: e.target.value }))} style={S.input} placeholder="e.g. 2" />
                </Field>
                <Field label="Claw config">
                  <input value={newVariant.claw_config} onChange={e => setNewVariant(p => ({ ...p, claw_config: e.target.value }))} style={S.input} placeholder="e.g. 4-claw, bezel" />
                </Field>
                <Field label="Display name" span>
                  <input value={newVariant.name} onChange={e => setNewVariant(p => ({ ...p, name: e.target.value }))} style={S.input} placeholder="Auto-generated if blank — e.g. 18K Yellow Gold 2mm" />
                </Field>
              </div>
              {variantError && <p style={{ color: "#EF4444", fontSize: 13, margin: "12px 0 0" }}>{variantError}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button onClick={handleCreateVariant} disabled={variantSaving} style={btnPrimary}>
                  {variantSaving ? <Loader size={14} /> : <Check size={14} />} Save variant
                </button>
                {variants.length > 0 && (
                  <button onClick={() => setCreatingVariant(false)} style={btnGhost}>Cancel</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Section 3: Physical Piece ─────────────────────────────────────────── */}
      {showPieceSection && (
        <div style={S.section}>
          <h2 style={S.h2}>3 · Physical Piece</h2>

          {/* Metal */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 12px" }}>Metal</p>
            <div style={S.grid3}>
              <Field label="Karat">
                <div style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, color: "#6B7280", background: "#F9FAFB" }}>
                  {variant.metal_karat}
                </div>
              </Field>
              <Field label="Colour">
                <div style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, color: "#6B7280", background: "#F9FAFB" }}>
                  {variant.metal_colour}
                </div>
              </Field>
              <Field label="Actual weight (g)">
                <input
                  type="number" min="0" step="0.001"
                  value={piece.metal_weight_grams}
                  onChange={e => setPiece(p => ({ ...p, metal_weight_grams: e.target.value }))}
                  style={S.input} placeholder="0.000"
                />
              </Field>
            </div>
          </div>

          {/* Stone */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 12px" }}>Stone</p>
            <div style={S.grid3}>
              <Field label="Stone type">
                <div style={{ position: "relative" }}>
                  <select value={piece.diamond_type} onChange={e => setPiece(p => ({ ...p, diamond_type: e.target.value }))} style={S.select}>
                    {STONE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                </div>
              </Field>

              {piece.diamond_type !== "None" && <>
                <Field label="Carat weight">
                  <input type="number" min="0" step="0.01" value={piece.diamond_carat} onChange={e => setPiece(p => ({ ...p, diamond_carat: e.target.value }))} style={S.input} placeholder="0.00" />
                </Field>
                <Field label="Stone wholesale cost ($)">
                  <input type="number" min="0" step="0.01" value={piece.stone_cost} onChange={e => setPiece(p => ({ ...p, stone_cost: e.target.value }))} style={S.input} placeholder="0.00" />
                </Field>
                <Field label="Shape">
                  <div style={{ position: "relative" }}>
                    <select value={piece.stone_shape} onChange={e => setPiece(p => ({ ...p, stone_shape: e.target.value }))} style={S.select}>
                      <option value="">— Shape —</option>
                      {STONE_SHAPES.map(s => <option key={s}>{s}</option>)}
                    </select>
                    <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                  </div>
                </Field>
                <Field label="Colour">
                  <div style={{ position: "relative" }}>
                    <select value={piece.diamond_colour} onChange={e => setPiece(p => ({ ...p, diamond_colour: e.target.value }))} style={S.select}>
                      <option value="">—</option>
                      {COLOUR_GRADES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                  </div>
                </Field>
                <Field label="Clarity">
                  <div style={{ position: "relative" }}>
                    <select value={piece.diamond_clarity} onChange={e => setPiece(p => ({ ...p, diamond_clarity: e.target.value }))} style={S.select}>
                      <option value="">—</option>
                      {CLARITY_GRADES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                  </div>
                </Field>
                <Field label="Certificate #">
                  <input value={piece.certificate_number} onChange={e => setPiece(p => ({ ...p, certificate_number: e.target.value }))} style={S.input} placeholder="e.g. GIA 1234567890" />
                </Field>
              </>}
            </div>
          </div>

          {/* Physical details */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 12px" }}>Physical Details</p>
            <div style={S.grid3}>
              <Field label="Finger size">
                <input value={piece.finger_size} onChange={e => setPiece(p => ({ ...p, finger_size: e.target.value }))} style={S.input} placeholder="e.g. N, 54, 7" />
              </Field>
              <Field label="Status">
                <div style={{ position: "relative" }}>
                  <select value={piece.status_id} onChange={e => setPiece(p => ({ ...p, status_id: e.target.value }))} style={S.select}>
                    <option value="">— Select status —</option>
                    {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                </div>
              </Field>
              <Field label="Location">
                <div style={{ position: "relative" }}>
                  <select value={piece.location_id} onChange={e => setPiece(p => ({ ...p, location_id: e.target.value }))} style={S.select}>
                    <option value="">— Location —</option>
                    {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                </div>
              </Field>
            </div>
          </div>

          {/* Costs — manager only */}
          {isManager && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 12px" }}>Costs</p>
              <div style={S.grid2}>
                <Field label="Actual cost (what we paid $)">
                  <input type="number" min="0" step="0.01" value={piece.actual_cost} onChange={e => setPiece(p => ({ ...p, actual_cost: e.target.value }))} style={S.input} placeholder="0.00" />
                </Field>
                <Field label="Retail price ($)">
                  <input type="number" min="0" step="0.01" value={piece.retail_price} onChange={e => setPiece(p => ({ ...p, retail_price: e.target.value }))} style={S.input} placeholder="0.00" />
                </Field>
              </div>
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom: 20 }}>
            <Field label="Notes">
              <textarea value={piece.notes} onChange={e => setPiece(p => ({ ...p, notes: e.target.value }))} style={{ ...S.input, resize: "vertical", minHeight: 64 }} placeholder="Optional — any specific details about this piece" />
            </Field>
          </div>

          {error && <p style={{ color: "#EF4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, padding: "11px 24px" }}>
              {saving ? <Loader size={15} /> : <Check size={15} />}
              {saving ? "Saving…" : "Save piece"}
            </button>
            <button onClick={() => router.push("/inventory")} style={btnGhost}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
