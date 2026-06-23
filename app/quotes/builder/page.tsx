"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage, hasPermission } from "@/lib/userTypes";
import Link from "next/link";
import { generateQuoteHTML } from "@/lib/quoteGenerator";
import { calculateRetailPrice, calculateBlendedRetailFromBrackets, calculateMultiplier, multiplierColour } from "@/lib/marginCalculator";
import type { BlendedBreakdownLine } from "@/lib/marginCalculator";
import NivodaModal, { type NivodaStone } from "@/components/NivodaModal";
import CharmNecklaceBuilder, { type CharmLineItem } from "@/components/CharmNecklaceBuilder";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetalRate { id: string; metal_type: string; price_per_gram: number; }
interface FixedCost { id: string; key: string; label: string; amount: number; }
interface MarginBracket { id: string; cost_min: number; cost_max: number | null; multiplier: number; stone_type?: string | null; }
interface MarginConfig  { id: string; category: string; margin_percent: number; hourly_rate: number | null; }

interface MetalRow { id: string; type: string; weight: string; }
interface StoneEntry {
  id: string; caratWeight: string; shape: string; colour: string;
  clarity: string; origin: "Lab Grown" | "Natural"; cost: string;
  nivodaId?: string;
}
interface MeleeRow {
  id: string; stoneType: string; quality: string; shape: string;
  caratWeight: string; individualCost: string; qty: string; location: string;
}
interface ComponentRow { id: string; name: string; cost: string; }
interface StoneOption {
  id: string; label: string; stones: StoneEntry[];
}
interface BuilderItem {
  id: string;
  collapsed: boolean;
  // Category
  itemType: ItemType | "";
  subcategory: string;
  subcategoryOther: string;
  // Design
  design: string;
  fingerSize: string;
  stockSku: string;
  // Metals
  metals: MetalRow[];
  // Stones
  includeMainStone: boolean;
  stoneOptions: StoneOption[];
  // Melee
  meleeRows: MeleeRow[];
  // Add-ons
  smallSettings: boolean;
  smallSettingsQty: string;
  handEngraving: boolean;
  handEngravingAmount: string;
  laserEngraving: boolean;
  laserEngravingAmount: string;
  components: ComponentRow[];
  // AI description
  aiDesc: string;
  aiGenerating: boolean;
  // Price overrides (manager)
  retailPriceOverride: string;
  marginMultiplierOverride: string;
}
interface CustomerResult { first_name: string | null; last_name: string | null; email: string | null; phone: string | null; }

function uid() { return Math.random().toString(36).slice(2); }
function newStone(): StoneEntry { return { id: uid(), caratWeight: "", shape: "", colour: "", clarity: "", origin: "Lab Grown", cost: "" }; }
function newMetal(): MetalRow { return { id: uid(), type: "", weight: "" }; }
function newMelee(): MeleeRow { return { id: uid(), stoneType: "", quality: "", shape: "", caratWeight: "", individualCost: "", qty: "1", location: "" }; }
function newStoneOption(index: number): StoneOption { return { id: uid(), label: `Option ${index + 1}`, stones: [newStone()] }; }
function newItem(index = 0): BuilderItem {
  return {
    id: uid(), collapsed: false,
    itemType: "", subcategory: "", subcategoryOther: "",
    design: "", fingerSize: "", stockSku: "",
    metals: [newMetal()],
    includeMainStone: false,
    stoneOptions: [newStoneOption(0)],
    meleeRows: [],
    smallSettings: false, smallSettingsQty: "1",
    handEngraving: false, handEngravingAmount: "150",
    laserEngraving: false, laserEngravingAmount: "80",
    components: [],
    aiDesc: "", aiGenerating: false,
    retailPriceOverride: "", marginMultiplierOverride: "",
  };
  void index;
}

// ─── Category data ─────────────────────────────────────────────────────────────

const ITEM_TYPES = ["Ring", "Bracelet", "Necklace", "Earrings", "Pendant", "Other"] as const;
type ItemType = (typeof ITEM_TYPES)[number];

const SUBCATEGORIES: Record<ItemType, string[]> = {
  Ring:     ["Engagement Ring", "Wedding Ring", "Dress Ring", "Eternity Ring", "Signet Ring", "Other Ring"],
  Bracelet: ["Tennis Bracelet", "Bangle", "Charm Bracelet", "Chain Bracelet", "Other Bracelet"],
  Necklace: ["Pendant Necklace", "Chain Necklace", "Locket", "Other Necklace"],
  Earrings: ["Stud Earrings", "Drop Earrings", "Hoop Earrings", "Huggie Earrings", "Other Earrings"],
  Pendant:  ["Solitaire Pendant", "Halo Pendant", "Custom Pendant", "Other Pendant"],
  Other:    [],
};

const ITEM_ICONS: Record<ItemType, string> = {
  Ring: "💍", Bracelet: "⌚", Necklace: "📿", Earrings: "✨", Pendant: "🔮", Other: "⭐",
};

// ─── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = { border: "1px solid #E8E8F0", borderRadius: 8, padding: "8px 12px", fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4, display: "block" };
const errStyle: React.CSSProperties = { fontSize: 12, color: "#EF4444", marginTop: 4 };
const row2Style: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 };
const addBtnStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1px dashed #635BFF", background: "#EEF2FF", color: "#635BFF", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all .15s" };
const headingStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #E8E8F0" };

function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) { e.target.style.borderColor = "#635BFF"; }
function onBlurField(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>, hasErr?: boolean) { e.target.style.borderColor = hasErr ? "#EF4444" : "#E8E8F0"; }

// ─── Pricing ────────────────────────────────────────────────────────────────────

interface ItemPricing {
  metalCost: number; mainStoneCost: number; meleeCost: number; mainStoneSettingCost: number;
  mainStoneSettingRate: number; addonsCost: number; totalCost: number;
  rawPrice: number; quotedPrice: number; finalPrice: number; suggestedRetail: number;
  breakdown: BlendedBreakdownLine[];
  mult: number | null; mColour: "green" | "orange" | "red" | null; costMap: Record<string, number>;
  activeMultiplier: number | null; handEngravingCost: number; laserEngravingCost: number;
  // Stone option prices (index matches stoneOptions array)
  stoneOptionPrices: number[];
  baseWithoutMainStone: number;
}

