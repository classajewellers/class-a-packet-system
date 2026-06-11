"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage, hasPermission } from "@/lib/userTypes";
import Link from "next/link";
import { generateQuoteHTML } from "@/lib/quoteGenerator";
import { calculateRetailPrice, calculateMultiplier, multiplierColour } from "@/lib/marginCalculator";
import NivodaModal, { type NivodaStone } from "@/components/NivodaModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetalRate { id: string; metal_type: string; price_per_gram: number; }
interface FixedCost { id: string; key: string; label: string; amount: number; }
interface MarginBracket { id: string; cost_min: number; cost_max: number | null; multiplier: number; }

interface MetalRow { id: string; type: string; weight: string; }
interface StoneEntry {
  id: string; caratWeight: string; shape: string; colour: string;
  clarity: string; origin: "Lab Grown" | "Natural"; cost: string;
  nivodaId?: string;
}
interface MeleeRow {
  id: string; stoneType: string; quality: string; shape: string;
  caratWeight: string; individualCost: string; qty: string;
}
interface CustomerResult { first_name: string | null; last_name: string | null; email: string | null; phone: string | null; }

function uid() { return Math.random().toString(36).slice(2); }
function newStone(): StoneEntry { return { id: uid(), caratWeight: "", shape: "", colour: "", clarity: "", origin: "Lab Grown", cost: "" }; }
function newMetal(): MetalRow { return { id: uid(), type: "", weight: "" }; }
function newMelee(): MeleeRow { return { id: uid(), stoneType: "", quality: "", shape: "", caratWeight: "", individualCost: "", qty: "1" }; }

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function QuoteBuilderPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const isManager = canManage(user?.role);

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "quotes")) router.replace("/");
  }, [user, hydrated, router]);

  // Pricing data
  const [metalRates, setMetalRates] = useState<MetalRate[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [marginBrackets, setMarginBrackets] = useState<MarginBracket[]>([]);

  // Customer
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Item category
  const [itemType, setItemType] = useState<ItemType | "">("");
  const [subcategory, setSubcategory] = useState("");
  const [subcategoryOther, setSubcategoryOther] = useState("");

  // Design description
  const [design, setDesign] = useState("");

  // Metals (up to 2)
  const [metals, setMetals] = useState<MetalRow[]>([newMetal()]);

  // Main stones
  const [includeMainStone, setIncludeMainStone] = useState(false);
  const [stones, setStones] = useState<StoneEntry[]>([newStone()]);

  // Melee stones
  const [meleeRows, setMeleeRows] = useState<MeleeRow[]>([]);

  // Add-ons
  const [smallSettings, setSmallSettings] = useState(false);
  const [smallSettingsQty, setSmallSettingsQty] = useState("1");
  const [butterflies, setButterflies] = useState(false);
  const [chain, setChain] = useState(false);
  const [additionalLabour, setAdditionalLabour] = useState(false);
  const [additionalLabourAmount, setAdditionalLabourAmount] = useState("");
  const [handEngraving, setHandEngraving] = useState(false);
  const [handEngravingAmount, setHandEngravingAmount] = useState("150");
  const [laserEngraving, setLaserEngraving] = useState(false);
  const [laserEngravingAmount, setLaserEngravingAmount] = useState("80");

  // AI description
  const [aiDesc, setAiDesc] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Description & notes
  const [internalNotes, setInternalNotes] = useState("");

  // Manager overrides
  const [retailPriceOverride, setRetailPriceOverride] = useState("");
  const [marginMultiplierOverride, setMarginMultiplierOverride] = useState("");

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showNivodaModal, setShowNivodaModal] = useState(false);

  // ── Load pricing data ──────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/pricing", { headers: { "x-tenant-id": user?.tenantId ?? "" } })
      .then(r => r.json())
      .then(json => {
        setMetalRates(json.metalRates ?? []);
        setFixedCosts(json.fixedCosts ?? []);
        setMarginBrackets(json.marginBrackets ?? []);
      })
      .catch(() => {});
  }, [user?.tenantId]);

  // ── Customer search ────────────────────────────────────────────────────────

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (customerSearch.length < 2) { setCustomerResults([]); setShowDropdown(false); return; }
    searchTimer.current = setTimeout(() => {
      fetch(`/api/customers/search?q=${encodeURIComponent(customerSearch)}`, {
        headers: { "x-tenant-id": user?.tenantId ?? "" },
      })
        .then(r => r.json())
        .then(json => {
          setCustomerResults(json.results ?? []);
          setShowDropdown((json.results ?? []).length > 0);
        })
        .catch(() => {});
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [customerSearch, user?.tenantId]);

  function selectCustomer(c: CustomerResult) {
    setFirstName(c.first_name ?? "");
    setLastName(c.last_name ?? "");
    setEmail(c.email ?? "");
    setPhone(c.phone ?? "");
    setCustomerSearch(`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim());
    setShowDropdown(false);
  }

  // ── AI description ─────────────────────────────────────────────────────────

  const generateDescription = useCallback(async () => {
    const hasContent = itemType || design || metals.some(m => m.type) || (includeMainStone && stones.some(s => s.caratWeight)) || meleeRows.some(m => m.stoneType);
    if (!hasContent) return;
    setAiGenerating(true);
    try {
      const res = await fetch("/api/quotes/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemType,
          subcategory: subcategory === "Other" ? subcategoryOther : subcategory,
          design,
          metals: metals.filter(m => m.type),
          mainStones: includeMainStone ? stones : [],
          meleeStones: meleeRows.filter(m => m.stoneType),
          engraving: { hand: handEngraving, laser: laserEngraving },
        }),
      });
      const json = await res.json();
      console.log("[quote-builder] AI response:", json);
      if (json.description) setAiDesc(json.description);
    } catch (e) {
      console.error("[quote-builder] AI fetch error:", e);
    } finally {
      setAiGenerating(false);
    }
  }, [itemType, subcategory, subcategoryOther, design, metals, includeMainStone, stones, meleeRows, handEngraving, laserEngraving]);

  // Debounced auto-trigger on field changes
  const triggerAI = useCallback(() => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(() => { generateDescription(); }, 1500);
  }, [generateDescription]);

  useEffect(() => { triggerAI(); }, [triggerAI]);

  // ── Nivoda stone selection ─────────────────────────────────────────────────

  const handleSelectNivodaStone = useCallback((stone: NivodaStone) => {
    const formatted: StoneEntry = {
      id: uid(),
      caratWeight: String(stone.carats),
      shape: stone.shape.charAt(0) + stone.shape.slice(1).toLowerCase(),
      colour: stone.color,
      clarity: stone.clarity,
      origin: stone.labgrown ? "Lab Grown" : "Natural",
      cost: stone.price > 0 ? String(Math.round(stone.price / 100)) : "",
      nivodaId: stone.id,
    };
    setIncludeMainStone(true);
    setStones([formatted]);
  }, []);

  // ── Pricing computation ────────────────────────────────────────────────────

  const pricing = useMemo(() => {
    // Metal costs (all rows)
    let metalCost = 0;
    for (const m of metals) {
      const rate = metalRates.find(r => r.metal_type === m.type);
      if (rate) metalCost += (parseFloat(m.weight) || 0) * rate.price_per_gram;
    }

    // Main stone cost (manager only)
    const mainStoneCost = includeMainStone && isManager
      ? stones.reduce((s, st) => s + (parseFloat(st.cost) || 0), 0)
      : 0;

    // Melee stone cost (manager only)
    const meleeCost = isManager
      ? meleeRows.reduce((s, r) => s + (parseFloat(r.individualCost) || 0) * (parseInt(r.qty) || 0), 0)
      : 0;

    let addonsCost = 0;
    const costMap: Record<string, number> = {};

    // Main stone setting
    const mainStoneSettingRate = fixedCosts.find(fc => fc.key === "main_stone_setting")?.amount ?? 80;
    const mainStoneSettingCost = includeMainStone ? stones.length * mainStoneSettingRate : 0;
    if (mainStoneSettingCost > 0) { addonsCost += mainStoneSettingCost; costMap.mainStoneSetting = mainStoneSettingCost; }

    // Labour (always)
    for (const fc of fixedCosts) {
      if (fc.key === "labour") { addonsCost += fc.amount; costMap.labour = fc.amount; }
      if (fc.key === "butterflies" && butterflies) { addonsCost += fc.amount; costMap.butterflies = fc.amount; }
      if (fc.key === "chain" && chain) { addonsCost += fc.amount; costMap.chain = fc.amount; }
    }

    if (smallSettings) {
      const sc = (parseInt(smallSettingsQty) || 0) * 30;
      addonsCost += sc; costMap.smallSettings = sc;
    }
    const extraLabour = additionalLabour ? (parseFloat(additionalLabourAmount) || 0) : 0;
    addonsCost += extraLabour;

    // Engraving
    const handEngravingCost = handEngraving ? (parseFloat(handEngravingAmount) || 150) : 0;
    const laserEngravingCost = laserEngraving ? (parseFloat(laserEngravingAmount) || 80) : 0;
    if (handEngravingCost > 0) { addonsCost += handEngravingCost; costMap.handEngraving = handEngravingCost; }
    if (laserEngravingCost > 0) { addonsCost += laserEngravingCost; costMap.laserEngraving = laserEngravingCost; }

    const totalCost = metalCost + mainStoneCost + meleeCost + addonsCost;

    const suggestedRetail = totalCost > 0 ? calculateRetailPrice(totalCost) : 0;

    // Bracket-based fallback
    const bracket = marginBrackets.find(b =>
      totalCost >= b.cost_min && (b.cost_max == null || totalCost <= b.cost_max)
    ) ?? marginBrackets[marginBrackets.length - 1];
    const rawPrice = bracket ? totalCost * bracket.multiplier : totalCost;

    // Multiplier override
    let quotedPrice: number;
    if (marginMultiplierOverride && parseFloat(marginMultiplierOverride) > 0) {
      quotedPrice = Math.round(totalCost * parseFloat(marginMultiplierOverride) / 50) * 50;
    } else {
      quotedPrice = suggestedRetail > 0 ? suggestedRetail : Math.ceil(rawPrice / 50) * 50;
    }

    // Retail price override (takes precedence over everything)
    const finalPrice = retailPriceOverride && parseFloat(retailPriceOverride) > 0
      ? parseFloat(retailPriceOverride)
      : quotedPrice;

    const activeMultiplier = marginMultiplierOverride && parseFloat(marginMultiplierOverride) > 0
      ? parseFloat(marginMultiplierOverride)
      : (bracket?.multiplier ?? null);

    const mult = calculateMultiplier(finalPrice, totalCost);
    const mColour = mult != null ? multiplierColour(mult) : null;

    return {
      metalCost, mainStoneCost, meleeCost, mainStoneSettingCost, mainStoneSettingRate,
      addonsCost, totalCost, bracket, rawPrice, quotedPrice, finalPrice,
      suggestedRetail, mult, mColour, costMap, extraLabour, activeMultiplier,
      handEngravingCost, laserEngravingCost,
    };
  }, [
    metals, metalRates, includeMainStone, stones, meleeRows, isManager,
    fixedCosts, smallSettings, smallSettingsQty, butterflies, chain,
    additionalLabour, additionalLabourAmount, handEngraving, handEngravingAmount,
    laserEngraving, laserEngravingAmount, marginBrackets,
    retailPriceOverride, marginMultiplierOverride,
  ]);

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
      const effectiveSubcategory = subcategory === "Other" ? subcategoryOther : subcategory;
      const qbd = {
        item_type: itemType || null,
        subcategory: effectiveSubcategory || null,
        design: design || null,
        // Backward-compatible items array for PDF
        items: [{
          id: "1",
          job_type: effectiveSubcategory || itemType || "Custom Order",
          description: design || effectiveSubcategory || itemType || "",
          retail_price: String(pricing.finalPrice),
          cost_price: isManager ? String(pricing.totalCost) : "0",
        }],
        metals: metals.filter(m => m.type).map(m => {
          const rate = metalRates.find(r => r.metal_type === m.type);
          return {
            type: m.type,
            weight: parseFloat(m.weight) || 0,
            cost: rate ? (parseFloat(m.weight) || 0) * rate.price_per_gram : 0,
          };
        }),
        main_stone: includeMainStone ? stones.map(s => ({
          carat_weight: parseFloat(s.caratWeight) || null,
          shape: s.shape || null,
          colour: s.colour || null,
          clarity: s.clarity || null,
          origin: s.origin,
          cost: isManager ? (parseFloat(s.cost) || 0) : 0,
        })) : null,
        melee_stones: meleeRows.length > 0 ? meleeRows.map(r => ({
          stone_type: r.stoneType || null,
          quality: r.quality || null,
          shape: r.shape || null,
          carat_weight: parseFloat(r.caratWeight) || null,
          individual_cost: isManager ? (parseFloat(r.individualCost) || 0) : 0,
          qty: parseInt(r.qty) || 0,
          row_total: isManager ? (parseFloat(r.individualCost) || 0) * (parseInt(r.qty) || 0) : 0,
        })) : null,
        setting_cost: pricing.mainStoneSettingCost,
        addons: {
          labour: fixedCosts.find(fc => fc.key === "labour")?.amount ?? 300,
          small_settings_qty: smallSettings ? (parseInt(smallSettingsQty) || 0) : 0,
          small_settings_cost: pricing.costMap.smallSettings ?? 0,
          butterflies,
          chain,
          additional_labour: parseFloat(additionalLabourAmount) || 0,
          hand_engraving: handEngraving,
          hand_engraving_cost: pricing.handEngravingCost,
          laser_engraving: laserEngraving,
          laser_engraving_cost: pricing.laserEngravingCost,
        },
        ai_description: aiDesc || null,
        total_cost: pricing.totalCost,
        multiplier: pricing.activeMultiplier,
        raw_price: pricing.rawPrice,
        quoted_price: pricing.finalPrice,
        retail_price_override: retailPriceOverride ? parseFloat(retailPriceOverride) : null,
        margin_multiplier_override: marginMultiplierOverride ? parseFloat(marginMultiplierOverride) : null,
      };

      const quoteType = (itemType === "Ring" && (subcategory?.includes("Engagement") || subcategory?.includes("Wedding")))
        ? "custom_order" : "custom_order";

      const res = await fetch("/api/quotes/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
        body: JSON.stringify({
          firstName, lastName, email, phone,
          assignedTo: user?.name ?? null,
          quoteDescription: aiDesc || design || null,
          internalNotes,
          quotedPrice: pricing.finalPrice,
          totalCost: pricing.totalCost,
          multiplier: pricing.activeMultiplier,
          rawPrice: pricing.rawPrice,
          quoteBuilderData: qbd,
          quoteType,
          pipelineStage: "Pending",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setToast("Quote saved successfully");
      setTimeout(() => router.push("/quotes"), 1500);
    } catch (err) {
      setToast("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  function handlePrintPDF() {
    const now = new Date().toISOString();
    const effectiveSubcategory = subcategory === "Other" ? subcategoryOther : subcategory;
    const pdfQbd: Record<string, unknown> = {
      design: design || null,
      items: [{
        job_type: effectiveSubcategory || itemType || "Custom Order",
        description: design || effectiveSubcategory || itemType || "",
        retail_price: String(pricing.finalPrice),
      }],
    };
    if (includeMainStone) {
      pdfQbd.main_stone = stones.map(s => ({
        carat_weight: parseFloat(s.caratWeight) || null,
        shape: s.shape || null, colour: s.colour || null, clarity: s.clarity || null, origin: s.origin,
      }));
    }
    const firstMetal = metals.find(m => m.type);
    const quoteObj = {
      id: "preview", created_at: now, reference_number: "PREVIEW",
      quote_type: "custom_order" as const, status: "pending",
      customer_first_name: firstName || null, customer_last_name: lastName || null,
      customer_email: email || null, customer_phone: phone || null,
      item_description: design || null, line_items: [], notes: null,
      repair_description: null, design_brief: design || null,
      metal_type: firstMetal?.type ?? null, stone_details: null,
      estimated_turnaround: null, staff_member: user?.name ?? null,
      converted_to_packet_id: null, converted_at: null, packet_reference: null,
      assigned_to: user?.name ?? null, follow_up_date: null, status_changed_at: null,
      status_changed_by: null, pending_at: null, follow_up_1_at: null,
      follow_up_2_at: null, job_won_at: null, job_lost_at: null,
      total: pricing.finalPrice, quote_builder_data: pdfQbd, quoted_price: pricing.finalPrice,
    };
    const html = generateQuoteHTML(quoteObj);
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  }

  if (!hydrated) return null;

  // ── Styles ─────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = { background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 20, marginBottom: 16 };
  const heading: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid #E8E8F0" };
  const input: React.CSSProperties = { border: "1px solid #E8E8F0", borderRadius: 8, padding: "8px 12px", fontSize: 14, width: "100%", outline: "none", boxSizing: "border-box" };
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4, display: "block" };
  const err: React.CSSProperties = { fontSize: 12, color: "#EF4444", marginTop: 4 };
  const row2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 };
  const addBtn: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1px dashed #635BFF", background: "#EEF2FF", color: "#635BFF", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all .15s" };
  const MULT_COLOURS = { green: { bg: "#DCFCE7", text: "#15803D" }, orange: { bg: "#FEF9C3", text: "#B45309" }, red: { bg: "#FEE2E2", text: "#DC2626" } };

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

  function focus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) { e.target.style.borderColor = "#635BFF"; }
  function blur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>, hasErr?: boolean) { e.target.style.borderColor = hasErr ? "#EF4444" : "#E8E8F0"; }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <Link href="/quotes" style={{ color: "#6B7280", textDecoration: "none", fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Quotes
        </Link>
        <span style={{ color: "#D1D5DB" }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Build Quote</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}>
        {/* ── Left: Form ── */}
        <div style={{ minWidth: 0 }}>

          {/* ── Section 1: Customer Details ── */}
          <div style={card}>
            <div style={heading}>Customer Details</div>

            {/* Customer search */}
            <div style={{ marginBottom: 14, position: "relative" }}>
              <label style={label}>Search Existing Customer</label>
              <input
                style={input}
                type="text"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                onFocus={focus}
                onBlur={e => { blur(e); setTimeout(() => setShowDropdown(false), 200); }}
                placeholder="Type name or email to search…"
              />
              {showDropdown && customerResults.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "#fff", border: "1px solid #E8E8F0", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", overflow: "hidden" }}>
                  {customerResults.map(c => (
                    <button
                      key={c.email ?? `${c.first_name}-${c.last_name}`}
                      type="button"
                      onMouseDown={() => selectCustomer(c)}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "none", cursor: "pointer", fontSize: 14, borderBottom: "1px solid #F3F4F6" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                      onMouseLeave={e => (e.currentTarget.style.background = "none")}
                    >
                      <span style={{ fontWeight: 600, color: "#1A1A2E" }}>{c.first_name} {c.last_name}</span>
                      {c.email && <span style={{ color: "#6B7280", marginLeft: 8, fontSize: 13 }}>{c.email}</span>}
                      {c.phone && <span style={{ color: "#9CA3AF", marginLeft: 8, fontSize: 13 }}>{c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={row2}>
              <div>
                <label style={label}>First Name</label>
                <input style={{ ...input, borderColor: errors.firstName ? "#EF4444" : "#E8E8F0" }} value={firstName} onChange={e => setFirstName(e.target.value)} onFocus={focus} onBlur={e => blur(e, !!errors.firstName)} placeholder="Jane" />
                {errors.firstName && <div style={err}>{errors.firstName}</div>}
              </div>
              <div>
                <label style={label}>Last Name</label>
                <input style={{ ...input, borderColor: errors.lastName ? "#EF4444" : "#E8E8F0" }} value={lastName} onChange={e => setLastName(e.target.value)} onFocus={focus} onBlur={e => blur(e, !!errors.lastName)} placeholder="Smith" />
                {errors.lastName && <div style={err}>{errors.lastName}</div>}
              </div>
            </div>
            <div style={row2}>
              <div>
                <label style={label}>Email</label>
                <input style={{ ...input, borderColor: errors.contact ? "#EF4444" : "#E8E8F0" }} type="email" value={email} onChange={e => setEmail(e.target.value)} onFocus={focus} onBlur={e => blur(e, !!errors.contact)} placeholder="jane@example.com" />
              </div>
              <div>
                <label style={label}>Phone</label>
                <input style={{ ...input, borderColor: errors.contact ? "#EF4444" : "#E8E8F0" }} type="tel" value={phone} onChange={e => setPhone(e.target.value)} onFocus={focus} onBlur={e => blur(e, !!errors.contact)} placeholder="04xx xxx xxx" />
              </div>
            </div>
            {errors.contact && <div style={err}>{errors.contact}</div>}
          </div>

          {/* ── Section 2: Item Category ── */}
          <div style={card}>
            <div style={heading}>Item Category</div>

            {/* Step 1 — Item type */}
            <div style={{ marginBottom: itemType ? 16 : 0 }}>
              <label style={{ ...label, marginBottom: 10 }}>Item Type</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {ITEM_TYPES.map(t => {
                  const active = itemType === t;
                  return (
                    <button
                      key={t} type="button"
                      onClick={() => { setItemType(active ? "" : t); setSubcategory(""); setSubcategoryOther(""); }}
                      style={{ padding: "14px 8px", borderRadius: 10, border: `${active ? 2 : 1}px solid ${active ? "#635BFF" : "#E8E8F0"}`, background: active ? "#EEF2FF" : "#fff", cursor: "pointer", textAlign: "center", transition: "all .15s" }}
                    >
                      <div style={{ fontSize: 24, marginBottom: 4 }}>{ITEM_ICONS[t]}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: active ? "#635BFF" : "#374151" }}>{t}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2 — Subcategory */}
            {itemType && itemType !== "Other" && (
              <div>
                <label style={{ ...label, marginBottom: 8 }}>Subcategory</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SUBCATEGORIES[itemType].map(sc => {
                    const active = subcategory === sc;
                    return (
                      <button key={sc} type="button"
                        onClick={() => setSubcategory(active ? "" : sc)}
                        style={{ padding: "8px 16px", borderRadius: 8, border: `${active ? 2 : 1}px solid ${active ? "#635BFF" : "#E8E8F0"}`, background: active ? "#635BFF" : "#fff", color: active ? "#fff" : "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all .15s" }}
                      >{sc}</button>
                    );
                  })}
                </div>
              </div>
            )}
            {itemType === "Other" && (
              <div>
                <label style={label}>Describe Item Type</label>
                <input style={input} type="text" value={subcategoryOther} onChange={e => setSubcategoryOther(e.target.value)} onFocus={focus} onBlur={blur} placeholder="e.g. Brooch, Cufflinks, Trophy…" />
              </div>
            )}
          </div>

          {/* ── Section 3: Design Description ── */}
          <div style={card}>
            <div style={heading}>Design Description</div>
            <label style={label}>Design Description</label>
            <input
              style={input} type="text" value={design}
              onChange={e => setDesign(e.target.value)}
              onFocus={focus} onBlur={blur}
              placeholder="e.g. Stella Trilogy with split shank"
            />
          </div>

          {/* ── Section 4: Metal Selection ── */}
          <div style={card}>
            <div style={heading}>Metal Selection</div>
            {metals.map((m, idx) => {
              const rate = metalRates.find(r => r.metal_type === m.type);
              const metalCost = rate ? (parseFloat(m.weight) || 0) * rate.price_per_gram : 0;
              return (
                <div key={m.id} style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Metal {idx + 1}</span>
                    {metals.length > 1 && (
                      <button onClick={() => setMetals(prev => prev.filter(x => x.id !== m.id))} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#9CA3AF", lineHeight: 1, padding: "0 2px" }}>×</button>
                    )}
                  </div>
                  <div style={row2}>
                    <div>
                      <label style={label}>Metal Type</label>
                      <select
                        style={{ ...input, cursor: "pointer" }}
                        value={m.type}
                        onChange={e => setMetals(prev => prev.map(x => x.id === m.id ? { ...x, type: e.target.value } : x))}
                        onFocus={focus} onBlur={blur}
                      >
                        <option value="">Select metal…</option>
                        {metalRates.map(r => <option key={r.id} value={r.metal_type}>{r.metal_type}</option>)}
                      </select>
                      {isManager && m.type && (
                        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                          Rate: ${rate?.price_per_gram.toFixed(2)}/g
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={label}>Weight (grams)</label>
                      <input
                        style={input} type="number" step="0.1" min="0" value={m.weight}
                        onChange={e => setMetals(prev => prev.map(x => x.id === m.id ? { ...x, weight: e.target.value } : x))}
                        onFocus={focus} onBlur={blur} placeholder="e.g. 5.5"
                      />
                      {isManager && m.weight && m.type && (
                        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>Metal cost: ${metalCost.toFixed(2)}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {metals.length < 2 && (
              <button
                onClick={() => setMetals(prev => [...prev, newMetal()])}
                style={addBtn}
                onMouseEnter={e => (e.currentTarget.style.background = "#E0E7FF")}
                onMouseLeave={e => (e.currentTarget.style.background = "#EEF2FF")}
              >+ Add Second Metal</button>
            )}
          </div>

          {/* ── Section 5: Main Stones ── */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...heading, marginBottom: 0, paddingBottom: 0, borderBottom: "none" }}>
              <span>Main Stone</span>
              <button
                onClick={() => setShowNivodaModal(true)}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #635BFF", background: "#EEF2FF", color: "#635BFF", fontSize: 12, fontWeight: 600, cursor: "pointer", letterSpacing: "0.02em", textTransform: "none" }}
              >Browse Stones</button>
            </div>
            <div style={{ borderBottom: "1px solid #E8E8F0", marginBottom: 14, marginTop: 8 }} />

            <div style={{ marginBottom: includeMainStone ? 12 : 0 }}>
              <Toggle on={includeMainStone} onChange={setIncludeMainStone}>Include Main Stone</Toggle>
            </div>

            {includeMainStone && (
              <div style={{ marginTop: 12 }}>
                {stones.map((stone, idx) => (
                  <div key={stone.id} style={{ marginBottom: 16, padding: "14px 14px 12px", borderRadius: 10, border: "1px solid #E8E8F0", background: "#FAFAFA" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Stone {idx + 1}</span>
                        {stone.nivodaId && (
                          <span style={{ fontSize: 11, fontWeight: 600, background: "#EEF2FF", color: "#635BFF", border: "1px solid #C7D2FE", borderRadius: 20, padding: "2px 8px" }}>Sourced from Nivoda</span>
                        )}
                      </div>
                      {stones.length > 1 && (
                        <button onClick={() => setStones(prev => prev.filter(s => s.id !== stone.id))} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#9CA3AF", lineHeight: 1, padding: "0 2px" }}>×</button>
                      )}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={label}>Carat Weight</label>
                        <input style={input} type="number" step="0.01" min="0" value={stone.caratWeight} onChange={e => setStones(prev => prev.map(s => s.id === stone.id ? { ...s, caratWeight: e.target.value } : s))} onFocus={focus} onBlur={blur} placeholder="0.00ct" />
                      </div>
                      <div>
                        <label style={label}>Shape</label>
                        <input style={input} type="text" value={stone.shape} onChange={e => setStones(prev => prev.map(s => s.id === stone.id ? { ...s, shape: e.target.value } : s))} onFocus={focus} onBlur={blur} placeholder="e.g. Round Brilliant, Oval" />
                      </div>
                      <div>
                        <label style={label}>Colour</label>
                        <input style={input} type="text" value={stone.colour} onChange={e => setStones(prev => prev.map(s => s.id === stone.id ? { ...s, colour: e.target.value } : s))} onFocus={focus} onBlur={blur} placeholder="e.g. F, G, H" />
                      </div>
                      <div>
                        <label style={label}>Clarity</label>
                        <input style={input} type="text" value={stone.clarity} onChange={e => setStones(prev => prev.map(s => s.id === stone.id ? { ...s, clarity: e.target.value } : s))} onFocus={focus} onBlur={blur} placeholder="e.g. VS1, VS2, SI1" />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid #E8E8F0", width: "fit-content", marginBottom: isManager ? 10 : 0 }}>
                      {(["Lab Grown", "Natural"] as const).map(o => (
                        <button key={o} onClick={() => setStones(prev => prev.map(s => s.id === stone.id ? { ...s, origin: o } : s))}
                          style={{ padding: "6px 18px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, background: stone.origin === o ? "#635BFF" : "#fff", color: stone.origin === o ? "#fff" : "#635BFF", transition: "all .15s" }}
                        >{o}</button>
                      ))}
                    </div>
                    {isManager && (
                      <div>
                        <label style={{ ...label, color: "#635BFF" }}>Cost Price ($)</label>
                        <input style={{ ...input, width: 140, borderColor: "#C4BFFE" }} type="number" min="0" step="0.01" value={stone.cost} onChange={e => setStones(prev => prev.map(s => s.id === stone.id ? { ...s, cost: e.target.value } : s))} onFocus={focus} onBlur={blur} placeholder="$0.00" />
                      </div>
                    )}
                  </div>
                ))}
                <button onClick={() => setStones(prev => [...prev, newStone()])} style={addBtn} onMouseEnter={e => (e.currentTarget.style.background = "#E0E7FF")} onMouseLeave={e => (e.currentTarget.style.background = "#EEF2FF")}>+ Add Stone</button>
              </div>
            )}
          </div>

          {/* ── Section 6: Melee Stones ── */}
          <div style={card}>
            <div style={heading}>Melee / Small Stones</div>
            {meleeRows.map((r, idx) => {
              const rowTotal = isManager ? (parseFloat(r.individualCost) || 0) * (parseInt(r.qty) || 0) : 0;
              return (
                <div key={r.id} style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Row {idx + 1}</span>
                    <button onClick={() => setMeleeRows(prev => prev.filter(x => x.id !== r.id))} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#9CA3AF", lineHeight: 1, padding: "0 2px" }}>×</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={label}>Stone Type</label>
                      <input style={input} type="text" value={r.stoneType} onChange={e => setMeleeRows(prev => prev.map(x => x.id === r.id ? { ...x, stoneType: e.target.value } : x))} onFocus={focus} onBlur={blur} placeholder="e.g. Round Brilliant Diamond" />
                    </div>
                    <div>
                      <label style={label}>Quality</label>
                      <input style={input} type="text" value={r.quality} onChange={e => setMeleeRows(prev => prev.map(x => x.id === r.id ? { ...x, quality: e.target.value } : x))} onFocus={focus} onBlur={blur} placeholder="e.g. G/VS" />
                    </div>
                    <div>
                      <label style={label}>Shape</label>
                      <input style={input} type="text" value={r.shape} onChange={e => setMeleeRows(prev => prev.map(x => x.id === r.id ? { ...x, shape: e.target.value } : x))} onFocus={focus} onBlur={blur} placeholder="e.g. Round" />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isManager ? "1fr 1fr 1fr" : "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={label}>Carat / Stone</label>
                      <input style={input} type="number" step="0.001" min="0" value={r.caratWeight} onChange={e => setMeleeRows(prev => prev.map(x => x.id === r.id ? { ...x, caratWeight: e.target.value } : x))} onFocus={focus} onBlur={blur} placeholder="0.05ct" />
                    </div>
                    {isManager && (
                      <div>
                        <label style={{ ...label, color: "#635BFF" }}>Cost / Stone ($)</label>
                        <input style={{ ...input, borderColor: "#C4BFFE" }} type="number" step="0.01" min="0" value={r.individualCost} onChange={e => setMeleeRows(prev => prev.map(x => x.id === r.id ? { ...x, individualCost: e.target.value } : x))} onFocus={focus} onBlur={blur} placeholder="0.00" />
                      </div>
                    )}
                    <div>
                      <label style={label}>Qty</label>
                      <input style={input} type="number" step="1" min="1" value={r.qty} onChange={e => setMeleeRows(prev => prev.map(x => x.id === r.id ? { ...x, qty: e.target.value } : x))} onFocus={focus} onBlur={blur} placeholder="1" />
                    </div>
                  </div>
                  {isManager && rowTotal > 0 && (
                    <div style={{ marginTop: 8, fontSize: 13, color: "#6B7280", textAlign: "right" }}>
                      Row total: <strong style={{ color: "#1A1A2E" }}>${rowTotal.toFixed(2)}</strong>
                    </div>
                  )}
                </div>
              );
            })}
            <button onClick={() => setMeleeRows(prev => [...prev, newMelee()])} style={addBtn} onMouseEnter={e => (e.currentTarget.style.background = "#E0E7FF")} onMouseLeave={e => (e.currentTarget.style.background = "#EEF2FF")}>+ Add Melee Row</button>
          </div>

          {/* ── Section 7: Additional Labour & Add-ons ── */}
          <div style={card}>
            <div style={heading}>Add-ons & Labour</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Labour — always included */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #E8E8F0" }}>
                <span style={{ fontSize: 14, color: "#374151", fontWeight: 500 }}>Labour</span>
                {isManager && <span style={{ fontSize: 13, color: "#6B7280" }}>${(fixedCosts.find(fc => fc.key === "labour")?.amount ?? 300).toFixed(2)}</span>}
              </div>

              {/* Main stone setting */}
              {isManager && includeMainStone && pricing.mainStoneSettingCost > 0 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #E8E8F0" }}>
                  <span style={{ fontSize: 14, color: "#374151" }}>Stone Settings (auto)</span>
                  <span style={{ fontSize: 13, color: "#6B7280" }}>{stones.length} × ${(fixedCosts.find(fc => fc.key === "main_stone_setting")?.amount ?? 80).toFixed(2)} = ${pricing.mainStoneSettingCost.toFixed(2)}</span>
                </div>
              )}

              {/* Small settings */}
              <div>
                <Toggle on={smallSettings} onChange={setSmallSettings}>Small Stone Settings</Toggle>
                {smallSettings && (
                  <div style={{ marginTop: 8, paddingLeft: 50 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ ...label, marginBottom: 0 }}>Qty</label>
                      <input style={{ ...input, width: 80 }} type="number" min="1" value={smallSettingsQty} onChange={e => setSmallSettingsQty(e.target.value)} />
                      {isManager && <span style={{ fontSize: 12, color: "#6B7280" }}>= ${((parseInt(smallSettingsQty) || 0) * 30).toFixed(2)}</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Butterflies */}
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="checkbox" checked={butterflies} onChange={e => setButterflies(e.target.checked)} style={{ accentColor: "#635BFF", width: 16, height: 16, cursor: "pointer" }} />
                  <span style={{ fontSize: 14, color: "#374151" }}>Butterflies (earrings)</span>
                </div>
                {isManager && butterflies && <span style={{ fontSize: 13, color: "#6B7280" }}>${(fixedCosts.find(fc => fc.key === "butterflies")?.amount ?? 15).toFixed(2)}</span>}
              </label>

              {/* Chain */}
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="checkbox" checked={chain} onChange={e => setChain(e.target.checked)} style={{ accentColor: "#635BFF", width: 16, height: 16, cursor: "pointer" }} />
                  <span style={{ fontSize: 14, color: "#374151" }}>Chain (bracelet/necklace)</span>
                </div>
                {isManager && chain && <span style={{ fontSize: 13, color: "#6B7280" }}>${(fixedCosts.find(fc => fc.key === "chain")?.amount ?? 40).toFixed(2)}</span>}
              </label>

              {/* Additional Labour */}
              <div>
                <Toggle on={additionalLabour} onChange={setAdditionalLabour}>Additional Labour</Toggle>
                {additionalLabour && (
                  <div style={{ marginTop: 8, paddingLeft: 50 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ ...label, marginBottom: 0 }}>Amount ($)</label>
                      <input style={{ ...input, width: 120 }} type="number" min="0" step="0.01" value={additionalLabourAmount} onChange={e => setAdditionalLabourAmount(e.target.value)} placeholder="0.00" />
                    </div>
                  </div>
                )}
              </div>

              {/* Hand Engraving */}
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="checkbox" checked={handEngraving} onChange={e => setHandEngraving(e.target.checked)} style={{ accentColor: "#635BFF", width: 16, height: 16, cursor: "pointer" }} />
                  <span style={{ fontSize: 14, color: "#374151" }}>Hand Engraving</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isManager && <span style={{ fontSize: 12, color: "#9CA3AF" }}>$</span>}
                  {isManager && (
                    <input
                      type="number" min="0" step="1" value={handEngravingAmount}
                      onChange={e => setHandEngravingAmount(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      style={{ ...input, width: 80, padding: "4px 8px", fontSize: 13 }}
                    />
                  )}
                  {!isManager && handEngraving && <span style={{ fontSize: 13, color: "#6B7280" }}>Included</span>}
                </div>
              </label>

              {/* Laser Engraving */}
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input type="checkbox" checked={laserEngraving} onChange={e => setLaserEngraving(e.target.checked)} style={{ accentColor: "#635BFF", width: 16, height: 16, cursor: "pointer" }} />
                  <span style={{ fontSize: 14, color: "#374151" }}>Laser Engraving</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isManager && <span style={{ fontSize: 12, color: "#9CA3AF" }}>$</span>}
                  {isManager && (
                    <input
                      type="number" min="0" step="1" value={laserEngravingAmount}
                      onChange={e => setLaserEngravingAmount(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      style={{ ...input, width: 80, padding: "4px 8px", fontSize: 13 }}
                    />
                  )}
                  {!isManager && laserEngraving && <span style={{ fontSize: 13, color: "#6B7280" }}>Included</span>}
                </div>
              </label>
            </div>
          </div>

          {/* ── Section 8: AI Description ── */}
          <div style={card}>
            <div style={{ ...heading, marginBottom: 0, paddingBottom: 0, borderBottom: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Quote Description</span>
              <button
                onClick={() => generateDescription()}
                disabled={aiGenerating}
                style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #635BFF", background: "#EEF2FF", color: "#635BFF", fontSize: 12, fontWeight: 600, cursor: aiGenerating ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                {aiGenerating ? (
                  <>
                    <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #635BFF", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
                    Generating…
                  </>
                ) : "↺ Regenerate"}
              </button>
            </div>
            <div style={{ borderBottom: "1px solid #E8E8F0", marginBottom: 14, marginTop: 8 }} />
            <label style={{ ...label, fontSize: 12, color: "#9CA3AF", fontWeight: 400 }}>AI Generated — editable</label>
            <textarea
              style={{ ...input, minHeight: 80, resize: "vertical", lineHeight: 1.6 }}
              value={aiDesc}
              onChange={e => setAiDesc(e.target.value)}
              onFocus={focus}
              onBlur={blur}
              placeholder="Fill in fields above and the AI will generate a description automatically…"
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>

          {/* ── Internal Notes ── */}
          <div style={card}>
            <div style={heading}>Internal Notes</div>
            <textarea
              style={{ ...input, minHeight: 60, resize: "vertical" }}
              value={internalNotes}
              onChange={e => setInternalNotes(e.target.value)}
              onFocus={focus}
              onBlur={blur}
              placeholder="Staff notes (not shown to customer)…"
            />
          </div>

          {/* ── Section 9: Price Override (Manager Only) ── */}
          {isManager && (
            <div style={card}>
              <div style={heading}>Price Override</div>

              {/* Full line-by-line cost breakdown */}
              <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13 }}>
                <div style={{ fontWeight: 600, color: "#374151", marginBottom: 10 }}>Cost Breakdown</div>

                {/* ── Metals ── */}
                {metals.filter(m => m.type).map((m, idx) => {
                  const rate = metalRates.find(r => r.metal_type === m.type);
                  const cost = rate ? (parseFloat(m.weight) || 0) * rate.price_per_gram : 0;
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ color: "#6B7280" }}>
                        Metal {idx + 1}: {m.type} — {m.weight || "0"}g × ${rate?.price_per_gram.toFixed(2) ?? "0.00"}/g
                      </span>
                      <span style={{ fontWeight: 500 }}>${cost.toFixed(2)}</span>
                    </div>
                  );
                })}

                {/* ── Main stones ── */}
                {includeMainStone && stones.map((s, idx) => {
                  const cost = parseFloat(s.cost) || 0;
                  const parts = [
                    s.caratWeight && `${s.caratWeight}ct`,
                    s.shape,
                    (s.colour || s.clarity) && `${s.colour}${s.colour && s.clarity ? "/" : ""}${s.clarity}`,
                    s.origin,
                  ].filter(Boolean).join(" ");
                  return (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ color: "#6B7280" }}>Stone {idx + 1}: {parts || "—"}</span>
                      <span style={{ fontWeight: 500 }}>${cost.toFixed(2)}</span>
                    </div>
                  );
                })}

                {/* ── Stone settings ── */}
                {includeMainStone && stones.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: "#6B7280" }}>
                      Stone Settings: {stones.length} stone{stones.length !== 1 ? "s" : ""} × ${pricing.mainStoneSettingRate.toFixed(2)}
                    </span>
                    <span style={{ fontWeight: 500 }}>${pricing.mainStoneSettingCost.toFixed(2)}</span>
                  </div>
                )}

                {/* ── Melee rows ── */}
                {meleeRows.filter(r => r.stoneType).map((r, idx) => {
                  const rowTotal = (parseFloat(r.individualCost) || 0) * (parseInt(r.qty) || 0);
                  const desc = `${r.qty || 1}× ${r.stoneType}${r.shape ? ` ${r.shape}` : ""}`;
                  return (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ color: "#6B7280" }}>Melee {idx + 1}: {desc}</span>
                      <span style={{ fontWeight: 500 }}>${rowTotal.toFixed(2)}</span>
                    </div>
                  );
                })}

                {/* ── Melee settings ── */}
                {smallSettings && (parseInt(smallSettingsQty) || 0) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: "#6B7280" }}>
                      Melee Settings: {smallSettingsQty} stone{parseInt(smallSettingsQty) !== 1 ? "s" : ""} × $30.00
                    </span>
                    <span style={{ fontWeight: 500 }}>${(pricing.costMap.smallSettings ?? 0).toFixed(2)}</span>
                  </div>
                )}

                {/* ── Labour (always) ── */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ color: "#6B7280" }}>Labour</span>
                  <span style={{ fontWeight: 500 }}>${(pricing.costMap.labour ?? 0).toFixed(2)}</span>
                </div>

                {/* ── Butterflies ── */}
                {butterflies && (pricing.costMap.butterflies ?? 0) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: "#6B7280" }}>Butterflies (earrings)</span>
                    <span style={{ fontWeight: 500 }}>${(pricing.costMap.butterflies ?? 0).toFixed(2)}</span>
                  </div>
                )}

                {/* ── Chain ── */}
                {chain && (pricing.costMap.chain ?? 0) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: "#6B7280" }}>Chain</span>
                    <span style={{ fontWeight: 500 }}>${(pricing.costMap.chain ?? 0).toFixed(2)}</span>
                  </div>
                )}

                {/* ── Additional labour ── */}
                {additionalLabour && pricing.extraLabour > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: "#6B7280" }}>Additional Labour</span>
                    <span style={{ fontWeight: 500 }}>${pricing.extraLabour.toFixed(2)}</span>
                  </div>
                )}

                {/* ── Hand engraving ── */}
                {handEngraving && pricing.handEngravingCost > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: "#6B7280" }}>Hand Engraving</span>
                    <span style={{ fontWeight: 500 }}>${pricing.handEngravingCost.toFixed(2)}</span>
                  </div>
                )}

                {/* ── Laser engraving ── */}
                {laserEngraving && pricing.laserEngravingCost > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: "#6B7280" }}>Laser Engraving</span>
                    <span style={{ fontWeight: 500 }}>${pricing.laserEngravingCost.toFixed(2)}</span>
                  </div>
                )}

                {/* ── Divider ── */}
                <div style={{ borderTop: "1px solid #D1D5DB", margin: "10px 0" }} />

                {/* ── Subtotal ── */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontWeight: 600, color: "#374151" }}>Subtotal</span>
                  <span style={{ fontWeight: 700, color: "#374151" }}>${pricing.totalCost.toFixed(2)}</span>
                </div>

                {/* ── Multiplier ── */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ color: "#6B7280" }}>
                    Multiplier{marginMultiplierOverride ? " (override)" : ""}
                  </span>
                  <span style={{ fontWeight: 500, color: marginMultiplierOverride ? "#D97706" : "#374151" }}>
                    ×{pricing.activeMultiplier?.toFixed(2) ?? "—"}
                  </span>
                </div>

                {/* ── Raw price ── */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ color: "#6B7280" }}>Raw Price</span>
                  <span style={{ fontWeight: 500 }}>${pricing.rawPrice.toFixed(2)}</span>
                </div>

                {/* ── Rounded price ── */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ color: "#6B7280" }}>Rounded Price (nearest $50)</span>
                  <span style={{ fontWeight: 500 }}>${pricing.quotedPrice.toLocaleString("en-AU")}</span>
                </div>

                {/* ── Retail override (if set) ── */}
                {retailPriceOverride && parseFloat(retailPriceOverride) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: "#D97706", fontWeight: 500 }}>Retail Override</span>
                    <span style={{ fontWeight: 500, color: "#D97706" }}>${parseFloat(retailPriceOverride).toLocaleString("en-AU")}</span>
                  </div>
                )}

                {/* ── Final quoted price ── */}
                <div style={{ borderTop: "1px solid #D1D5DB", margin: "8px 0 8px", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, color: "#1A1A2E", fontSize: 14 }}>Final Quoted Price</span>
                  <span style={{ fontWeight: 800, color: "#635BFF", fontSize: 14 }}>
                    ${pricing.finalPrice.toLocaleString("en-AU")}
                  </span>
                </div>
              </div>

              {/* Override inputs */}
              <div style={row2}>
                <div>
                  <label style={{ ...label, color: "#D97706" }}>Retail Price Override ($)</label>
                  <input
                    style={{ ...input, borderColor: retailPriceOverride ? "#D97706" : "#E8E8F0" }}
                    type="number" min="0" step="50" value={retailPriceOverride}
                    onChange={e => setRetailPriceOverride(e.target.value)}
                    onFocus={focus} onBlur={blur}
                    placeholder="Leave blank to use calculated price"
                  />
                  {retailPriceOverride && <div style={{ fontSize: 11, color: "#D97706", marginTop: 4 }}>⚠ Overrides system-calculated price</div>}
                </div>
                <div>
                  <label style={{ ...label, color: "#D97706" }}>Margin Multiplier Override</label>
                  <input
                    style={{ ...input, borderColor: marginMultiplierOverride ? "#D97706" : "#E8E8F0" }}
                    type="number" min="1" step="0.05" value={marginMultiplierOverride}
                    onChange={e => setMarginMultiplierOverride(e.target.value)}
                    onFocus={focus} onBlur={blur}
                    placeholder="e.g. 2.50"
                  />
                  {marginMultiplierOverride && <div style={{ fontSize: 11, color: "#D97706", marginTop: 4 }}>⚠ Overrides bracket multiplier</div>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Price panel ── */}
        <div style={{ position: "sticky", top: 24 }}>
          <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Live Price</div>

            {/* Manager multiplier badge */}
            {isManager && pricing.mult != null && pricing.mColour && (() => {
              const cs = MULT_COLOURS[pricing.mColour];
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: cs.bg, marginBottom: 12, fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: cs.text }}>×{pricing.mult.toFixed(2)}</span>
                  <span style={{ fontSize: 12, color: cs.text, opacity: 0.8 }}>
                    ${(pricing.finalPrice - pricing.totalCost).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} profit
                  </span>
                  {pricing.finalPrice !== pricing.quotedPrice && (
                    <span style={{ fontSize: 11, color: "#D97706", marginLeft: "auto", fontWeight: 600 }}>overridden</span>
                  )}
                </div>
              );
            })()}

            {/* Quoted price — visible to all */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>Quoted Price (incl. GST)</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: "#1A1A2E", lineHeight: 1 }}>
                {pricing.finalPrice > 0 ? `$${pricing.finalPrice.toLocaleString("en-AU")}` : "—"}
              </div>
            </div>

            {/* Item type badge */}
            {(subcategory || itemType) && (
              <div style={{ marginBottom: 16, fontSize: 13, color: "#374151" }}>
                <span style={{ background: "#EEF2FF", color: "#635BFF", borderRadius: 6, padding: "3px 10px", fontWeight: 600 }}>
                  {subcategory === "Other" ? subcategoryOther || "Other" : subcategory || itemType}
                </span>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={handleSave} disabled={saving}
                style={{ width: "100%", padding: "12px 0", borderRadius: 10, background: saving ? "#9CA3AF" : "#635BFF", color: "#fff", border: "none", cursor: saving ? "not-allowed" : "pointer", fontSize: 15, fontWeight: 600, transition: "background .15s" }}
                onMouseEnter={e => { if (!saving) (e.currentTarget.style.background = "#4F46E5"); }}
                onMouseLeave={e => { if (!saving) (e.currentTarget.style.background = "#635BFF"); }}
              >{saving ? "Saving…" : "Save Quote"}</button>
              <button
                onClick={handlePrintPDF}
                style={{ width: "100%", padding: "12px 0", borderRadius: 10, background: "#fff", color: "#635BFF", border: "1px solid #635BFF", cursor: "pointer", fontSize: 15, fontWeight: 600, transition: "background .15s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#EEF2FF")}
                onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
              >Print PDF</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Nivoda Modal ── */}
      <NivodaModal
        open={showNivodaModal}
        onClose={() => setShowNivodaModal(false)}
        onSelectStone={handleSelectNivodaStone}
        tenantId={user?.tenantId ?? ""}
      />

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#1A1A2E", color: "#fff", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 500, zIndex: 1000, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
