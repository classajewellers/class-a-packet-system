// @ts-nocheck
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import {
  InventoryDesign,
  InventoryPiece,
  InventoryPieceBom,
  InventoryLocation,
  InventorySupplier,
  PieceStatus,
  CsvImportResult,
} from "@/lib/types";
import { calculateMultiplier, multiplierColour, calculateRetailPrice } from "@/lib/marginCalculator";
import { generatePieceTagHTML } from "@/lib/jewelleryTagGenerator";
import {
  Plus, Search, X, ChevronRight, Printer, Edit2, Trash2, AlertTriangle, Info, Upload, Download,
} from "lucide-react";

// ── constants ──────────────────────────────────────────────────────────────
const DESIGN_CATEGORIES = [
  "Engagement Ring", "Wedding Ring", "Fine Jewellery", "Earrings",
  "Bracelet", "Necklace", "Pendant", "Brooch", "Loose Stone", "Component", "Other",
] as const;

const CATEGORY_BADGE: Record<string, { bg: string; fg: string }> = {
  "Engagement Ring": { bg: "#FDF2F8", fg: "#9D174D" },
  "Wedding Ring":    { bg: "#FFF7ED", fg: "#9A3412" },
  "Fine Jewellery":  { bg: "#EEF2FF", fg: "#4338CA" },
  "Earrings":        { bg: "#F0FDF4", fg: "#166534" },
  "Bracelet":        { bg: "#F0F9FF", fg: "#0369A1" },
  "Necklace":        { bg: "#FDF4FF", fg: "#7E22CE" },
  "Pendant":         { bg: "#ECFDF5", fg: "#065F46" },
  "Brooch":          { bg: "#FEF3C7", fg: "#92400E" },
  "Loose Stone":     { bg: "#DBEAFE", fg: "#1E40AF" },
  "Component":       { bg: "#F3F4F6", fg: "#6B7280" },
  "Other":           { bg: "#F3F4F6", fg: "#6B7280" },
};

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  in_stock:    { bg: "#D1FAE5", fg: "#065F46", label: "In Stock" },
  on_order:    { bg: "#FEF3C7", fg: "#92400E", label: "On Order" },
  sold:        { bg: "#F3F4F6", fg: "#6B7280", label: "Sold" },
  workshop:    { bg: "#EDE9FE", fg: "#5B21B6", label: "Workshop" },
  consignment: { bg: "#FFF7ED", fg: "#9A3412", label: "Consignment" },
};

