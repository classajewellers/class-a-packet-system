"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import Link from "next/link";
import { generateQuoteHTML } from "@/lib/quoteGenerator";
import { calculateRetailPrice, calculateMultiplier, multiplierColour } from "@/lib/marginCalculator";

interface MetalRate { id: string; metal_type: string; price_per_gram: number; }
interface FixedCost { id: string; key: string; label: string; amount: number; }
interface MarginBracket { id: string; cost_min: number; cost_max: number | null; multiplier: number; }
interface QuoteTemplate { id: string; name: string; includes_labour: boolean; includes_main_stone_setting: boolean; includes_chain: boolean; includes_butterflies: boolean; default_metal: string | null; sort_order: number; }

interface StoneEntry {
  id: string;
  caratWeight: string;
  shape: string;
  colour: string;
  clarity: string;
  origin: 'Lab Grown' | 'Natural';
  cost: string; // manager only
}

interface BuilderItem {
  id: string;
  job_type: string;
  description: string;
  retail_price: string;
  cost_price: string;
}

function newStone(): StoneEntry {
  return { id: Math.random().toString(36).slice(2), caratWeight: '', shape: '', colour: '', clarity: '', origin: 'Lab Grown', cost: '' };
}

function newBuilderItem(): BuilderItem {
  return { id: Math.random().toString(36).slice(2), job_type: '', description: '', retail_price: '', cost_price: '' };
}

const TEMPLATE_EMOJI: Record<string, string> = {
  'Engagement Ring': '💍',
  'Ring Resize / Repair': '🔧',
  'Pendant / Necklace': '📿',
  'Earrings': '✨',
  'Bracelet / Bangle': '⌚',
  'Custom Job': '⭐',
};

const BUILDER_JOB_TYPES = ['Engagement Ring', 'Wedding Ring', 'Fine Jewellery', 'Repair', 'Other'] as const;

const BUILDER_JOB_PLACEHOLDERS: Record<string, string> = {
  'Engagement Ring': 'e.g. 18ct White Gold Solitaire Engagement Ring, 4 Claw, Size: N',
  'Wedding Ring':    'e.g. 18ct Yellow Gold Half Round Wedding Ring 5.5mm × 1.5mm, Size: Q',
  'Fine Jewellery':  'e.g. 18ct Rose Gold Diamond Tennis Bracelet, 2.00ct TW',
  'Repair':          'e.g. Resize platinum ring from Size L to Size N, re-tip 4 claws',
  'Other':           'e.g. Custom repair, alteration, or other work',
};

