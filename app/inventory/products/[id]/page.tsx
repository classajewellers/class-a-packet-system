"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { InventoryProduct, InventoryVariant, InventoryPiece } from "@/lib/types";
import { ArrowLeft, Plus, Edit2, Save, X, Trash2, ChevronDown, ChevronRight, Sparkles, Loader } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: { id: string } };

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: "#EEF2FF", color: "#635BFF", border: "1px solid #C7D2FE" }}>
      {children}
    </span>
  );
}

function StatusDot({ colour, name }: { colour?: string | null; name?: string | null }) {
  if (!name) return <span style={{ color: "#9CA3AF", fontSize: 12 }}>—</span>;
  const c = colour ?? "#9CA3AF";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, color: c }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c, flexShrink: 0 }} />
      {name}
    </span>
  );
}

const BLANK_VARIANT = {
  title: "", metal_type: "", metal_karat: "", metal_colour: "",
  finger_size: "", chain_length: "", diamond_type: "",
  diamond_carat: "", diamond_colour: "", diamond_clarity: "",
};

const BLANK_PIECE = {
  title: "", category_id: "", status_id: "", location_id: "",
  metal_type: "", metal_karat: "", metal_colour: "", finger_size: "",
  notes: "", product_id: "", variant_id: "",
};

export default function ProductDetailPage({ params }: Params) {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const tenantId = user?.tenantId ?? "";
  const isManager = hydrated ? canManage(user?.role) : false;

  const [product, setProduct]   = useState<InventoryProduct | null>(null);
  const [variants, setVariants] = useState<InventoryVariant[]>([]);
  const [unlinked, setUnlinked] = useState<InventoryPiece[]>([]);
  const [loading, setLoading]   = useState(true);
  const [ref, setRef]           = useState<any>(null);

  // Product edit
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState("");

  // Variant expand state
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Add variant modal
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [variantForm, setVariantForm]       = useState(BLANK_VARIANT);
  const [variantSaving, setVariantSaving]   = useState(false);
  const [variantError, setVariantError]     = useState("");

  // Edit variant modal
  const [editVariantId, setEditVariantId]   = useState<string | null>(null);
  const [editVariantForm, setEditVariantForm] = useState(BLANK_VARIANT);
  const [editVariantSaving, setEditVariantSaving] = useState(false);
  const [editVariantError, setEditVariantError]   = useState("");

  // Add piece modal
  const [addPieceVariantId, setAddPieceVariantId] = useState<string | null>(null);
  const [pieceForm, setPieceForm]   = useState(BLANK_PIECE);
  const [pieceSaving, setPieceSaving] = useState(false);
  const [pieceError, setPieceError]   = useState("");
  const [aiDesc, setAiDesc]         = useState("");
  const [aiLoading, setAiLoading]   = useState(false);

  const headers = { "x-tenant-id": tenantId };

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [prodRes, refRes] = await Promise.all([
      fetch(`/api/inventory/products/${params.id}`, { headers }),
      fetch("/api/inventory/reference", { headers }),
    ]);
    if (prodRes.ok) {
      const json = await prodRes.json();
      setProduct(json.product);
      setVariants(json.variants ?? []);
      setUnlinked(json.unlinked_pieces ?? []);
    }
    if (refRes.ok) setRef(await refRes.json());
    setLoading(false);
  }, [tenantId, params.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleSaveProduct() {
    if (!product) return;
    setEditSaving(true);
    setEditError("");
    const res = await fetch(`/api/inventory/products/${product.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const json = await res.json();
    setEditSaving(false);
    if (!res.ok) { setEditError(json.error ?? "Save failed"); return; }
    setProduct(json.product);
    setEditing(false);
  }

  async function handleAddVariant() {
    if (!product) return;
    setVariantSaving(true);
    setVariantError("");
    const body = { ...variantForm, product_id: product.id, diamond_carat: variantForm.diamond_carat ? Number(variantForm.diamond_carat) : null };
    const res = await fetch("/api/inventory/variants", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setVariantSaving(false);
    if (!res.ok) { setVariantError(json.error ?? "Failed"); return; }
    setShowAddVariant(false);
    setVariantForm(BLANK_VARIANT);
    fetchAll();
  }

  async function handleSaveVariant() {
    if (!editVariantId) return;
    setEditVariantSaving(true);
    setEditVariantError("");
    const body = { ...editVariantForm, diamond_carat: editVariantForm.diamond_carat ? Number(editVariantForm.diamond_carat) : null };
    const res = await fetch(`/api/inventory/variants/${editVariantId}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setEditVariantSaving(false);
    if (!res.ok) { setEditVariantError(json.error ?? "Failed"); return; }
    setEditVariantId(null);
    fetchAll();
  }

  async function handleDeleteVariant(variantId: string, pieceCount: number) {
    if (pieceCount > 0) {
      alert(`Cannot delete — ${pieceCount} piece(s) still linked. Unlink or reassign them first.`);
      return;
    }
    if (!confirm("Delete this variant?")) return;
    const res = await fetch(`/api/inventory/variants/${variantId}`, { method: "DELETE", headers });
    if (res.ok) fetchAll();
    else {
      const json = await res.json();
      alert(json.error ?? "Delete failed");
    }
  }

  async function handleParseWithAI() {
    if (!aiDesc.trim()) return;
    setAiLoading(true);
    const res = await fetch("/api/inventory/ai-parse", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ description: aiDesc }),
    });
    setAiLoading(false);
    if (!res.ok) return;
    const json = await res.json();
    const f = json.fields ?? {};
    setPieceForm(prev => ({
      ...prev,
      title:        f.title        && !prev.title        ? f.title        : prev.title,
      metal_type:   f.metal_type   && !prev.metal_type   ? f.metal_type   : prev.metal_type,
      metal_karat:  f.metal_karat  && !prev.metal_karat  ? f.metal_karat  : prev.metal_karat,
      metal_colour: f.metal_colour && !prev.metal_colour ? f.metal_colour : prev.metal_colour,
      finger_size:  f.finger_size  && !prev.finger_size  ? f.finger_size  : prev.finger_size,
      notes:        f.notes        && !prev.notes        ? f.notes        : prev.notes,
    }));
  }

  function openAddPiece(variant: InventoryVariant) {
    setPieceForm({
      ...BLANK_PIECE,
      product_id:   product?.id ?? "",
      variant_id:   variant.id,
      title:        product?.title ?? product?.name ?? "",
      metal_type:   variant.metal_type ?? "",
      metal_karat:  variant.metal_karat ?? "",
      metal_colour: variant.metal_colour ?? "",
      finger_size:  variant.finger_size ?? "",
    });
    setAddPieceVariantId(variant.id);
    setAiDesc("");
    setPieceError("");
  }

  async function handleAddPiece() {
    setPieceSaving(true);
    setPieceError("");
    const body = { ...pieceForm };
    const res = await fetch("/api/inventory/pieces", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setPieceSaving(false);
    if (!res.ok) { setPieceError(json.error ?? "Failed"); return; }
    setAddPieceVariantId(null);
    router.push(`/inventory/${json.piece.id}`);
  }

  if (!hydrated || loading) return <div style={{ padding: 48, textAlign: "center", color: "#9CA3AF" }}>Loading…</div>;
  if (!product) return (
    <div style={{ padding: 48, textAlign: "center" }}>
      <p style={{ color: "#6B7280" }}>Product not found.</p>
      <button onClick={() => router.push("/inventory/products")} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 14 }}>Back to Products</button>
    </div>
  );

  const catName = typeof product.category === "object" && product.category && "name" in product.category
    ? product.category.name : typeof product.category === "string" ? product.category : null;

  const LF = { fontSize: 13, fontWeight: 500 as const, color: "#374151", display: "block" as const, marginBottom: 4 };
  const IF = { width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14 };

  function VariantSpecPills({ v }: { v: InventoryVariant }) {
    const specs = [
      v.metal_karat, v.metal_colour, v.metal_type,
      v.finger_size && `Size ${v.finger_size}`,
      v.chain_length && `${v.chain_length} chain`,
      v.diamond_carat && `${v.diamond_carat}ct`,
      v.diamond_colour,
      v.diamond_clarity,
    ].filter(Boolean) as string[];
    if (specs.length === 0) return <span style={{ fontSize: 12, color: "#9CA3AF" }}>No specs</span>;
    return (
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {specs.map((s, i) => <Pill key={i}>{s}</Pill>)}
      </div>
    );
  }

  function VariantFormFields({ form, setForm }: { form: typeof BLANK_VARIANT; setForm: (f: typeof BLANK_VARIANT) => void }) {
    const set = (k: keyof typeof BLANK_VARIANT) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={LF}>Label / Title</label>
          <input value={form.title} onChange={set("title")} placeholder="e.g. 18ct Yellow Gold / Size N" style={IF} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
          <div><label style={LF}>Metal Type</label><input value={form.metal_type} onChange={set("metal_type")} placeholder="Yellow Gold" style={IF} /></div>
          <div><label style={LF}>Carat</label><input value={form.metal_karat} onChange={set("metal_karat")} placeholder="18ct" style={IF} /></div>
          <div><label style={LF}>Metal Colour</label><input value={form.metal_colour} onChange={set("metal_colour")} placeholder="Yellow" style={IF} /></div>
          <div><label style={LF}>Finger Size</label><input value={form.finger_size} onChange={set("finger_size")} placeholder="N" style={IF} /></div>
          <div><label style={LF}>Chain Length</label><input value={form.chain_length} onChange={set("chain_length")} placeholder='45cm' style={IF} /></div>
          <div><label style={LF}>Diamond Type</label><input value={form.diamond_type} onChange={set("diamond_type")} placeholder="Round Brilliant" style={IF} /></div>
          <div><label style={LF}>Diamond Carat</label><input value={form.diamond_carat} onChange={set("diamond_carat")} placeholder="0.50" style={IF} /></div>
          <div><label style={LF}>Diamond Colour</label><input value={form.diamond_colour} onChange={set("diamond_colour")} placeholder="G" style={IF} /></div>
          <div><label style={LF}>Diamond Clarity</label><input value={form.diamond_clarity} onChange={set("diamond_clarity")} placeholder="VS1" style={IF} /></div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 960, margin: "0 auto" }}>
      {/* Back */}
      <button
        onClick={() => router.push("/inventory/products")}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: 14, marginBottom: 20, padding: 0 }}
      >
        <ArrowLeft size={16} /> Products
      </button>

      {/* Product header card */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 24, marginBottom: 16 }}>
        {!editing ? (
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>{product.title ?? product.name}</h1>
                {catName && <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: "#F3F4F6", color: "#6B7280", fontWeight: 500 }}>{catName}</span>}
              </div>
              {product.collection && <div style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 6 }}>{product.collection}</div>}
              {product.description && <div style={{ fontSize: 14, color: "#374151" }}>{product.description}</div>}
              <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
                <span style={{ fontSize: 13, color: "#6B7280" }}><strong style={{ color: "#111827" }}>{variants.length}</strong> variants</span>
                <span style={{ fontSize: 13, color: "#6B7280" }}><strong style={{ color: "#111827" }}>{variants.reduce((n, v) => n + (v.pieces?.length ?? 0), 0)}</strong> pieces</span>
              </div>
            </div>
            {isManager && (
              <button onClick={() => { setEditForm({ title: product.title, category_id: typeof product.category === "object" && product.category ? (product.category as any).id : "", collection: product.collection, description: product.description, notes: product.notes }); setEditing(true); setEditError(""); }}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer", color: "#374151", flexShrink: 0 }}>
                <Edit2 size={14} /> Edit
              </button>
            )}
          </div>
        ) : (
          <div>
            <h3 style={{ margin: "0 0 16px", fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Edit Product</h3>
            {editError && <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{editError}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={LF}>Title</label><input value={editForm.title ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, title: e.target.value }))} style={IF} /></div>
              <div>
                <label style={LF}>Category</label>
                <select value={editForm.category_id ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, category_id: e.target.value }))} style={{ ...IF, background: "#fff" }}>
                  <option value="">— None —</option>
                  {ref?.categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div><label style={LF}>Collection</label><input value={editForm.collection ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, collection: e.target.value }))} style={IF} /></div>
              <div><label style={LF}>Description</label><textarea value={editForm.description ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, description: e.target.value }))} rows={2} style={{ ...IF, resize: "vertical" }} /></div>
              <div><label style={LF}>Notes</label><textarea value={editForm.notes ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...IF, resize: "vertical" }} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSaveProduct} disabled={editSaving} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: editSaving ? "not-allowed" : "pointer", opacity: editSaving ? 0.7 : 1 }}>
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Variants */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>Variants</h2>
        {isManager && (
          <button onClick={() => { setVariantForm(BLANK_VARIANT); setVariantError(""); setShowAddVariant(true); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", color: "#374151" }}>
            <Plus size={14} /> Add Variant
          </button>
        )}
      </div>

      {variants.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 32, textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: "#9CA3AF" }}>No variants yet. Add a variant to start tracking stock.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {variants.map(variant => {
            const isOpen = expanded[variant.id] ?? false;
            const pieces = variant.pieces ?? [];
            return (
              <div key={variant.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
                {/* Variant header */}
                <div
                  style={{ display: "flex", alignItems: "center", padding: "14px 18px", cursor: "pointer" }}
                  onClick={() => setExpanded(e => ({ ...e, [variant.id]: !isOpen }))}
                >
                  <div style={{ marginRight: 12, color: "#9CA3AF" }}>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {variant.title && <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 4 }}>{variant.title}</div>}
                    <VariantSpecPills v={variant} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: 12 }}>
                    <span style={{ fontSize: 13, color: "#6B7280" }}>
                      <strong style={{ color: "#111827" }}>{pieces.length}</strong> piece{pieces.length !== 1 ? "s" : ""}
                    </span>
                    {isManager && (
                      <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditVariantId(variant.id); setEditVariantForm({ title: variant.title ?? "", metal_type: variant.metal_type ?? "", metal_karat: variant.metal_karat ?? "", metal_colour: variant.metal_colour ?? "", finger_size: variant.finger_size ?? "", chain_length: variant.chain_length ?? "", diamond_type: variant.diamond_type ?? "", diamond_carat: String(variant.diamond_carat ?? ""), diamond_colour: variant.diamond_colour ?? "", diamond_clarity: variant.diamond_clarity ?? "" }); setEditVariantError(""); }}
                          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", fontSize: 12, cursor: "pointer", color: "#374151" }}
                        >Edit</button>
                        <button
                          onClick={() => openAddPiece(variant)}
                          style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#111827", color: "#fff", fontSize: 12, cursor: "pointer" }}
                        ><Plus size={11} style={{ display: "inline", marginRight: 3 }} />Piece</button>
                        <button
                          onClick={() => handleDeleteVariant(variant.id, pieces.length)}
                          style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 12, cursor: "pointer" }}
                        ><Trash2 size={11} /></button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded pieces */}
                {isOpen && (
                  <div style={{ borderTop: "1px solid #F3F4F6" }}>
                    {pieces.length === 0 ? (
                      <div style={{ padding: "12px 52px", fontSize: 13, color: "#9CA3AF" }}>No pieces linked to this variant.</div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: "#F9FAFB" }}>
                            {["SKU", "Title", "Status", "Location", ""].map(h => (
                              <th key={h} style={{ padding: "8px 16px 8px " + (h === "SKU" ? "52px" : "16px"), textAlign: "left", fontWeight: 600, color: "#9CA3AF", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {pieces.map((piece, i) => (
                            <tr
                              key={piece.id}
                              onClick={() => router.push(`/inventory/${piece.id}`)}
                              style={{ borderTop: "1px solid #F3F4F6", cursor: "pointer" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                              onMouseLeave={e => (e.currentTarget.style.background = "")}
                            >
                              <td style={{ padding: "10px 16px 10px 52px", fontFamily: "monospace", fontWeight: 600, color: "#111827" }}>{piece.sku}</td>
                              <td style={{ padding: "10px 16px", color: "#374151" }}>{piece.title ?? "—"}</td>
                              <td style={{ padding: "10px 16px" }}><StatusDot colour={(piece.status as any)?.colour} name={(piece.status as any)?.name} /></td>
                              <td style={{ padding: "10px 16px", color: "#6B7280" }}>{(piece.location as any)?.name ?? "—"}</td>
                              <td style={{ padding: "10px 16px", color: "#9CA3AF", fontSize: 12 }}>View →</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unlinked pieces */}
      {unlinked.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#9CA3AF" }}>UNLINKED PIECES ({unlinked.length})</h3>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {unlinked.map(piece => (
                <tr key={piece.id} onClick={() => router.push(`/inventory/${piece.id}`)} style={{ borderBottom: "1px solid #F3F4F6", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}>
                  <td style={{ padding: "10px 18px", fontFamily: "monospace", fontWeight: 600, color: "#111827", width: 120 }}>{piece.sku}</td>
                  <td style={{ padding: "10px 16px", color: "#374151" }}>{piece.title ?? "—"}</td>
                  <td style={{ padding: "10px 16px", color: "#9CA3AF", fontSize: 12, textAlign: "right" }}>View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Variant Modal */}
      {showAddVariant && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>Add Variant</h2>
              <button onClick={() => setShowAddVariant(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={20} /></button>
            </div>
            {variantError && <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{variantError}</div>}
            <VariantFormFields form={variantForm} setForm={setVariantForm} />
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowAddVariant(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleAddVariant} disabled={variantSaving} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: variantSaving ? "not-allowed" : "pointer", opacity: variantSaving ? 0.7 : 1 }}>
                {variantSaving ? "Creating…" : "Create Variant"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Variant Modal */}
      {editVariantId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>Edit Variant</h2>
              <button onClick={() => setEditVariantId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={20} /></button>
            </div>
            {editVariantError && <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{editVariantError}</div>}
            <VariantFormFields form={editVariantForm} setForm={setEditVariantForm} />
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setEditVariantId(null)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSaveVariant} disabled={editVariantSaving} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: editVariantSaving ? "not-allowed" : "pointer", opacity: editVariantSaving ? 0.7 : 1 }}>
                {editVariantSaving ? "Saving…" : "Save Variant"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Piece Modal */}
      {addPieceVariantId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>Add Piece</h2>
              <button onClick={() => setAddPieceVariantId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={20} /></button>
            </div>

            {/* AI parse */}
            <div style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 10, padding: 14, marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#5B21B6", display: "block", marginBottom: 6 }}>
                <Sparkles size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />Describe the item
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea value={aiDesc} onChange={e => setAiDesc(e.target.value)} placeholder="e.g. 18ct yellow gold, 0.5ct round brilliant G VS1…" rows={2} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD6FE", fontSize: 13, resize: "vertical", background: "#fff" }} />
                <button onClick={handleParseWithAI} disabled={aiLoading || !aiDesc.trim()} style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "#635BFF", color: "#fff", border: "none", cursor: aiLoading || !aiDesc.trim() ? "not-allowed" : "pointer", opacity: !aiDesc.trim() ? 0.5 : 1, alignSelf: "flex-start" }}>
                  {aiLoading ? <Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} />} Parse
                </button>
              </div>
            </div>

            {pieceError && <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{pieceError}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={LF}>Title</label><input value={pieceForm.title} onChange={e => setPieceForm(f => ({ ...f, title: e.target.value }))} style={IF} /></div>
              <div>
                <label style={LF}>Category</label>
                <select value={pieceForm.category_id} onChange={e => setPieceForm(f => ({ ...f, category_id: e.target.value }))} style={{ ...IF, background: "#fff" }}>
                  <option value="">— Select —</option>
                  {ref?.categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
                <div><label style={LF}>Metal Type</label><input value={pieceForm.metal_type} onChange={e => setPieceForm(f => ({ ...f, metal_type: e.target.value }))} style={IF} /></div>
                <div><label style={LF}>Carat</label><input value={pieceForm.metal_karat} onChange={e => setPieceForm(f => ({ ...f, metal_karat: e.target.value }))} style={IF} /></div>
                <div><label style={LF}>Metal Colour</label><input value={pieceForm.metal_colour} onChange={e => setPieceForm(f => ({ ...f, metal_colour: e.target.value }))} style={IF} /></div>
                <div><label style={LF}>Finger Size</label><input value={pieceForm.finger_size} onChange={e => setPieceForm(f => ({ ...f, finger_size: e.target.value }))} style={IF} /></div>
              </div>
              <div>
                <label style={LF}>Status</label>
                <select value={pieceForm.status_id} onChange={e => setPieceForm(f => ({ ...f, status_id: e.target.value }))} style={{ ...IF, background: "#fff" }}>
                  <option value="">— Select —</option>
                  {ref?.statuses?.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={LF}>Location</label>
                <select value={pieceForm.location_id} onChange={e => setPieceForm(f => ({ ...f, location_id: e.target.value }))} style={{ ...IF, background: "#fff" }}>
                  <option value="">— Select —</option>
                  {ref?.locations?.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div><label style={LF}>Notes</label><textarea value={pieceForm.notes} onChange={e => setPieceForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...IF, resize: "vertical" }} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setAddPieceVariantId(null)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleAddPiece} disabled={pieceSaving} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: pieceSaving ? "not-allowed" : "pointer", opacity: pieceSaving ? 0.7 : 1 }}>
                {pieceSaving ? "Creating…" : "Create & Open"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
