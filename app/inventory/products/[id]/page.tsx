"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { ArrowLeft, Edit2, Trash2, Plus, X, Sparkles, Loader } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: { id: string } };

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

const BLANK_PIECE = {
  title: "", category_id: "", status_id: "", location_id: "",
  metal_type: "", metal_karat: "", metal_colour: "", finger_size: "",
  cost_price: "", retail_price: "", notes: "",
};

export default function ProductDetailPage({ params }: Params) {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const tenantId = user?.tenantId ?? "";
  const isManager = hydrated ? canManage(user?.role) : false;

  const [product, setProduct] = useState<any>(null);
  const [pieces, setPieces]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ref, setRef]         = useState<any>(null);

  const [editing, setEditing]       = useState(false);
  const [editForm, setEditForm]     = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError]   = useState("");

  const [showAddPiece, setShowAddPiece] = useState(false);
  const [pieceForm, setPieceForm]       = useState(BLANK_PIECE);
  const [pieceSaving, setPieceSaving]   = useState(false);
  const [pieceError, setPieceError]     = useState("");
  const [aiDesc, setAiDesc]             = useState("");
  const [aiLoading, setAiLoading]       = useState(false);

  const [deleting, setDeleting] = useState(false);

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
      setPieces(json.pieces ?? []);
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

  async function handleDelete() {
    if (!product) return;
    if (pieces.length > 0) {
      alert(`Cannot delete — ${pieces.length} piece(s) still linked. Unlink them first.`);
      return;
    }
    if (!confirm(`Delete product "${product.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/inventory/products/${product.id}`, { method: "DELETE", headers });
    setDeleting(false);
    if (res.ok) router.push("/inventory/products");
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

  async function handleAddPiece() {
    setPieceSaving(true);
    setPieceError("");
    const body = {
      ...pieceForm,
      product_id:   product.id,
      cost_price:   pieceForm.cost_price   ? Number(pieceForm.cost_price)   : null,
      retail_price: pieceForm.retail_price ? Number(pieceForm.retail_price) : null,
    };
    const res = await fetch("/api/inventory/pieces", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setPieceSaving(false);
    if (!res.ok) { setPieceError(json.error ?? "Failed"); return; }
    setShowAddPiece(false);
    setPieceForm(BLANK_PIECE);
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
  const TA = { ...IF, resize: "vertical" as const };

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 960, margin: "0 auto" }}>
      <button
        onClick={() => router.push("/inventory/products")}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: 14, marginBottom: 20, padding: 0 }}
      >
        <ArrowLeft size={16} /> Products
      </button>

      {/* Product header / edit card */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 24, marginBottom: 16 }}>
        {!editing ? (
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>{product.name}</h1>
                {catName && <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: "#F3F4F6", color: "#6B7280", fontWeight: 500 }}>{catName}</span>}
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#6B7280", marginBottom: 8 }}>
                {product.collection    && <span>Collection: <strong style={{ color: "#374151" }}>{product.collection}</strong></span>}
                {product.style         && <span>Style: <strong style={{ color: "#374151" }}>{product.style}</strong></span>}
                {product.design        && <span>Design: <strong style={{ color: "#374151" }}>{product.design}</strong></span>}
                {product.setting_type  && <span>Setting: <strong style={{ color: "#374151" }}>{product.setting_type}</strong></span>}
              </div>
              {product.marketing_description && (
                <p style={{ fontSize: 14, color: "#374151", margin: "8px 0 0", maxWidth: 640 }}>{product.marketing_description}</p>
              )}
              <div style={{ marginTop: 12, fontSize: 13, color: "#6B7280" }}>
                <strong style={{ color: "#111827" }}>{pieces.length}</strong> piece{pieces.length !== 1 ? "s" : ""} linked
              </div>
            </div>
            {isManager && (
              <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 16 }}>
                <button onClick={() => {
                  setEditForm({
                    name: product.name,
                    category_id: typeof product.category === "object" && product.category ? (product.category as any).id : (product.category_id ?? ""),
                    collection: product.collection ?? "",
                    design: product.design ?? "",
                    style: product.style ?? "",
                    setting_type: product.setting_type ?? "",
                    marketing_description: product.marketing_description ?? "",
                    website_description: product.website_description ?? "",
                    seo_title: product.seo_title ?? "",
                    seo_description: product.seo_description ?? "",
                    care_instructions: product.care_instructions ?? "",
                  });
                  setEditing(true);
                  setEditError("");
                }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer", color: "#374151" }}>
                  <Edit2 size={14} /> Edit
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 14, cursor: "pointer" }}>
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <h3 style={{ margin: "0 0 16px", fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Edit Product</h3>
            {editError && <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{editError}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LF}>Name <span style={{ color: "#EF4444" }}>*</span></label>
                <input value={editForm.name ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, name: e.target.value }))} style={IF} />
              </div>
              <div>
                <label style={LF}>Category</label>
                <select value={editForm.category_id ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, category_id: e.target.value }))} style={{ ...IF, background: "#fff" }}>
                  <option value="">— None —</option>
                  {ref?.categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={LF}>Collection</label>
                <input value={editForm.collection ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, collection: e.target.value }))} style={IF} />
              </div>
              <div>
                <label style={LF}>Style</label>
                <input value={editForm.style ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, style: e.target.value }))} placeholder="e.g. Solitaire, Halo, Three-Stone" style={IF} />
              </div>
              <div>
                <label style={LF}>Design</label>
                <input value={editForm.design ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, design: e.target.value }))} style={IF} />
              </div>
              <div>
                <label style={LF}>Setting Type</label>
                <input value={editForm.setting_type ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, setting_type: e.target.value }))} placeholder="e.g. Claw, Bezel, Pavé" style={IF} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LF}>Marketing Description</label>
                <textarea value={editForm.marketing_description ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, marketing_description: e.target.value }))} rows={3} style={TA} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LF}>Website Description</label>
                <textarea value={editForm.website_description ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, website_description: e.target.value }))} rows={2} style={TA} />
              </div>
              <div>
                <label style={LF}>SEO Title</label>
                <input value={editForm.seo_title ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, seo_title: e.target.value }))} style={IF} />
              </div>
              <div>
                <label style={LF}>SEO Description</label>
                <input value={editForm.seo_description ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, seo_description: e.target.value }))} style={IF} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LF}>Care Instructions</label>
                <textarea value={editForm.care_instructions ?? ""} onChange={e => setEditForm((f: any) => ({ ...f, care_instructions: e.target.value }))} rows={2} style={TA} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setEditing(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSaveProduct} disabled={editSaving} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: editSaving ? "not-allowed" : "pointer", opacity: editSaving ? 0.7 : 1 }}>
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pieces */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>Linked Pieces ({pieces.length})</h2>
        {isManager && (
          <button
            onClick={() => { setPieceForm({ ...BLANK_PIECE }); setPieceError(""); setAiDesc(""); setShowAddPiece(true); }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", color: "#374151" }}
          >
            <Plus size={14} /> Add Piece
          </button>
        )}
      </div>

      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        {pieces.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>
            No pieces linked to this product yet.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                {["SKU", "Title", "Metal", "Status", "Location", "Retail", ""].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#9CA3AF", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pieces.map(piece => (
                <tr
                  key={piece.id}
                  onClick={() => router.push(`/inventory/${piece.id}`)}
                  style={{ borderTop: "1px solid #F3F4F6", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 600, color: "#111827" }}>{piece.sku}</td>
                  <td style={{ padding: "10px 16px", color: "#374151" }}>{piece.title ?? "—"}</td>
                  <td style={{ padding: "10px 16px", color: "#6B7280" }}>
                    {[piece.metal_karat, piece.metal_colour, piece.metal_type].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td style={{ padding: "10px 16px" }}><StatusDot colour={piece.status?.colour} name={piece.status?.name} /></td>
                  <td style={{ padding: "10px 16px", color: "#6B7280" }}>{piece.location?.name ?? "—"}</td>
                  <td style={{ padding: "10px 16px", color: "#374151" }}>
                    {piece.retail_price != null ? `$${Number(piece.retail_price).toLocaleString()}` : "—"}
                  </td>
                  <td style={{ padding: "10px 16px", color: "#9CA3AF", fontSize: 12 }}>View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Piece Modal */}
      {showAddPiece && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>Add Piece to {product.name}</h2>
              <button onClick={() => setShowAddPiece(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={20} /></button>
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
                <div><label style={LF}>Cost Price</label><input type="number" value={pieceForm.cost_price} onChange={e => setPieceForm(f => ({ ...f, cost_price: e.target.value }))} placeholder="0.00" style={IF} /></div>
                <div><label style={LF}>Retail Price</label><input type="number" value={pieceForm.retail_price} onChange={e => setPieceForm(f => ({ ...f, retail_price: e.target.value }))} placeholder="0.00" style={IF} /></div>
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
              <div><label style={LF}>Notes</label><textarea value={pieceForm.notes} onChange={e => setPieceForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...IF, resize: "vertical" as const }} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowAddPiece(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer" }}>Cancel</button>
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