const METAL_CARATS = ["9K", "18K", "Platinum", "Silver", "Other"];
const METAL_COLOURS = ["Yellow", "White", "Rose", "N/A"];
const DIAMOND_TYPES = ["Natural", "Lab Grown", "None"];
const DIAMOND_COLOURS = ["D", "E", "F", "G", "H", "I", "J", "Other"];
const DIAMOND_CLARITIES = ["IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "Other"];
const BOM_TYPES = ["casting", "diamond", "labour", "settings", "findings", "other"];
const PIECE_STATUSES: PieceStatus[] = ["in_stock", "on_order", "sold", "workshop", "consignment"];

const BOM_TYPE_STYLE: Record<string, { bg: string; fg: string }> = {
  casting:  { bg: "#FEF3C7", fg: "#92400E" },
  diamond:  { bg: "#EEF2FF", fg: "#4338CA" },
  labour:   { bg: "#F0F9FF", fg: "#0369A1" },
  settings: { bg: "#FCE7F3", fg: "#9D174D" },
  findings: { bg: "#F3F4F6", fg: "#6B7280" },
  other:    { bg: "#ECFDF5", fg: "#065F46" },
};

const AMBER = "#F59E0B";

// ── helpers ────────────────────────────────────────────────────────────────
const fmtCurrency = (v: number | null | undefined) =>
  v != null ? `$${Number(v).toFixed(2)}` : "—";

function buildLocationOptions(locations: InventoryLocation[]): { id: string; label: string }[] {
  const byId = new Map(locations.map((l) => [l.id, l]));
  return locations.map((l) => {
    if (l.parent_id) {
      const parent = byId.get(l.parent_id);
      return { id: l.id, label: parent ? `${parent.name} → ${l.name}` : l.name };
    }
    return { id: l.id, label: l.name };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

function metalStr(piece: InventoryPiece): string {
  const parts: string[] = [];
  if (piece.metal_karat) parts.push(piece.metal_karat);
  if (piece.metal_colour && piece.metal_colour !== "N/A") parts.push(piece.metal_colour);
  return parts.join(" ");
}

function diamondStr(piece: InventoryPiece): string {
  if (!piece.diamond_type || piece.diamond_type === "None") return "";
  const parts: string[] = [];
  if (piece.diamond_carat) parts.push(`${piece.diamond_carat}ct`);
  parts.push(piece.diamond_type === "Lab Grown" ? "Lab" : piece.diamond_type);
  const grading: string[] = [];
  if (piece.diamond_colour) grading.push(piece.diamond_colour);
  if (piece.diamond_clarity) grading.push(piece.diamond_clarity);
  if (grading.length) parts.push(grading.join("/"));
  return parts.join(" ");
}

function multiplierBadge(mult: number | null) {
  if (mult == null) return null;
  const colour = multiplierColour(mult);
  const palette = {
    green:  { bg: "#D1FAE5", fg: "#065F46" },
    orange: { bg: "#FED7AA", fg: "#9A3412" },
    red:    { bg: "#FEE2E2", fg: "#991B1B" },
  }[colour];
  return (
    <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: palette.bg, color: palette.fg }}>
      ×{mult.toFixed(2)}
    </span>
  );
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// ── badge components ──────────────────────────────────────────────────────
function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const c = CATEGORY_BADGE[category] ?? CATEGORY_BADGE["Other"];
  return (
    <span style={{
      display: "inline-flex", padding: "2px 10px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg,
    }}>
      {category}
    </span>
  );
}

function StatusBadge({ status }: { status: PieceStatus }) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.in_stock;
  return (
    <span style={{
      display: "inline-flex", padding: "2px 10px", borderRadius: 999,
      fontSize: 11, fontWeight: 600, background: s.bg, color: s.fg,
    }}>
      {s.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────
export default function StockPage() {
  const { user } = useUser();
  const isManager = canManage(user?.role);

  const [designs, setDesigns] = useState<InventoryDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [piecesCache, setPiecesCache] = useState<Record<string, InventoryPiece[]>>({});
  const [pageError, setPageError] = useState<string | null>(null);

  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [goldPrices, setGoldPrices] = useState<Record<string, { price_per_gram: number; created_at: string }>>({});

  const [drawer, setDrawer] = useState<{
    mode: "new-piece" | "edit-piece";
    design: InventoryDesign | null;
    piece: InventoryPiece | null;
    tab: "details" | "bom";
  } | null>(null);

  const [showNewDesign, setShowNewDesign] = useState(false);
  const [showImportCsv, setShowImportCsv] = useState(false);
  const [oneOffPieces, setOneOffPieces] = useState<InventoryPiece[]>([]);
  const [oneOffLoading, setOneOffLoading] = useState(true);

  const locationOptions = useMemo(() => buildLocationOptions(locations), [locations]);
  const locationLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of locationOptions) m.set(o.id, o.label);
    return m;
  }, [locationOptions]);

  // ── fetchers ────────────────────────────────────────────────────────────
  const fetchDesigns = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const url = "/api/inventory/designs" + (search ? `?search=${encodeURIComponent(search)}` : "");
      const res = await fetch(url, { headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      const json = await res.json();
      if (!res.ok || json.error) {
        setPageError(json.error || `Failed to load designs (${res.status})`);
        setDesigns([]);
      } else {
        setDesigns(json.designs ?? []);
      }
    } catch (err) {
      setPageError(String(err));
    } finally {
      setLoading(false);
    }
  }, [search]);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/locations", { headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      const json = await res.json();
      if (res.ok && !json.error) setLocations(json.locations ?? []);
    } catch { /* ignore */ }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/suppliers", { headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      const json = await res.json();
      if (res.ok && !json.error) setSuppliers(json.suppliers ?? []);
    } catch { /* ignore */ }
  }, []);

  const fetchGoldPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/gold-prices", { headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      const json = await res.json();
      if (res.ok && !json.error) setGoldPrices(json.latest ?? {});
    } catch { /* ignore */ }
  }, []);

  const fetchOneOffPieces = useCallback(async () => {
    setOneOffLoading(true);
    try {
      const res = await fetch("/api/inventory/pieces?oneoff=true", { headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      const json = await res.json();
      if (res.ok && !json.error) setOneOffPieces(json.pieces ?? []);
    } catch { /* ignore */ } finally {
      setOneOffLoading(false);
    }
  }, []);

  useEffect(() => { fetchDesigns(); }, [fetchDesigns]);
  useEffect(() => {
    fetchLocations();
    fetchSuppliers();
    fetchGoldPrices();
    fetchOneOffPieces();
  }, [fetchLocations, fetchSuppliers, fetchGoldPrices, fetchOneOffPieces]);

  // ── expand / pieces cache ───────────────────────────────────────────────
  const fetchPiecesForDesign = useCallback(async (designId: string) => {
    try {
      const res = await fetch(`/api/inventory/pieces?design_id=${encodeURIComponent(designId)}`, { headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      const json = await res.json();
      if (!res.ok || json.error) {
        setPageError(json.error || "Failed to load pieces");
        return;
      }
      setPiecesCache((c) => ({ ...c, [designId]: json.pieces ?? [] }));
    } catch (err) {
      setPageError(String(err));
    }
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds((s) => {
      const next = new Set(Array.from(s));
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!piecesCache[id]) {
          void fetchPiecesForDesign(id);
        }
      }
      return next;
    });
  };

  // ── handlers ────────────────────────────────────────────────────────────
  const handlePrintTag = (piece: InventoryPiece, designName: string) => {
    const html = generatePieceTagHTML(piece, designName);
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  const openAddPiece = (design: InventoryDesign) => {
    setDrawer({ mode: "new-piece", design, piece: null, tab: "details" });
  };

  const openEditPiece = (design: InventoryDesign, piece: InventoryPiece) => {
    setDrawer({ mode: "edit-piece", design, piece, tab: "details" });
  };

  const openAddOneOff = () => {
    setDrawer({ mode: "new-piece", design: null, piece: null, tab: "details" });
  };

  const openEditOneOff = (piece: InventoryPiece) => {
    setDrawer({ mode: "edit-piece", design: null, piece, tab: "details" });
  };

  const closeDrawer = () => setDrawer(null);

  const handlePieceSaved = (designId: string | null, piece: InventoryPiece, isNew: boolean) => {
    if (!designId) {
      // one-off
      setOneOffPieces((prev) => {
        if (isNew) return [...prev, piece];
        const idx = prev.findIndex((p) => p.id === piece.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = piece;
          return next;
        }
        return [...prev, piece];
      });
      return;
    }
    setPiecesCache((c) => {
      const cur = c[designId] ? [...c[designId]] : [];
      if (isNew) {
        cur.push(piece);
      } else {
        const idx = cur.findIndex((p) => p.id === piece.id);
        if (idx >= 0) cur[idx] = piece; else cur.push(piece);
      }
      return { ...c, [designId]: cur };
    });
    // also refresh design summary list (counts)
    void fetchDesigns();
    // ensure design is expanded
    setExpandedIds((s) => {
      const next = new Set(Array.from(s));
      next.add(designId);
      return next;
    });
  };

  const handlePieceDeleted = (designId: string | null, pieceId: string) => {
    if (!designId) {
      setOneOffPieces((prev) => prev.filter((p) => p.id !== pieceId));
      return;
    }
    setPiecesCache((c) => {
      const cur = (c[designId] ?? []).filter((p) => p.id !== pieceId);
      return { ...c, [designId]: cur };
    });
    void fetchDesigns();
  };

  const handleDesignCreated = (design: InventoryDesign) => {
    setShowNewDesign(false);
    void fetchDesigns();
    setExpandedIds((s) => {
      const next = new Set(Array.from(s));
      next.add(design.id);
      return next;
    });
    // empty pieces cache for new design
    setPiecesCache((c) => ({ ...c, [design.id]: [] }));
  };

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Stock</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input
              type="text"
              placeholder="Search designs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "8px 12px 8px 32px",
                border: "1px solid #D1D5DB",
                borderRadius: 8,
                fontSize: 14,
                width: 240,
                outline: "none",
              }}
            />
          </div>
          <button
            onClick={() => setShowImportCsv(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", background: "#fff", color: "#111827",
              border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            <Upload size={16} /> Import CSV
          </button>
          <button
            onClick={() => setShowNewDesign(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", background: "#111827", color: "#fff",
              border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            <Plus size={16} /> Add Design
          </button>
        </div>
      </div>

      {pageError && (
        <div style={{ marginBottom: 16, padding: 12, background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13 }}>
          {pageError}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#6B7280" }}>Loading…</div>
      ) : designs.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#6B7280", background: "#F9FAFB", borderRadius: 12 }}>
          No designs yet. Click <strong>+ Add Design</strong> to create one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {designs.map((d) => (
            <DesignCard
              key={d.id}
              design={d}
              expanded={expandedIds.has(d.id)}
              onToggle={() => toggleExpand(d.id)}
              pieces={piecesCache[d.id]}
              isManager={isManager}
              onAddPiece={() => openAddPiece(d)}
              onEditPiece={(p) => openEditPiece(d, p)}
              onPrintTag={(p) => handlePrintTag(p, d.name)}
              locationLabelById={locationLabelById}
            />
          ))}
        </div>
      )}

      {/* One-Off Items */}
      <OneOffSection
        pieces={oneOffPieces}
        loading={oneOffLoading}
        isManager={isManager}
        locationLabelById={locationLabelById}
        onAdd={openAddOneOff}
        onEdit={openEditOneOff}
        onPrintTag={(p) => handlePrintTag(p, "One-Off")}
      />

      {/* Add Design Modal */}
      {showNewDesign && (
        <NewDesignModal
          onClose={() => setShowNewDesign(false)}
          onCreated={handleDesignCreated}
        />
      )}

      {/* Import CSV Modal */}
      {showImportCsv && (
        <ImportCsvModal
          onClose={() => setShowImportCsv(false)}
          onImported={() => {
            void fetchDesigns();
            void fetchOneOffPieces();
            setPiecesCache({});
          }}
        />
      )}

      {/* Piece Drawer */}
      {drawer && (
        <PieceDrawer
          mode={drawer.mode}
          design={drawer.design}
          piece={drawer.piece}
          tab={drawer.tab}
          onTabChange={(tab) => setDrawer((d) => d ? { ...d, tab } : d)}
          onClose={closeDrawer}
          isManager={isManager}
          locationOptions={locationOptions}
          suppliers={suppliers}
          goldPrices={goldPrices}
          onSaved={(piece, isNew) => handlePieceSaved(drawer.design?.id ?? null, piece, isNew)}
          onDeleted={(pieceId) => { handlePieceDeleted(drawer.design?.id ?? null, pieceId); closeDrawer(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Design Card
// ─────────────────────────────────────────────────────────────────────────
function DesignCard({
  design, expanded, onToggle, pieces, isManager,
  onAddPiece, onEditPiece, onPrintTag, locationLabelById,
}: {
  design: InventoryDesign;
  expanded: boolean;
  onToggle: () => void;
  pieces: InventoryPiece[] | undefined;
  isManager: boolean;
  onAddPiece: () => void;
  onEditPiece: (p: InventoryPiece) => void;
  onPrintTag: (p: InventoryPiece) => void;
  locationLabelById: Map<string, string>;
}) {
  const summaryPieces = design.pieces ?? [];
  const total = summaryPieces.length;
  const inStock = summaryPieces.filter((p) => p.status === "in_stock").length;

  return (
    <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, background: "#fff", overflow: "hidden" }}>
      {/* Row */}
      <div
        style={{ display: "flex", alignItems: "center", padding: "14px 16px", cursor: "pointer", gap: 12 }}
        onClick={onToggle}
      >
        <ChevronRight
          size={16}
          style={{
            transition: "transform 0.15s",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            color: "#6B7280",
            flexShrink: 0,
          }}
        />
        <div style={{ fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{design.name}</div>
        <CategoryBadge category={design.category} />
        <div style={{ color: "#6B7280", fontSize: 13, marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span>{total} {total === 1 ? "piece" : "pieces"} · {inStock} in stock</span>
          <button
            onClick={(e) => { e.stopPropagation(); onAddPiece(); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "6px 12px", border: "1px solid #D1D5DB",
              borderRadius: 6, background: "#fff", fontSize: 13, fontWeight: 600,
              color: "#111827", cursor: "pointer",
            }}
          >
            <Plus size={14} /> Add Piece
          </button>
        </div>
      </div>

      {/* Pieces table */}
      {expanded && (
        <div style={{ borderTop: "1px solid #F3F4F6", background: "#F9FAFB" }}>
          {pieces == null ? (
            <div style={{ padding: 16, color: "#6B7280", fontSize: 13 }}>Loading pieces…</div>
          ) : pieces.length === 0 ? (
            <div style={{ padding: 16, color: "#6B7280", fontSize: 13 }}>
              No pieces yet. Click <strong>+ Add Piece</strong> to add one.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#6B7280" }}>
                    <th style={{ padding: "8px 12px", fontWeight: 600 }}>SKU</th>
                    <th style={{ padding: "8px 4px", fontWeight: 600 }}>Metal</th>
                    <th style={{ padding: "8px 4px", fontWeight: 600 }}>Diamond</th>
                    <th style={{ padding: "8px 4px", fontWeight: 600 }}>Specs</th>
                    <th style={{ padding: "8px 4px", fontWeight: 600 }}>Location</th>
                    <th style={{ padding: "8px 4px", fontWeight: 600 }}>Status</th>
                    <th style={{ padding: "8px 4px", fontWeight: 600 }}>Cost</th>
                    <th style={{ padding: "8px 4px", fontWeight: 600 }}>Retail</th>
                    <th style={{ padding: "8px 4px", fontWeight: 600 }}>Mult</th>
                    <th style={{ padding: "8px 12px", fontWeight: 600 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pieces.map((p) => {
                    const mult = isManager ? calculateMultiplier(p.retail_price ?? 0, p.cost_price ?? 0) : null;
                    const specs = p.finger_size ? `Size ${p.finger_size}` : (p.other_specs ?? "");
                    const locLabel = p.location_id ? (locationLabelById.get(p.location_id) ?? "—") : "—";
                    return (
                      <tr key={p.id} style={{ borderTop: "1px solid #F3F4F6", background: "#fff" }}>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>{p.sku}</td>
                        <td style={{ padding: "8px 4px" }}>{metalStr(p) || "—"}</td>
                        <td style={{ padding: "8px 4px" }}>{diamondStr(p) || "—"}</td>
                        <td style={{ padding: "8px 4px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{specs || "—"}</td>
                        <td style={{ padding: "8px 4px" }}>{locLabel}</td>
                        <td style={{ padding: "8px 4px" }}><StatusBadge status={p.status} /></td>
                        <td style={{ padding: "8px 4px" }}>{isManager ? fmtCurrency(p.cost_price) : "—"}</td>
                        <td style={{ padding: "8px 4px" }}>{fmtCurrency(p.retail_price)}</td>
                        <td style={{ padding: "8px 4px" }}>{isManager ? multiplierBadge(mult) : "—"}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              onClick={() => onPrintTag(p)}
                              title="Print Tag"
                              style={{ padding: 6, border: "1px solid #D1D5DB", borderRadius: 6, background: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                            >
                              <Printer size={14} />
                            </button>
                            <button
                              onClick={() => onEditPiece(p)}
                              title="Edit"
                              style={{ padding: 6, border: "1px solid #D1D5DB", borderRadius: 6, background: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                            >
                              <Edit2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// New Design Modal
// ─────────────────────────────────────────────────────────────────────────
function NewDesignModal({
  onClose, onCreated,
}: {
  onClose: () => void;
  onCreated: (d: InventoryDesign) => void;
}) {
  const { user } = useUser();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify({ name, category: category || null, description, notes }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || `Failed (${res.status})`);
      } else {
        onCreated(json.design);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, width: 480, maxWidth: "90vw",
          padding: 24, boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>New Design</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}>
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 12, padding: 10, background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13 }}>{error}</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <FieldLabel label="Name *">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              autoFocus
            />
          </FieldLabel>
          <FieldLabel label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              <option value="">— Select —</option>
              {DESIGN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FieldLabel>
          <FieldLabel label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </FieldLabel>
          <FieldLabel label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </FieldLabel>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={btnSecondary}>Cancel</button>
          <button onClick={submit} disabled={saving} style={btnPrimary}>
            {saving ? "Creating…" : "Create Design"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Piece Drawer (Details + BOM)
// ─────────────────────────────────────────────────────────────────────────
function PieceDrawer({
  mode, design, piece, tab, onTabChange, onClose, isManager,
  locationOptions, suppliers, goldPrices, onSaved, onDeleted,
}: {
  mode: "new-piece" | "edit-piece";
  design: InventoryDesign | null;
  piece: InventoryPiece | null;
  tab: "details" | "bom";
  onTabChange: (t: "details" | "bom") => void;
  onClose: () => void;
  isManager: boolean;
  locationOptions: { id: string; label: string }[];
  suppliers: InventorySupplier[];
  goldPrices: Record<string, { price_per_gram: number; created_at: string }>;
  onSaved: (piece: InventoryPiece, isNew: boolean) => void;
  onDeleted: (pieceId: string) => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <div
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0,
          width: 500, maxWidth: "95vw",
          background: "#fff", boxShadow: "-10px 0 30px rgba(0,0,0,0.15)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 2 }}>{design?.name ?? "One-Off Item"}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {mode === "new-piece" ? "New Piece" : (piece?.sku ?? "Edit Piece")}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}>
              <X size={20} />
            </button>
          </div>

          {mode === "edit-piece" && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <TabButton active={tab === "details"} onClick={() => onTabChange("details")}>Details</TabButton>
              <TabButton active={tab === "bom"} onClick={() => onTabChange("bom")}>Bill of Materials</TabButton>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {tab === "details" || mode === "new-piece" ? (
            <PieceDetailsForm
              mode={mode}
              design={design}
              piece={piece}
              isManager={isManager}
              locationOptions={locationOptions}
              onSaved={onSaved}
              onDeleted={onDeleted}
            />
          ) : (
            piece && (
              <PieceBomPanel
                piece={piece}
                suppliers={suppliers}
                goldPrices={goldPrices}
                isManager={isManager}
                onPieceUpdated={(p) => onSaved(p, false)}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", fontSize: 13, fontWeight: 600,
        border: "none", borderBottom: active ? "2px solid #111827" : "2px solid transparent",
        color: active ? "#111827" : "#6B7280",
        background: "none", cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Piece Details Form
// ─────────────────────────────────────────────────────────────────────────
function PieceDetailsForm({
  mode, design, piece, isManager, locationOptions, onSaved, onDeleted,
}: {
  mode: "new-piece" | "edit-piece";
  design: InventoryDesign | null;
  piece: InventoryPiece | null;
  isManager: boolean;
  locationOptions: { id: string; label: string }[];
  onSaved: (piece: InventoryPiece, isNew: boolean) => void;
  onDeleted: (pieceId: string) => void;
}) {
  const { user } = useUser();
  const [sku, setSku] = useState(piece?.sku ?? "");
  const [metalCarat, setMetalCarat] = useState(piece?.metal_karat ?? "");
  const [metalColour, setMetalColour] = useState(piece?.metal_colour ?? "");
  const [metalWeight, setMetalWeight] = useState(piece?.metal_weight_grams != null ? String(piece.metal_weight_grams) : "");
  const [diamondType, setDiamondType] = useState(piece?.diamond_type ?? "");
  const [diamondCarat, setDiamondCarat] = useState(piece?.diamond_carat != null ? String(piece.diamond_carat) : "");
  const [diamondColour, setDiamondColour] = useState(piece?.diamond_colour ?? "");
  const [diamondClarity, setDiamondClarity] = useState(piece?.diamond_clarity ?? "");
  const [fingerSize, setFingerSize] = useState(piece?.finger_size ?? "");
  const [otherSpecs, setOtherSpecs] = useState(piece?.other_specs ?? "");
  const [locationId, setLocationId] = useState(piece?.location_id ?? "");
  const [status, setStatus] = useState<PieceStatus>(piece?.status ?? "in_stock");
  const [costPrice, setCostPrice] = useState(piece?.cost_price != null ? String(piece.cost_price) : "");
  const [retailPrice, setRetailPrice] = useState(piece?.retail_price != null ? String(piece.retail_price) : "");
  const [notes, setNotes] = useState(piece?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showDiamondGrading = diamondType && diamondType !== "None";

  const costNum = parseFloat(costPrice) || 0;
  const retailNum = parseFloat(retailPrice) || 0;
  const mult = isManager ? calculateMultiplier(retailNum, costNum) : null;

  const submit = async () => {
    if (!sku.trim()) { setError("SKU is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        design_id: design?.id ?? null,
        sku: sku.trim(),
        metal_karat: metalCarat || null,
        metal_colour: metalColour || null,
        metal_weight_grams: metalWeight,
        diamond_type: diamondType || null,
        diamond_carat: showDiamondGrading ? diamondCarat : null,
        diamond_colour: showDiamondGrading ? (diamondColour || null) : null,
        diamond_clarity: showDiamondGrading ? (diamondClarity || null) : null,
        finger_size: fingerSize || null,
        other_specs: otherSpecs || null,
        location_id: locationId || null,
        cost_price: isManager ? costPrice : (piece?.cost_price ?? null),
        retail_price: retailPrice,
        status,
        notes: notes || null,
      };
      const url = mode === "new-piece"
        ? "/api/inventory/pieces"
        : `/api/inventory/pieces/${piece!.id}`;
      const res = await fetch(url, {
        method: mode === "new-piece" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || `Failed (${res.status})`);
      } else {
        onSaved(json.piece, mode === "new-piece");
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!piece) return;
    if (!confirm(`Delete piece ${piece.sku}?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/inventory/pieces/${piece.id}`, { method: "DELETE", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError(json.error || `Failed (${res.status})`);
      } else {
        onDeleted(piece.id);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && (
        <div style={{ padding: 10, background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13 }}>{error}</div>
      )}

      <SectionHeader>SKU</SectionHeader>
      <FieldLabel label="SKU *">
        <input value={sku} onChange={(e) => setSku(e.target.value)} style={inputStyle} />
      </FieldLabel>

      <SectionHeader>Metal</SectionHeader>
      <Row>
        <FieldLabel label="Carat">
          <select value={metalCarat} onChange={(e) => setMetalCarat(e.target.value)} style={inputStyle}>
            <option value="">—</option>
            {METAL_CARATS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="Colour">
          <select value={metalColour} onChange={(e) => setMetalColour(e.target.value)} style={inputStyle}>
            <option value="">—</option>
            {METAL_COLOURS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="Weight (g)">
          <input type="number" step="0.01" value={metalWeight} onChange={(e) => setMetalWeight(e.target.value)} style={inputStyle} />
        </FieldLabel>
      </Row>

      <SectionHeader>Diamond</SectionHeader>
      <FieldLabel label="Type">
        <select value={diamondType} onChange={(e) => setDiamondType(e.target.value)} style={inputStyle}>
          <option value="">—</option>
          {DIAMOND_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </FieldLabel>
      {showDiamondGrading && (
        <Row>
          <FieldLabel label="Carat">
            <input type="number" step="0.01" value={diamondCarat} onChange={(e) => setDiamondCarat(e.target.value)} style={inputStyle} />
          </FieldLabel>
          <FieldLabel label="Colour">
            <select value={diamondColour} onChange={(e) => setDiamondColour(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {DIAMOND_COLOURS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FieldLabel>
          <FieldLabel label="Clarity">
            <select value={diamondClarity} onChange={(e) => setDiamondClarity(e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {DIAMOND_CLARITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FieldLabel>
        </Row>
      )}

      <SectionHeader>Other</SectionHeader>
      <Row>
        <FieldLabel label="Finger Size">
          <input value={fingerSize} onChange={(e) => setFingerSize(e.target.value)} style={inputStyle} />
        </FieldLabel>
        <FieldLabel label="Other Specs">
          <input value={otherSpecs} onChange={(e) => setOtherSpecs(e.target.value)} style={inputStyle} />
        </FieldLabel>
      </Row>

      <SectionHeader>Location & Status</SectionHeader>
      <FieldLabel label="Location">
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={inputStyle}>
          <option value="">— None —</option>
          {locationOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </FieldLabel>
      <FieldLabel label="Status">
        <select value={status} onChange={(e) => setStatus(e.target.value as PieceStatus)} style={inputStyle}>
          {PIECE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_BADGE[s].label}</option>)}
        </select>
      </FieldLabel>

      <SectionHeader>Pricing</SectionHeader>
      {isManager && (
        <FieldLabel label="Cost Price ($)">
          <input type="number" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} style={inputStyle} />
        </FieldLabel>
      )}
      <FieldLabel label="Retail Price ($)">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="number" step="0.01" value={retailPrice} onChange={(e) => setRetailPrice(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          {mult != null && <div>{multiplierBadge(mult)}</div>}
        </div>
      </FieldLabel>

      <SectionHeader>Notes</SectionHeader>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTop: "1px solid #E5E7EB" }}>
        {mode === "edit-piece" && piece ? (
          <button onClick={handleDelete} disabled={saving} style={{ ...btnSecondary, color: "#991B1B", borderColor: "#FCA5A5" }}>
            <Trash2 size={14} style={{ marginRight: 4, verticalAlign: -2 }} /> Delete
          </button>
        ) : <span />}
        <button onClick={submit} disabled={saving} style={btnPrimary}>
          {saving ? "Saving…" : (mode === "new-piece" ? "Create Piece" : "Save Changes")}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BOM Panel
// ─────────────────────────────────────────────────────────────────────────
function PieceBomPanel({
  piece, suppliers, goldPrices, isManager, onPieceUpdated,
}: {
  piece: InventoryPiece;
  suppliers: InventorySupplier[];
  goldPrices: Record<string, { price_per_gram: number; created_at: string }>;
  isManager: boolean;
  onPieceUpdated: (p: InventoryPiece) => void;
}) {
  const { user } = useUser();
  const [items, setItems] = useState<InventoryPieceBom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/piece-bom?piece_id=${piece.id}`, { headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || `Failed (${res.status})`);
      } else {
        setItems(json.items ?? []);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [piece.id]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const totalBomCost = items.reduce((sum, it) => sum + Number(it.locked_cost || 0), 0);
  const suggestedRetail = calculateRetailPrice(totalBomCost);
  const currentRetail = piece.retail_price ?? 0;
  const currentMult = isManager && totalBomCost > 0 ? calculateMultiplier(currentRetail, totalBomCost) : null;

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this component?")) return;
    try {
      const res = await fetch(`/api/inventory/piece-bom/${id}`, { method: "DELETE", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        setError(json.error || `Failed (${res.status})`);
      } else {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const handleUseSuggested = async () => {
    try {
      const res = await fetch(`/api/inventory/pieces/${piece.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify({ retail_price: suggestedRetail, cost_price: totalBomCost }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || `Failed (${res.status})`);
      } else {
        onPieceUpdated(json.piece);
      }
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {error && (
        <div style={{ padding: 10, background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ color: "#6B7280", fontSize: 13 }}>Loading components…</div>
      ) : (
        <>
          {items.length === 0 && !showAddForm ? (
            <div style={{ padding: 16, background: "#F9FAFB", borderRadius: 8, color: "#6B7280", fontSize: 13, textAlign: "center" }}>
              No components yet. Click <strong>+ Add Component</strong> to begin.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((item) => (
                editingId === item.id ? (
                  <BomItemForm
                    key={item.id}
                    pieceId={piece.id}
                    existing={item}
                    suppliers={suppliers}
                    goldPrices={goldPrices}
                    metalCarat={piece.metal_karat}
                    onClose={() => setEditingId(null)}
                    onSaved={(saved) => {
                      setItems((prev) => prev.map((i) => i.id === saved.id ? saved : i));
                      setEditingId(null);
                    }}
                  />
                ) : (
                  <BomItemRow
                    key={item.id}
                    item={item}
                    onEdit={() => setEditingId(item.id)}
                    onDelete={() => handleDelete(item.id)}
                  />
                )
              ))}
            </div>
          )}

          {showAddForm ? (
            <BomItemForm
              pieceId={piece.id}
              existing={null}
              suppliers={suppliers}
              goldPrices={goldPrices}
              metalCarat={piece.metal_karat}
              onClose={() => setShowAddForm(false)}
              onSaved={(saved) => {
                setItems((prev) => [...prev, saved]);
                setShowAddForm(false);
              }}
            />
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 12px", border: "1px dashed #D1D5DB", borderRadius: 8,
                background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer",
                alignSelf: "flex-start",
              }}
            >
              <Plus size={14} /> Add Component
            </button>
          )}

          {/* Summary */}
          <div style={{ marginTop: 16, padding: 14, background: "#F9FAFB", borderRadius: 8, fontSize: 13 }}>
            <SummaryRow label="Total BOM Cost" value={`$${totalBomCost.toFixed(2)}`} />
            <SummaryRow label="Suggested Retail" value={`$${suggestedRetail.toFixed(0)}`} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
              <span style={{ color: "#6B7280" }}>Current Retail</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{fmtCurrency(piece.retail_price)}</span>
                {totalBomCost > 0 && suggestedRetail !== currentRetail && (
                  <button onClick={handleUseSuggested} style={{ ...btnSecondary, padding: "4px 8px", fontSize: 11 }}>
                    Use Suggested
                  </button>
                )}
              </div>
            </div>
            {currentMult != null && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                <span style={{ color: "#6B7280" }}>Multiplier</span>
                {multiplierBadge(currentMult)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
      <span style={{ color: "#6B7280" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function BomItemRow({ item, onEdit, onDelete }: { item: InventoryPieceBom; onEdit: () => void; onDelete: () => void }) {
  const style = BOM_TYPE_STYLE[item.component_type] ?? BOM_TYPE_STYLE.other;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #E5E7EB", borderRadius: 8, background: "#fff" }}>
      <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: style.bg, color: style.fg, textTransform: "uppercase" }}>
        {item.component_type}
      </span>
      <div style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
        <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.description}</div>
        <div style={{ color: "#6B7280", fontSize: 11 }}>
          {item.quantity}{item.unit ? ` ${item.unit}` : ""} × ${Number(item.unit_cost).toFixed(2)}
          {item.supplier?.name ? ` · ${item.supplier.name}` : ""}
        </div>
      </div>
      <div style={{ fontWeight: 700, fontSize: 13, minWidth: 70, textAlign: "right" }}>
        ${Number(item.locked_cost).toFixed(2)}
      </div>
      <button onClick={onEdit} style={{ padding: 5, border: "1px solid #D1D5DB", borderRadius: 6, background: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
        <Edit2 size={12} />
      </button>
      <button onClick={onDelete} style={{ padding: 5, border: "1px solid #FCA5A5", borderRadius: 6, background: "#fff", color: "#991B1B", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BOM Item Form (add + edit)
// ─────────────────────────────────────────────────────────────────────────
function BomItemForm({
  pieceId, existing, suppliers, goldPrices, metalCarat, onClose, onSaved,
}: {
  pieceId: string;
  existing: InventoryPieceBom | null;
  suppliers: InventorySupplier[];
  goldPrices: Record<string, { price_per_gram: number; created_at: string }>;
  metalCarat: string | null;
  onClose: () => void;
  onSaved: (item: InventoryPieceBom) => void;
}) {
  const { user } = useUser();
  const [componentType, setComponentType] = useState(existing?.component_type ?? "casting");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [quantity, setQuantity] = useState(existing?.quantity != null ? String(existing.quantity) : "1");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [unitCost, setUnitCost] = useState(existing?.unit_cost != null ? String(existing.unit_cost) : "");
  const [supplierId, setSupplierId] = useState(existing?.supplier_id ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showGoldHint = componentType === "casting" && metalCarat && goldPrices[metalCarat];
  const goldPriceEntry = showGoldHint ? goldPrices[metalCarat!] : null;
  const goldDays = goldPriceEntry ? daysSince(goldPriceEntry.created_at) : null;
  const goldStale = goldDays != null && goldDays > 7;

  const submit = async () => {
    if (!description.trim()) { setError("Description is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        piece_id: pieceId,
        component_type: componentType,
        description: description.trim(),
        quantity,
        unit: unit || null,
        unit_cost: unitCost,
        supplier_id: supplierId || null,
        notes: notes || null,
      };
      const url = existing
        ? `/api/inventory/piece-bom/${existing.id}`
        : `/api/inventory/piece-bom`;
      const res = await fetch(url, {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || `Failed (${res.status})`);
      } else {
        onSaved(json.item);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 14, border: "1px solid #D1D5DB", borderRadius: 8, background: "#FAFAFA", display: "flex", flexDirection: "column", gap: 10 }}>
      {error && (
        <div style={{ padding: 8, background: "#FEE2E2", color: "#991B1B", borderRadius: 6, fontSize: 12 }}>{error}</div>
      )}

      <Row>
        <FieldLabel label="Component Type">
          <select value={componentType} onChange={(e) => setComponentType(e.target.value as InventoryPieceBom["component_type"])} style={inputStyle}>
            {BOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="Description *">
          <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
        </FieldLabel>
      </Row>

      <Row>
        <FieldLabel label="Quantity">
          <input type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} />
        </FieldLabel>
        <FieldLabel label="Unit">
          <input placeholder="g, ct, each…" value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle} />
        </FieldLabel>
        <FieldLabel label="Unit Cost ($)">
          <input type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} style={inputStyle} />
        </FieldLabel>
      </Row>

      {showGoldHint && goldPriceEntry && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 10px", borderRadius: 6,
          background: goldStale ? "#FEF3C7" : "#FFFBEB",
          color: goldStale ? "#92400E" : "#78350F",
          fontSize: 12,
        }}>
          {goldStale ? <AlertTriangle size={14} /> : <Info size={14} color={AMBER} />}
          <span>
            Current {metalCarat} gold price: <strong>${Number(goldPriceEntry.price_per_gram).toFixed(2)}/g</strong>
            {goldDays != null && (
              <> (updated {goldDays === 0 ? "today" : goldDays === 1 ? "1 day ago" : `${goldDays} days ago`})</>
            )}
          </span>
        </div>
      )}

      <FieldLabel label="Supplier">
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inputStyle}>
          <option value="">— None —</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </FieldLabel>

      <FieldLabel label="Notes">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputStyle} />
      </FieldLabel>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose} style={btnSecondary}>Cancel</button>
        <button onClick={submit} disabled={saving} style={btnPrimary}>
          {saving ? "Saving…" : (existing ? "Save" : "Add Component")}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: 0.5, color: AMBER, marginTop: 4,
    }}>
      {children}
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#374151", flex: 1, minWidth: 0 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  background: "#fff",
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 16px",
  background: "#111827",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 14px",
  background: "#fff",
  color: "#374151",
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

// ─────────────────────────────────────────────────────────────────────────
// One-Off Items Section
// ─────────────────────────────────────────────────────────────────────────
function OneOffSection({
  pieces, loading, isManager, locationLabelById, onAdd, onEdit, onPrintTag,
}: {
  pieces: InventoryPiece[];
  loading: boolean;
  isManager: boolean;
  locationLabelById: Map<string, string>;
  onAdd: () => void;
  onEdit: (p: InventoryPiece) => void;
  onPrintTag: (p: InventoryPiece) => void;
}) {
  const count = pieces.length;
  return (
    <div style={{
      marginTop: 24,
      border: "2px dashed #D1D5DB",
      borderRadius: 12,
      background: "#FAFAF9",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", padding: "14px 16px", gap: 12,
        borderBottom: count > 0 ? "1px solid #E5E7EB" : "none",
      }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>One-Off Items</div>
        <span style={{
          display: "inline-flex", padding: "2px 10px", borderRadius: 999,
          fontSize: 11, fontWeight: 600, background: "#E5E7EB", color: "#374151",
        }}>
          {count}
        </span>
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={onAdd}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px", border: "1px solid #D1D5DB",
              borderRadius: 6, background: "#fff", fontSize: 13, fontWeight: 600,
              color: "#111827", cursor: "pointer",
            }}
          >
            <Plus size={14} /> Add One-Off Item
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 16, color: "#6B7280", fontSize: 13 }}>Loading one-off items…</div>
      ) : count === 0 ? (
        <div style={{ padding: 16, color: "#6B7280", fontSize: 13 }}>
          No one-off items yet. Click <strong>+ Add One-Off Item</strong> to add a unique or vintage piece.
        </div>
      ) : (
        <div style={{ overflowX: "auto", background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6B7280" }}>
                <th style={{ padding: "8px 12px", fontWeight: 600 }}>SKU</th>
                <th style={{ padding: "8px 4px", fontWeight: 600 }}>Metal</th>
                <th style={{ padding: "8px 4px", fontWeight: 600 }}>Diamond</th>
                <th style={{ padding: "8px 4px", fontWeight: 600 }}>Specs</th>
                <th style={{ padding: "8px 4px", fontWeight: 600 }}>Location</th>
                <th style={{ padding: "8px 4px", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "8px 4px", fontWeight: 600 }}>Cost</th>
                <th style={{ padding: "8px 4px", fontWeight: 600 }}>Retail</th>
                <th style={{ padding: "8px 12px", fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {pieces.map((p) => {
                const specs = p.finger_size ? `Size ${p.finger_size}` : (p.other_specs ?? "");
                const locLabel = p.location_id ? (locationLabelById.get(p.location_id) ?? "—") : "—";
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }}>{p.sku}</td>
                    <td style={{ padding: "8px 4px" }}>{metalStr(p) || "—"}</td>
                    <td style={{ padding: "8px 4px" }}>{diamondStr(p) || "—"}</td>
                    <td style={{ padding: "8px 4px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{specs || "—"}</td>
                    <td style={{ padding: "8px 4px" }}>{locLabel}</td>
                    <td style={{ padding: "8px 4px" }}><StatusBadge status={p.status} /></td>
                    <td style={{ padding: "8px 4px" }}>{isManager ? fmtCurrency(p.cost_price) : "—"}</td>
                    <td style={{ padding: "8px 4px" }}>{fmtCurrency(p.retail_price)}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button
                          onClick={() => onPrintTag(p)}
                          title="Print Tag"
                          style={{ padding: 6, border: "1px solid #D1D5DB", borderRadius: 6, background: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                        >
                          <Printer size={14} />
                        </button>
                        <button
                          onClick={() => onEdit(p)}
                          title="Edit"
                          style={{ padding: 6, border: "1px solid #D1D5DB", borderRadius: 6, background: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Import CSV Modal
// ─────────────────────────────────────────────────────────────────────────
const CSV_HEADERS = [
  "design_name", "category", "sku", "metal_karat", "metal_colour",
  "metal_weight_grams", "diamond_type", "diamond_carat", "diamond_colour",
  "diamond_clarity", "finger_size", "other_specs", "location_name",
  "cost_price", "retail_price", "status", "notes",
] as const;

const CSV_EXAMPLE_ROW = [
  "Grace Engagement Ring", "Engagement Ring", "CA001", "18K", "White",
  "4.2", "Natural", "1.5", "D", "VS1", "L", "", "Showroom",
  "3200", "8500", "in_stock", "",
];

type ParsedCsvRow = Record<string, string>;

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') { result.push(cur); cur = ""; }
      else if (ch === '"') { inQuotes = true; }
      else { cur += ch; }
    }
  }
  result.push(cur);
  return result;
}

function parseCsvText(text: string): ParsedCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const rows: ParsedCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row: ParsedCsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (cells[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function ImportCsvModal({
  onClose, onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const { user } = useUser();
  const [rows, setRows] = useState<ParsedCsvRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);

  const handleDownloadTemplate = () => {
    const csv = CSV_HEADERS.join(",") + "\n" + CSV_EXAMPLE_ROW.map((v) => {
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    }).join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      if (parsed.length === 0) {
        setError("CSV contained no data rows.");
        setRows([]);
        return;
      }
      setRows(parsed);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || `Failed (${res.status})`);
      } else {
        setResult(json as CsvImportResult);
        onImported();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(false);
    }
  };

  const previewRows = rows.slice(0, 5);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, width: 820, maxWidth: "95vw",
          maxHeight: "90vh", padding: 24, boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Import Inventory from CSV</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}>
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 12, padding: 10, background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={handleDownloadTemplate} style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Download size={14} /> Download Template
            </button>
            <label style={{ ...btnSecondary, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <Upload size={14} /> Choose CSV File
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
                style={{ display: "none" }}
              />
            </label>
            {fileName && (
              <span style={{ fontSize: 13, color: "#6B7280" }}>{fileName} · {rows.length} row{rows.length === 1 ? "" : "s"}</span>
            )}
          </div>

          {previewRows.length > 0 && !result && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                Preview (first {previewRows.length} of {rows.length} row{rows.length === 1 ? "" : "s"})
              </div>
              <div style={{ overflowX: "auto", border: "1px solid #E5E7EB", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead style={{ background: "#F9FAFB" }}>
                    <tr>
                      {CSV_HEADERS.map((h) => (
                        <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "#6B7280", whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, idx) => (
                      <tr key={idx} style={{ borderTop: "1px solid #F3F4F6" }}>
                        {CSV_HEADERS.map((h) => (
                          <td key={h} style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                            {r[h] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div style={{
              padding: 16, borderRadius: 8,
              background: result.failed === 0 ? "#D1FAE5" : "#FEF3C7",
              color: result.failed === 0 ? "#065F46" : "#92400E",
              fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {result.designs_created} design{result.designs_created === 1 ? "" : "s"} created, {result.pieces_imported} piece{result.pieces_imported === 1 ? "" : "s"} imported, {result.failed} failed
              </div>
              {result.errors.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Failures:</div>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {result.errors.map((e, i) => (
                      <li key={i}>Row {e.row}: {e.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16, paddingTop: 16, borderTop: "1px solid #E5E7EB" }}>
          {result ? (
            <button onClick={onClose} style={btnPrimary}>Done</button>
          ) : (
            <>
              <button onClick={onClose} style={btnSecondary}>Cancel</button>
              <button
                onClick={handleImport}
                disabled={importing || rows.length === 0}
                style={{ ...btnPrimary, opacity: importing || rows.length === 0 ? 0.6 : 1 }}
              >
                {importing ? "Importing…" : `Confirm Import (${rows.length})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
