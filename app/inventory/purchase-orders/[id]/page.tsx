"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage, canSeeCosts } from "@/lib/userTypes";
import { ArrowLeft, Package, CheckCircle2, SkipForward, Sparkles, Loader, X, ChevronDown, DollarSign, Pencil, Ban, AlertTriangle, Plus, Trash2 } from "lucide-react";
import InventoryAttachmentsPanel from "@/components/InventoryAttachmentsPanel";

type POStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";

interface PoLine {
  id: string;
  title: string | null;
  category_id: string | null;
  category?: { id: string; name: string } | null;
  metal_type: string | null;
  metal_karat: string | null;
  metal_colour: string | null;
  diamond_type: string | null;
  diamond_carat: number | null;
  diamond_colour: string | null;
  diamond_clarity: string | null;
  finger_size: string | null;
  quantity: number;
  unit_cost: number | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  supplier_design_no: string | null;
  packet_id: string | null;
  packet?: {
    id: string;
    reference_number: string;
    customer_first_name: string | null;
    customer_last_name: string | null;
    packet_type: string | null;
  } | null;
  notes: string | null;
  received: boolean;
  received_quantity: number;
  piece_id: string | null;
  pieces?: { id: string; sku: string; quantity: number }[];
}

interface EditPoLine {
  id: string;
  title: string;
  category_id: string;
  metal_type: string;
  metal_karat: string;
  metal_colour: string;
  diamond_type: string;
  diamond_carat: string;
  diamond_colour: string;
  diamond_clarity: string;
  finger_size: string;
  quantity: string;
  estimated_cost: string;
  actual_cost: number | null;
  supplier_design_no: string;
  packet_id: string;
  notes: string;
  received: boolean;
  forOrder: boolean;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier?: { id: string; name: string } | null;
  status: POStatus;
  order_date: string | null;
  expected_date: string | null;
  notes: string | null;
  lines: PoLine[];
  created_at: string;
}

const STATUS_CONFIG: Record<POStatus, { label: string; bg: string; fg: string; border: string }> = {
  draft:              { label: "Draft",           bg: "#F3F4F6", fg: "#374151", border: "#E5E7EB" },
  ordered:            { label: "Ordered",         bg: "#EFF6FF", fg: "#1D4ED8", border: "#BFDBFE" },
  partially_received: { label: "Partly Received", bg: "#FFFBEB", fg: "#92400E", border: "#FDE68A" },
  received:           { label: "Received",        bg: "#ECFDF5", fg: "#065F46", border: "#A7F3D0" },
  cancelled:          { label: "Cancelled",       bg: "#F9FAFB", fg: "#6B7280", border: "#E5E7EB" },
};

function StatusBadge({ status }: { status: POStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span style={{
      display: "inline-block", padding: "3px 12px", borderRadius: 999,
      fontSize: 13, fontWeight: 500,
      background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

function DetailItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, color: value ? "#111827" : "#D1D5DB" }}>{value ?? "—"}</div>
    </div>
  );
}