export default function QuoteBuilderPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const isManager = canManage(user?.role);

  // Pricing data
  const [metalRates, setMetalRates] = useState<MetalRate[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [marginBrackets, setMarginBrackets] = useState<MarginBracket[]>([]);
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);

  // Customer
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Template
  const [selectedTemplate, setSelectedTemplate] = useState<QuoteTemplate | null>(null);

  // Metal
  const [metalType, setMetalType] = useState('');
  const [weight, setWeight] = useState('');

  // Design description
  const [design, setDesign] = useState('');

  // Main stone (multi-entry)
  const [includeMainStone, setIncludeMainStone] = useState(false);
  const [stones, setStones] = useState<StoneEntry[]>([newStone()]);

  // Add-ons (labour always included; main stone setting is auto-calculated from stoneQty)
  const [smallSettings, setSmallSettings] = useState(false);
  const [smallSettingsQty, setSmallSettingsQty] = useState('1');
  const [butterflies, setButterflies] = useState(false);
  const [chain, setChain] = useState(false);
  const [additionalLabour, setAdditionalLabour] = useState(false);
  const [additionalLabourAmount, setAdditionalLabourAmount] = useState('');

  // Builder items (multi-item quote lines)
  const [builderItems, setBuilderItems] = useState<BuilderItem[]>([newBuilderItem()]);

  // Description
  const [quoteDescription, setQuoteDescription] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  useEffect(() => {
    fetch('/api/pricing', { headers: { 'x-tenant-id': user?.tenantId ?? '' } }).then(r => r.json()).then(json => {
      setMetalRates(json.metalRates ?? []);
      setFixedCosts(json.fixedCosts ?? []);
      setMarginBrackets(json.marginBrackets ?? []);
      setTemplates(json.templates ?? []);
    }).catch(() => {});
  }, []);

  const pricing = useMemo(() => {
    const metalRate = metalRates.find(r => r.metal_type === metalType);
    const metalCost = metalRate ? (parseFloat(weight) || 0) * metalRate.price_per_gram : 0;

    // Main stone cost: sum of all individual stone costs (manager/admin only)
    const mainStoneCost = (includeMainStone && isManager)
      ? stones.reduce((sum, s) => sum + (parseFloat(s.cost) || 0), 0)
      : 0;

    let addonsCost = 0;
    const costMap: Record<string, number> = {};

    // Main stone setting cost: stones.length × rate (only when main stone is on)
    const mainStoneSettingRate = fixedCosts.find(fc => fc.key === 'main_stone_setting')?.amount ?? 80;
    const mainStoneSettingCost = includeMainStone ? stones.length * mainStoneSettingRate : 0;
    if (mainStoneSettingCost > 0) {
      addonsCost += mainStoneSettingCost;
      costMap.mainStoneSetting = mainStoneSettingCost;
    }

    for (const fc of fixedCosts) {
      // Labour is always included
      if (fc.key === 'labour') { addonsCost += fc.amount; costMap.labour = fc.amount; }
      if (fc.key === 'butterflies' && butterflies) { addonsCost += fc.amount; costMap.butterflies = fc.amount; }
      if (fc.key === 'chain' && chain) { addonsCost += fc.amount; costMap.chain = fc.amount; }
    }
    if (smallSettings) {
      const smallCost = (parseInt(smallSettingsQty) || 0) * 30;
      addonsCost += smallCost;
      costMap.smallSettings = smallCost;
    }
    const extraLabour = additionalLabour ? (parseFloat(additionalLabourAmount) || 0) : 0;
    addonsCost += extraLabour;

    const totalCost = metalCost + mainStoneCost + addonsCost;

    // Suggested retail from blended margin calculator (lib/marginCalculator.ts)
    const suggestedRetail = totalCost > 0 ? calculateRetailPrice(totalCost) : 0;

    // Legacy DB bracket multiplier (kept for backward compat with quotedPrice)
    const bracket = marginBrackets.find(b =>
      totalCost >= b.cost_min && (b.cost_max == null || totalCost <= b.cost_max)
    ) ?? marginBrackets[marginBrackets.length - 1];

    const rawPrice = bracket ? totalCost * bracket.multiplier : totalCost;
    // Quoted price: prefer blended suggested retail, fall back to DB bracket
    const quotedPrice = suggestedRetail > 0 ? suggestedRetail : Math.ceil(rawPrice / 50) * 50;

    // Multiplier against total cost (using quotedPrice as retail)
    const mult = calculateMultiplier(quotedPrice, totalCost);
    const mColour = mult != null ? multiplierColour(mult) : null;

    return { metalCost, mainStoneCost, mainStoneSettingCost, addonsCost, totalCost, bracket, rawPrice, quotedPrice, suggestedRetail, mult, mColour, costMap, extraLabour };
  }, [metalType, weight, metalRates, includeMainStone, stones, isManager, fixedCosts, smallSettings, smallSettingsQty, butterflies, chain, additionalLabour, additionalLabourAmount, marginBrackets]);

  // Sum retail/cost prices from builder items
  const itemsRetailTotal = builderItems.reduce((sum, item) => {
    const p = parseFloat(item.retail_price) || 0;
    return sum + p;
  }, 0);
  const itemsCostTotal = isManager ? builderItems.reduce((sum, item) => {
    const c = parseFloat(item.cost_price) || 0;
    return sum + c;
  }, 0) : 0;

  const effectiveRetail = itemsRetailTotal > 0 ? itemsRetailTotal : pricing.quotedPrice;
  const effectiveCost = itemsCostTotal > 0 ? itemsCostTotal : pricing.totalCost;
  const effectiveMult = calculateMultiplier(effectiveRetail, effectiveCost);
  const effectiveMColour = effectiveMult != null ? multiplierColour(effectiveMult) : null;

  function updateBuilderItem(id: string, field: keyof BuilderItem, value: string) {
    setBuilderItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  }

  function selectTemplate(t: QuoteTemplate) {
    setSelectedTemplate(t);
    if (t.default_metal) setMetalType(t.default_metal);
    setChain(t.includes_chain);
    setButterflies(t.includes_butterflies);
  }

  async function handleSave() {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = 'First name is required';
    if (!lastName.trim()) errs.lastName = 'Last name is required';
    if (!email.trim() && !phone.trim()) errs.contact = 'At least one of email or phone is required';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      const quoteType = selectedTemplate?.name === 'Ring Resize / Repair' ? 'repair' : 'custom_order';
      const qbd = {
        items: builderItems,
        design: design || null,
        template: selectedTemplate?.name ?? null,
        metal: { type: metalType, weight: parseFloat(weight) || 0, cost: pricing.metalCost },
        main_stone: includeMainStone ? stones.map(s => ({
          carat_weight: parseFloat(s.caratWeight) || null,
          shape: s.shape || null,
          colour: s.colour || null,
          clarity: s.clarity || null,
          origin: s.origin,
          cost: isManager ? (parseFloat(s.cost) || 0) : 0,
        })) : null,
        setting_cost: pricing.mainStoneSettingCost,
        addons: {
          labour: fixedCosts.find(fc => fc.key === 'labour')?.amount ?? 300,
          small_settings_qty: smallSettings ? (parseInt(smallSettingsQty) || 0) : 0,
          small_settings_cost: pricing.costMap.smallSettings ?? 0,
          butterflies: butterflies,
          chain: chain,
          additional_labour: parseFloat(additionalLabourAmount) || 0,
        },
        total_cost: effectiveCost,
        multiplier: pricing.bracket?.multiplier ?? null,
        raw_price: pricing.rawPrice,
        quoted_price: effectiveRetail,
      };
      const res = await fetch('/api/quotes/builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify({
          firstName, lastName, email, phone,
          assignedTo: user?.name ?? null,
          template: selectedTemplate?.name ?? null,
          quoteDescription, internalNotes,
          quotedPrice: effectiveRetail,
          totalCost: effectiveCost,
          multiplier: pricing.bracket?.multiplier ?? null,
          rawPrice: pricing.rawPrice,
          quoteBuilderData: qbd,
          quoteType,
          pipelineStage: 'Pending',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      setToast('Quote saved successfully');
      setTimeout(() => router.push('/quotes'), 1500);
    } catch (err) {
      setToast('Error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  function handlePrintPDF() {
    const now = new Date().toISOString();
    const pdfQbd: Record<string, unknown> = {
      design: design || null,
      items: builderItems.map(item => ({
        job_type: item.job_type,
        description: item.description,
        retail_price: item.retail_price,
      })),
    };
    if (includeMainStone) {
      pdfQbd.main_stone = stones.map(s => ({
        carat_weight: parseFloat(s.caratWeight) || null,
        shape: s.shape || null,
        colour: s.colour || null,
        clarity: s.clarity || null,
        origin: s.origin,
      }));
    }
    const quoteObj = {
      id: 'preview',
      created_at: now,
      reference_number: 'PREVIEW',
      quote_type: 'custom_order' as const,
      status: 'pending',
      customer_first_name: firstName || null,
      customer_last_name: lastName || null,
      customer_email: email || null,
      customer_phone: phone || null,
      item_description: design || null,
      line_items: [],
      notes: null,
      repair_description: null,
      design_brief: design || null,
      metal_type: metalType || null,
      stone_details: null,
      estimated_turnaround: null,
      staff_member: user?.name ?? null,
      converted_to_packet_id: null,
      converted_at: null,
      packet_reference: null,
      assigned_to: user?.name ?? null,
      follow_up_date: null,
      status_changed_at: null,
      status_changed_by: null,
      pending_at: null,
      follow_up_1_at: null,
      follow_up_2_at: null,
      job_won_at: null,
      job_lost_at: null,
      total: effectiveRetail,
      quote_builder_data: pdfQbd,
      quoted_price: effectiveRetail,
    };
    const html = generateQuoteHTML(quoteObj);
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  }

  if (!hydrated) return null;

  // Styles
  const sectionCard: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #E8E8F0',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  };
  const sectionHeading: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 14,
    paddingBottom: 8,
    borderBottom: '1px solid #E8E8F0',
    margin: '0 0 14px 0',
  };
  const inputStyle: React.CSSProperties = {
    border: '1px solid #E8E8F0',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 14,
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 4,
    display: 'block',
  };
  const errorStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  };
  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    marginBottom: 12,
  };

  function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => onChange(!on)}>
        <div style={{
          width: 40, height: 22, borderRadius: 11,
          background: on ? '#635BFF' : '#D1D5DB',
          position: 'relative', transition: 'background .2s', flexShrink: 0,
        }}>
          <div style={{
            position: 'absolute', top: 3, left: on ? 21 : 3,
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </div>
        <span style={{ fontSize: 14, color: '#374151' }}>{label}</span>
      </div>
    );
  }

  const MULT_COLOURS = {
    green:  { bg: '#DCFCE7', text: '#15803D' },
    orange: { bg: '#FEF9C3', text: '#B45309' },
    red:    { bg: '#FEE2E2', text: '#DC2626' },
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <Link href="/quotes" style={{ color: '#6B7280', textDecoration: 'none', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Quotes
        </Link>
        <span style={{ color: '#D1D5DB' }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>Build Quote</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
        {/* Left: Form */}
        <div style={{ minWidth: 0 }}>

          {/* Customer details */}
          <div style={sectionCard}>
            <div style={sectionHeading}>Customer Details</div>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>First Name</label>
                <input
                  style={{ ...inputStyle, borderColor: errors.firstName ? '#EF4444' : '#E8E8F0' }}
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  onFocus={e => (e.target.style.borderColor = '#635BFF')}
                  onBlur={e => (e.target.style.borderColor = errors.firstName ? '#EF4444' : '#E8E8F0')}
                  placeholder="Jane"
                />
                {errors.firstName && <div style={errorStyle}>{errors.firstName}</div>}
              </div>
              <div>
                <label style={labelStyle}>Last Name</label>
                <input
                  style={{ ...inputStyle, borderColor: errors.lastName ? '#EF4444' : '#E8E8F0' }}
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  onFocus={e => (e.target.style.borderColor = '#635BFF')}
                  onBlur={e => (e.target.style.borderColor = errors.lastName ? '#EF4444' : '#E8E8F0')}
                  placeholder="Smith"
                />
                {errors.lastName && <div style={errorStyle}>{errors.lastName}</div>}
              </div>
            </div>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  style={{ ...inputStyle, borderColor: errors.contact ? '#EF4444' : '#E8E8F0' }}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onFocus={e => (e.target.style.borderColor = '#635BFF')}
                  onBlur={e => (e.target.style.borderColor = errors.contact ? '#EF4444' : '#E8E8F0')}
                  placeholder="jane@example.com"
                />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input
                  style={{ ...inputStyle, borderColor: errors.contact ? '#EF4444' : '#E8E8F0' }}
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onFocus={e => (e.target.style.borderColor = '#635BFF')}
                  onBlur={e => (e.target.style.borderColor = errors.contact ? '#EF4444' : '#E8E8F0')}
                  placeholder="04xx xxx xxx"
                />
              </div>
            </div>
            {errors.contact && <div style={errorStyle}>{errors.contact}</div>}
          </div>

          {/* Quote Items */}
          <div style={sectionCard}>
            <div style={sectionHeading}>Quote Items</div>

            {builderItems.map((item, idx) => {
              const itemRetail = parseFloat(item.retail_price) || 0;
              const itemCost = parseFloat(item.cost_price) || 0;
              const itemMult = isManager && itemRetail > 0 && itemCost > 0
                ? calculateMultiplier(itemRetail, itemCost)
                : null;
              const itemMColour = itemMult != null ? multiplierColour(itemMult) : null;

              return (
                <div
                  key={item.id}
                  style={{
                    background: '#F9FAFB',
                    border: '1px solid #E8E8F0',
                    borderRadius: 10,
                    padding: 14,
                    marginBottom: idx < builderItems.length - 1 ? 12 : 0,
                  }}
                >
                  {/* Item header row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Item {idx + 1}</span>
                    {builderItems.length > 1 && (
                      <button
                        onClick={() => setBuilderItems(prev => prev.filter(i => i.id !== item.id))}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#9CA3AF', lineHeight: 1, padding: '0 2px' }}
                        title="Remove item"
                      >×</button>
                    )}
                  </div>

                  {/* Job type pill buttons */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                    {BUILDER_JOB_TYPES.map(jt => {
                      const active = item.job_type === jt;
                      return (
                        <button
                          key={jt}
                          type="button"
                          onClick={() => updateBuilderItem(item.id, 'job_type', active ? '' : jt)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            border: `1px solid ${active ? '#635BFF' : '#E8E8F0'}`,
                            background: active ? '#635BFF' : '#fff',
                            color: active ? '#fff' : '#374151',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all .15s',
                          }}
                        >
                          {jt}
                        </button>
                      );
                    })}
                  </div>

                  {/* Description textarea */}
                  <div style={{ marginBottom: 12 }}>
                    <textarea
                      value={item.description}
                      onChange={e => updateBuilderItem(item.id, 'description', e.target.value)}
                      onFocus={e => (e.target.style.borderColor = '#635BFF')}
                      onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                      rows={3}
                      placeholder={
                        item.job_type
                          ? BUILDER_JOB_PLACEHOLDERS[item.job_type] ?? 'Describe what the customer will receive…'
                          : 'Select a type above, then describe what the customer will receive…'
                      }
                      style={{ ...inputStyle, minHeight: 72, resize: 'vertical', lineHeight: 1.6 }}
                    />
                  </div>

                  {/* Price row */}
                  <div style={{ display: 'grid', gridTemplateColumns: isManager ? '1fr 1fr' : '1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Retail Price ($)</label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={item.retail_price}
                        onChange={e => updateBuilderItem(item.id, 'retail_price', e.target.value)}
                        onFocus={e => (e.target.style.borderColor = '#635BFF')}
                        onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                        placeholder="0"
                        style={inputStyle}
                      />
                    </div>
                    {isManager && (
                      <div>
                        <label style={{ ...labelStyle, color: '#635BFF' }}>Cost Price ($)</label>
                        <input
                          type="number"
                          step="1"
                          min="0"
                          value={item.cost_price}
                          onChange={e => updateBuilderItem(item.id, 'cost_price', e.target.value)}
                          onFocus={e => (e.target.style.borderColor = '#635BFF')}
                          onBlur={e => (e.target.style.borderColor = '#C4BFFE')}
                          placeholder="0"
                          style={{ ...inputStyle, borderColor: '#C4BFFE' }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Per-item multiplier badge */}
                  {isManager && itemMult != null && itemMColour && (() => {
                    const cs = MULT_COLOURS[itemMColour];
                    const profit = itemRetail - itemCost;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, background: cs.bg, marginTop: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: cs.text }}>
                          ×{itemMult.toFixed(2)}
                        </span>
                        <span style={{ fontSize: 12, color: cs.text, opacity: 0.75 }}>
                          (${profit.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} profit)
                        </span>
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {/* Add Item button */}
            {builderItems.length < 10 && (
              <button
                onClick={() => setBuilderItems(prev => [...prev, newBuilderItem()])}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 16px', borderRadius: 8, marginTop: 12,
                  border: '1px dashed #635BFF', background: '#EEF2FF',
                  color: '#635BFF', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  transition: 'all .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#E0E7FF')}
                onMouseLeave={e => (e.currentTarget.style.background = '#EEF2FF')}
              >
                + Add Item
              </button>
            )}
          </div>

          {/* Template */}
          <div style={sectionCard}>
            <div style={sectionHeading}>Job Type</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => selectTemplate(t)}
                  style={{
                    padding: '12px 8px',
                    borderRadius: 10,
                    border: selectedTemplate?.id === t.id ? '2px solid #635BFF' : '1px solid #E8E8F0',
                    background: selectedTemplate?.id === t.id ? '#EEF2FF' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{TEMPLATE_EMOJI[t.name] ?? '📋'}</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: selectedTemplate?.id === t.id ? '#635BFF' : '#374151' }}>{t.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Design description */}
          <div style={sectionCard}>
            <div style={sectionHeading}>Design</div>
            <label style={labelStyle}>Design Description</label>
            <input
              style={inputStyle}
              type="text"
              value={design}
              onChange={e => setDesign(e.target.value)}
              onFocus={e => (e.target.style.borderColor = '#635BFF')}
              onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
              placeholder="e.g. Stella Trilogy Engagement Ring, Florence Solitaire, Custom Pendant"
            />
          </div>

          {/* Metal */}
          <div style={sectionCard}>
            <div style={sectionHeading}>Metal</div>
            <div style={rowStyle}>
              <div>
                <label style={labelStyle}>Metal Type</label>
                <select
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={metalType}
                  onChange={e => setMetalType(e.target.value)}
                  onFocus={e => (e.target.style.borderColor = '#635BFF')}
                  onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                >
                  <option value="">Select metal…</option>
                  {metalRates.map(r => (
                    <option key={r.id} value={r.metal_type}>{r.metal_type}</option>
                  ))}
                </select>
                {isManager && metalType && (
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                    Rate: ${metalRates.find(r => r.metal_type === metalType)?.price_per_gram.toFixed(2)}/g
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Weight (grams)</label>
                <input
                  style={inputStyle}
                  type="number"
                  step="0.1"
                  min="0"
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  onFocus={e => (e.target.style.borderColor = '#635BFF')}
                  onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                  placeholder="e.g. 5.5"
                />
                {isManager && weight && metalType && (
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                    Metal cost: ${pricing.metalCost.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stones */}
          <div style={sectionCard}>
            <div style={sectionHeading}>Main Stone</div>
            <div style={{ marginBottom: includeMainStone ? 12 : 0 }}>
              <Toggle on={includeMainStone} onChange={setIncludeMainStone} label="Include Main Stone" />
            </div>
            {includeMainStone && (
              <div style={{ marginTop: 12 }}>
                {stones.map((stone, idx) => (
                  <div key={stone.id} style={{ marginBottom: 16, padding: '14px 14px 12px', borderRadius: 10, border: '1px solid #E8E8F0', background: '#FAFAFA', position: 'relative' }}>
                    {/* Stone header row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Stone {idx + 1}</span>
                      {stones.length > 1 && (
                        <button
                          onClick={() => setStones(prev => prev.filter(s => s.id !== stone.id))}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#9CA3AF', lineHeight: 1, padding: '0 2px' }}
                          title="Remove stone"
                        >×</button>
                      )}
                    </div>

                    {/* Specs grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={labelStyle}>Carat Weight</label>
                        <input
                          style={inputStyle}
                          type="number"
                          step="0.01"
                          min="0"
                          value={stone.caratWeight}
                          onChange={e => setStones(prev => prev.map(s => s.id === stone.id ? { ...s, caratWeight: e.target.value } : s))}
                          onFocus={e => (e.target.style.borderColor = '#635BFF')}
                          onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                          placeholder="0.00ct"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Shape</label>
                        <input
                          style={inputStyle}
                          type="text"
                          value={stone.shape}
                          onChange={e => setStones(prev => prev.map(s => s.id === stone.id ? { ...s, shape: e.target.value } : s))}
                          onFocus={e => (e.target.style.borderColor = '#635BFF')}
                          onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                          placeholder="e.g. Round Brilliant, Oval"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Colour</label>
                        <input
                          style={inputStyle}
                          type="text"
                          value={stone.colour}
                          onChange={e => setStones(prev => prev.map(s => s.id === stone.id ? { ...s, colour: e.target.value } : s))}
                          onFocus={e => (e.target.style.borderColor = '#635BFF')}
                          onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                          placeholder="e.g. F, G, H"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Clarity</label>
                        <input
                          style={inputStyle}
                          type="text"
                          value={stone.clarity}
                          onChange={e => setStones(prev => prev.map(s => s.id === stone.id ? { ...s, clarity: e.target.value } : s))}
                          onFocus={e => (e.target.style.borderColor = '#635BFF')}
                          onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                          placeholder="e.g. VS1, VS2, SI1"
                        />
                      </div>
                    </div>

                    {/* Origin toggle */}
                    <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #E8E8F0', width: 'fit-content', marginBottom: isManager ? 10 : 0 }}>
                      {(['Lab Grown', 'Natural'] as const).map(o => (
                        <button
                          key={o}
                          onClick={() => setStones(prev => prev.map(s => s.id === stone.id ? { ...s, origin: o } : s))}
                          style={{
                            padding: '6px 18px', border: 'none', cursor: 'pointer',
                            fontSize: 13, fontWeight: 500,
                            background: stone.origin === o ? '#635BFF' : '#fff',
                            color: stone.origin === o ? '#fff' : '#635BFF',
                            transition: 'all .15s',
                          }}
                        >{o}</button>
                      ))}
                    </div>

                    {/* Manager/Admin: per-stone cost price */}
                    {isManager && (
                      <div>
                        <label style={labelStyle}>Cost Price ($)</label>
                        <input
                          style={{ ...inputStyle, width: 140 }}
                          type="number"
                          min="0"
                          step="0.01"
                          value={stone.cost}
                          onChange={e => setStones(prev => prev.map(s => s.id === stone.id ? { ...s, cost: e.target.value } : s))}
                          onFocus={e => (e.target.style.borderColor = '#635BFF')}
                          onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                          placeholder="$0.00"
                        />
                      </div>
                    )}
                  </div>
                ))}

                {/* Add Stone button */}
                <button
                  onClick={() => setStones(prev => [...prev, newStone()])}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 8,
                    border: '1px dashed #635BFF', background: '#EEF2FF',
                    color: '#635BFF', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    transition: 'all .15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#E0E7FF')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#EEF2FF')}
                >
                  + Add Stone
                </button>
              </div>
            )}
          </div>

          {/* Add-ons */}
          <div style={sectionCard}>
            <div style={sectionHeading}>Add-ons & Labour</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Labour — always included, no toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E8E8F0' }}>
                <span style={{ fontSize: 14, color: '#374151', fontWeight: 500 }}>Labour</span>
                {isManager && (
                  <span style={{ fontSize: 13, color: '#6B7280' }}>${(fixedCosts.find(fc => fc.key === 'labour')?.amount ?? 300).toFixed(2)}</span>
                )}
              </div>

              {/* Main Stone Setting — auto-calculated from stone count */}
              {isManager && includeMainStone && pricing.mainStoneSettingCost > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E8E8F0' }}>
                  <span style={{ fontSize: 14, color: '#374151' }}>Stone Settings (auto)</span>
                  <span style={{ fontSize: 13, color: '#6B7280' }}>
                    {stones.length} × ${(fixedCosts.find(fc => fc.key === 'main_stone_setting')?.amount ?? 80).toFixed(2)} = ${pricing.mainStoneSettingCost.toFixed(2)}
                  </span>
                </div>
              )}

              <div>
                <Toggle on={smallSettings} onChange={setSmallSettings} label="Small Stone Settings" />
                {smallSettings && (
                  <div style={{ marginTop: 8, paddingLeft: 50 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>Qty</label>
                      <input
                        style={{ ...inputStyle, width: 80 }}
                        type="number"
                        min="1"
                        value={smallSettingsQty}
                        onChange={e => setSmallSettingsQty(e.target.value)}
                      />
                      {isManager && (
                        <span style={{ fontSize: 12, color: '#6B7280' }}>= ${((parseInt(smallSettingsQty) || 0) * 30).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={butterflies}
                    onChange={e => setButterflies(e.target.checked)}
                    style={{ accentColor: '#635BFF', width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 14, color: '#374151' }}>Butterflies (earrings)</span>
                </div>
                {isManager && butterflies && (
                  <span style={{ fontSize: 13, color: '#6B7280' }}>${(fixedCosts.find(fc => fc.key === 'butterflies')?.amount ?? 15).toFixed(2)}</span>
                )}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={chain}
                    onChange={e => setChain(e.target.checked)}
                    style={{ accentColor: '#635BFF', width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 14, color: '#374151' }}>Chain (bracelet/necklace)</span>
                </div>
                {isManager && chain && (
                  <span style={{ fontSize: 13, color: '#6B7280' }}>${(fixedCosts.find(fc => fc.key === 'chain')?.amount ?? 40).toFixed(2)}</span>
                )}
              </label>

              <div>
                <Toggle on={additionalLabour} onChange={setAdditionalLabour} label="Additional Labour" />
                {additionalLabour && (
                  <div style={{ marginTop: 8, paddingLeft: 50 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>Amount ($)</label>
                      <input
                        style={{ ...inputStyle, width: 120 }}
                        type="number"
                        min="0"
                        step="0.01"
                        value={additionalLabourAmount}
                        onChange={e => setAdditionalLabourAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description & Notes */}
          <div style={sectionCard}>
            <div style={sectionHeading}>Description & Notes</div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Quote Description (shown on PDF)</label>
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                value={quoteDescription}
                onChange={e => setQuoteDescription(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#635BFF')}
                onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                placeholder="e.g. 18ct Yellow Gold Engagement Ring with round brilliant lab diamond…"
              />
            </div>
            <div>
              <label style={labelStyle}>Internal Notes (not shown to customer)</label>
              <textarea
                style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                value={internalNotes}
                onChange={e => setInternalNotes(e.target.value)}
                onFocus={e => (e.target.style.borderColor = '#635BFF')}
                onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                placeholder="Staff notes…"
              />
            </div>
          </div>
        </div>

        {/* Right: Price preview */}
        <div style={{ position: 'sticky', top: 24 }}>
          <div style={{ background: '#fff', border: '1px solid #E8E8F0', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
              Live Price
            </div>

            {/* Manager/Admin cost breakdown */}
            {isManager && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Toggle on={showCostBreakdown} onChange={setShowCostBreakdown} label="Show cost breakdown" />
                </div>
                {showCostBreakdown && (
                  <div style={{ background: '#F9FAFB', border: '1px solid #E8E8F0', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>

                    {pricing.metalCost > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#6B7280' }}>
                          Metal{weight && metalType ? ` (${weight}g × $${metalRates.find(r => r.metal_type === metalType)?.price_per_gram.toFixed(2)})` : ''}
                        </span>
                        <span style={{ fontWeight: 500 }}>${pricing.metalCost.toFixed(2)}</span>
                      </div>
                    )}
                    {pricing.mainStoneCost > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#6B7280' }}>Stone cost</span>
                        <span style={{ fontWeight: 500 }}>${pricing.mainStoneCost.toFixed(2)}</span>
                      </div>
                    )}
                    {pricing.costMap.labour !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#6B7280' }}>Labour</span>
                        <span style={{ fontWeight: 500 }}>${pricing.costMap.labour.toFixed(2)}</span>
                      </div>
                    )}
                    {pricing.costMap.mainStoneSetting !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#6B7280' }}>Stone settings ({stones.length}×)</span>
                        <span style={{ fontWeight: 500 }}>${pricing.costMap.mainStoneSetting.toFixed(2)}</span>
                      </div>
                    )}
                    {pricing.costMap.smallSettings !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#6B7280' }}>Small settings ({smallSettingsQty})</span>
                        <span style={{ fontWeight: 500 }}>${pricing.costMap.smallSettings.toFixed(2)}</span>
                      </div>
                    )}
                    {pricing.costMap.butterflies !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#6B7280' }}>Butterflies</span>
                        <span style={{ fontWeight: 500 }}>${pricing.costMap.butterflies.toFixed(2)}</span>
                      </div>
                    )}
                    {pricing.costMap.chain !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#6B7280' }}>Chain</span>
                        <span style={{ fontWeight: 500 }}>${pricing.costMap.chain.toFixed(2)}</span>
                      </div>
                    )}
                    {pricing.extraLabour > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#6B7280' }}>Additional labour</span>
                        <span style={{ fontWeight: 500 }}>${pricing.extraLabour.toFixed(2)}</span>
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid #E8E8F0', marginTop: 8, paddingTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#6B7280', fontWeight: 600 }}>Total cost</span>
                        <span style={{ fontWeight: 700 }}>${pricing.totalCost.toFixed(2)}</span>
                      </div>
                      {pricing.suggestedRetail > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ color: '#6B7280' }}>Suggested retail</span>
                          <span style={{ fontWeight: 500, color: '#635BFF' }}>
                            ${pricing.suggestedRetail.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#6B7280' }}>Quoted price</span>
                        <span style={{ fontWeight: 600 }}>
                          ${pricing.quotedPrice.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Always-visible cost summary (manager/admin) ── */}
            {isManager && (
              <div style={{ background: '#F9FAFB', border: '1px solid #E8E8F0', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#6B7280' }}>Total cost</span>
                  <span style={{ fontWeight: 600, color: pricing.totalCost > 0 ? '#1A1A2E' : '#9CA3AF' }}>
                    {pricing.totalCost > 0 ? `$${pricing.totalCost.toFixed(2)}` : '—'}
                  </span>
                </div>
                {pricing.suggestedRetail > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ color: '#6B7280' }}>Suggested retail</span>
                    <span style={{ fontWeight: 500, color: '#635BFF' }}>
                      ${pricing.suggestedRetail.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: effectiveMult != null && effectiveMColour ? 8 : 0 }}>
                  <span style={{ color: '#6B7280' }}>Quoted price</span>
                  <span style={{ fontWeight: 600 }}>
                    {effectiveRetail > 0
                      ? `$${effectiveRetail.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                      : '—'}
                  </span>
                </div>
                {effectiveMult != null && effectiveMColour && (() => {
                  const cs = MULT_COLOURS[effectiveMColour];
                  const profit = effectiveRetail - effectiveCost;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, background: cs.bg }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cs.text }}>
                        ×{effectiveMult.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 12, color: cs.text, opacity: 0.75 }}>
                        (${profit.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} profit)
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Item price list (when multiple items with prices) */}
            {itemsRetailTotal > 0 && builderItems.length > 1 && (
              <div style={{ marginBottom: 12, fontSize: 13 }}>
                {builderItems.map((item, i) => {
                  const p = parseFloat(item.retail_price) || 0;
                  if (p === 0) return null;
                  return (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#6B7280' }}>
                      <span>Item {i + 1}{item.job_type ? ` · ${item.job_type}` : ''}</span>
                      <span style={{ fontWeight: 500, color: '#1A1A2E' }}>
                        ${p.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  );
                })}
                <div style={{ borderTop: '1px solid #E8E8F0', paddingTop: 6, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#374151', fontSize: 13 }}>
                  <span>Total</span>
                  <span>${itemsRetailTotal.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            )}

            {/* Quoted price */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Quoted Price (incl. GST)</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: '#1A1A2E', lineHeight: 1 }}>
                {effectiveRetail > 0
                  ? `$${effectiveRetail.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                  : '—'}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 10,
                  background: saving ? '#9CA3AF' : '#635BFF',
                  color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: 15, fontWeight: 600, transition: 'background .15s',
                }}
                onMouseEnter={e => { if (!saving) (e.currentTarget.style.background = '#4F46E5'); }}
                onMouseLeave={e => { if (!saving) (e.currentTarget.style.background = '#635BFF'); }}
              >
                {saving ? 'Saving…' : 'Save Quote'}
              </button>
              <button
                onClick={handlePrintPDF}
                style={{
                  width: '100%', padding: '12px 0', borderRadius: 10,
                  background: '#fff', color: '#635BFF',
                  border: '1px solid #635BFF', cursor: 'pointer',
                  fontSize: 15, fontWeight: 600, transition: 'background .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#EEF2FF')}
                onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
              >
                Print PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#1A1A2E', color: '#fff',
          borderRadius: 10, padding: '12px 20px',
          fontSize: 14, fontWeight: 500, zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
