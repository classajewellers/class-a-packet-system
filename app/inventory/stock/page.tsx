"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import {
  InventoryProduct,
  InventoryVariant,
  InventoryBomItem,
  InventorySupplier,
  InventoryGoldPrice,
  MetalKarat,
  MetalColour,
  DiamondType,
  BomComponentType,
} from "@/lib/types";
import { calculateMultiplier, multiplierColour, calculateRetailPrice } from "@/lib/marginCalculator";
import { generateJewelleryTagHTML } from "@/lib/jewelleryTagGenerator";
import { Plus, Search, X, ChevronDown, ChevronRight, Printer, Edit2, Trash2, AlertTriangle } from "lucide-react";

// ── helpers ────────────────────────────────────────────────────────────────
const fmtCurrency = (v: number | null | undefined) =>
  v != null ? `$${Number(v).toFixed(2)}` : "—";

const KARATS: MetalKarat[] = ["9K", "18K", "Platinum", "Silver", "Other"];
const COLOURS: MetalColour[] = ["Yellow", "White", "Rose", "N/A"];
const DIAMOND_TYPES: DiamondType[] = ["Natural", "Lab Grown", "None"];
const BOM_TYPES: BomComponentType[] = ["casting", "diamond", "labour", "settings", "findings", "other"];

const BOM_TYPE_STYLE: Record<BomComponentType, { bg: string; fg: string }> = {
  casting:  { bg: "#FEF3C7", fg: "#92400E" },
  diamond:  { bg: "#EEF2FF", fg: "#4338CA" },
  labour:   { bg: "#F0F9FF", fg: "#0369A1" },
  settings: { bg: "#FCE7F3", fg: "#9D174D" },
  findings: { bg: "#F3F4F6", fg: "#6B7280" },
  other:    { bg: "#ECFDF5", fg: "#065F46" },
};

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