function computeItemPricing(
  item: BuilderItem,
  metalRates: MetalRate[],
  fixedCosts: FixedCost[],
  marginBrackets: MarginBracket[],
  isManager: boolean
): ItemPricing {
  let metalCost = 0;
  for (const m of item.metals) {
    const rate = metalRates.find(r => r.metal_type === m.type);
    if (rate) {
      const rawCost = (parseFloat(m.weight) || 0) * Number(rate.price_per_gram);
      if (marginConfig.length > 0) {
        const cat = getMetalCategory(m.type);
        const marginPct = marginConfig.find(c => c.category === cat)?.margin_percent ?? 45;
        metalCost += rawCost * (1 + marginPct / 100);
      } else {
        metalCost += rawCost;
      }
    }
  }

  const mainStoneSettingRate = Number(fixedCosts.find(fc => fc.key === "main_stone_setting")?.amount ?? 80);
  const stoneCount = item.includeMainStone && item.stoneOptions[0] ? (item.stoneOptions[0].stones?.length ?? 0) : 0;
  const mainStoneSettingCost = item.includeMainStone ? stoneCount * mainStoneSettingRate : 0;

  const stoneCatMarginPct = marginConfig.find(c => c.category === "gold_9ct")?.margin_percent ?? 45;
  const mainStoneCost = item.includeMainStone && isManager && item.stoneOptions[0]
    ? (item.stoneOptions[0].stones ?? []).reduce((s, st) => {
        const cost = parseFloat(st.cost) || 0;
        return s + (marginConfig.length > 0 ? cost * (1 + stoneCatMarginPct / 100) : cost);
      }, 0)
    : 0;

  const meleeCost = isManager
    ? item.meleeRows.reduce((s, r) => {
        const cost = (parseFloat(r.individualCost) || 0) * (parseInt(r.qty) || 0);
        return s + (marginConfig.length > 0 ? cost * (1 + stoneCatMarginPct / 100) : cost);
      }, 0)
    : 0;

  let addonsCost = mainStoneSettingCost;
  const costMap: Record<string, number> = {};
  if (mainStoneSettingCost > 0) costMap.mainStoneSetting = mainStoneSettingCost;

  for (const fc of fixedCosts) {
    if (fc.key === "labour") {
      const labourAmt = marginConfig.length > 0
        ? (marginConfig.find(c => c.category === "labour_standard")?.hourly_rate ?? Number(fc.amount))
        : Number(fc.amount);
      addonsCost += labourAmt; costMap.labour = labourAmt;
    }
  }

  if (item.smallSettings) {
    const sc = (parseInt(item.smallSettingsQty) || 0) * 30;
    addonsCost += sc; costMap.smallSettings = sc;
  }

  const componentsCost = item.components.reduce((s, c) => s + (parseFloat(c.cost) || 0), 0);
  addonsCost += componentsCost;
  if (componentsCost > 0) costMap.components = componentsCost;
  const handEngravingCost = item.handEngraving ? (parseFloat(item.handEngravingAmount) || 150) : 0;
  const laserEngravingCost = item.laserEngraving ? (parseFloat(item.laserEngravingAmount) || 80) : 0;
  if (handEngravingCost > 0) { addonsCost += handEngravingCost; costMap.handEngraving = handEngravingCost; }
  if (laserEngravingCost > 0) { addonsCost += laserEngravingCost; costMap.laserEngraving = laserEngravingCost; }

  const baseWithoutMainStone = metalCost + meleeCost + addonsCost - mainStoneSettingCost;
  const totalCost = metalCost + mainStoneCost + meleeCost + addonsCost;

  // Filter brackets by stone_type when the DB has stone_type rows; fall back to all brackets
  const primaryOrigin = item.includeMainStone
    ? (item.stoneOptions[0]?.stones[0]?.origin ?? "Natural")
    : "Natural";
  const stoneTypeKey = primaryOrigin === "Lab Grown" ? "lab_grown" : "natural";
  const hasStonetype = marginBrackets.some(b => b.stone_type != null);
  const activeBrackets = hasStonetype
    ? (() => {
        const filtered = marginBrackets.filter(b => b.stone_type === stoneTypeKey);
        return filtered.length > 0
          ? filtered
          : marginBrackets.filter(b => b.stone_type === "natural" || b.stone_type == null);
      })()
    : marginBrackets;
  const safeBrackets = activeBrackets.length > 0 ? activeBrackets : marginBrackets;

  const blended = calculateBlendedRetailFromBrackets(totalCost, safeBrackets);
  const suggestedRetail = blended.retail;
  const rawPrice = blended.unrounded;
  const breakdown = blended.breakdown;

  let quotedPrice: number;
  if (item.marginMultiplierOverride && parseFloat(item.marginMultiplierOverride) > 0) {
    quotedPrice = Math.ceil(totalCost * parseFloat(item.marginMultiplierOverride) / 5) * 5;
  } else {
    quotedPrice = suggestedRetail > 0 ? suggestedRetail : (totalCost > 0 ? Math.ceil(totalCost / 5) * 5 : 0);
  }

  const finalPrice = item.retailPriceOverride && parseFloat(item.retailPriceOverride) > 0
    ? parseFloat(item.retailPriceOverride)
    : quotedPrice;

  const activeMultiplier = item.marginMultiplierOverride && parseFloat(item.marginMultiplierOverride) > 0
    ? parseFloat(item.marginMultiplierOverride)
    : null;

  const mult = calculateMultiplier(finalPrice, totalCost);
  const mColour = mult != null ? multiplierColour(mult) : null;

  // Per stone option prices (only when multiple options)
  const stoneOptionPrices = item.stoneOptions.map((opt, oi) => {
    if (!item.includeMainStone) return finalPrice;
    const optStoneCost = isManager ? (opt.stones ?? []).reduce((s, st) => s + (parseFloat(st.cost) || 0), 0) : 0;
    const optSettingCost = (opt.stones?.length ?? 0) * mainStoneSettingRate;
    const optTotal = baseWithoutMainStone + optStoneCost + optSettingCost;
    const optSuggested = optTotal > 0 ? calculateRetailPrice(optTotal) : 0;
    const optBracket = safeBrackets.find(b => optTotal >= Number(b.cost_min) && (b.cost_max == null || optTotal <= Number(b.cost_max))) ?? safeBrackets[safeBrackets.length - 1];
    const optRaw = optBracket ? optTotal * Number(optBracket.multiplier) : optTotal;
    if (oi === 0 && item.retailPriceOverride && parseFloat(item.retailPriceOverride) > 0) return parseFloat(item.retailPriceOverride);
    if (item.marginMultiplierOverride && parseFloat(item.marginMultiplierOverride) > 0) {
      return Math.ceil(optTotal * parseFloat(item.marginMultiplierOverride) / 5) * 5;
    }
    return optSuggested > 0 ? Math.ceil(optSuggested / 5) * 5 : Math.ceil(optRaw / 5) * 5;
  });

  return {
    metalCost, mainStoneCost, meleeCost, mainStoneSettingCost, mainStoneSettingRate,
    addonsCost, totalCost, rawPrice, quotedPrice, finalPrice, suggestedRetail, breakdown,
    mult, mColour, costMap, activeMultiplier, handEngravingCost, laserEngravingCost,
    stoneOptionPrices, baseWithoutMainStone,
  };
}

// ─── ItemCard ──────────────────────────────────────────────────────────────────

interface ItemCardProps {
  item: BuilderItem;
  index: number;
  total: number;
  pricing: ItemPricing;
  metalRates: MetalRate[];
  fixedCosts: FixedCost[];
  isManager: boolean;
  setItems: React.Dispatch<React.SetStateAction<BuilderItem[]>>;
  onShowNivoda: (itemId: string, optId: string) => void;
  errors: Record<string, string>;
}

