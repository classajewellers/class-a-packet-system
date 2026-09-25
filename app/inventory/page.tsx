"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import {
  InventoryPiece,
  InventoryReferenceData,
  InventoryStatus,
  InventoryProduct,
  InventoryVariant,
} from "@/lib/types";
import { Search, Plus, X, Filter, Sparkles, Loader, ChevronDown, ChevronRight, Package, Upload } from "lucide-react";
import { FALLBACK_STATUS_OPTIONS } from "@/lib/pieceResolution";
import { formatLocationLabel, locationsForPicker } from "@/lib/location-label";

const PAGE_SIZE = 50;

// Renders the server-resolved status ({label, colour}) — production and
// staging resolve this differently (a real inventory_statuses row on
// production, e.g. "Awaiting photography"; a fixed fallback palette on
// staging's plain text enum) but both produce the same {label, colour}
// shape, so the UI never needs to know which environment it's in. See
// lib/pieceResolution.ts.
function StatusBadge({ status }: { status?: { label: string; colour: string } | null }) {
  if (!status) return <span style={{ color: "var(--vault-text-muted)", fontSize: 12 }}>—</span>;
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500,
      background: status.colour + "22", color: status.colour, border: `1px solid ${status.colour}44`,
    }}>
      {status.label}
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: "var(--vault-surface-selected)", color: "var(--vault-text)", border: "1px solid var(--vault-border)" }}>
      {children}
    </span>
  );
}

// title/category_id/status_id/metal_type removed — none of these are real
// inventory_pieces columns (confirmed live 2026-09-23: only metal_karat and
// metal_colour exist, no metal_type). status uses the piece's real text
// enum; category still isn't set here since a piece's category comes from
// its linked product, not a quick-add field.
interface AddForm {
  status: string; location_id: string;
  metal_karat: string; metal_colour: string; finger_size: string; notes: string;
}

const BLANK_FORM: AddForm = {
  status: "in_stock", location_id: "",
  metal_karat: "", metal_colour: "", finger_size: "", notes: "",
};

type ViewMode = "flat" | "grouped";

interface GroupedProduct extends InventoryProduct {
  variants?: (InventoryVariant & { pieces?: InventoryPiece[] })[];
  unlinked_pieces?: InventoryPiece[];
}