// ── Page ───────────────────────────────────────────────────────────────────
export default function StockPage() {
  const { user } = useUser();
  const isManager = canManage(user?.role);

  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [goldPrices, setGoldPrices] = useState<InventoryGoldPrice[]>([]);

  const [drawerState, setDrawerState] = useState<{
    open: boolean;
    product: InventoryProduct | null;
    variant: InventoryVariant | null;
    tab: "details" | "bom";
  }>({ open: false, product: null, variant: null, tab: "details" });

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const url = "/api/inventory/products" + (search ? `?search=${encodeURIComponent(search)}` : "");
      const res = await fetch(url);
      const json = await res.json();
      setProducts(json.products ?? []);
    } finally {
      setLoading(false);
    }
  }, [search]);

  const fetchSuppliers = useCallback(async () => {
    const res = await fetch("/api/inventory/suppliers");
    const json = await res.json();
    setSuppliers(json.suppliers ?? []);
  }, []);

  const fetchGoldPrices = useCallback(async () => {
    const res = await fetch("/api/inventory/gold-prices");
    const json = await res.json();
    setGoldPrices(json.prices ?? []);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchSuppliers(); fetchGoldPrices(); }, [fetchSuppliers, fetchGoldPrices]);

  const toggleExpand = (id: string) => {
    setExpandedProducts((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openNewProduct = () => {
    setDrawerState({ open: true, product: null, variant: null, tab: "details" });
  };

  const openVariantDrawer = (product: InventoryProduct, variant: InventoryVariant | null) => {
    setDrawerState({ open: true, product, variant, tab: "details" });
  };

  const closeDrawer = () => setDrawerState((s) => ({ ...s, open: false }));

  const handlePrintTag = (variant: InventoryVariant, productName: string) => {
    const html = generateJewelleryTagHTML(variant, productName);
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Stock</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                padding: "8px 12px 8px 32px", borderRadius: 8, border: "1px solid #E5E7EB",
                fontSize: 13, width: 240, outline: "none",
              }}
            />
          </div>
          {isManager && (
            <button
              onClick={openNewProduct}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "#635BFF", color: "#fff", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
            >
              <Plus size={16} /> Add Product
            </button>
          )}
        </div>
      </div>

      {/* Product list */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>Loading...</div>
        ) : products.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>No products yet. Click &quot;Add Product&quot; to get started.</div>
        ) : (
          products.map((product) => {
            const expanded = expandedProducts.has(product.id);
            const variants = product.variants ?? [];
            return (
              <div key={product.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                {/* Product row */}
                <div
                  style={{ display: "flex", alignItems: "center", padding: "14px 20px", cursor: "pointer", gap: 12 }}
                  onClick={() => toggleExpand(product.id)}
                >
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E" }}>{product.name}</div>
                    {product.description && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{product.description}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280" }}>{product.category || "—"}</div>
                  <div style={{ fontSize: 12, color: "#6B7280", minWidth: 80, textAlign: "right" }}>
                    {variants.length} variant{variants.length === 1 ? "" : "s"}
                  </div>
                  {isManager && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openVariantDrawer(product, null); }}
                      style={{ padding: "4px 10px", borderRadius: 6, background: "#EEF2FF", color: "#4338CA", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                    >
                      + Variant
                    </button>
                  )}
                </div>

                {/* Variant rows */}
                {expanded && (
                  <div style={{ background: "#FAFAFC", padding: "4px 20px 16px 44px" }}>
                    {variants.length === 0 ? (
                      <div style={{ padding: "16px 0", fontSize: 12, color: "#9CA3AF", fontStyle: "italic" }}>
                        No variants yet.
                      </div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ color: "#6B7280", textAlign: "left" }}>
                            <th style={{ padding: "8px 4px", fontWeight: 500 }}>SKU</th>
                            <th style={{ padding: "8px 4px", fontWeight: 500 }}>Metal</th>
                            <th style={{ padding: "8px 4px", fontWeight: 500 }}>Diamond</th>
                            <th style={{ padding: "8px 4px", fontWeight: 500 }}>Size</th>
                            <th style={{ padding: "8px 4px", fontWeight: 500, textAlign: "right" }}>Cost</th>
                            <th style={{ padding: "8px 4px", fontWeight: 500, textAlign: "right" }}>Retail</th>
                            <th style={{ padding: "8px 4px", fontWeight: 500 }}>Mult</th>
                            <th style={{ padding: "8px 4px", fontWeight: 500, textAlign: "right" }}>Stock</th>
                            <th style={{ padding: "8px 4px", fontWeight: 500 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {variants.map((v) => {
                            const mult = calculateMultiplier(v.retail_price ?? 0, v.cost_price ?? 0);
                            const metalStr = [v.metal_karat, v.metal_colour && v.metal_colour !== "N/A" ? v.metal_colour : null].filter(Boolean).join(" ") || "—";
                            const diamondStr = v.diamond_carat
                              ? `${v.diamond_carat}ct ${v.diamond_type ?? ""} ${v.diamond_colour ?? ""}${v.diamond_clarity ? "/" + v.diamond_clarity : ""}`.trim()
                              : "—";
                            return (
                              <tr key={v.id} style={{ borderTop: "1px solid #E8E8F0" }}>
                                <td style={{ padding: "8px 4px", fontFamily: "monospace", color: "#1A1A2E" }}>{v.sku}</td>
                                <td style={{ padding: "8px 4px", color: "#1A1A2E" }}>{metalStr}</td>
                                <td style={{ padding: "8px 4px", color: "#1A1A2E" }}>{diamondStr}</td>
                                <td style={{ padding: "8px 4px", color: "#1A1A2E" }}>{v.finger_size || "—"}</td>
                                <td style={{ padding: "8px 4px", color: "#1A1A2E", textAlign: "right" }}>{fmtCurrency(v.cost_price)}</td>
                                <td style={{ padding: "8px 4px", color: "#1A1A2E", textAlign: "right", fontWeight: 500 }}>{fmtCurrency(v.retail_price)}</td>
                                <td style={{ padding: "8px 4px" }}>{multiplierBadge(mult)}</td>
                                <td style={{ padding: "8px 4px", color: "#1A1A2E", textAlign: "right" }}>{v.total_stock ?? 0}</td>
                                <td style={{ padding: "8px 4px", textAlign: "right" }}>
                                  <button
                                    onClick={() => handlePrintTag(v, product.name)}
                                    title="Print Tag"
                                    style={{ padding: 4, marginRight: 4, background: "transparent", border: "none", cursor: "pointer", color: "#6B7280" }}
                                  >
                                    <Printer size={14} />
                                  </button>
                                  <button
                                    onClick={() => openVariantDrawer(product, v)}
                                    title="Edit"
                                    style={{ padding: 4, background: "transparent", border: "none", cursor: "pointer", color: "#4338CA" }}
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Drawer */}
      {drawerState.open && (
        <DetailDrawer
          state={drawerState}
          setState={setDrawerState}
          suppliers={suppliers}
          goldPrices={goldPrices}
          onClose={closeDrawer}
          onSaved={fetchProducts}
        />
      )}
    </div>
  );
}

// ── DetailDrawer ───────────────────────────────────────────────────────────
interface DrawerProps {
  state: {
    open: boolean;
    product: InventoryProduct | null;
    variant: InventoryVariant | null;
    tab: "details" | "bom";
  };
  setState: React.Dispatch<React.SetStateAction<DrawerProps["state"]>>;
  suppliers: InventorySupplier[];
  goldPrices: InventoryGoldPrice[];
  onClose: () => void;
  onSaved: () => void;
}

function DetailDrawer({ state, setState, suppliers, goldPrices, onClose, onSaved }: DrawerProps) {
  const { product, variant } = state;
  const isNewProduct = !product;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50,
        display: "flex", justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{ width: 480, height: "100%", background: "#fff", boxShadow: "-4px 0 12px rgba(0,0,0,0.1)", overflowY: "auto", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {isNewProduct ? "New Product" : variant ? "Variant" : "New Variant"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A2E", marginTop: 2 }}>
              {isNewProduct ? "Create product" : product?.name}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6B7280" }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab bar (only if editing/creating a variant) */}
        {!isNewProduct && (
          <div style={{ display: "flex", borderBottom: "1px solid #E8E8F0" }}>
            <button
              onClick={() => setState((s) => ({ ...s, tab: "details" }))}
              style={{
                flex: 1, padding: "12px", background: "transparent", border: "none",
                borderBottom: state.tab === "details" ? "2px solid #635BFF" : "2px solid transparent",
                color: state.tab === "details" ? "#635BFF" : "#6B7280",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            >
              Details
            </button>
            {variant && (
              <button
                onClick={() => setState((s) => ({ ...s, tab: "bom" }))}
                style={{
                  flex: 1, padding: "12px", background: "transparent", border: "none",
                  borderBottom: state.tab === "bom" ? "2px solid #635BFF" : "2px solid transparent",
                  color: state.tab === "bom" ? "#635BFF" : "#6B7280",
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}
              >
                Bill of Materials
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {isNewProduct ? (
            <ProductForm
              product={null}
              onSaved={(newProduct) => {
                onSaved();
                // Switch to variant form on the new product
                setState({ open: true, product: newProduct, variant: null, tab: "details" });
              }}
            />
          ) : state.tab === "details" ? (
            <VariantForm
              product={product!}
              variant={variant}
              onSaved={(v) => {
                onSaved();
                setState((s) => ({ ...s, variant: v }));
              }}
            />
          ) : (
            variant && (
              <BomTab
                variant={variant}
                suppliers={suppliers}
                goldPrices={goldPrices}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── ProductForm ────────────────────────────────────────────────────────────
function ProductForm({ product, onSaved }: { product: InventoryProduct | null; onSaved: (p: InventoryProduct) => void }) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [department, setDepartment] = useState(product?.department ?? "");
  const [notes, setNotes] = useState(product?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return alert("Name is required");
    setSaving(true);
    try {
      const url = product ? `/api/inventory/products/${product.id}` : "/api/inventory/products";
      const method = product ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, category, department, notes }),
      });
      const json = await res.json();
      if (json.product) onSaved(json.product);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <FieldText label="Name *" value={name} onChange={setName} />
      <FieldText label="Description" value={description ?? ""} onChange={setDescription} multiline />
      <FieldText label="Category" value={category ?? ""} onChange={setCategory} />
      <FieldText label="Department" value={department ?? ""} onChange={setDepartment} />
      <FieldText label="Notes" value={notes ?? ""} onChange={setNotes} multiline />
      <button
        onClick={save}
        disabled={saving}
        style={{ padding: "10px 16px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
      >
        {saving ? "Saving..." : product ? "Save Product" : "Create & Add Variant"}
      </button>
    </div>
  );
}

// ── VariantForm ────────────────────────────────────────────────────────────
function VariantForm({ product, variant, onSaved }: { product: InventoryProduct; variant: InventoryVariant | null; onSaved: (v: InventoryVariant) => void }) {
  const [sku, setSku] = useState(variant?.sku ?? "");
  const [metalType, setMetalType] = useState(variant?.metal_type ?? "");
  const [metalKarat, setMetalKarat] = useState<string>(variant?.metal_karat ?? "");
  const [metalColour, setMetalColour] = useState<string>(variant?.metal_colour ?? "");
  const [metalWeight, setMetalWeight] = useState(variant?.metal_weight_grams?.toString() ?? "");
  const [diamondCarat, setDiamondCarat] = useState(variant?.diamond_carat?.toString() ?? "");
  const [diamondColour, setDiamondColour] = useState(variant?.diamond_colour ?? "");
  const [diamondClarity, setDiamondClarity] = useState(variant?.diamond_clarity ?? "");
  const [diamondType, setDiamondType] = useState<string>(variant?.diamond_type ?? "");
  const [fingerSize, setFingerSize] = useState(variant?.finger_size ?? "");
  const [otherSpecs, setOtherSpecs] = useState(variant?.other_specs ?? "");
  const [costPrice, setCostPrice] = useState(variant?.cost_price?.toString() ?? "");
  const [retailPrice, setRetailPrice] = useState(variant?.retail_price?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const costNum = parseFloat(costPrice) || 0;
  const retailNum = parseFloat(retailPrice) || 0;
  const mult = calculateMultiplier(retailNum, costNum);

  const save = async () => {
    if (!sku.trim()) return alert("SKU is required");
    setSaving(true);
    try {
      const body = {
        product_id: product.id,
        sku,
        metal_type: metalType || null,
        metal_karat: metalKarat || null,
        metal_colour: metalColour || null,
        metal_weight_grams: metalWeight ? parseFloat(metalWeight) : null,
        diamond_carat: diamondCarat ? parseFloat(diamondCarat) : null,
        diamond_colour: diamondColour || null,
        diamond_clarity: diamondClarity || null,
        diamond_type: diamondType || null,
        finger_size: fingerSize || null,
        other_specs: otherSpecs || null,
        cost_price: costPrice ? parseFloat(costPrice) : null,
        retail_price: retailPrice ? parseFloat(retailPrice) : null,
        is_active: true,
      };
      const url = variant ? `/api/inventory/variants/${variant.id}` : "/api/inventory/variants";
      const method = variant ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.variant) onSaved(json.variant);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <FieldText label="SKU *" value={sku} onChange={setSku} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FieldText label="Metal Type" value={metalType} onChange={setMetalType} />
        <FieldSelect label="Metal Karat" value={metalKarat} onChange={setMetalKarat} options={["", ...KARATS]} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FieldSelect label="Metal Colour" value={metalColour} onChange={setMetalColour} options={["", ...COLOURS]} />
        <FieldText label="Metal Weight (g)" value={metalWeight} onChange={setMetalWeight} type="number" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FieldText label="Diamond Carat" value={diamondCarat} onChange={setDiamondCarat} type="number" />
        <FieldSelect label="Diamond Type" value={diamondType} onChange={setDiamondType} options={["", ...DIAMOND_TYPES]} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FieldText label="Diamond Colour" value={diamondColour} onChange={setDiamondColour} />
        <FieldText label="Diamond Clarity" value={diamondClarity} onChange={setDiamondClarity} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FieldText label="Finger Size" value={fingerSize} onChange={setFingerSize} />
        <FieldText label="Other Specs" value={otherSpecs} onChange={setOtherSpecs} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
        <FieldText label="Cost Price ($)" value={costPrice} onChange={setCostPrice} type="number" />
        <FieldText label="Retail Price ($)" value={retailPrice} onChange={setRetailPrice} type="number" />
        <div style={{ paddingBottom: 8 }}>{multiplierBadge(mult)}</div>
      </div>
      <button
        onClick={save}
        disabled={saving}
        style={{ padding: "10px 16px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: saving ? 0.6 : 1, marginTop: 8 }}
      >
        {saving ? "Saving..." : variant ? "Save Variant" : "Create Variant"}
      </button>
    </div>
  );
}

// ── BomTab ─────────────────────────────────────────────────────────────────
function BomTab({ variant, suppliers, goldPrices }: { variant: InventoryVariant; suppliers: InventorySupplier[]; goldPrices: InventoryGoldPrice[] }) {
  const [items, setItems] = useState<InventoryBomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [retailPrice, setRetailPrice] = useState(variant.retail_price);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory/bom?variant_id=${variant.id}`);
      const json = await res.json();
      setItems(json.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [variant.id]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const totalBomCost = useMemo(() => items.reduce((sum, i) => sum + Number(i.total_cost ?? 0), 0), [items]);
  const suggestedRetail = calculateRetailPrice(totalBomCost);

  const deleteItem = async (id: string) => {
    if (!confirm("Delete this BOM item?")) return;
    await fetch(`/api/inventory/bom/${id}`, { method: "DELETE" });
    fetchItems();
  };

  const useSuggested = async () => {
    await fetch(`/api/inventory/variants/${variant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...variant, retail_price: suggestedRetail }),
    });
    setRetailPrice(suggestedRetail);
  };

  return (
    <div style={{ padding: 20 }}>
      {/* Items */}
      {loading ? (
        <div style={{ padding: 20, textAlign: "center", color: "#9CA3AF" }}>Loading...</div>
      ) : items.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "#9CA3AF", fontStyle: "italic" }}>No BOM items yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => (
            editId === item.id ? (
              <BomForm
                key={item.id}
                variant={variant}
                suppliers={suppliers}
                goldPrices={goldPrices}
                existing={item}
                onCancel={() => setEditId(null)}
                onSaved={() => { setEditId(null); fetchItems(); }}
              />
            ) : (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#F9FAFB", borderRadius: 8, fontSize: 12 }}>
                <span style={{ display: "inline-flex", padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: BOM_TYPE_STYLE[item.component_type].bg, color: BOM_TYPE_STYLE[item.component_type].fg }}>
                  {item.component_type}
                </span>
                <div style={{ flex: 1, color: "#1A1A2E" }}>{item.description}</div>
                <div style={{ color: "#6B7280" }}>{item.quantity} {item.unit ?? ""}</div>
                <div style={{ color: "#6B7280" }}>{fmtCurrency(item.unit_cost)}</div>
                <div style={{ fontWeight: 600, color: "#1A1A2E", minWidth: 60, textAlign: "right" }}>{fmtCurrency(item.total_cost)}</div>
                <button onClick={() => setEditId(item.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#4338CA", padding: 4 }}>
                  <Edit2 size={12} />
                </button>
                <button onClick={() => deleteItem(item.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#DC2626", padding: 4 }}>
                  <Trash2 size={12} />
                </button>
              </div>
            )
          ))}
        </div>
      )}

      {/* Add component */}
      {addOpen ? (
        <div style={{ marginTop: 12 }}>
          <BomForm
            variant={variant}
            suppliers={suppliers}
            goldPrices={goldPrices}
            existing={null}
            onCancel={() => setAddOpen(false)}
            onSaved={() => { setAddOpen(false); fetchItems(); }}
          />
        </div>
      ) : (
        <button
          onClick={() => setAddOpen(true)}
          style={{ marginTop: 12, padding: "8px 14px", background: "#EEF2FF", color: "#4338CA", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Plus size={14} /> Add Component
        </button>
      )}

      {/* Totals */}
      <div style={{ marginTop: 24, padding: 14, background: "#FAFAFC", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "#6B7280" }}>Total BOM Cost:</span>
          <strong style={{ color: "#1A1A2E" }}>{fmtCurrency(totalBomCost)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "#6B7280" }}>Suggested Retail:</span>
          <strong style={{ color: "#065F46" }}>{fmtCurrency(suggestedRetail)}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
          <span style={{ color: "#6B7280" }}>Current Retail:</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong style={{ color: "#1A1A2E" }}>{fmtCurrency(retailPrice)}</strong>
            {suggestedRetail > 0 && suggestedRetail !== retailPrice && (
              <button
                onClick={useSuggested}
                style={{ padding: "3px 8px", fontSize: 11, background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
              >
                Use Suggested
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── BomForm ────────────────────────────────────────────────────────────────
function BomForm({ variant, suppliers, goldPrices, existing, onCancel, onSaved }: {
  variant: InventoryVariant;
  suppliers: InventorySupplier[];
  goldPrices: InventoryGoldPrice[];
  existing: InventoryBomItem | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [componentType, setComponentType] = useState<BomComponentType>(existing?.component_type ?? "casting");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [quantity, setQuantity] = useState(existing?.quantity?.toString() ?? "1");
  const [unit, setUnit] = useState(existing?.unit ?? "");
  const [unitCost, setUnitCost] = useState(existing?.unit_cost?.toString() ?? "");
  const [supplierId, setSupplierId] = useState(existing?.supplier_id ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  // Casting auto-fill from gold price
  const currentGoldPrice = useMemo(() => {
    if (componentType !== "casting" || !variant.metal_karat) return null;
    const matches = goldPrices.filter((p) => p.karat === variant.metal_karat);
    if (matches.length === 0) return null;
    // already sorted desc by created_at from API
    return matches[0];
  }, [componentType, variant.metal_karat, goldPrices]);

  const goldPriceAge = currentGoldPrice ? daysSince(currentGoldPrice.created_at) : null;
  const goldPriceStale = goldPriceAge != null && goldPriceAge > 7;

  // When component_type switches to casting on a new item, prefill the unit_cost
  useEffect(() => {
    if (!existing && componentType === "casting" && currentGoldPrice && !unitCost) {
      setUnitCost(String(currentGoldPrice.price_per_gram));
      if (!unit) setUnit("g");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentType, currentGoldPrice]);

  const save = async () => {
    if (!description.trim()) return alert("Description is required");
    setSaving(true);
    try {
      const body = {
        variant_id: variant.id,
        component_type: componentType,
        description,
        quantity: parseFloat(quantity) || 0,
        unit: unit || null,
        unit_cost: parseFloat(unitCost) || 0,
        supplier_id: supplierId || null,
        notes: notes || null,
      };
      const url = existing ? `/api/inventory/bom/${existing.id}` : "/api/inventory/bom";
      const method = existing ? "PATCH" : "POST";
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 14, background: "#fff", border: "1px solid #E8E8F0", borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FieldSelect label="Component Type" value={componentType} onChange={(v) => setComponentType(v as BomComponentType)} options={BOM_TYPES} />
        <FieldText label="Description" value={description} onChange={setDescription} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <FieldText label="Quantity" value={quantity} onChange={setQuantity} type="number" />
        <FieldText label="Unit" value={unit ?? ""} onChange={setUnit} />
        <FieldText label="Unit Cost ($)" value={unitCost} onChange={setUnitCost} type="number" />
      </div>
      {componentType === "casting" && (
        currentGoldPrice ? (
          <div style={{ padding: 10, background: goldPriceStale ? "#FEF3C7" : "#EFF6FF", borderRadius: 6, fontSize: 11, color: goldPriceStale ? "#92400E" : "#1E40AF", display: "flex", gap: 6, alignItems: "flex-start" }}>
            {goldPriceStale && <AlertTriangle size={14} />}
            <div>
              Based on current {variant.metal_karat} gold price: ${Number(currentGoldPrice.price_per_gram).toFixed(2)}/g
              {goldPriceAge != null && ` (updated ${goldPriceAge} day${goldPriceAge === 1 ? "" : "s"} ago)`}
              {goldPriceStale && " — please refresh in Settings."}
            </div>
          </div>
        ) : variant.metal_karat ? (
          <div style={{ padding: 10, background: "#FEF3C7", borderRadius: 6, fontSize: 11, color: "#92400E" }}>
            No gold price set for {variant.metal_karat}. Add one in Settings.
          </div>
        ) : null
      )}
      <FieldSelectMap label="Supplier" value={supplierId ?? ""} onChange={setSupplierId} options={[{ value: "", label: "—" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]} />
      <FieldText label="Notes" value={notes ?? ""} onChange={setNotes} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ padding: "8px 14px", background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ padding: "8px 14px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── Form Fields ────────────────────────────────────────────────────────────
function FieldText({ label, value, onChange, type = "text", multiline = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; multiline?: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 13, outline: "none", fontFamily: "inherit", resize: "vertical" }}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          step={type === "number" ? "any" : undefined}
          style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 13, outline: "none" }}
        />
      )}
    </label>
  );
}

function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 13, outline: "none", background: "#fff" }}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o || "—"}</option>
        ))}
      </select>
    </label>
  );
}

function FieldSelectMap({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 13, outline: "none", background: "#fff" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