function ItemCard({ item, index, total, pricing, metalRates, fixedCosts, isManager, setItems, onShowNivoda, errors }: ItemCardProps) {
  const [activeOptIdx, setActiveOptIdx] = useState(0);

  function set<K extends keyof BuilderItem>(key: K, value: BuilderItem[K]) {
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, [key]: value } : it));
  }

  function Toggle({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => onChange(!on)}>
        <div style={{ width: 40, height: 22, borderRadius: 11, background: on ? "#635BFF" : "#D1D5DB", position: "relative", transition: "background .2s", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: 3, left: on ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
        </div>
        <span style={{ fontSize: 14, color: "#374151" }}>{children}</span>
      </div>
    );
  }

  const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, marginBottom: 0, overflow: "hidden" };
  const sectionStyle: React.CSSProperties = { padding: "16px 20px", borderBottom: "1px solid #E8E8F0" };

  const itemLabel = item.subcategory === "Other" ? item.subcategoryOther || "Other" : item.subcategory || item.itemType || `Item ${index + 1}`;

  return (
    <div style={{ border: "2px solid #E8E8F0", borderRadius: 14, marginBottom: 16, overflow: "hidden" }}>
      {/* Item header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#F9FAFB", borderBottom: item.collapsed ? "none" : "1px solid #E8E8F0", cursor: "pointer" }} onClick={() => set("collapsed", !item.collapsed)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 18, lineHeight: 1 }}>{item.itemType ? ITEM_ICONS[item.itemType as ItemType] : "📦"}</div>
          <div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E" }}>
              {total > 1 ? `Item ${index + 1}: ` : ""}{itemLabel}
            </span>
            {item.collapsed && pricing.finalPrice > 0 && (
              <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 700, color: "#635BFF" }}>${pricing.finalPrice.toLocaleString("en-AU")}</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {total > 1 && (
            <button
              onClick={e => { e.stopPropagation(); setItems(prev => prev.filter(it => it.id !== item.id)); }}
              style={{ border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#EF4444", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >Remove</button>
          )}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ transform: item.collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform .2s" }}><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>

      {!item.collapsed && (
        <>
          {/* Item Category */}
          <div style={sectionStyle}>
            <div style={headingStyle}>Item Category</div>
            <div style={{ marginBottom: item.itemType ? 16 : 0 }}>
              <label style={{ ...labelStyle, marginBottom: 10 }}>Item Type</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {ITEM_TYPES.map(t => {
                  const active = item.itemType === t;
                  return (
                    <button key={t} type="button"
                      onClick={() => { set("itemType", active ? "" : t); set("subcategory", ""); set("subcategoryOther", ""); }}
                      style={{ padding: "10px 4px", borderRadius: 10, border: `${active ? 2 : 1}px solid ${active ? "#635BFF" : "#E8E8F0"}`, background: active ? "#EEF2FF" : "#fff", cursor: "pointer", textAlign: "center", transition: "all .15s" }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: active ? "#635BFF" : "#374151" }}>{t}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            {item.itemType && item.itemType !== "Other" && (
              <div style={{ marginTop: 12 }}>
                <label style={{ ...labelStyle, marginBottom: 8 }}>Subcategory</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SUBCATEGORIES[item.itemType as ItemType].map(sc => {
                    const active = item.subcategory === sc;
                    return (
                      <button key={sc} type="button"
                        onClick={() => set("subcategory", active ? "" : sc)}
                        style={{ padding: "6px 14px", borderRadius: 8, border: `${active ? 2 : 1}px solid ${active ? "#635BFF" : "#E8E8F0"}`, background: active ? "#635BFF" : "#fff", color: active ? "#fff" : "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all .15s" }}
                      >{sc}</button>
                    );
                  })}
                </div>
              </div>
            )}
            {item.itemType === "Other" && (
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Describe Item Type</label>
                <input style={inputStyle} type="text" value={item.subcategoryOther} onChange={e => set("subcategoryOther", e.target.value)} onFocus={onFocus} onBlur={onBlurField} placeholder="e.g. Brooch, Cufflinks…" />
              </div>
            )}
          </div>

          {/* Design */}
          <div style={sectionStyle}>
            <div style={headingStyle}>Design</div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Design Description</label>
              <input style={inputStyle} type="text" value={item.design} onChange={e => set("design", e.target.value)} onFocus={onFocus} onBlur={onBlurField} placeholder="e.g. Stella Trilogy with split shank" />
            </div>
            <div className="qb-row2">
              <div>
                <label style={labelStyle}>Finger Size</label>
                <input style={inputStyle} type="text" value={item.fingerSize} onChange={e => set("fingerSize", e.target.value)} onFocus={onFocus} onBlur={onBlurField} placeholder="e.g. N, O½, 7" />
              </div>
              <div>
                <label style={labelStyle}>SKU</label>
                <input style={inputStyle} type="text" value={item.stockSku} onChange={e => set("stockSku", e.target.value)} onFocus={onFocus} onBlur={onBlurField} placeholder="if based off a product" />
              </div>
            </div>
          </div>

          {/* Metal Selection */}
          <div style={sectionStyle}>
            <div style={headingStyle}>Metal Selection</div>
            {item.metals.map((m, idx) => {
              const rate = metalRates.find(r => r.metal_type === m.type);
              const metalCost = rate ? (parseFloat(m.weight) || 0) * rate.price_per_gram : 0;
              return (
                <div key={m.id} style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Metal {idx + 1}</span>
                    {item.metals.length > 1 && (
                      <button onClick={() => set("metals", item.metals.filter(x => x.id !== m.id))} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#9CA3AF" }}>×</button>
                    )}
                  </div>
                  <div className="qb-row2">
                    <div>
                      <label style={labelStyle}>Metal Type</label>
                      <select style={{ ...inputStyle, cursor: "pointer" }} value={m.type} onChange={e => set("metals", item.metals.map(x => x.id === m.id ? { ...x, type: e.target.value } : x))} onFocus={onFocus} onBlur={onBlurField}>
                        <option value="">Select metal…</option>
                        {metalRates.map(r => <option key={r.id} value={r.metal_type}>{r.metal_type}</option>)}
                      </select>
                      {isManager && m.type && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>Rate: ${Number(rate?.price_per_gram ?? 0).toFixed(2)}/g</div>}
                    </div>
                    <div>
                      <label style={labelStyle}>Weight (grams)</label>
                      <input style={inputStyle} type="number" step="any" min="0" value={m.weight} onChange={e => set("metals", item.metals.map(x => x.id === m.id ? { ...x, weight: e.target.value } : x))} onFocus={onFocus} onBlur={onBlurField} placeholder="e.g. 5.5" />
                      {isManager && m.weight && m.type && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>Metal cost: ${Number(metalCost).toFixed(2)}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
            {item.metals.length < 2 && (
              <button onClick={() => set("metals", [...item.metals, newMetal()])} style={addBtnStyle} onMouseEnter={e => (e.currentTarget.style.background = "#E0E7FF")} onMouseLeave={e => (e.currentTarget.style.background = "#EEF2FF")}>+ Add Second Metal</button>
            )}
          </div>

          {/* Main Stones */}
          <div style={sectionStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...headingStyle, marginBottom: 0, paddingBottom: 0, borderBottom: "none" }}>
              <span>Main Stone</span>
              <button onClick={() => { setActiveOptIdx(0); onShowNivoda(item.id, item.stoneOptions[0]?.id ?? ""); }} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #635BFF", background: "#EEF2FF", color: "#635BFF", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Browse Stones</button>
            </div>
            <div style={{ borderBottom: "1px solid #E8E8F0", marginBottom: 14, marginTop: 8 }} />
            <div style={{ marginBottom: item.includeMainStone ? 12 : 0 }}>
              <Toggle on={item.includeMainStone} onChange={v => set("includeMainStone", v)}>Include Main Stone</Toggle>
            </div>

            {item.includeMainStone && (
              <div style={{ marginTop: 12 }}>
                {item.stoneOptions.map((opt, optIdx) => (
                  <div key={opt.id} style={{ marginBottom: 16, padding: "14px 14px 12px", borderRadius: 10, border: "1px solid #E8E8F0", background: "#FAFAFA" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          style={{ ...inputStyle, width: 120, padding: "4px 8px", fontSize: 13 }}
                          type="text"
                          value={opt.label}
                          onChange={e => set("stoneOptions", item.stoneOptions.map(o => o.id === opt.id ? { ...o, label: e.target.value } : o))}
                          onFocus={onFocus} onBlur={onBlurField}
                        />
                        {item.stoneOptions.length > 1 && isManager && pricing.stoneOptionPrices[optIdx] > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#635BFF" }}>${pricing.stoneOptionPrices[optIdx].toLocaleString("en-AU")}</span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button onClick={() => { setActiveOptIdx(optIdx); onShowNivoda(item.id, opt.id); }} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #635BFF", background: "#EEF2FF", color: "#635BFF", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Browse Stones</button>
                        {item.stoneOptions.length > 1 && (
                          <button onClick={() => set("stoneOptions", item.stoneOptions.filter(o => o.id !== opt.id))} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#9CA3AF" }}>×</button>
                        )}
                      </div>
                    </div>

                    {opt.stones.map((stone, si) => (
                      <div key={stone.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: opt.stones.length > 1 && si < opt.stones.length - 1 ? "1px dashed #E8E8F0" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>Stone {opt.stones.length > 1 ? si + 1 : ""}</span>
                          {opt.stones.length > 1 && (
                            <button onClick={() => set("stoneOptions", item.stoneOptions.map(o => o.id === opt.id ? { ...o, stones: o.stones.filter(s => s.id !== stone.id) } : o))} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, color: "#9CA3AF" }}>×</button>
                          )}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div>
                            <label style={labelStyle}>Carat Weight</label>
                            <input style={inputStyle} type="number" step="0.01" min="0" value={stone.caratWeight} onChange={e => set("stoneOptions", item.stoneOptions.map(o => o.id === opt.id ? { ...o, stones: o.stones.map(s => s.id === stone.id ? { ...s, caratWeight: e.target.value } : s) } : o))} onFocus={onFocus} onBlur={onBlurField} placeholder="0.00ct" />
                          </div>
                          <div>
                            <label style={labelStyle}>Shape</label>
                            <input style={inputStyle} type="text" value={stone.shape} onChange={e => set("stoneOptions", item.stoneOptions.map(o => o.id === opt.id ? { ...o, stones: o.stones.map(s => s.id === stone.id ? { ...s, shape: e.target.value } : s) } : o))} onFocus={onFocus} onBlur={onBlurField} placeholder="Round Brilliant" />
                          </div>
                          <div>
                            <label style={labelStyle}>Colour</label>
                            <input style={inputStyle} type="text" value={stone.colour} onChange={e => set("stoneOptions", item.stoneOptions.map(o => o.id === opt.id ? { ...o, stones: o.stones.map(s => s.id === stone.id ? { ...s, colour: e.target.value } : s) } : o))} onFocus={onFocus} onBlur={onBlurField} placeholder="F, G, H" />
                          </div>
                          <div>
                            <label style={labelStyle}>Clarity</label>
                            <input style={inputStyle} type="text" value={stone.clarity} onChange={e => set("stoneOptions", item.stoneOptions.map(o => o.id === opt.id ? { ...o, stones: o.stones.map(s => s.id === stone.id ? { ...s, clarity: e.target.value } : s) } : o))} onFocus={onFocus} onBlur={onBlurField} placeholder="VS1, VS2, SI1" />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid #E8E8F0", width: "fit-content", marginBottom: isManager ? 8 : 0 }}>
                          {(["Lab Grown", "Natural"] as const).map(o => (
                            <button key={o} onClick={() => set("stoneOptions", item.stoneOptions.map(opt2 => opt2.id === opt.id ? { ...opt2, stones: opt2.stones.map(s => s.id === stone.id ? { ...s, origin: o } : s) } : opt2))}
                              style={{ padding: "5px 14px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, background: stone.origin === o ? "#635BFF" : "#fff", color: stone.origin === o ? "#fff" : "#635BFF", transition: "all .15s" }}
                            >{o}</button>
                          ))}
                        </div>
                        {isManager && (
                          <div style={{ marginTop: 4 }}>
                            <label style={{ ...labelStyle, color: "#635BFF" }}>Cost Price ($)</label>
                            <input style={{ ...inputStyle, width: 130, borderColor: "#C4BFFE" }} type="number" min="0" step="0.01" value={stone.cost} onChange={e => set("stoneOptions", item.stoneOptions.map(o => o.id === opt.id ? { ...o, stones: o.stones.map(s => s.id === stone.id ? { ...s, cost: e.target.value } : s) } : o))} onFocus={onFocus} onBlur={onBlurField} placeholder="$0.00" />
                          </div>
                        )}
                      </div>
                    ))}

                    <button onClick={() => set("stoneOptions", item.stoneOptions.map(o => o.id === opt.id ? { ...o, stones: [...o.stones, newStone()] } : o))} style={{ ...addBtnStyle, fontSize: 12, padding: "5px 12px" }} onMouseEnter={e => (e.currentTarget.style.background = "#E0E7FF")} onMouseLeave={e => (e.currentTarget.style.background = "#EEF2FF")}>+ Add Stone</button>
                  </div>
                ))}

                <button
                  onClick={() => set("stoneOptions", [...item.stoneOptions, newStoneOption(item.stoneOptions.length)])}
                  style={{ ...addBtnStyle, border: "1px dashed #10B981", background: "#ECFDF5", color: "#10B981" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#D1FAE5")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#ECFDF5")}
                >+ Add Stone Option</button>
              </div>
            )}
          </div>

          {/* Melee Stones */}
          <div style={sectionStyle}>
            <div style={headingStyle}>Melee / Small Stones</div>
            {item.meleeRows.map((r, idx) => {
              const rowTotal = isManager ? (parseFloat(r.individualCost) || 0) * (parseInt(r.qty) || 0) : 0;
              return (
                <div key={r.id} style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Row {idx + 1}</span>
                    <button onClick={() => set("meleeRows", item.meleeRows.filter(x => x.id !== r.id))} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#9CA3AF" }}>×</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div><label style={labelStyle}>Stone Shape</label><input style={inputStyle} type="text" value={r.stoneType} onChange={e => set("meleeRows", item.meleeRows.map(x => x.id === r.id ? { ...x, stoneType: e.target.value } : x))} onFocus={onFocus} onBlur={onBlurField} placeholder="Round Brilliant Diamond" /></div>
                    <div><label style={labelStyle}>Quality</label><input style={inputStyle} type="text" value={r.quality} onChange={e => set("meleeRows", item.meleeRows.map(x => x.id === r.id ? { ...x, quality: e.target.value } : x))} onFocus={onFocus} onBlur={onBlurField} placeholder="G/VS" /></div>
                    <div><label style={labelStyle}>Shape</label><input style={inputStyle} type="text" value={r.shape} onChange={e => set("meleeRows", item.meleeRows.map(x => x.id === r.id ? { ...x, shape: e.target.value } : x))} onFocus={onFocus} onBlur={onBlurField} placeholder="Round" /></div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Location</label>
                    <input style={inputStyle} type="text" value={r.location} onChange={e => set("meleeRows", item.meleeRows.map(x => x.id === r.id ? { ...x, location: e.target.value } : x))} onFocus={onFocus} onBlur={onBlurField} placeholder="e.g. hidden halo, halo, diamond band, band" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isManager ? "1fr 1fr 1fr" : "1fr 1fr", gap: 10 }}>
                    <div><label style={labelStyle}>Carat / Stone</label><input style={inputStyle} type="number" step="0.001" min="0" value={r.caratWeight} onChange={e => set("meleeRows", item.meleeRows.map(x => x.id === r.id ? { ...x, caratWeight: e.target.value } : x))} onFocus={onFocus} onBlur={onBlurField} placeholder="0.05ct" /></div>
                    {isManager && <div><label style={{ ...labelStyle, color: "#635BFF" }}>Cost / Stone ($)</label><input style={{ ...inputStyle, borderColor: "#C4BFFE" }} type="number" step="0.01" min="0" value={r.individualCost} onChange={e => set("meleeRows", item.meleeRows.map(x => x.id === r.id ? { ...x, individualCost: e.target.value } : x))} onFocus={onFocus} onBlur={onBlurField} placeholder="0.00" /></div>}
                    <div><label style={labelStyle}>Qty</label><input style={inputStyle} type="number" step="1" min="1" value={r.qty} onChange={e => set("meleeRows", item.meleeRows.map(x => x.id === r.id ? { ...x, qty: e.target.value } : x))} onFocus={onFocus} onBlur={onBlurField} /></div>
                  </div>
                  {isManager && rowTotal > 0 && <div style={{ marginTop: 6, fontSize: 12, color: "#6B7280", textAlign: "right" }}>Row total: <strong style={{ color: "#1A1A2E" }}>${Number(rowTotal).toFixed(2)}</strong></div>}
                </div>
              );
            })}
            <button onClick={() => set("meleeRows", [...item.meleeRows, newMelee()])} style={addBtnStyle} onMouseEnter={e => (e.currentTarget.style.background = "#E0E7FF")} onMouseLeave={e => (e.currentTarget.style.background = "#EEF2FF")}>+ Add Melee Row</button>
          </div>

          {/* Add-ons */}
          <div style={sectionStyle}>
            <div style={headingStyle}>Add-ons & Labour</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #E8E8F0" }}>
                <span style={{ fontSize: 14, color: "#374151", fontWeight: 500 }}>Labour</span>
                {isManager && <span style={{ fontSize: 13, color: "#6B7280" }}>${Number(fixedCosts.find(fc => fc.key === "labour")?.amount ?? 300).toFixed(2)}</span>}
              </div>
              {isManager && item.includeMainStone && pricing.mainStoneSettingCost > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #E8E8F0" }}>
                  <span style={{ fontSize: 14, color: "#374151" }}>Stone Settings (auto)</span>
                  <span style={{ fontSize: 13, color: "#6B7280" }}>{item.stoneOptions[0]?.stones.length ?? 0} × ${Number(pricing.mainStoneSettingRate).toFixed(2)} = ${Number(pricing.mainStoneSettingCost).toFixed(2)}</span>
                </div>
              )}
              <div>
                <Toggle on={item.smallSettings} onChange={v => set("smallSettings", v)}>Small Stone Settings</Toggle>
                {item.smallSettings && <div style={{ marginTop: 8, paddingLeft: 50, display: "flex", alignItems: "center", gap: 8 }}><label style={{ ...labelStyle, marginBottom: 0 }}>Qty</label><input style={{ ...inputStyle, width: 80 }} type="number" min="1" value={item.smallSettingsQty} onChange={e => set("smallSettingsQty", e.target.value)} />{isManager && <span style={{ fontSize: 12, color: "#6B7280" }}>= ${Number((parseInt(item.smallSettingsQty) || 0) * 30).toFixed(2)}</span>}</div>}
              </div>

              {/* Freeform components */}
              {item.components.map((comp, ci) => (
                <div key={comp.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
                  <input
                    style={inputStyle} type="text" value={comp.name}
                    onChange={e => set("components", item.components.map(x => x.id === comp.id ? { ...x, name: e.target.value } : x))}
                    onFocus={onFocus} onBlur={onBlurField} placeholder="Component name…"
                  />
                  <input
                    style={{ ...inputStyle, width: 90, textAlign: "right" }} type="number" min="0" step="0.01" value={comp.cost}
                    onChange={e => set("components", item.components.map(x => x.id === comp.id ? { ...x, cost: e.target.value } : x))}
                    onFocus={onFocus} onBlur={onBlurField} placeholder="0.00"
                  />
                  <button onClick={() => set("components", item.components.filter(x => x.id !== comp.id))} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#9CA3AF", lineHeight: 1, padding: "0 4px" }}>×</button>
                </div>
              ))}
              <button
                onClick={() => set("components", [...item.components, { id: uid(), name: "", cost: "" }])}
                style={{ ...addBtnStyle, fontSize: 13 }}
                onMouseEnter={e => (e.currentTarget.style.background = "#E0E7FF")}
                onMouseLeave={e => (e.currentTarget.style.background = "#EEF2FF")}
              >+ Add Component</button>

              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}><input type="checkbox" checked={item.handEngraving} onChange={e => set("handEngraving", e.target.checked)} style={{ accentColor: "#635BFF", width: 16, height: 16 }} /><span style={{ fontSize: 14, color: "#374151" }}>Hand Engraving</span></div>
                {isManager && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 12, color: "#9CA3AF" }}>$</span><input type="number" min="0" step="1" value={item.handEngravingAmount} onChange={e => set("handEngravingAmount", e.target.value)} onClick={e => e.stopPropagation()} style={{ ...inputStyle, width: 72, padding: "4px 8px", fontSize: 13 }} /></div>}
              </label>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}><input type="checkbox" checked={item.laserEngraving} onChange={e => set("laserEngraving", e.target.checked)} style={{ accentColor: "#635BFF", width: 16, height: 16 }} /><span style={{ fontSize: 14, color: "#374151" }}>Laser Engraving</span></div>
                {isManager && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 12, color: "#9CA3AF" }}>$</span><input type="number" min="0" step="1" value={item.laserEngravingAmount} onChange={e => set("laserEngravingAmount", e.target.value)} onClick={e => e.stopPropagation()} style={{ ...inputStyle, width: 72, padding: "4px 8px", fontSize: 13 }} /></div>}
              </label>
            </div>
          </div>

          {/* AI Description */}
          <div style={sectionStyle}>
            <div style={{ ...headingStyle, marginBottom: 0, paddingBottom: 0, borderBottom: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Quote Description</span>
              <button
                onClick={async () => {
                  set("aiGenerating", true);
                  try {
                    const res = await fetch("/api/quotes/generate-description", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        itemType: item.itemType,
                        subcategory: item.subcategory === "Other" ? item.subcategoryOther : item.subcategory,
                        design: item.design,
                        metals: item.metals.filter(m => m.type),
                        mainStones: item.includeMainStone ? (item.stoneOptions[0]?.stones ?? []) : [],
                        stoneOptions: item.includeMainStone && item.stoneOptions.length > 1
                          ? item.stoneOptions.map(opt => ({ label: opt.label, stones: opt.stones }))
                          : null,
                        meleeStones: item.meleeRows.filter(m => m.stoneType),
                        engraving: { hand: item.handEngraving, laser: item.laserEngraving },
                        fingerSize: item.fingerSize || null,
                        stockSku: item.stockSku || null,
                      }),
                    });
                    const json = await res.json();
                    if (json.description) set("aiDesc", json.description);
                  } catch { /* noop */ } finally {
                    set("aiGenerating", false);
                  }
                }}
                disabled={item.aiGenerating}
                style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #635BFF", background: "#EEF2FF", color: "#635BFF", fontSize: 12, fontWeight: 600, cursor: item.aiGenerating ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                {item.aiGenerating ? <><span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #635BFF", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />Generating…</> : "Generate"}
              </button>
            </div>
            <div style={{ borderBottom: "1px solid #E8E8F0", marginBottom: 12, marginTop: 8 }} />
            <label style={{ ...labelStyle, fontSize: 12, color: "#9CA3AF", fontWeight: 400 }}>AI Generated — editable</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical", lineHeight: 1.6 }} value={item.aiDesc} onChange={e => set("aiDesc", e.target.value)} onFocus={onFocus} onBlur={onBlurField} placeholder="Fill in fields above and the AI will generate a description automatically…" />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>

          {/* Manager: Price Override */}
          {isManager && (
            <div style={{ padding: "16px 20px" }}>
              <div style={headingStyle}>Price Override</div>
              <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 13 }}>
                <div style={{ fontWeight: 600, color: "#374151", marginBottom: 10 }}>Cost Breakdown</div>
                {item.metals.filter(m => m.type).map((m, idx) => {
                  const rate = metalRates.find(r => r.metal_type === m.type);
                  const cost = rate ? (parseFloat(m.weight) || 0) * Number(rate.price_per_gram) : 0;
                  return <div key={m.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ color: "#6B7280" }}>Metal {idx + 1}: {m.type} — {m.weight || "0"}g × ${Number(rate?.price_per_gram ?? 0).toFixed(2)}/g</span><span style={{ fontWeight: 500 }}>${Number(cost).toFixed(2)}</span></div>;
                })}
                {item.includeMainStone && item.stoneOptions[0]?.stones.map((s, idx) => {
                  const cost = parseFloat(s.cost) || 0;
                  const parts = [s.caratWeight && `${s.caratWeight}ct`, s.shape, (s.colour || s.clarity) && `${s.colour}/${s.clarity}`, s.origin].filter(Boolean).join(" ");
                  return <div key={s.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ color: "#6B7280" }}>Stone {idx + 1}: {parts || "—"}</span><span style={{ fontWeight: 500 }}>${Number(cost).toFixed(2)}</span></div>;
                })}
                {item.includeMainStone && (item.stoneOptions[0]?.stones.length ?? 0) > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ color: "#6B7280" }}>Stone Settings: {item.stoneOptions[0]?.stones.length} × ${Number(pricing.mainStoneSettingRate).toFixed(2)}</span><span style={{ fontWeight: 500 }}>${Number(pricing.mainStoneSettingCost).toFixed(2)}</span></div>}
                {item.meleeRows.filter(r => r.stoneType).map((r, idx) => {
                  const t = (parseFloat(r.individualCost) || 0) * (parseInt(r.qty) || 0);
                  return <div key={r.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ color: "#6B7280" }}>Melee {idx + 1}: {r.qty || 1}× {r.stoneType}</span><span style={{ fontWeight: 500 }}>${Number(t).toFixed(2)}</span></div>;
                })}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ color: "#6B7280" }}>Labour</span><span style={{ fontWeight: 500 }}>${Number(pricing.costMap.labour ?? 0).toFixed(2)}</span></div>
                {item.smallSettings && (parseInt(item.smallSettingsQty) || 0) > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ color: "#6B7280" }}>Melee Settings: {item.smallSettingsQty} × $30.00</span><span style={{ fontWeight: 500 }}>${Number(pricing.costMap.smallSettings ?? 0).toFixed(2)}</span></div>}
                {item.components.filter(c => c.name).map(c => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ color: "#6B7280" }}>{c.name}</span><span style={{ fontWeight: 500 }}>${Number(parseFloat(c.cost) || 0).toFixed(2)}</span></div>
                ))}
                {item.handEngraving && pricing.handEngravingCost > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ color: "#6B7280" }}>Hand Engraving</span><span style={{ fontWeight: 500 }}>${Number(pricing.handEngravingCost).toFixed(2)}</span></div>}
                {item.laserEngraving && pricing.laserEngravingCost > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ color: "#6B7280" }}>Laser Engraving</span><span style={{ fontWeight: 500 }}>${Number(pricing.laserEngravingCost).toFixed(2)}</span></div>}
                <div style={{ borderTop: "1px solid #D1D5DB", margin: "8px 0", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600, color: "#374151" }}>Subtotal</span>
                  <span style={{ fontWeight: 700, color: "#374151" }}>${Number(pricing.totalCost).toFixed(2)}</span>
                </div>
                {item.marginMultiplierOverride && parseFloat(item.marginMultiplierOverride) > 0 ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ color: "#6B7280" }}>Override multiplier</span>
                      <span style={{ fontWeight: 500, color: "#D97706" }}>×{Number(pricing.activeMultiplier ?? 0).toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ color: "#6B7280" }}>Pre-rounding</span>
                      <span style={{ fontWeight: 500 }}>${Number(pricing.totalCost * parseFloat(item.marginMultiplierOverride)).toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ color: "#6B7280", fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 6 }}>Margin calculation (blended)</div>
                    {pricing.breakdown.map((line, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ color: "#9CA3AF", fontSize: 12 }}>{line.label} × {Number(line.multiplier).toFixed(2)}</span>
                        <span style={{ color: "#374151", fontSize: 12 }}>${Number(line.subtotal).toFixed(2)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, marginTop: 4 }}>
                      <span style={{ color: "#6B7280", fontSize: 12 }}>Subtotal (unrounded)</span>
                      <span style={{ fontWeight: 500, fontSize: 12 }}>${Number(pricing.rawPrice).toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div style={{ borderTop: "1px solid #D1D5DB", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 700, color: "#1A1A2E", fontSize: 14 }}>Final Price <span style={{ fontWeight: 400, color: "#9CA3AF", fontSize: 11 }}>(rounded to nearest $5)</span></span>
                  <span style={{ fontWeight: 800, color: "#635BFF", fontSize: 14 }}>${pricing.finalPrice.toLocaleString("en-AU")}</span>
                </div>
                {item.stoneOptions.length > 1 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #D1D5DB" }}>
                    <div style={{ fontWeight: 600, color: "#374151", marginBottom: 6, fontSize: 12 }}>Stone Option Prices</div>
                    {item.stoneOptions.map((opt, oi) => (
                      <div key={opt.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#6B7280", fontSize: 12 }}>{opt.label}</span>
                        <span style={{ fontWeight: 600, color: "#635BFF", fontSize: 12 }}>${pricing.stoneOptionPrices[oi]?.toLocaleString("en-AU") ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="qb-row2">
                <div>
                  <label style={{ ...labelStyle, color: "#D97706" }}>Retail Price Override ($)</label>
                  <input style={{ ...inputStyle, borderColor: item.retailPriceOverride ? "#D97706" : "#E8E8F0" }} type="number" min="0" step="50" value={item.retailPriceOverride} onChange={e => set("retailPriceOverride", e.target.value)} onFocus={onFocus} onBlur={onBlurField} placeholder="Leave blank to use calculated" />
                </div>
                <div>
                  <label style={{ ...labelStyle, color: "#D97706" }}>Margin Multiplier Override</label>
                  <input style={{ ...inputStyle, borderColor: item.marginMultiplierOverride ? "#D97706" : "#E8E8F0" }} type="number" min="1" step="0.05" value={item.marginMultiplierOverride} onChange={e => set("marginMultiplierOverride", e.target.value)} onFocus={onFocus} onBlur={onBlurField} placeholder="e.g. 2.50" />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

function QuoteBuilderPageInner() {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isManager = canManage(user?.role);

  // Append-to-existing-quote mode
  const [appendToQuoteId, setAppendToQuoteId] = useState<string | null>(null);
  const [appendToQuoteRef, setAppendToQuoteRef] = useState<string | null>(null);
  const [existingQbd, setExistingQbd] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "quotes")) router.replace("/");
  }, [user, hydrated, router]);

  // Load existing quote if quote_id param is present (append-item mode)
  useEffect(() => {
    const quoteId = searchParams.get("quote_id");
    if (!quoteId || !hydrated) return;
    fetch(`/api/quotes/${quoteId}`, { headers: { "x-tenant-id": user?.tenantId ?? "" } })
      .then(r => r.json())
      .then(json => {
        if (!json.quote) return;
        const q = json.quote;
        setAppendToQuoteId(q.id);
        setAppendToQuoteRef(q.reference_number);
        // Pre-fill customer from existing quote
        setFirstName(q.customer_first_name ?? "");
        setLastName(q.customer_last_name ?? "");
        setEmail(q.customer_email ?? "");
        setPhone(q.customer_phone ?? "");
        if (q.customer_first_name) setCustomerSearch(`${q.customer_first_name ?? ""} ${q.customer_last_name ?? ""}`.trim());
        // Store existing builder data so we can append to it
        if (q.quote_builder_data && typeof q.quote_builder_data === "object") {
          const qbd = q.quote_builder_data as Record<string, unknown>;
          setExistingQbd(qbd);
          // Restore any charm items already on the quote
          if (Array.isArray(qbd.charm_items)) {
            setCharmItems(qbd.charm_items as CharmLineItem[]);
          }
        }
      })
      .catch(() => {});
  }, [searchParams, hydrated, user?.tenantId]);

  // Pricing data
  const [metalRates, setMetalRates] = useState<MetalRate[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [marginBrackets, setMarginBrackets] = useState<MarginBracket[]>([]);
  const [marginConfig, setMarginConfig] = useState<MarginConfig[]>([]);

  // Customer
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [vipTier, setVipTier] = useState<{ tier_name: string; colour: string } | null>(null);

  // Notes (customer-visible, shown on PDF)
  const [notes, setNotes] = useState("");

  // Items
  const [items, setItems] = useState<BuilderItem[]>([newItem(0)]);

  // Charm necklace builder
  const [featureConfigurableProducts, setFeatureConfigurableProducts] = useState(false);
  const [showCharmBuilder, setShowCharmBuilder] = useState<"necklace" | "bracelet" | null>(null);
  const [charmItems, setCharmItems] = useState<CharmLineItem[]>([]);

  // Nivoda
  const [showNivodaModal, setShowNivodaModal] = useState(false);
  const nivodaTargetItemId = useRef<string | null>(null);
  const nivodaTargetOptId  = useRef<string | null>(null);

  // UI
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ── Load pricing data ──────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/pricing", { headers: { "x-tenant-id": user?.tenantId ?? "" } })
      .then(r => r.json())
      .then(json => {
        const METAL_ORDER = ["9ct Yellow Gold", "9ct White Gold", "9ct Rose Gold", "18ct Yellow Gold", "18ct White Gold", "18ct Rose Gold", "Platinum", "Silver"];
        const sortedMetals = (json.metalRates ?? [] as MetalRate[]).slice().sort((a: MetalRate, b: MetalRate) => {
          const ai = METAL_ORDER.indexOf(a.metal_type); const bi = METAL_ORDER.indexOf(b.metal_type);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1; if (bi !== -1) return 1;
          return a.metal_type.localeCompare(b.metal_type);
        });
        setMetalRates(sortedMetals);
        setFixedCosts(json.fixedCosts ?? []);
        setMarginBrackets(json.marginBrackets ?? []);
      })
      .catch(() => {});
  }, [user?.tenantId]);

  // ── Tenant features ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.tenantId) return;
    fetch("/api/pricing-hub/tenant-features", { headers: { "x-tenant-id": user.tenantId } })
      .then(r => r.json())
      .then(json => { if (json.feature_configurable_products) setFeatureConfigurableProducts(true); })
      .catch(() => {});
  }, [user?.tenantId]);

  // ── Customer search ────────────────────────────────────────────────────────

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (customerSearch.length < 2) { setCustomerResults([]); setShowDropdown(false); return; }
    searchTimer.current = setTimeout(() => {
      fetch(`/api/customers/search?q=${encodeURIComponent(customerSearch)}`, { headers: { "x-tenant-id": user?.tenantId ?? "" } })
        .then(r => r.json())
        .then(json => { setCustomerResults(json.results ?? []); setShowDropdown((json.results ?? []).length > 0); })
        .catch(() => {});
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [customerSearch, user?.tenantId]);

  function selectCustomer(c: CustomerResult) {
    setFirstName(c.first_name ?? ""); setLastName(c.last_name ?? ""); setEmail(c.email ?? ""); setPhone(c.phone ?? "");
    setCustomerSearch(`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()); setShowDropdown(false);
  }

  // ── VIP tier lookup ────────────────────────────────────────────────────────

  const tierTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (tierTimer.current) clearTimeout(tierTimer.current);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setVipTier(null); return; }
    tierTimer.current = setTimeout(() => {
      fetch(`/api/vip-tier/customer?emails=${encodeURIComponent(trimmed)}`, {
        headers: { "x-tenant-id": user?.tenantId ?? "" }
      })
        .then(r => r.json())
        .then(j => { setVipTier(j.results?.[trimmed] ?? null); })
        .catch(() => {});
    }, 400);
    return () => { if (tierTimer.current) clearTimeout(tierTimer.current); };
  }, [email, user?.tenantId]);

  // ── Pricing ────────────────────────────────────────────────────────────────

  const allPricings = useMemo(() =>
    items.map(item => computeItemPricing(item, metalRates, fixedCosts, marginBrackets, isManager)),
    [items, metalRates, fixedCosts, marginBrackets, isManager]
  );

  const charmTotal = useMemo(() => charmItems.reduce((sum, c) => sum + Number(c.retail_price), 0), [charmItems]);
  const grandTotal = useMemo(() => allPricings.reduce((sum, p) => sum + p.finalPrice, 0) + charmTotal, [allPricings, charmTotal]);

  // ── Nivoda stone selection ─────────────────────────────────────────────────

  const handleSelectNivodaStone = useCallback((stone: NivodaStone) => {
    const formatted: StoneEntry = {
      id: uid(),
      caratWeight: String(stone.carats),
      shape: stone.shape ? stone.shape.charAt(0) + stone.shape.slice(1).toLowerCase() : "",
      colour: stone.color,
      clarity: stone.clarity,
      origin: stone.labgrown ? "Lab Grown" : "Natural",
      cost: stone.price > 0 ? String(Math.round(stone.price / 100)) : "",
      nivodaId: stone.id,
    };
    const targetId    = nivodaTargetItemId.current;
    const targetOptId = nivodaTargetOptId.current;
    setItems(prev => prev.map(it => it.id !== targetId ? it : {
      ...it,
      includeMainStone: true,
      stoneOptions: it.stoneOptions.map(opt =>
        opt.id !== targetOptId ? opt : { ...opt, stones: [formatted] }
      ),
    }));
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = "First name is required";
    if (!lastName.trim()) errs.lastName = "Last name is required";
    if (!email.trim() && !phone.trim()) errs.contact = "At least one of email or phone is required";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const builderItemsData = items.map((item, idx) => {
        const p = allPricings[idx];
        const effectiveSub = item.subcategory === "Other" ? item.subcategoryOther : item.subcategory;
        return {
          item_type: item.itemType || null,
          subcategory: effectiveSub || null,
          design: item.design || null,
          metals: item.metals.filter(m => m.type).map(m => {
            const rate = metalRates.find(r => r.metal_type === m.type);
            return { type: m.type, weight: parseFloat(m.weight) || 0, cost: rate ? (parseFloat(m.weight) || 0) * rate.price_per_gram : 0 };
          }),
          include_main_stone: item.includeMainStone,
          stone_options: item.includeMainStone ? item.stoneOptions.map((opt, oi) => ({
            id: opt.id,
            label: opt.label,
            stones: (opt.stones ?? []).map(s => ({
              carat_weight: parseFloat(s.caratWeight) || null,
              shape: s.shape || null,
              colour: s.colour || null,
              clarity: s.clarity || null,
              origin: s.origin,
              cost: isManager ? (parseFloat(s.cost) || 0) : 0,
            })),
            quoted_price: p.stoneOptionPrices[oi] ?? p.finalPrice,
          })) : [],
          melee_stones: item.meleeRows.length > 0 ? item.meleeRows.map(r => ({
            stone_type: r.stoneType || null,
            quality: r.quality || null,
            shape: r.shape || null,
            carat_weight: parseFloat(r.caratWeight) || null,
            individual_cost: isManager ? (parseFloat(r.individualCost) || 0) : 0,
            qty: parseInt(r.qty) || 0,
            row_total: isManager ? (parseFloat(r.individualCost) || 0) * (parseInt(r.qty) || 0) : 0,
          })) : null,
          addons: {
            labour: fixedCosts.find(fc => fc.key === "labour")?.amount ?? 300,
            small_settings_qty: item.smallSettings ? (parseInt(item.smallSettingsQty) || 0) : 0,
            small_settings_cost: p.costMap.smallSettings ?? 0,
            hand_engraving: item.handEngraving,
            hand_engraving_cost: p.handEngravingCost,
            laser_engraving: item.laserEngraving,
            laser_engraving_cost: p.laserEngravingCost,
            components: item.components.filter(c => c.name).map(c => ({ name: c.name, cost: parseFloat(c.cost) || 0 })),
          },
          ai_description: item.aiDesc || null,
          finger_size: item.fingerSize || null,
          stock_sku: item.stockSku || null,
          total_cost: p.totalCost,
          quoted_price: p.finalPrice,
          multiplier: p.activeMultiplier,
        };
      });

      const qbd = {
        version: 2,
        builder_items: builderItemsData,
        charm_items: charmItems.length > 0 ? charmItems : undefined,
        total_quoted_price: grandTotal,
      };

      const primaryItem = items[0];
      const primaryPricing = allPricings[0];
      const effectiveSub = primaryItem.subcategory === "Other" ? primaryItem.subcategoryOther : primaryItem.subcategory;

      let res: Response;
      let json: { error?: string; quote?: { id: string } };

      if (appendToQuoteId) {
        // ── Append item to existing quote ─────────────────────────────────
        const existingItems = (existingQbd && Array.isArray(existingQbd.builder_items))
          ? (existingQbd.builder_items as Array<Record<string, unknown>>)
          : [];
        const mergedCharmItems = charmItems.length > 0 ? charmItems : undefined;
        const mergedQbd = {
          version: 2,
          builder_items: [...existingItems, ...builderItemsData],
          charm_items: mergedCharmItems,
          total_quoted_price: grandTotal,
        };
        res = await fetch(`/api/quotes/${appendToQuoteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
          body: JSON.stringify({
            quote_builder_data: mergedQbd,
            quoted_price: mergedQbd.total_quoted_price,
          }),
        });
        json = await res.json();
        if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
        setToast("Item added to quote");
        setTimeout(() => router.push(`/quotes/${appendToQuoteId}`), 1200);
      } else {
        // ── Create new quote ───────────────────────────────────────────────
        res = await fetch("/api/quotes/builder", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
          body: JSON.stringify({
            firstName, lastName, email, phone,
            assignedTo: user?.name ?? null,
            quoteDescription: primaryItem.aiDesc || primaryItem.design || null,
            internalNotes: notes,
            quotedPrice: grandTotal,
            totalCost: primaryPricing.totalCost,
            multiplier: primaryPricing.activeMultiplier,
            rawPrice: primaryPricing.rawPrice,
            quoteBuilderData: qbd,
            quoteType: "custom_order",
            pipelineStage: "Pending",
            aiDescription: primaryItem.aiDesc || null,
            fingerSize: primaryItem.fingerSize || null,
            stockSku: primaryItem.stockSku || null,
          }),
        });
        json = await res.json();
        if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
        setToast("Quote saved successfully");
        setTimeout(() => router.push("/quotes"), 1500);
      }
    } catch (err) {
      setToast("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  function handlePrintPDF() {
    const primaryItem = items[0];
    const effectiveSub = primaryItem.subcategory === "Other" ? primaryItem.subcategoryOther : primaryItem.subcategory;

    const quoteObj = {
      id: "preview",
      created_at: new Date().toISOString(),
      reference_number: "PREVIEW",
      quote_type: "custom_order" as const,
      status: "pending",
      customer_first_name: firstName || null,
      customer_last_name: lastName || null,
      customer_email: email || null,
      customer_phone: phone || null,
      item_description: null,
      line_items: [],
      notes: notes || null,
      repair_description: null,
      design_brief: primaryItem.design || null,
      metal_type: primaryItem.metals.find(m => m.type)?.type ?? null,
      stone_details: null,
      estimated_turnaround: null,
      staff_member: user?.name ?? null,
      converted_to_packet_id: null, converted_at: null, packet_reference: null,
      assigned_to: user?.name ?? null, follow_up_date: null, status_changed_at: null,
      status_changed_by: null, pending_at: null, follow_up_1_at: null,
      follow_up_2_at: null, job_won_at: null, job_lost_at: null,
      total: grandTotal,
      quoted_price: grandTotal,
      ai_description: primaryItem.aiDesc || null,
      finger_size: primaryItem.fingerSize || null,
      stock_sku: primaryItem.stockSku || null,
      quote_builder_data: {
        version: 2,
        builder_items: items.map((item, idx) => {
          const p = allPricings[idx];
          return {
            item_type: item.itemType || null,
            subcategory: (item.subcategory === "Other" ? item.subcategoryOther : item.subcategory) || null,
            design: item.design || null,
            metals: item.metals.filter(m => m.type).map(m => ({ type: m.type, weight: parseFloat(m.weight) || 0 })),
            include_main_stone: item.includeMainStone,
            stone_options: item.includeMainStone ? item.stoneOptions.map((opt, oi) => ({
              id: opt.id,
              label: opt.label,
              stones: (opt.stones ?? []).map(s => ({
                carat_weight: parseFloat(s.caratWeight) || null,
                shape: s.shape || null,
                colour: s.colour || null,
                clarity: s.clarity || null,
                origin: s.origin,
              })),
              quoted_price: p.stoneOptionPrices[oi] ?? p.finalPrice,
            })) : [],
            melee_stones: item.meleeRows.filter(r => r.stoneType).map(r => ({
              stone_type: r.stoneType || null, shape: r.shape || null,
              carat_weight: parseFloat(r.caratWeight) || null, qty: parseInt(r.qty) || 0,
            })),
            addons: {
              hand_engraving: item.handEngraving,
              laser_engraving: item.laserEngraving,
              components: item.components.filter(c => c.name).map(c => ({ name: c.name, cost: parseFloat(c.cost) || 0 })),
            },
            ai_description: item.aiDesc || null,
            finger_size: item.fingerSize || null,
            stock_sku: item.stockSku || null,
            quoted_price: p.finalPrice,
          };
        }),
        total_quoted_price: grandTotal,
      },
    };

    const html = generateQuoteHTML(quoteObj);
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  }

  if (!hydrated) return null;

  const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 20, marginBottom: 16 };

  return (
    <>
    <style>{`
      .qb-outer { padding: 24px; max-width: 1100px; margin: 0 auto; }
      .qb-grid  { display: grid; grid-template-columns: 1fr 380px; gap: 24px; align-items: start; }
      .qb-sidebar { position: sticky; top: 24px; }
      .qb-row2  { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
      @media (max-width: 767px) {
        .qb-outer   { padding: 16px; }
        .qb-grid    { display: flex; flex-direction: column; gap: 16px; }
        .qb-sidebar { position: static; top: auto; }
        .qb-row2    { grid-template-columns: 1fr; }
      }
    `}</style>
    <div className="qb-outer">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: appendToQuoteId ? 12 : 24 }}>
        <Link href={appendToQuoteId ? `/quotes/${appendToQuoteId}` : "/quotes"} style={{ color: "#6B7280", textDecoration: "none", fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          {appendToQuoteId ? "Quote" : "Quotes"}
        </Link>
        <span style={{ color: "#D1D5DB" }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>
          {appendToQuoteId ? "Add Item" : "Build Quote"}
        </h1>
      </div>

      {/* Append-mode banner */}
      {appendToQuoteId && (
        <div style={{ background: "#EEF2FF", border: "1px solid #C7D2FE", borderRadius: 10, padding: "10px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#635BFF" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{ fontSize: 13, color: "#3730A3", fontWeight: 500 }}>
            Adding item to quote <strong style={{ fontFamily: "monospace" }}>{appendToQuoteRef ?? appendToQuoteId}</strong>
          </span>
        </div>
      )}

      <div className="qb-grid">
        {/* ── Left ── */}
        <div style={{ minWidth: 0 }}>

          {/* Customer Details */}
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #E8E8F0" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Customer Details</span>
              {vipTier && (
                <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: `${vipTier.colour}22`, color: vipTier.colour, letterSpacing: "0.05em", textTransform: "uppercase", lineHeight: 1.6 }}>
                  {vipTier.tier_name}
                </span>
              )}
            </div>
            <div style={{ marginBottom: 14, position: "relative" }}>
              <label style={labelStyle}>Search Existing Customer</label>
              <input style={inputStyle} type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} onFocus={onFocus} onBlur={e => { onBlurField(e); setTimeout(() => setShowDropdown(false), 200); }} placeholder="Type name or email to search…" />
              {showDropdown && customerResults.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "#fff", border: "1px solid #E8E8F0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", overflow: "hidden" }}>
                  {customerResults.map(c => (
                    <button key={c.email ?? `${c.first_name}-${c.last_name}`} type="button" onMouseDown={() => selectCustomer(c)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 14, borderBottom: "1px solid #F3F4F6" }} onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                      <span style={{ fontWeight: 600, color: "#1A1A2E" }}>{c.first_name} {c.last_name}</span>
                      {c.email && <span style={{ color: "#6B7280", marginLeft: 8, fontSize: 13 }}>{c.email}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="qb-row2">
              <div>
                <label style={labelStyle}>First Name</label>
                <input style={{ ...inputStyle, borderColor: errors.firstName ? "#EF4444" : "#E8E8F0" }} value={firstName} onChange={e => setFirstName(e.target.value)} onFocus={onFocus} onBlur={e => onBlurField(e, !!errors.firstName)} placeholder="Jane" />
                {errors.firstName && <div style={errStyle}>{errors.firstName}</div>}
              </div>
              <div>
                <label style={labelStyle}>Last Name</label>
                <input style={{ ...inputStyle, borderColor: errors.lastName ? "#EF4444" : "#E8E8F0" }} value={lastName} onChange={e => setLastName(e.target.value)} onFocus={onFocus} onBlur={e => onBlurField(e, !!errors.lastName)} placeholder="Smith" />
                {errors.lastName && <div style={errStyle}>{errors.lastName}</div>}
              </div>
            </div>
            <div className="qb-row2">
              <div>
                <label style={labelStyle}>Email</label>
                <input style={{ ...inputStyle, borderColor: errors.contact ? "#EF4444" : "#E8E8F0" }} type="email" value={email} onChange={e => setEmail(e.target.value)} onFocus={onFocus} onBlur={e => onBlurField(e, !!errors.contact)} placeholder="jane@example.com" />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={{ ...inputStyle, borderColor: errors.contact ? "#EF4444" : "#E8E8F0" }} type="tel" value={phone} onChange={e => setPhone(e.target.value)} onFocus={onFocus} onBlur={e => onBlurField(e, !!errors.contact)} placeholder="04xx xxx xxx" />
              </div>
            </div>
            {errors.contact && <div style={errStyle}>{errors.contact}</div>}
          </div>

          {/* Items */}
          {items.map((item, idx) => (
            <ItemCard
              key={item.id}
              item={item}
              index={idx}
              total={items.length}
              pricing={allPricings[idx]}
              metalRates={metalRates}
              fixedCosts={fixedCosts}
              isManager={isManager}
              setItems={setItems}
              onShowNivoda={(itemId, optId) => { nivodaTargetItemId.current = itemId; nivodaTargetOptId.current = optId; setShowNivodaModal(true); }}
              errors={errors}
            />
          ))}

          <button
            onClick={() => setItems(prev => [...prev, newItem(prev.length)])}
            style={{ ...addBtnStyle, width: "100%", justifyContent: "center", padding: "12px 0", fontSize: 14, marginBottom: 8 }}
            onMouseEnter={e => (e.currentTarget.style.background = "#E0E7FF")}
            onMouseLeave={e => (e.currentTarget.style.background = "#EEF2FF")}
          >+ Add Another Item</button>


          {/* Charm line items */}
          {charmItems.map(ci => (
            <div key={ci.id} style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "16px 20px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, background: "#EDE9FE", color: "#4C1D95", padding: "1px 8px", borderRadius: 10, fontWeight: 700, textTransform: "uppercase" }}>CLASS A CUSTOM</span>
                  <span style={{ fontSize: 12, color: "#6B7280" }}>{ci.product_type === "bracelet" ? "Charm Bracelet" : "Charm Necklace"}</span>
                </div>
                <p style={{ fontSize: 13, color: "#374151", margin: "0 0 4px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ci.description}</p>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
                  {ci.selected_charms?.filter(c => c.from_stock).length ?? 0} from stock,{" "}
                  {ci.selected_charms?.filter(c => !c.from_stock).length ?? 0} to order
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#1A1760" }}>${Number(ci.retail_price).toLocaleString("en-AU")}</span>
                <button
                  onClick={() => setCharmItems(prev => prev.filter(x => x.id !== ci.id))}
                  style={{ background: "#FEE2E2", border: "none", borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: "#DC2626", fontSize: 14, fontWeight: 700 }}
                >×</button>
              </div>
            </div>
          ))}

          {/* Notes */}
          <div style={cardStyle}>
            <div style={headingStyle}>Notes</div>
            <textarea
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onFocus={onFocus}
              onBlur={onBlurField}
              placeholder="Any notes to include on the quote PDF…"
            />
          </div>
        </div>

        {/* ── Right: Price panel ── */}
        <div className="qb-sidebar">
          <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Live Price</div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                {(items.length > 1 || charmItems.length > 0) ? "Grand Total (incl. GST)" : "Quoted Price (incl. GST)"}
              </div>
              <div style={{ fontSize: 40, fontWeight: 800, color: "#1A1A2E", lineHeight: 1 }}>
                {grandTotal > 0 ? `$${grandTotal.toLocaleString("en-AU")}` : "—"}
              </div>
            </div>

            {/* Per-item breakdown when multiple items or charm items */}
            {(items.length > 1 || charmItems.length > 0) && (
              <div style={{ marginBottom: 20, fontSize: 13 }}>
                {items.map((item, idx) => {
                  const p = allPricings[idx];
                  const label = (item.subcategory === "Other" ? item.subcategoryOther : item.subcategory) || item.itemType || `Item ${idx + 1}`;
                  return (
                    <div key={item.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, padding: "6px 0", borderBottom: "1px solid #F3F4F6" }}>
                      <span style={{ color: "#374151" }}>{label}</span>
                      <span style={{ fontWeight: 600, color: p.finalPrice > 0 ? "#635BFF" : "#9CA3AF" }}>
                        {p.finalPrice > 0 ? `$${p.finalPrice.toLocaleString("en-AU")}` : "—"}
                      </span>
                    </div>
                  );
                })}
                {charmItems.map(ci => (
                  <div key={ci.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, padding: "6px 0", borderBottom: "1px solid #F3F4F6" }}>
                    <span style={{ color: "#7C3AED", fontSize: 12 }}>✦ {ci.product_type === "bracelet" ? "Charm Bracelet" : "Charm Necklace"}</span>
                    <span style={{ fontWeight: 600, color: "#7C3AED" }}>${Number(ci.retail_price).toLocaleString("en-AU")}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "12px 0", borderRadius: 10, background: saving ? "#9CA3AF" : "#635BFF", color: "#fff", border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 600 }} onMouseEnter={e => { if (!saving) (e.currentTarget.style.background = "#4F46E5"); }} onMouseLeave={e => { if (!saving) (e.currentTarget.style.background = "#635BFF"); }}>
                {saving ? "Saving…" : appendToQuoteId ? "Add Item to Quote" : "Save Quote"}
              </button>
              {!appendToQuoteId && (
                <button onClick={handlePrintPDF} style={{ width: "100%", padding: "12px 0", borderRadius: 10, background: "#fff", color: "#635BFF", border: "1px solid #635BFF", cursor: "pointer", fontSize: 15, fontWeight: 600 }} onMouseEnter={e => (e.currentTarget.style.background = "#EEF2FF")} onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
                  Print PDF
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <NivodaModal
        open={showNivodaModal}
        onClose={() => setShowNivodaModal(false)}
        onSelectStone={handleSelectNivodaStone}
        tenantId={user?.tenantId ?? ""}
      />

      {showCharmBuilder && (
        <CharmNecklaceBuilder
          open={!!showCharmBuilder}
          productType={showCharmBuilder}
          tenantId={user?.tenantId ?? ""}
          isManager={isManager}
          quoteId={appendToQuoteId ?? undefined}
          onClose={() => setShowCharmBuilder(null)}
          onConfirm={item => setCharmItems(prev => [...prev, item])}
        />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#1A1A2E", color: "#fff", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 500, zIndex: 1000, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          {toast}
        </div>
      )}
    </div>
    </>
  );
}

export default function QuoteBuilderPage() {
  return (
    <Suspense fallback={<div style={{ padding: 48, textAlign: "center", color: "#6B7280", fontSize: 14 }}>Loading…</div>}>
      <QuoteBuilderPageInner />
    </Suspense>
  );
}
