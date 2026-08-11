"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { ArrowLeft, Package, CheckCircle2, SkipForward, Sparkles, Loader, X, ChevronDown, DollarSign } from "lucide-react";
import InventoryAttachmentsPanel from "@/components/InventoryAttachmentsPanel";

type POStatus = "draft" | "ordered" | "partially_received" | "received";

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
  piece_id: string | null;
  piece?: { id: string; sku: string } | null;
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
    // New fields — prefill from estimated_cost (preferred) or unit_cost (legacy)
    actual_cost: line.estimated_cost != null
      ? String(line.estimated_cost)
      : line.unit_cost != null ? String(line.unit_cost) : "",
    location_id: "",   // "" = use route default
    product_id:  "",   // "" = unlinked
  });
  const [saving, setSaving]     = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [done, setDone]         = useState(false);
  const [aiDesc, setAiDesc]     = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [pieceResult, setPieceResult] = useState<{ id: string; sku: string } | null>(null);
  const [showAttach, setShowAttach] = useState(false);

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
      actual_cost:   specs.actual_cost   ? parseFloat(specs.actual_cost)   : null,
    };
    // Strip empty-string optionals so route uses its defaults
    if (!builtSpecs.location_id) delete builtSpecs.location_id;
    if (!builtSpecs.product_id)  delete builtSpecs.product_id;
    if (builtSpecs.actual_cost == null) delete builtSpecs.actual_cost;

    const res = await fetch(`/api/inventory/purchase-orders/${poId}/receive`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ line_id: line.id, specs: builtSpecs }),
    });
    const json = await res.json();
    setSaving(false);
    if (res.ok) { setPieceResult(json.piece); setDone(true); onDone(); }
  }

  async function handleSkip() {
    setSkipping(true);
    await fetch(`/api/inventory/purchase-orders/${poId}/receive`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ line_id: line.id, skip: true }),
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
              {pieceResult ? `Created ${pieceResult.sku}` : "Skipped"}
            </div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{line.title ?? "Untitled item"}</div>
          </div>
          {pieceResult && (
            <button
              onClick={() => setShowAttach(a => !a)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, border: "1px solid #6EE7B7", background: "#D1FAE5", color: "#065F46", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
            >
              Attachments <ChevronDown size={12} style={{ transform: showAttach ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>
          )}
        </div>
        {pieceResult && showAttach && (
          <div style={{ padding: "0 20px 20px", borderTop: "1px solid #A7F3D0" }}>
            <InventoryAttachmentsPanel
              entityType="inventory_piece"
              entityId={pieceResult.id}
              readOnly={false}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 4 }}>{line.title ?? "Untitled item"}</div>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>
        {[line.metal_karat, line.metal_colour, line.metal_type].filter(Boolean).join(" ")}
        {line.diamond_carat ? ` · ${line.diamond_carat}ct ${line.diamond_colour ?? ""} ${line.diamond_type ?? ""}`.trim() : ""}
        {line.finger_size ? ` · Size ${line.finger_size}` : ""}
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
          <label style={LF}>Actual Cost ($)</label>
          <input
            type="number" step="0.01" min="0"
            value={specs.actual_cost}
            onChange={e => setSpecs(s => ({ ...s, actual_cost: e.target.value }))}
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
          <CheckCircle2 size={14} /> {saving ? "Creating…" : "Confirm & Create Piece"}
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

  const [po, setPo]           = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations]   = useState<any[]>([]);
  const [products, setProducts]     = useState<any[]>([]);
  const [showReceive, setShowReceive] = useState(false);
  const [receivedCount, setReceivedCount] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const [toast, setToast]     = useState("");

  // Confirm actual cost modal
  const [confirmLine, setConfirmLine]     = useState<PoLine | null>(null);
  const [confirmCost, setConfirmCost]     = useState("");
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [confirmError, setConfirmError]   = useState("");

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
    }
    if (prodRes.ok) {
      const json = await prodRes.json();
      setProducts(json.products ?? []);
    }
    setLoading(false);
  }, [tenantId, params.id]);

  useEffect(() => { fetchPo(); }, [fetchPo]);

  const unreceived = po?.lines.filter(l => !l.received) ?? [];

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
  const canReceive   = isManager && (po.status === "ordered" || po.status === "partially_received") && unreceived.length > 0;

  // Receive mode view
  if (showReceive) {
    return (
      <div style={{ padding: "32px 32px 64px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button onClick={() => setShowReceive(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280", padding: 0 }}>
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
        <div style={{ display: "flex", gap: 8 }}>
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
          <DetailItem label="Received" value={`${po.lines.filter(l => l.received).length} of ${po.lines.length}`} />
          <DetailItem label="Created" value={new Date(po.created_at).toLocaleDateString("en-AU")} />
          {po.notes && <div style={{ gridColumn: "1 / -1" }}><DetailItem label="Notes" value={po.notes} /></div>}
        </div>
      </div>

      {/* Lines table */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Line Items</span>
          {po.lines.some(l => l.actual_cost == null) && (
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
                  {["Title", "Metal", "Qty", "Est. Cost", "Actual Cost", "Invoice", "Receipt"].map(h => (
                    <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontWeight: 600, color: "#6B7280", fontSize: 11, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {po.lines.map((line, i) => {
                  const estCost = line.estimated_cost ?? line.unit_cost;
                  const invoiced = line.actual_cost != null;
                  return (
                    <tr key={line.id} style={{ borderTop: i > 0 ? "1px solid #F3F4F6" : "none" }}>
                      <td style={{ padding: "10px 16px", color: "#374151", maxWidth: 240 }}>
                        <div>{line.title ?? <span style={{ color: "#D1D5DB" }}>—</span>}</div>
                        {line.category?.name && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{line.category.name}</div>}
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
                      </td>
                      <td style={{ padding: "10px 16px", color: "#374151", textAlign: "center" }}>{line.quantity}</td>
                      <td style={{ padding: "10px 16px", color: "#6B7280", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                        {estCost != null ? `$${Number(estCost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                        {invoiced ? (
                          <span style={{ color: "#111827", fontWeight: 500 }}>
                            ${Number(line.actual_cost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span style={{ color: "#D1D5DB" }}>—</span>
                        )}
                      </td>
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
                      <td style={{ padding: "10px 16px" }}>
                        {line.received ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#ECFDF5", color: "#065F46", border: "1px solid #A7F3D0" }}>Received</span>
                            {line.piece && <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "monospace" }}>{line.piece.sku}</span>}
                          </div>
                        ) : (
                          <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 500, background: "#F3F4F6", color: "#6B7280" }}>Pending</span>
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

            {(confirmLine.estimated_cost ?? confirmLine.unit_cost) != null && (
              <div style={{ padding: "10px 14px", background: "#F9FAFB", borderRadius: 8, fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
                Estimated: <strong style={{ fontFamily: "monospace", color: "#374151" }}>
                  ${Number(confirmLine.estimated_cost ?? confirmLine.unit_cost).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
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
    </div>
  );
}