// Receive card for a single line
function ReceiveCard({
  line, tenantId, poId, categories, locations, products, onDone,
}: {
  line: PoLine;
  tenantId: string;
  poId: string;
  categories: any[];
  locations: any[];
  products: any[];
  onDone: () => void;
}) {
  const headers = { "x-tenant-id": tenantId };

  const alreadyReceived = Number(line.received_quantity ?? 0);
  const orderedQty      = Number(line.quantity ?? 1);
  const remaining       = orderedQty - alreadyReceived;

  const [specs, setSpecs] = useState({
    title:           line.title          ?? "",
    category_id:     line.category_id    ?? "",
    metal_type:      line.metal_type     ?? "",
    metal_karat:     line.metal_karat    ?? "",
    metal_colour:    line.metal_colour   ?? "",
    diamond_type:    line.diamond_type    ?? "",
    diamond_carat:   line.diamond_carat != null ? String(line.diamond_carat) : "",
    diamond_colour:  line.diamond_colour  ?? "",
    diamond_clarity: line.diamond_clarity ?? "",
    finger_size:     line.finger_size    ?? "",
    notes:           line.notes          ?? "",
    location_id: "",
    product_id:  "",
  });
  const [actualUnitCost, setActualUnitCost] = useState(
    line.estimated_cost != null ? String(line.estimated_cost) : ""
  );
  const [receiveQty, setReceiveQty] = useState(remaining);
  // individual = one piece per unit; batch = one piece record with quantity > 1
  const [receiveMode, setReceiveMode] = useState<"individual" | "batch">("individual");

  const [saving, setSaving]     = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [done, setDone]         = useState(false);
  const [aiDesc, setAiDesc]     = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [createdPieces, setCreatedPieces] = useState<{ id: string; sku: string }[]>([]);
  const [showAttach, setShowAttach]   = useState<string | null>(null); // piece id

  // Product typeahead
  const [productSearch, setProductSearch] = useState("");
  const [productOpen, setProductOpen]     = useState(false);
  const filteredProducts = productSearch
    ? products.filter((p: any) => p.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 8)
    : [];

  const IF = { width: "100%", boxSizing: "border-box" as const, padding: "7px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13 };
  const LF = { fontSize: 12, fontWeight: 500 as const, color: "#374151", display: "block" as const, marginBottom: 2 };

  async function parseWithAI() {
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
    setSpecs(s => ({
      ...s,
      title:           f.title          && !s.title          ? f.title          : s.title,
      metal_type:      f.metal_type     && !s.metal_type     ? f.metal_type     : s.metal_type,
      metal_karat:     f.metal_karat    && !s.metal_karat    ? f.metal_karat    : s.metal_karat,
      metal_colour:    f.metal_colour   && !s.metal_colour   ? f.metal_colour   : s.metal_colour,
      diamond_type:    f.diamond_type   && !s.diamond_type   ? f.diamond_type   : s.diamond_type,
      diamond_carat:   f.diamond_carat  && !s.diamond_carat  ? String(f.diamond_carat) : s.diamond_carat,
      diamond_colour:  f.diamond_colour && !s.diamond_colour ? f.diamond_colour : s.diamond_colour,
      diamond_clarity: f.diamond_clarity && !s.diamond_clarity ? f.diamond_clarity : s.diamond_clarity,
      finger_size:     f.finger_size    && !s.finger_size    ? f.finger_size    : s.finger_size,
      notes:           f.notes          && !s.notes          ? f.notes          : s.notes,
    }));
  }

  async function handleConfirm() {
    setSaving(true);
    const builtSpecs: Record<string, any> = {
      ...specs,
      diamond_carat: specs.diamond_carat ? parseFloat(specs.diamond_carat) : null,
    };
    // Strip empty-string UUID fields — empty string is invalid for uuid columns
    if (!builtSpecs.category_id)  delete builtSpecs.category_id;
    if (!builtSpecs.location_id)  delete builtSpecs.location_id;
    if (!builtSpecs.product_id)   delete builtSpecs.product_id;

    const res = await fetch(`/api/inventory/purchase-orders/${poId}/receive`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        line_id:            line.id,
        specs:              builtSpecs,
        quantity_to_receive: receiveQty,
        mode:               receiveMode,
        actual_unit_cost:   actualUnitCost ? parseFloat(actualUnitCost) : null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (res.ok) {
      setCreatedPieces(json.pieces ?? []);
      setDone(true);
      onDone();
    }
  }

  async function handleSkip() {
    setSkipping(true);
    await fetch(`/api/inventory/purchase-orders/${poId}/receive`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ line_id: line.id, skip: true, quantity_to_receive: receiveQty }),
    });
    setSkipping(false);
    setDone(true);
    onDone();
  }

  if (done) {
    return (
      <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <CheckCircle2 size={20} style={{ color: "#059669", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#065F46" }}>
              {createdPieces.length > 0
                ? createdPieces.length === 1
                  ? `Created ${createdPieces[0].sku}`
                  : `Created ${createdPieces.length} pieces (${createdPieces.map(p => p.sku).join(", ")})`
                : "Skipped"}
            </div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{line.title ?? "Untitled item"}</div>
          </div>
        </div>
        {createdPieces.length > 0 && (
          <div style={{ padding: "0 20px 16px", borderTop: "1px solid #A7F3D0" }}>
            {createdPieces.map(piece => (
              <div key={piece.id} style={{ marginTop: 10 }}>
                <button
                  onClick={() => setShowAttach(prev => prev === piece.id ? null : piece.id)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, border: "1px solid #6EE7B7", background: "#D1FAE5", color: "#065F46", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                >
                  {piece.sku} — Attachments <ChevronDown size={12} style={{ transform: showAttach === piece.id ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                </button>
                {showAttach === piece.id && (
                  <div style={{ marginTop: 8 }}>
                    <InventoryAttachmentsPanel
                      entityType="inventory_piece"
                      entityId={piece.id}
                      readOnly={false}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
      {/* Header — title + qty summary */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4, gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{line.title ?? "Untitled item"}</div>
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#6B7280", flexShrink: 0 }}>
          <span>Ordered: <strong style={{ color: "#374151" }}>{orderedQty}</strong></span>
          {alreadyReceived > 0 && <span>Received: <strong style={{ color: "#059669" }}>{alreadyReceived}</strong></span>}
          <span>Remaining: <strong style={{ color: "#374151" }}>{remaining}</strong></span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>
        {[line.metal_karat, line.metal_colour, line.metal_type].filter(Boolean).join(" ")}
        {line.diamond_carat ? ` · ${line.diamond_carat}ct ${line.diamond_colour ?? ""} ${line.diamond_type ?? ""}`.trim() : ""}
        {line.finger_size ? ` · Size ${line.finger_size}` : ""}
        {line.estimated_cost != null && ` · Est. $${Number(line.estimated_cost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`}
      </div>

      {/* Quantity to receive + mode */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px 16px", marginBottom: 14, padding: "12px 14px", background: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB" }}>
        <div>
          <label style={LF}>Receive quantity</label>
          <input
            type="number" min="1" max={remaining}
            value={receiveQty}
            onChange={e => setReceiveQty(Math.max(1, Math.min(remaining, parseInt(e.target.value) || 1)))}
            style={IF}
          />
        </div>
        <div>
          <label style={LF}>Tracking mode</label>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #E5E7EB" }}>
            <button
              type="button"
              onClick={() => setReceiveMode("individual")}
              style={{ flex: 1, padding: "7px 10px", background: receiveMode === "individual" ? "#111827" : "#fff", color: receiveMode === "individual" ? "#fff" : "#374151", border: "none", cursor: "pointer", fontSize: 12, fontWeight: receiveMode === "individual" ? 600 : 400 }}
            >
              Individual pieces
            </button>
            <button
              type="button"
              onClick={() => setReceiveMode("batch")}
              style={{ flex: 1, padding: "7px 10px", background: receiveMode === "batch" ? "#111827" : "#fff", color: receiveMode === "batch" ? "#fff" : "#374151", border: "none", cursor: "pointer", fontSize: 12, fontWeight: receiveMode === "batch" ? 600 : 400 }}
            >
              Batch stock
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
            {receiveMode === "individual"
              ? `Creates ${receiveQty} separately tracked piece${receiveQty !== 1 ? "s" : ""}, each with its own SKU`
              : `Creates 1 stock record with quantity ${receiveQty}`}
          </div>
        </div>
      </div>

      {/* AI row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          value={aiDesc}
          onChange={e => setAiDesc(e.target.value)}
          placeholder="Optionally describe to refine with AI…"
          style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13 }}
        />
        <button
          onClick={parseWithAI}
          disabled={aiLoading || !aiDesc.trim()}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, background: "#635BFF", color: "#fff", border: "none", fontSize: 13, cursor: aiLoading || !aiDesc.trim() ? "not-allowed" : "pointer", opacity: !aiDesc.trim() ? 0.5 : 1 }}
        >
          {aiLoading ? <Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} />}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 16px", marginBottom: 14 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={LF}>Title</label>
          <input value={specs.title} onChange={e => setSpecs(s => ({ ...s, title: e.target.value }))} style={IF} />
        </div>
        <div>
          <label style={LF}>Category</label>
          <select value={specs.category_id} onChange={e => setSpecs(s => ({ ...s, category_id: e.target.value }))} style={{ ...IF, background: "#fff" }}>
            <option value="">—</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={LF}>Metal Type</label>
          <input value={specs.metal_type} onChange={e => setSpecs(s => ({ ...s, metal_type: e.target.value }))} style={IF} />
        </div>
        <div>
          <label style={LF}>Carat</label>
          <input value={specs.metal_karat} onChange={e => setSpecs(s => ({ ...s, metal_karat: e.target.value }))} style={IF} />
        </div>
        <div>
          <label style={LF}>Metal Colour</label>
          <input value={specs.metal_colour} onChange={e => setSpecs(s => ({ ...s, metal_colour: e.target.value }))} style={IF} />
        </div>
        <div>
          <label style={LF}>Stone Type</label>
          <input value={specs.diamond_type} onChange={e => setSpecs(s => ({ ...s, diamond_type: e.target.value }))} style={IF} />
        </div>
        <div>
          <label style={LF}>Stone Carat</label>
          <input type="number" step="0.01" value={specs.diamond_carat} onChange={e => setSpecs(s => ({ ...s, diamond_carat: e.target.value }))} style={IF} />
        </div>
        <div>
          <label style={LF}>Stone Colour</label>
          <input value={specs.diamond_colour} onChange={e => setSpecs(s => ({ ...s, diamond_colour: e.target.value }))} style={IF} />
        </div>
        <div>
          <label style={LF}>Stone Clarity</label>
          <input value={specs.diamond_clarity} onChange={e => setSpecs(s => ({ ...s, diamond_clarity: e.target.value }))} style={IF} />
        </div>
        <div>
          <label style={LF}>Finger Size</label>
          <input value={specs.finger_size} onChange={e => setSpecs(s => ({ ...s, finger_size: e.target.value }))} style={IF} />
        </div>
        <div>
          <label style={LF}>Notes</label>
          <input value={specs.notes} onChange={e => setSpecs(s => ({ ...s, notes: e.target.value }))} style={IF} />
        </div>

        {/* Receiving-specific fields */}
        <div>
          <label style={LF}>Actual Unit Cost ($)</label>
          <input
            type="number" step="0.01" min="0"
            value={actualUnitCost}
            onChange={e => setActualUnitCost(e.target.value)}
            placeholder="e.g. 450.00"
            style={IF}
          />
        </div>
        <div>
          <label style={LF}>Location</label>
          <select
            value={specs.location_id}
            onChange={e => setSpecs(s => ({ ...s, location_id: e.target.value }))}
            style={{ ...IF, background: "#fff" }}
          >
            <option value="">Use default</option>
            {locations.filter((l: any) => l.is_active !== false).map((l: any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div style={{ position: "relative" }}>
          <label style={LF}>Link to Product</label>
          <input
            value={productSearch || (specs.product_id ? (products.find((p: any) => p.id === specs.product_id)?.name ?? "") : "")}
            onChange={e => {
              setProductSearch(e.target.value);
              if (!e.target.value) setSpecs(s => ({ ...s, product_id: "" }));
              setProductOpen(true);
            }}
            onFocus={() => setProductOpen(true)}
            onBlur={() => setTimeout(() => setProductOpen(false), 150)}
            placeholder="Search products…"
            style={IF}
          />
          {productOpen && filteredProducts.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, zIndex: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", maxHeight: 220, overflowY: "auto" }}>
              {filteredProducts.map((p: any) => (
                <div
                  key={p.id}
                  onMouseDown={() => {
                    setSpecs(s => ({ ...s, product_id: p.id }));
                    setProductSearch("");
                    setProductOpen(false);
                  }}
                  style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #F3F4F6" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  {p.name}
                </div>
              ))}
            </div>
          )}
          {specs.product_id && (
            <button
              type="button"
              onClick={() => { setSpecs(s => ({ ...s, product_id: "" })); setProductSearch(""); }}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 2 }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={handleSkip}
          disabled={skipping || saving}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 13, cursor: "pointer", color: "#6B7280" }}
        >
          <SkipForward size={14} /> {skipping ? "Skipping…" : "Skip"}
        </button>
        <button
          onClick={handleConfirm}
          disabled={saving || skipping}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 13, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
        >
          <CheckCircle2 size={14} />
          {saving ? "Creating…" : receiveMode === "batch" ? `Confirm & Create Batch (qty ${receiveQty})` : receiveQty === 1 ? "Confirm & Create Piece" : `Confirm & Create ${receiveQty} Pieces`}
        </button>
      </div>
    </div>
  );
}

export default function PurchaseOrderDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const tenantId: string = user?.tenantId ?? "";
  const isManager = hydrated ? canManage(user?.role) : false;
  const showCosts = hydrated ? canSeeCosts(user) : false;

  const [po, setPo]           = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations]   = useState<any[]>([]);
  const [products, setProducts]     = useState<any[]>([]);
  const [suppliers, setSuppliers]   = useState<{ id: string; name: string }[]>([]);
  const [showReceive, setShowReceive] = useState(false);
  const [receivedCount, setReceivedCount] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const [toast, setToast]     = useState("");

  // Confirm actual cost modal
  const [confirmLine, setConfirmLine]     = useState<PoLine | null>(null);
  const [confirmCost, setConfirmCost]     = useState("");
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmError, setConfirmError]   = useState("");

  // Edit mode
  const [editMode, setEditMode]     = useState(false);
  const [editHeader, setEditHeader] = useState({ supplier_id: "", order_date: "", expected_date: "", notes: "" });
  const [editLines, setEditLines]   = useState<EditPoLine[]>([]);
  const [editSaving, setEditSaving]           = useState(false);
  const [editError, setEditError]             = useState("");
  const [deletedLineIds, setDeletedLineIds]   = useState<string[]>([]);
  const [openPackets, setOpenPackets]         = useState<any[]>([]);

  // Cancel PO modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling]           = useState(false);
  const [cancelError, setCancelError]         = useState("");

  const headers = { "x-tenant-id": tenantId };

  const fetchPo = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [poRes, refRes, prodRes] = await Promise.all([
      fetch(`/api/inventory/purchase-orders/${params.id}`, { headers }),
      fetch("/api/inventory/reference", { headers }),
      fetch("/api/inventory/products?limit=500", { headers }),
    ]);
    if (poRes.ok) {
      const json = await poRes.json();
      setPo(json.purchase_order);
    }
    if (refRes.ok) {
      const json = await refRes.json();
      setCategories(json.categories ?? []);
      setLocations(json.locations ?? []);
      setSuppliers(json.suppliers ?? []);
    }
    if (prodRes.ok) {
      const json = await prodRes.json();
      setProducts(json.products ?? []);
    }
    setLoading(false);
  }, [tenantId, params.id]);

  useEffect(() => { fetchPo(); }, [fetchPo]);

  // Show lines that still have remaining qty to receive
  const unreceived = po?.lines.filter(l => Number(l.received_quantity ?? 0) < Number(l.quantity ?? 1)) ?? [];

  function handleLineDone() {
    setReceivedCount(c => {
      const next = c + 1;
      if (next >= unreceived.length) setAllDone(true);
      return next;
    });
  }

  function handleFinish() {
    fetchPo();
    setShowReceive(false);
    setAllDone(false);
    setReceivedCount(0);
  }

  function openConfirmModal(line: PoLine) {
    setConfirmLine(line);
    setConfirmCost(line.actual_cost != null ? String(line.actual_cost) : "");
    setConfirmError("");
  }

  async function handleConfirmActualCost() {
    if (!confirmLine) return;
    const cost = parseFloat(confirmCost);
    if (isNaN(cost) || cost < 0) {
      setConfirmError("Enter a valid amount (0 or greater)");
      return;
    }
    setConfirmSaving(true);
    setConfirmError("");
    const res = await fetch(
      `/api/inventory/purchase-orders/lines/${confirmLine.id}`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ actual_cost: cost }),
      }
    );
    const json = await res.json();
    setConfirmSaving(false);
    if (!res.ok) { setConfirmError(json.error ?? "Failed to save"); return; }
    setConfirmLine(null);
    setConfirmCost("");
    fetchPo();
  }

  async function handleMarkOrdered() {
    await fetch(`/api/inventory/purchase-orders/${params.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ordered" }),
    });
    fetchPo();
  }

  async function enterEditMode() {
    if (!po) return;
    setEditHeader({
      supplier_id:   po.supplier_id   ?? "",
      order_date:    po.order_date    ?? "",
      expected_date: po.expected_date ?? "",
      notes:         po.notes         ?? "",
    });
    setEditLines(po.lines.map(l => ({
      id:                l.id,
      title:             l.title             ?? "",
      category_id:       l.category_id       ?? "",
      metal_type:        l.metal_type        ?? "",
      metal_karat:       l.metal_karat       ?? "",
      metal_colour:      l.metal_colour      ?? "",
      diamond_type:      l.diamond_type      ?? "",
      diamond_carat:     l.diamond_carat != null ? String(l.diamond_carat) : "",
      diamond_colour:    l.diamond_colour    ?? "",
      diamond_clarity:   l.diamond_clarity   ?? "",
      finger_size:       l.finger_size       ?? "",
      quantity:          String(l.quantity),
      estimated_cost:    l.estimated_cost != null ? String(l.estimated_cost) : "",
      actual_cost:       l.actual_cost,
      supplier_design_no: l.supplier_design_no ?? "",
      packet_id:         l.packet_id         ?? "",
      notes:             l.notes             ?? "",
      received:          l.received,
      forOrder:          l.packet_id != null,
    })));
    setEditError("");
    setDeletedLineIds([]);
    setEditMode(true);
    const res = await fetch("/api/inventory/open-packets", { headers });
    if (res.ok) {
      const json = await res.json();
      setOpenPackets(json.packets ?? []);
    }
  }

  async function handleSaveEdit() {
    if (!po) return;
    // Warn before saving if any invoiced line was modified
    const invoicedModified = editLines.some(el => {
      const orig = po.lines.find(l => l.id === el.id);
      if (!orig || orig.actual_cost == null) return false;
      return (
        el.title !== (orig.title ?? "") ||
        el.estimated_cost !== (orig.estimated_cost != null ? String(orig.estimated_cost) : "") ||
        el.metal_type !== (orig.metal_type ?? "") ||
        el.diamond_type !== (orig.diamond_type ?? "")
      );
    });
    if (invoicedModified) {
      const ok = window.confirm(
        "One or more invoiced lines have been modified. These changes are cosmetic only and won't affect the supplier invoice. Save anyway?"
      );
      if (!ok) return;
    }
    setEditSaving(true);
    setEditError("");
    const res = await fetch(`/api/inventory/purchase-orders/${params.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        supplier_id:      editHeader.supplier_id   || null,
        order_date:       editHeader.order_date    || null,
        expected_date:    editHeader.expected_date || null,
        notes:            editHeader.notes         || null,
        deleted_line_ids: deletedLineIds.length > 0 ? deletedLineIds : undefined,
        lines: editLines.map(l => ({
          id:                l.id,
          title:             l.title             || null,
          category_id:       l.category_id       || null,
          metal_type:        l.metal_type        || null,
          metal_karat:       l.metal_karat       || null,
          metal_colour:      l.metal_colour      || null,
          diamond_type:      l.diamond_type      || null,
          diamond_carat:     l.diamond_carat     ? Number(l.diamond_carat) : null,
          diamond_colour:    l.diamond_colour    || null,
          diamond_clarity:   l.diamond_clarity   || null,
          finger_size:       l.finger_size       || null,
          quantity:          Number(l.quantity)  || 1,
          estimated_cost:    l.estimated_cost    ? Number(l.estimated_cost) : null,
          supplier_design_no: l.supplier_design_no || null,
          packet_id:         l.forOrder ? (l.packet_id || null) : null,
          notes:             l.notes             || null,
        })),
      }),
    });
    const json = await res.json();
    setEditSaving(false);
    if (!res.ok) { setEditError(json.error ?? "Failed to save"); return; }
    setEditMode(false);
    fetchPo();
  }

  async function handleCancelPO() {
    setCancelling(true);
    setCancelError("");
    const res = await fetch(`/api/inventory/purchase-orders/${params.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    const json = await res.json();
    setCancelling(false);
    if (!res.ok) { setCancelError(json.error ?? "Failed to cancel"); return; }
    setShowCancelModal(false);
    fetchPo();
  }

  if (!hydrated) return null;

  if (loading) {
    return (
      <div style={{ padding: "32px 32px 64px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ height: 20, width: 120, background: "#F3F4F6", borderRadius: 6, marginBottom: 24 }} />
        <div style={{ height: 200, background: "#F3F4F6", borderRadius: 12 }} />
      </div>
    );
  }

  if (!po) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <p style={{ color: "#6B7280" }}>Purchase order not found.</p>
        <button onClick={() => router.push("/inventory/purchase-orders")} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 14 }}>Back</button>
      </div>
    );
  }

  const supplierName = po.supplier?.name ?? po.supplier_name ?? "—";
  const canReceive   = isManager && po.status !== "cancelled" && po.status !== "draft" && unreceived.length > 0;
  const canEdit      = isManager && po.status !== "cancelled";
  const canCancel    = isManager && po.status !== "cancelled";

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (editMode) {
    const IF = { width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13 };
    const LF = { fontSize: 12, fontWeight: 600 as const, color: "#374151", display: "block" as const, marginBottom: 4 };

    return (
      <div style={{ padding: "32px 32px 64px", maxWidth: 900, margin: "0 auto" }}>
        {/* Edit header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setEditMode(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", padding: 0 }}>
              <X size={20} />
            </button>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>Edit {po.po_number}</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {editError && <span style={{ fontSize: 13, color: "#DC2626" }}>{editError}</span>}
            <button
              onClick={() => setEditMode(false)}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer" }}
            >
              Discard
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={editSaving}
              style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: editSaving ? "not-allowed" : "pointer", opacity: editSaving ? 0.7 : 1 }}
            >
              {editSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Order details */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16 }}>Order Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px 24px" }}>
            <div>
              <label style={LF}>Supplier</label>
              <select
                value={editHeader.supplier_id}
                onChange={e => setEditHeader(h => ({ ...h, supplier_id: e.target.value }))}
                style={{ ...IF, background: "#fff" }}
              >
                <option value="">— No supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={LF}>Order Date</label>
              <input
                type="date"
                value={editHeader.order_date}
                onChange={e => setEditHeader(h => ({ ...h, order_date: e.target.value }))}
                style={IF}
              />
            </div>
            <div>
              <label style={LF}>Expected Delivery</label>
              <input
                type="date"
                value={editHeader.expected_date}
                onChange={e => setEditHeader(h => ({ ...h, expected_date: e.target.value }))}
                style={IF}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={LF}>Notes</label>
              <textarea
                value={editHeader.notes}
                onChange={e => setEditHeader(h => ({ ...h, notes: e.target.value }))}
                rows={2}
                style={{ ...IF, resize: "vertical" as const }}
              />
            </div>
          </div>
        </div>

        {/* Line items */}
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Line Items</span>
          </div>
          {editLines.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>No line items</div>
          ) : (
            editLines.map((line, idx) => {
              const isInvoiced = line.actual_cost != null;
              const isNew = !line.id;
              const setLine = (patch: Partial<EditPoLine>) =>
                setEditLines(ls => ls.map((l, i) => i === idx ? { ...l, ...patch } : l));
              const removeLine = () => {
                if (line.id) setDeletedLineIds(ids => [...ids, line.id]);
                setEditLines(ls => ls.filter((_, i) => i !== idx));
              };

              return (
                <div
                  key={idx}
                  style={{ padding: 20, borderTop: idx > 0 ? "1px solid #F3F4F6" : "none", background: isInvoiced ? "#FFFCF5" : "#fff" }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF" }}>
                      {isNew ? "New line" : `Line ${idx + 1}`}
                    </span>
                    {!line.received && (
                      <button
                        type="button"
                        onClick={removeLine}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 11, cursor: "pointer" }}
                      >
                        <Trash2 size={11} /> Remove
                      </button>
                    )}
                  </div>
                  {isInvoiced && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, fontSize: 12, color: "#92400E", marginBottom: 14 }}>
                      <AlertTriangle size={13} />
                      This line has been invoiced (actual cost: ${Number(line.actual_cost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}). Changes here are cosmetic only.
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "10px 16px", marginBottom: 12 }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={LF}>Title</label>
                      <input value={line.title} onChange={e => setLine({ title: e.target.value })} style={IF} />
                    </div>
                    <div>
                      <label style={LF}>Metal Type</label>
                      <input value={line.metal_type} onChange={e => setLine({ metal_type: e.target.value })} style={IF} />
                    </div>
                    <div>
                      <label style={LF}>Karat</label>
                      <input value={line.metal_karat} onChange={e => setLine({ metal_karat: e.target.value })} style={IF} />
                    </div>
                    <div>
                      <label style={LF}>Metal Colour</label>
                      <input value={line.metal_colour} onChange={e => setLine({ metal_colour: e.target.value })} style={IF} />
                    </div>
                    <div>
                      <label style={LF}>Stone Type</label>
                      <input value={line.diamond_type} onChange={e => setLine({ diamond_type: e.target.value })} style={IF} />
                    </div>
                    <div>
                      <label style={LF}>Stone Carat</label>
                      <input type="number" step="0.01" value={line.diamond_carat} onChange={e => setLine({ diamond_carat: e.target.value })} style={IF} />
                    </div>
                    <div>
                      <label style={LF}>Stone Colour</label>
                      <input value={line.diamond_colour} onChange={e => setLine({ diamond_colour: e.target.value })} style={IF} />
                    </div>
                    <div>
                      <label style={LF}>Stone Clarity</label>
                      <input value={line.diamond_clarity} onChange={e => setLine({ diamond_clarity: e.target.value })} style={IF} />
                    </div>
                    <div>
                      <label style={LF}>Finger Size</label>
                      <input value={line.finger_size} onChange={e => setLine({ finger_size: e.target.value })} style={IF} />
                    </div>
                    <div>
                      <label style={LF}>Qty</label>
                      <input type="number" min="1" value={line.quantity} onChange={e => setLine({ quantity: e.target.value })} style={IF} />
                    </div>
                    <div>
                      <label style={LF}>
                        Est. Cost ($){isInvoiced && <span style={{ color: "#D97706", marginLeft: 4 }}>⚠</span>}
                      </label>
                      <input type="number" step="0.01" min="0" value={line.estimated_cost} onChange={e => setLine({ estimated_cost: e.target.value })} style={IF} />
                    </div>
                    <div>
                      <label style={LF}>Supplier Design No</label>
                      <input value={line.supplier_design_no} onChange={e => setLine({ supplier_design_no: e.target.value })} style={IF} />
                    </div>
                    <div>
                      <label style={LF}>Notes</label>
                      <input value={line.notes} onChange={e => setLine({ notes: e.target.value })} style={IF} />
                    </div>
                  </div>
                  {/* Stock / Order toggle */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #E5E7EB", fontSize: 13 }}>
                      <button
                        type="button"
                        onClick={() => setLine({ forOrder: false, packet_id: "" })}
                        style={{ padding: "6px 14px", background: !line.forOrder ? "#111827" : "#fff", color: !line.forOrder ? "#fff" : "#374151", border: "none", cursor: "pointer", fontWeight: !line.forOrder ? 600 : 400 }}
                      >
                        For Stock
                      </button>
                      <button
                        type="button"
                        onClick={() => setLine({ forOrder: true })}
                        style={{ padding: "6px 14px", background: line.forOrder ? "#111827" : "#fff", color: line.forOrder ? "#fff" : "#374151", border: "none", cursor: "pointer", fontWeight: line.forOrder ? 600 : 400 }}
                      >
                        Customer Order
                      </button>
                    </div>
                    {line.forOrder && (
                      <select
                        value={line.packet_id}
                        onChange={e => setLine({ packet_id: e.target.value })}
                        style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13, background: "#fff" }}
                      >
                        <option value="">— Select packet —</option>
                        {openPackets.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.reference_number}{p.customer_first_name ? ` · ${[p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ")}` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <button
          type="button"
          onClick={() => setEditLines(ls => [...ls, {
            id: "", title: "", category_id: "", metal_type: "", metal_karat: "",
            metal_colour: "", diamond_type: "", diamond_carat: "", diamond_colour: "",
            diamond_clarity: "", finger_size: "", quantity: "1", estimated_cost: "",
            actual_cost: null, supplier_design_no: "", packet_id: "", notes: "",
            received: false, forOrder: false,
          }])}
          style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, padding: "8px 16px", borderRadius: 8, border: "1px dashed #D1D5DB", background: "#fff", color: "#6B7280", fontSize: 13, cursor: "pointer", width: "100%" }}
        >
          <Plus size={14} /> Add Line Item
        </button>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Receive mode ───────────────────────────────────────────────────────────
  if (showReceive) {
    return (
      <div style={{ padding: "32px 32px 64px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button onClick={() => { fetchPo(); setShowReceive(false); setAllDone(false); setReceivedCount(0); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", padding: 0 }}>
            <X size={20} />
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>Receive Stock — {po.po_number}</h1>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6B7280" }}>{unreceived.length} item{unreceived.length !== 1 ? "s" : ""} to receive</p>
          </div>
        </div>

        {allDone && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#ECFDF5", color: "#065F46", borderRadius: 10, fontSize: 14, fontWeight: 500, marginBottom: 16 }}>
            <span>All lines processed</span>
            <button
              onClick={handleFinish}
              style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: "#059669", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Finish
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {unreceived.map(line => (
            <ReceiveCard
              key={line.id}
              line={line}
              tenantId={tenantId}
              poId={po.id}
              categories={categories}
              locations={locations}
              products={products}
              onDone={handleLineDone}
            />
          ))}
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 900, margin: "0 auto" }}>
      {/* Back */}
      <button
        onClick={() => router.push("/inventory/purchase-orders")}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#6B7280", fontSize: 14, marginBottom: 20, padding: 0 }}
      >
        <ArrowLeft size={16} /> Purchase Orders
      </button>

      {/* Title bar */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#111827" }}>{po.po_number}</span>
            <StatusBadge status={po.status} />
          </div>
          <div style={{ fontSize: 14, color: "#6B7280" }}>{supplierName}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEdit && (
            <button
              onClick={enterEditMode}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", color: "#374151", fontSize: 14, cursor: "pointer" }}
            >
              <Pencil size={14} /> Edit PO
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => { setCancelError(""); setShowCancelModal(true); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 14, cursor: "pointer" }}
            >
              <Ban size={14} /> Cancel PO
            </button>
          )}
          {isManager && po.status === "draft" && (
            <button
              onClick={handleMarkOrdered}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#1D4ED8", fontSize: 14, cursor: "pointer" }}
            >
              Mark as Ordered
            </button>
          )}
          {canReceive && (
            <button
              onClick={() => { setReceivedCount(0); setShowReceive(true); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            >
              <Package size={15} /> Receive Stock
            </button>
          )}
        </div>
      </div>

      {/* Summary card */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px 24px" }}>
          <DetailItem label="Supplier" value={supplierName} />
          <DetailItem label="Order Date" value={po.order_date ? new Date(po.order_date).toLocaleDateString("en-AU") : null} />
          <DetailItem label="Expected Delivery" value={po.expected_date ? new Date(po.expected_date).toLocaleDateString("en-AU") : null} />
          <DetailItem label="Lines" value={`${po.lines.length} item${po.lines.length !== 1 ? "s" : ""}`} />
          <DetailItem label="Received" value={`${po.lines.filter(l => Number(l.received_quantity ?? 0) >= Number(l.quantity ?? 1)).length} of ${po.lines.length} lines`} />
          <DetailItem label="Created" value={new Date(po.created_at).toLocaleDateString("en-AU")} />
          {po.notes && <div style={{ gridColumn: "1 / -1" }}><DetailItem label="Notes" value={po.notes} /></div>}
        </div>
      </div>

      {/* Lines table */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Line Items</span>
          {showCosts && po.lines.some(l => l.actual_cost == null) && (
            <span style={{ fontSize: 12, color: "#D97706", fontWeight: 500 }}>
              {po.lines.filter(l => l.actual_cost == null).length} line{po.lines.filter(l => l.actual_cost == null).length !== 1 ? "s" : ""} pending invoice
            </span>
          )}
        </div>
        {po.lines.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>No line items</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {(["Title", "Metal", "Ordered", "Received", "Remaining", ...(showCosts ? ["Est. Cost", "Actual Cost", "Invoice"] : []), "Stock Pieces"] as string[]).map(h => (
                    <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontWeight: 600, color: "#6B7280", fontSize: 11, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {po.lines.map((line, i) => {
                  const estCost     = line.estimated_cost;
                  const invoiced    = line.actual_cost != null;
                  const orderedQty  = Number(line.quantity ?? 1);
                  const receivedQty = Number(line.received_quantity ?? 0);
                  const remaining   = orderedQty - receivedQty;
                  const fullyRcvd   = receivedQty >= orderedQty;
                  const linePieces  = line.pieces ?? [];
                  return (
                    <tr key={line.id} style={{ borderTop: i > 0 ? "1px solid #F3F4F6" : "none" }}>
                      <td style={{ padding: "10px 16px", color: "#374151", maxWidth: 240 }}>
                        <div>{line.title ?? <span style={{ color: "#D1D5DB" }}>—</span>}</div>
                        {(() => { const catName = categories.find(c => c.id === line.category_id)?.name; return catName ? <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{catName}</div> : null; })()}
                        {line.supplier_design_no && (
                          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, fontFamily: "monospace" }}>
                            Ref: {line.supplier_design_no}
                          </div>
                        )}
                        {line.packet ? (
                          <div style={{ marginTop: 4 }}>
                            <a
                              href={`/workshop/board`}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 3,
                                padding: "2px 7px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                                background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE",
                                textDecoration: "none",
                              }}
                              title={[line.packet.customer_first_name, line.packet.customer_last_name].filter(Boolean).join(" ") || undefined}
                            >
                              {line.packet.reference_number}
                            </a>
                          </div>
                        ) : (
                          <div style={{ marginTop: 4 }}>
                            <span style={{
                              display: "inline-block", padding: "2px 7px", borderRadius: 6, fontSize: 11,
                              fontWeight: 500, background: "#F3F4F6", color: "#9CA3AF",
                            }}>Stock</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 16px", color: "#6B7280", whiteSpace: "nowrap" }}>
                        {[line.metal_karat, line.metal_colour, line.metal_type].filter(Boolean).join(" ") || "—"}
                        {line.diamond_carat && (
                          <div style={{ fontSize: 11, marginTop: 2 }}>
                            {[line.diamond_carat && `${line.diamond_carat}ct`, line.diamond_colour, line.diamond_type].filter(Boolean).join(" ")}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 16px", color: "#374151", textAlign: "center", fontWeight: 500 }}>{orderedQty}</td>
                      <td style={{ padding: "10px 16px", textAlign: "center", color: receivedQty > 0 ? "#059669" : "#D1D5DB", fontWeight: receivedQty > 0 ? 600 : 400 }}>{receivedQty}</td>
                      <td style={{ padding: "10px 16px", textAlign: "center", color: remaining > 0 ? "#92400E" : "#9CA3AF", fontWeight: remaining > 0 ? 500 : 400 }}>{remaining}</td>
                      {showCosts && (
                        <td style={{ padding: "10px 16px", color: "#6B7280", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                          {estCost != null ? `$${Number(estCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}` : "—"}
                        </td>
                      )}
                      {showCosts && (
                        <td style={{ padding: "10px 16px", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                          {invoiced ? (
                            <span style={{ color: "#111827", fontWeight: 500 }}>
                              ${Number(line.actual_cost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span style={{ color: "#D1D5DB" }}>—</span>
                          )}
                        </td>
                      )}
                      {showCosts && (
                        <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                          {invoiced ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }}>Invoiced</span>
                              {isManager && (
                                <button
                                  onClick={() => openConfirmModal(line)}
                                  style={{ fontSize: 11, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A" }}>Pending Invoice</span>
                              {isManager && (
                                <button
                                  onClick={() => openConfirmModal(line)}
                                  style={{ display: "flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", fontSize: 11, cursor: "pointer", color: "#374151", fontWeight: 500, whiteSpace: "nowrap" }}
                                >
                                  <DollarSign size={11} /> Confirm
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                      <td style={{ padding: "10px 16px" }}>
                        {linePieces.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {fullyRcvd && (
                              <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0", marginBottom: 2, display: "inline-block" }}>Received</span>
                            )}
                            {linePieces.map(piece => (
                              <a
                                key={piece.id}
                                href={`/inventory/pieces/${piece.id}`}
                                style={{ fontSize: 11, color: "#4338CA", fontFamily: "monospace", textDecoration: "none" }}
                                title={piece.quantity > 1 ? `Batch qty: ${piece.quantity}` : undefined}
                              >
                                {piece.sku}{piece.quantity > 1 ? ` ×${piece.quantity}` : ""}
                              </a>
                            ))}
                          </div>
                        ) : remaining > 0 ? (
                          <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: "#F3F4F6", color: "#6B7280" }}>Pending</span>
                        ) : (
                          <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: "#FFFBEB", color: "#92400E" }}>Skipped</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice attachments — PO-level, independent of line receiving */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8, paddingLeft: 2 }}>
          Invoice Documents
        </div>
        <InventoryAttachmentsPanel
          entityType="purchase_order"
          entityId={po.id}
          readOnly={false}
        />
      </div>

      {/* Confirm Actual Cost Modal */}
      {confirmLine && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>
                  {confirmLine.actual_cost != null ? "Update Actual Cost" : "Confirm Invoice Amount"}
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>
                  {confirmLine.title ?? "Untitled item"}
                </p>
              </div>
              <button onClick={() => setConfirmLine(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", padding: 0 }}>
                <X size={20} />
              </button>
            </div>

            {confirmLine.estimated_cost != null && (
              <div style={{ padding: "10px 14px", background: "#F9FAFB", borderRadius: 8, fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
                Estimated: <strong style={{ fontFamily: "monospace", color: "#374151" }}>
                  ${Number(confirmLine.estimated_cost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                </strong>
              </div>
            )}

            {confirmError && (
              <div style={{ padding: "8px 12px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{confirmError}</div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>
                Invoice Amount ($) <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={confirmCost}
                onChange={e => setConfirmCost(e.target.value)}
                placeholder="0.00"
                autoFocus
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 15, fontFamily: "monospace" }}
                onKeyDown={e => { if (e.key === "Enter") handleConfirmActualCost(); }}
              />
              <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>
                This records the actual amount on the supplier invoice.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setConfirmLine(null)}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmActualCost}
                disabled={confirmSaving || !confirmCost}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 14, fontWeight: 500, cursor: confirmSaving || !confirmCost ? "not-allowed" : "pointer", opacity: confirmSaving || !confirmCost ? 0.7 : 1 }}
              >
                {confirmSaving ? "Saving…" : "Confirm Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel PO Modal */}
      {showCancelModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>Cancel Purchase Order</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>{po.po_number}</p>
              </div>
              <button onClick={() => setShowCancelModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", padding: 0 }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: "12px 16px", background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 10, fontSize: 13, color: "#7F1D1D", marginBottom: 20, lineHeight: 1.5 }}>
              This will mark the PO as cancelled. All line items and cost data are preserved. The PO will be hidden from the main list by default.
            </div>

            {cancelError && (
              <div style={{ padding: "8px 12px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{cancelError}</div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowCancelModal(false)}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 14, cursor: "pointer" }}
              >
                Keep PO
              </button>
              <button
                onClick={handleCancelPO}
                disabled={cancelling}
                style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", fontSize: 14, fontWeight: 500, cursor: cancelling ? "not-allowed" : "pointer", opacity: cancelling ? 0.7 : 1 }}
              >
                {cancelling ? "Cancelling…" : "Cancel PO"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