export default function InventoryPage() {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const tenantId: string = user?.tenantId ?? "";
  const isManager = hydrated ? canManage(user?.role) : false;

  const [viewMode, setViewMode] = useState<ViewMode>("flat");

  // Flat view state
  const [pieces, setPieces]   = useState<InventoryPiece[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [ref, setRef]         = useState<InventoryReferenceData | null>(null);

  // Filters
  // Category filters on the LINKED PRODUCT's category text field
  // (inventory_products.category) — there is no category on the piece
  // itself. Status filters on inventory_pieces.status directly (the real
  // text column), not an inventory_statuses id.
  const [search, setSearch]         = useState("");
  const [category, setCategory]     = useState("");
  const [status, setStatus]         = useState("");
  const [locationId, setLocationId] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [statusOptions, setStatusOptions]     = useState<{ value: string; label: string; colour: string }[]>([]);

  // Add-item modal
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState<AddForm>(BLANK_FORM);
  const [saving, setSaving]     = useState(false);
  const [addError, setAddError] = useState("");

  // AI description
  const [aiDesc, setAiDesc]       = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Grouped view state
  const [products, setProducts]       = useState<InventoryProduct[]>([]);
  const [loadingGrouped, setLoadingGrouped] = useState(false);
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [productDetail, setProductDetail]       = useState<Record<string, GroupedProduct>>({});
  const [loadingDetail, setLoadingDetail]       = useState<Record<string, boolean>>({});
  const [unassignedPieces, setUnassignedPieces] = useState<InventoryPiece[]>([]);
  const [unassignedExpanded, setUnassignedExpanded] = useState(false);

  const headers = { "x-tenant-id": tenantId };

  const fetchRef = useCallback(async () => {
    if (!tenantId) return;
    const res = await fetch("/api/inventory/reference", { headers });
    if (res.ok) setRef(await res.json());
  }, [tenantId]);

  const fetchPieces = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: String(PAGE_SIZE) });
    if (search)     params.set("search",      search);
    if (category)   params.set("category",    category);
    if (status)     params.set("status",      status);
    if (locationId) params.set("location_id", locationId);
    const res = await fetch(`/api/inventory/pieces?${params}`, { headers });
    if (res.ok) {
      const json = await res.json();
      setPieces(json.pieces ?? []);
      setTotal(json.total  ?? 0);
    }
    setLoading(false);
  }, [tenantId, page, search, category, status, locationId]);

  // Category/Status filter options merge BOTH real schemas — production's
  // real inventory_categories/inventory_statuses rows (custom statuses like
  // "Awaiting photography") plus the linked-product category / plain status
  // enum used on staging. See app/api/inventory/pieces/route.ts's
  // buildFilterOptions().
  const fetchFilterOptions = useCallback(async () => {
    if (!tenantId) return;
    const res = await fetch("/api/inventory/pieces/filter-options", { headers });
    if (res.ok) {
      const json = await res.json();
      setCategoryOptions(json.categoryOptions ?? []);
      setStatusOptions(json.statusOptions ?? []);
    }
  }, [tenantId]);

  const fetchGrouped = useCallback(async () => {
    if (!tenantId) return;
    setLoadingGrouped(true);
    const [prodRes, unassignedRes] = await Promise.all([
      fetch("/api/inventory/products", { headers }),
      fetch("/api/inventory/pieces?unassigned=true&per_page=200", { headers }),
    ]);
    if (prodRes.ok) setProducts((await prodRes.json()).products ?? []);
    if (unassignedRes.ok) setUnassignedPieces((await unassignedRes.json()).pieces ?? []);
    setLoadingGrouped(false);
  }, [tenantId]);

  useEffect(() => { fetchRef(); }, [fetchRef]);
  useEffect(() => { fetchFilterOptions(); }, [fetchFilterOptions]);
  useEffect(() => { if (viewMode === "flat") fetchPieces(); }, [fetchPieces, viewMode]);
  useEffect(() => { if (viewMode === "grouped") fetchGrouped(); }, [fetchGrouped, viewMode]);

  async function toggleProduct(productId: string) {
    const nowOpen = !expandedProducts[productId];
    setExpandedProducts(e => ({ ...e, [productId]: nowOpen }));
    if (nowOpen && !productDetail[productId]) {
      setLoadingDetail(d => ({ ...d, [productId]: true }));
      const res = await fetch(`/api/inventory/products/${productId}`, { headers });
      if (res.ok) {
        const json = await res.json();
        setProductDetail(d => ({ ...d, [productId]: json }));
      }
      setLoadingDetail(d => ({ ...d, [productId]: false }));
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
    setAddForm(prev => ({
      ...prev,
      metal_karat:  f.metal_karat  && !prev.metal_karat  ? f.metal_karat  : prev.metal_karat,
      metal_colour: f.metal_colour && !prev.metal_colour ? f.metal_colour : prev.metal_colour,
      finger_size:  f.finger_size  && !prev.finger_size  ? f.finger_size  : prev.finger_size,
      notes:        f.notes        && !prev.notes        ? f.notes        : prev.notes,
    }));
  }

  async function handleAdd() {
    setSaving(true);
    setAddError("");
    const res = await fetch("/api/inventory/pieces", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    const json = await res.json();
    if (!res.ok) { setAddError(json.error ?? "Failed to create"); setSaving(false); return; }
    setSaving(false);
    setShowAdd(false);
    setAddForm(BLANK_FORM);
    setAiDesc("");
    router.push(`/inventory/${json.piece.id}`);
  }

  function openAdd() { setShowAdd(true); setAddForm(BLANK_FORM); setAiDesc(""); setAddError(""); }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = search || category || status || locationId;

  function clearFilters() {
    setSearch(""); setCategory(""); setStatus(""); setLocationId(""); setPage(1);
  }

  if (!hydrated) return null;

  const LF = { fontSize: 13, fontWeight: 500 as const, color: "var(--vault-text)", display: "block" as const, marginBottom: 4 };
  const IF = { width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14 };

  return (
    <div className="stock-page" style={{ padding: "32px 32px 64px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "var(--vault-text-page-title)", fontWeight: 600, color: "var(--vault-text)", margin: 0 }}>Inventory</h1>
          <p style={{ fontSize: 14, color: "var(--vault-text-secondary)", margin: "4px 0 0" }}>
            {viewMode === "flat"
              ? (loading ? "Loading…" : `${total.toLocaleString()} piece${total !== 1 ? "s" : ""}`)
              : (loadingGrouped ? "Loading…" : `${products.length} product${products.length !== 1 ? "s" : ""}`)}
          </p>
        </div>
        <div className="stock-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* View toggle */}
          <div style={{ display: "flex", background: "var(--vault-surface)", border: "1px solid var(--vault-border)", borderRadius: "var(--vault-radius-sm)", padding: 3 }}>
            {(["flat", "grouped"] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                style={{
                  padding: "6px 14px", borderRadius: 6, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
                  background: viewMode === v ? "var(--vault-canvas)" : "transparent",
                  color: viewMode === v ? "var(--vault-text)" : "var(--vault-text-secondary)",
                  boxShadow: viewMode === v ? "var(--vault-shadow-elevated)" : "none",
                  transition: "all .15s",
                }}
              >
                {v === "flat" ? "Flat" : "Grouped"}
              </button>
            ))}
          </div>

          {viewMode === "flat" && (
            <button
              onClick={() => setShowFilters(f => !f)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 500,
                background: showFilters ? "var(--vault-surface-selected)" : "var(--vault-surface)",
                color: "var(--vault-text)",
                border: "1px solid " + (showFilters ? "var(--vault-text)" : "var(--vault-border)"),
                cursor: "pointer",
              }}
            >
              <Filter size={15} /> Filters{hasFilters ? " ●" : ""}
            </button>
          )}

          {viewMode === "grouped" && isManager && (
            <button
              onClick={() => router.push("/inventory/products")}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 500, background: "var(--vault-surface)", color: "var(--vault-text)", border: "1px solid #E5E7EB", cursor: "pointer" }}
            >
              <Package size={15} /> Manage Products
            </button>
          )}

          {isManager && (
            <button
              onClick={() => router.push("/inventory/import")}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, fontSize: 14, fontWeight: 500, background: "var(--vault-surface)", color: "var(--vault-text)", border: "1px solid #E5E7EB", cursor: "pointer" }}
            >
              <Upload size={15} /> Import CSV
            </button>
          )}
          {isManager && (
            <button
              onClick={() => router.push("/inventory/pieces/new")}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 500, background: "var(--vault-text)", color: "#fff", border: "none", cursor: "pointer" }}
            >
              <Plus size={15} /> Add Piece
            </button>
          )}
        </div>
      </div>

      {/* ── FLAT VIEW ── */}
      {viewMode === "flat" && (
        <>
          {/* Search + filter bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ position: "relative", marginBottom: showFilters ? 12 : 0 }}>
              <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--vault-text-muted)", pointerEvents: "none" }} />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search SKU or title…"
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 36px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 14, outline: "none", background: "var(--vault-canvas)" }}
              />
              {search && (
                <button onClick={() => { setSearch(""); setPage(1); }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--vault-text-muted)" }}>
                  <X size={14} />
                </button>
              )}
            </div>
            {showFilters && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13, background: "var(--vault-canvas)", color: "var(--vault-text)" }}>
                  <option value="">All Categories</option>
                  {categoryOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13, background: "var(--vault-canvas)", color: "var(--vault-text)" }}>
                  <option value="">All Statuses</option>
                  {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <select value={locationId} onChange={e => { setLocationId(e.target.value); setPage(1); }} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13, background: "var(--vault-canvas)", color: "var(--vault-text)" }}>
                  <option value="">All Locations</option>
                  {locationsForPicker(ref?.locations ?? []).map(l => <option key={l.id} value={l.id}>{formatLocationLabel(l)}</option>)}
                </select>
                {hasFilters && (
                  <button onClick={clearFilters} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13, background: "var(--vault-canvas)", color: "#EF4444", cursor: "pointer" }}>Clear all</button>
                )}
              </div>
            )}
          </div>

          <div className="stock-cards">
            {loading ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--vault-text-muted)" }}>Loading…</div>
            ) : pieces.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "var(--vault-text-muted)" }}>No items found</div>
            ) : pieces.map((piece) => (
              <button
                key={piece.id}
                type="button"
                onClick={() => router.push(`/inventory/${piece.id}`)}
                style={{
                  display: "block", width: "100%", boxSizing: "border-box", textAlign: "left",
                  background: "var(--vault-canvas)", border: "1px solid #E5E7EB", borderRadius: 12,
                  padding: "14px 14px", minHeight: 72, cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "var(--vault-text)" }}>{piece.sku}</span>
                  <span style={{ fontWeight: 700, color: "var(--vault-text)", flexShrink: 0 }}>
                    {piece.retail_price != null
                      ? `$${piece.retail_price.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "—"}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: "var(--vault-text-secondary)", marginTop: 4 }}>
                  {[piece.metal_karat, piece.metal_colour].filter(Boolean).join(" ") || "—"}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
                  <StatusBadge status={piece.resolved_status} />
                  <span style={{ fontSize: 13, color: "var(--vault-text-secondary)" }}>{piece.location_path ?? piece.location?.name ?? "No location"}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="stock-table-wrap" style={{ background: "var(--vault-canvas)", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "var(--vault-surface)", borderBottom: "1px solid #E5E7EB" }}>
                  {["SKU", "Design", "Category", "Status", "Location", "Metal", "Retail Price", ""].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "var(--vault-text)", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--vault-text-muted)" }}>Loading…</td></tr>
                ) : pieces.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "var(--vault-text-muted)" }}>No items found</td></tr>
                ) : pieces.map((piece, i) => (
                  <tr
                    key={piece.id}
                    onClick={() => router.push(`/inventory/${piece.id}`)}
                    style={{ borderBottom: i < pieces.length - 1 ? "1px solid #F3F4F6" : "none", cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--vault-surface)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}
                  >
                    <td style={{ padding: "12px 16px", fontFamily: "monospace", fontWeight: 600, color: "var(--vault-text)" }}>{piece.sku}</td>
                    <td style={{ padding: "12px 16px", color: "var(--vault-text)" }}>{piece.resolved_design ?? <span style={{ color: "var(--vault-text-muted)" }}>—</span>}</td>
                    <td style={{ padding: "12px 16px", color: "var(--vault-text-secondary)" }}>{piece.resolved_category ?? "—"}</td>
                    <td style={{ padding: "12px 16px" }}><StatusBadge status={piece.resolved_status} /></td>
                    <td style={{ padding: "12px 16px", color: "var(--vault-text-secondary)" }}>{piece.location_path ?? piece.location?.name ?? "—"}</td>
                    <td style={{ padding: "12px 16px", color: "var(--vault-text-secondary)", fontSize: 13 }}>{[piece.metal_karat, piece.metal_colour].filter(Boolean).join(" ") || "—"}</td>
                    <td style={{ padding: "12px 16px", color: "var(--vault-text)", fontWeight: 500 }}>
                      {piece.retail_price != null
                        ? `$${piece.retail_price.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : <span style={{ color: "var(--vault-text-muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--vault-text-secondary)", fontSize: 12 }}>View →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
              <span style={{ fontSize: 13, color: "var(--vault-text-secondary)" }}>Page {page} of {totalPages}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "var(--vault-canvas)", fontSize: 13, cursor: page <= 1 ? "not-allowed" : "pointer", color: page <= 1 ? "var(--vault-border-strong)" : "var(--vault-text)" }}>Prev</button>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "var(--vault-canvas)", fontSize: 13, cursor: page >= totalPages ? "not-allowed" : "pointer", color: page >= totalPages ? "var(--vault-border-strong)" : "var(--vault-text)" }}>Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── GROUPED VIEW ── */}
      {viewMode === "grouped" && (
        <div>
          {loadingGrouped ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--vault-text-muted)" }}>Loading…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {products.map(product => {
                const isOpen = expandedProducts[product.id];
                const detail = productDetail[product.id] as GroupedProduct | undefined;
                const isLoadingDetail = loadingDetail[product.id];
                const catName = typeof product.category === "object" && product.category && "name" in product.category
                  ? product.category.name : null;

                return (
                  <div key={product.id} style={{ background: "var(--vault-canvas)", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
                    {/* Product row */}
                    <div
                      style={{ display: "flex", alignItems: "center", padding: "14px 18px", cursor: "pointer" }}
                      onClick={() => toggleProduct(product.id)}
                    >
                      <div style={{ marginRight: 12, color: "var(--vault-text-muted)" }}>
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--vault-surface-selected)", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 12, flexShrink: 0 }}>
                        <Package size={14} style={{ color: "var(--vault-text)" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--vault-text)" }}>{product.name}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                          {catName && <span style={{ fontSize: 11, color: "var(--vault-text-muted)" }}>{catName}</span>}
                          {product.collection && <span style={{ fontSize: 11, color: "var(--vault-text-muted)" }}>· {product.collection}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 16, marginRight: 8 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--vault-text)" }}>{product.piece_count ?? 0}</div>
                          <div style={{ fontSize: 10, color: "var(--vault-text-muted)" }}>pieces</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: (product.atp?.available_to_sell_today ?? 0) > 0 ? "#10B981" : "var(--vault-text-muted)" }}>
                            {product.atp?.available_to_sell_today ?? 0}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--vault-text-muted)" }}>available today</div>
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/inventory/products/${product.id}`); }}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #E5E7EB", background: "var(--vault-canvas)", fontSize: 12, cursor: "pointer", color: "var(--vault-text)" }}
                      >Open</button>
                    </div>

                    {/* Expanded variants + pieces */}
                    {isOpen && (
                      <div style={{ borderTop: "1px solid #F3F4F6" }}>
                        {isLoadingDetail ? (
                          <div style={{ padding: "16px 52px", fontSize: 13, color: "var(--vault-text-muted)" }}>Loading…</div>
                        ) : detail?.variants?.map(variant => {
                          const specs = [variant.metal_karat, variant.metal_colour, variant.metal_type, variant.finger_size && `Size ${variant.finger_size}`].filter(Boolean) as string[];
                          const pieces = variant.pieces ?? [];
                          return (
                            <div key={variant.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                              {/* Variant row */}
                              <div className="stock-indent" style={{ display: "flex", alignItems: "center", padding: "10px 18px 10px 52px", background: "var(--vault-surface)" }}>
                                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                                  {variant.title && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--vault-text)" }}>{variant.title}</span>}
                                  <div style={{ display: "flex", gap: 4 }}>
                                    {specs.map((s, i) => <Pill key={i}>{s}</Pill>)}
                                  </div>
                                </div>
                                <span style={{ fontSize: 12, color: "var(--vault-text-muted)", marginRight: 8 }}>{pieces.length} piece{pieces.length !== 1 ? "s" : ""}</span>
                              </div>
                              {/* Pieces */}
                              {pieces.map(piece => (
                                <div
                                  key={piece.id}
                                  onClick={() => router.push(`/inventory/${piece.id}`)}
                                  className="stock-indent"
                                  style={{ display: "flex", alignItems: "center", padding: "8px 18px 8px 72px", cursor: "pointer", borderTop: "1px solid #F9FAFB" }}
                                  onMouseEnter={e => (e.currentTarget.style.background = "var(--vault-surface)")}
                                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                                >
                                  <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--vault-text)", width: 100, flexShrink: 0 }}>{piece.sku}</span>
                                  <span style={{ fontSize: 12, color: "var(--vault-text-muted)", flex: 1 }}>{piece.location_path ?? (piece.location as any)?.name ?? "—"}</span>
                                  {piece.resolved_status && (
                                    <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 999, background: piece.resolved_status.colour + "22", color: piece.resolved_status.colour, border: `1px solid ${piece.resolved_status.colour}44`, fontWeight: 500 }}>
                                      {piece.resolved_status.label}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Unassigned group */}
              {unassignedPieces.length > 0 && (
                <div style={{ background: "var(--vault-canvas)", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
                  <div
                    style={{ display: "flex", alignItems: "center", padding: "14px 18px", cursor: "pointer" }}
                    onClick={() => setUnassignedExpanded(e => !e)}
                  >
                    <div style={{ marginRight: 12, color: "var(--vault-text-muted)" }}>
                      {unassignedExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--vault-text-secondary)" }}>Unassigned Pieces</div>
                      <div style={{ fontSize: 12, color: "var(--vault-text-muted)", marginTop: 1 }}>Not linked to any product</div>
                    </div>
                    <div style={{ textAlign: "right", marginRight: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--vault-text)" }}>{unassignedPieces.length}</div>
                      <div style={{ fontSize: 10, color: "var(--vault-text-muted)" }}>pieces</div>
                    </div>
                  </div>
                  {unassignedExpanded && (
                    <div style={{ borderTop: "1px solid #F3F4F6" }}>
                      {unassignedPieces.map(piece => (
                        <div
                          key={piece.id}
                          onClick={() => router.push(`/inventory/${piece.id}`)}
                          className="stock-indent"
                          style={{ display: "flex", alignItems: "center", padding: "10px 18px 10px 52px", cursor: "pointer", borderBottom: "1px solid #F9FAFB" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--vault-surface)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "")}
                        >
                          <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--vault-text)", width: 100, flexShrink: 0 }}>{piece.sku}</span>
                          <span style={{ fontSize: 12, color: "var(--vault-text-muted)", flex: 1 }}>{piece.location_path ?? (piece.location as any)?.name ?? "—"}</span>
                          {piece.resolved_status && (
                            <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 999, background: piece.resolved_status.colour + "22", color: piece.resolved_status.colour, border: `1px solid ${piece.resolved_status.colour}44`, fontWeight: 500 }}>
                              {piece.resolved_status.label}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {products.length === 0 && unassignedPieces.length === 0 && (
                <div style={{ padding: 48, textAlign: "center", color: "var(--vault-text-muted)" }}>
                  No products yet. <button onClick={() => router.push("/inventory/products")} style={{ color: "var(--vault-text)", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>Create your first product</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Item Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--vault-canvas)", borderRadius: 16, padding: 32, width: "100%", maxWidth: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--vault-text)" }}>Add New Item</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--vault-text-secondary)" }}><X size={20} /></button>
            </div>

            {/* AI description */}
            <div style={{ background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 10, padding: 14, marginBottom: 20 }}>
              <label style={{ ...LF, color: "#5B21B6", marginBottom: 6 }}>
                <Sparkles size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                Describe the item (optional)
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea
                  value={aiDesc}
                  onChange={e => setAiDesc(e.target.value)}
                  placeholder="e.g. 18ct yellow gold solitaire engagement ring with 0.5ct round brilliant diamond G VS1…"
                  rows={2}
                  style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #DDD6FE", fontSize: 13, resize: "vertical", background: "var(--vault-canvas)" }}
                />
                <button
                  onClick={handleParseWithAI}
                  disabled={aiLoading || !aiDesc.trim()}
                  style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "var(--vault-text)", color: "#fff", border: "none", cursor: aiLoading || !aiDesc.trim() ? "not-allowed" : "pointer", opacity: !aiDesc.trim() ? 0.5 : 1, alignSelf: "flex-start" }}
                >
                  {aiLoading ? <Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} />}
                  Parse
                </button>
              </div>
              {aiLoading && <div style={{ fontSize: 12, color: "#7C3AED", marginTop: 6 }}>Parsing with AI…</div>}
            </div>

            {addError && (
              <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{addError}</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 12, color: "var(--vault-text-muted)" }}>
                This creates an unlinked piece (no Design). Link it to a product from the piece&apos;s own page afterward if it belongs to one.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
                <div>
                  <label style={LF}>Carat</label>
                  <input value={addForm.metal_karat} onChange={e => setAddForm(f => ({ ...f, metal_karat: e.target.value }))} placeholder="e.g. 18ct" style={IF} />
                </div>
                <div>
                  <label style={LF}>Metal Colour</label>
                  <input value={addForm.metal_colour} onChange={e => setAddForm(f => ({ ...f, metal_colour: e.target.value }))} placeholder="e.g. Yellow" style={IF} />
                </div>
                <div>
                  <label style={LF}>Finger Size</label>
                  <input value={addForm.finger_size} onChange={e => setAddForm(f => ({ ...f, finger_size: e.target.value }))} placeholder="e.g. N" style={IF} />
                </div>
              </div>
              <div>
                <label style={LF}>Status</label>
                <select value={addForm.status} onChange={e => setAddForm(f => ({ ...f, status: e.target.value }))} style={{ ...IF, background: "var(--vault-canvas)" }}>
                  {FALLBACK_STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label style={LF}>Location</label>
                <select value={addForm.location_id} onChange={e => setAddForm(f => ({ ...f, location_id: e.target.value }))} style={{ ...IF, background: "var(--vault-canvas)" }}>
                  <option value="">— Select location —</option>
                  {locationsForPicker(ref?.locations ?? []).map(l => <option key={l.id} value={l.id}>{formatLocationLabel(l)}</option>)}
                </select>
              </div>
              <div>
                <label style={LF}>Notes</label>
                <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...IF, resize: "vertical" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "var(--vault-canvas)", fontSize: 14, cursor: "pointer", color: "var(--vault-text)" }}>Cancel</button>
              <button onClick={handleAdd} disabled={saving} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "var(--vault-text)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Creating…" : "Create Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
