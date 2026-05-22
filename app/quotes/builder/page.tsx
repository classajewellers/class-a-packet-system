"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";
import { generateQuoteHTML } from "@/lib/quoteGenerator";

interface MetalRate { id: string; metal_type: string; price_per_gram: number; }
interface FixedCost { id: string; key: string; label: string; amount: number; }
interface MarginBracket { id: string; cost_min: number; cost_max: number | null; multiplier: number; }
interface MeleeStone { id: string; size_label: string; stone_type: string; price_per_stone: number; }
interface QuoteTemplate { id: string; name: string; includes_labour: boolean; includes_main_stone_setting: boolean; includes_chain: boolean; includes_butterflies: boolean; default_metal: string | null; sort_order: number; }

const TEMPLATE_EMOJI: Record<string, string> = {
  'Engagement Ring': '💍',
  'Ring Resize / Repair': '🔧',
  'Pendant / Necklace': '📿',
  'Earrings': '✨',
  'Bracelet / Bangle': '⌚',
  'Custom Job': '⭐',
};

const CARAT_SIZES = ['0.005ct', '0.01ct', '0.02ct', '0.03ct', '0.05ct', '0.10ct'];

export default function QuoteBuilderPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  // Pricing data
  const [metalRates, setMetalRates] = useState<MetalRate[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [marginBrackets, setMarginBrackets] = useState<MarginBracket[]>([]);
  const [meleeStones, setMeleeStones] = useState<MeleeStone[]>([]);
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

  // Main stone
  const [includeMainStone, setIncludeMainStone] = useState(false);
  const [mainStoneMode, setMainStoneMode] = useState<'melee' | 'gemstone'>('melee');
  const [mainCaratSize, setMainCaratSize] = useState('0.05ct');
  const [mainStoneType, setMainStoneType] = useState('Lab Grown');
  const [mainQty, setMainQty] = useState('1');
  const [gemDescription, setGemDescription] = useState('');
  const [gemCostPrice, setGemCostPrice] = useState('');

  // Accent stones
  const [includeAccentStones, setIncludeAccentStones] = useState(false);
  const [accentCaratSize, setAccentCaratSize] = useState('0.05ct');
  const [accentStoneType, setAccentStoneType] = useState('Lab Grown');
  const [accentQty, setAccentQty] = useState('1');

  // Add-ons
  const [labour, setLabour] = useState(true);
  const [mainStoneSetting, setMainStoneSetting] = useState(false);
  const [smallSettings, setSmallSettings] = useState(false);
  const [smallSettingsQty, setSmallSettingsQty] = useState('1');
  const [butterflies, setButterflies] = useState(false);
  const [chain, setChain] = useState(false);
  const [additionalLabour, setAdditionalLabour] = useState(false);
  const [additionalLabourAmount, setAdditionalLabourAmount] = useState('');

  // Description
  const [quoteDescription, setQuoteDescription] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);

  useEffect(() => {
    fetch('/api/pricing').then(r => r.json()).then(json => {
      setMetalRates(json.metalRates ?? []);
      setFixedCosts(json.fixedCosts ?? []);
      setMarginBrackets(json.marginBrackets ?? []);
      setMeleeStones(json.meleeStones ?? []);
      setTemplates(json.templates ?? []);
    }).catch(() => {});
  }, []);

  const pricing = useMemo(() => {
    const metalRate = metalRates.find(r => r.metal_type === metalType);
    const metalCost = metalRate ? (parseFloat(weight) || 0) * metalRate.price_per_gram : 0;

    let mainStoneCost = 0;
    if (includeMainStone) {
      if (mainStoneMode === 'melee') {
        const stone = meleeStones.find(s => s.size_label === mainCaratSize && s.stone_type === mainStoneType);
        mainStoneCost = stone ? (parseInt(mainQty) || 0) * Number(stone.price_per_stone) : 0;
      } else {
        mainStoneCost = parseFloat(gemCostPrice) || 0;
      }
    }

    let accentStoneCost = 0;
    if (includeAccentStones) {
      const stone = meleeStones.find(s => s.size_label === accentCaratSize && s.stone_type === accentStoneType);
      accentStoneCost = stone ? (parseInt(accentQty) || 0) * Number(stone.price_per_stone) : 0;
    }

    let addonsCost = 0;
    const costMap: Record<string, number> = {};
    for (const fc of fixedCosts) {
      if (fc.key === 'labour' && labour) { addonsCost += fc.amount; costMap.labour = fc.amount; }
      if (fc.key === 'main_stone_setting' && mainStoneSetting) { addonsCost += fc.amount; costMap.mainStoneSetting = fc.amount; }
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

    const totalCost = metalCost + mainStoneCost + accentStoneCost + addonsCost;

    const bracket = marginBrackets.find(b =>
      totalCost >= b.cost_min && (b.cost_max == null || totalCost <= b.cost_max)
    ) ?? marginBrackets[marginBrackets.length - 1];

    const rawPrice = bracket ? totalCost * bracket.multiplier : totalCost;
    const quotedPrice = Math.ceil(rawPrice / 50) * 50;

    return { metalCost, mainStoneCost, accentStoneCost, addonsCost, totalCost, bracket, rawPrice, quotedPrice, costMap, extraLabour };
  }, [metalType, weight, metalRates, includeMainStone, mainStoneMode, mainCaratSize, mainStoneType, mainQty, gemCostPrice, meleeStones, includeAccentStones, accentCaratSize, accentStoneType, accentQty, fixedCosts, labour, mainStoneSetting, smallSettings, smallSettingsQty, butterflies, chain, additionalLabour, additionalLabourAmount, marginBrackets]);

  function selectTemplate(t: QuoteTemplate) {
    setSelectedTemplate(t);
    if (t.default_metal) setMetalType(t.default_metal);
    setLabour(t.includes_labour);
    setMainStoneSetting(t.includes_main_stone_setting);
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
        template: selectedTemplate?.name ?? null,
        metal: { type: metalType, weight: parseFloat(weight) || 0, cost: pricing.metalCost },
        mainStone: includeMainStone ? (mainStoneMode === 'melee' ? { type: 'melee', size: mainCaratSize, stoneType: mainStoneType, qty: parseInt(mainQty) || 0, cost: pricing.mainStoneCost } : { type: 'gemstone', description: gemDescription, cost: pricing.mainStoneCost }) : null,
        accentStones: includeAccentStones ? { size: accentCaratSize, stoneType: accentStoneType, qty: parseInt(accentQty) || 0, cost: pricing.accentStoneCost } : null,
        addons: { labour, mainStoneSetting, smallSettings, smallSettingsQty: parseInt(smallSettingsQty) || 0, butterflies, chain, additionalLabour, additionalLabourAmount: parseFloat(additionalLabourAmount) || 0 },
        totalCost: pricing.totalCost,
        multiplier: pricing.bracket?.multiplier ?? null,
        rawPrice: pricing.rawPrice,
        quotedPrice: pricing.quotedPrice,
      };
      const res = await fetch('/api/quotes/builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName, lastName, email, phone,
          assignedTo: user?.name ?? null,
          template: selectedTemplate?.name ?? null,
          quoteDescription, internalNotes,
          quotedPrice: pricing.quotedPrice,
          totalCost: pricing.totalCost,
          multiplier: pricing.bracket?.multiplier ?? null,
          rawPrice: pricing.rawPrice,
          quoteBuilderData: qbd,
          quoteType,
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
      item_description: quoteDescription || null,
      line_items: quoteDescription ? [{ design: quoteDescription, stone: '', price: `$${pricing.quotedPrice.toLocaleString('en-AU', { minimumFractionDigits: 2 })}` }] : [],
      notes: null,
      repair_description: null,
      design_brief: quoteDescription || null,
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
      total: pricing.quotedPrice,
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
                {user?.role === 'manager' && metalType && (
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
                {user?.role === 'manager' && weight && metalType && (
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                    Metal cost: ${pricing.metalCost.toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stones */}
          <div style={sectionCard}>
            <div style={sectionHeading}>Stones</div>

            {/* Main stone */}
            <div style={{ marginBottom: 16 }}>
              <Toggle on={includeMainStone} onChange={setIncludeMainStone} label="Include Main Stone" />
              {includeMainStone && (
                <div style={{ marginTop: 12, paddingLeft: 12, borderLeft: '2px solid #E8E8F0' }}>
                  {/* Mode toggle */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {(['melee', 'gemstone'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setMainStoneMode(m)}
                        style={{
                          padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                          fontSize: 13, fontWeight: 500,
                          background: mainStoneMode === m ? '#635BFF' : '#F3F4F6',
                          color: mainStoneMode === m ? '#fff' : '#6B7280',
                          transition: 'all .15s',
                        }}
                      >
                        {m === 'melee' ? 'Melee / Small Stone' : 'Gemstone (manual)'}
                      </button>
                    ))}
                  </div>

                  {mainStoneMode === 'melee' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={labelStyle}>Size</label>
                        <select style={{ ...inputStyle, cursor: 'pointer' }} value={mainCaratSize} onChange={e => setMainCaratSize(e.target.value)}>
                          {CARAT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Stone Type</label>
                        <select style={{ ...inputStyle, cursor: 'pointer' }} value={mainStoneType} onChange={e => setMainStoneType(e.target.value)}>
                          <option value="Lab Grown">Lab Grown</option>
                          <option value="Natural">Natural</option>
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Quantity</label>
                        <input style={inputStyle} type="number" min="1" value={mainQty} onChange={e => setMainQty(e.target.value)} />
                      </div>
                      {user?.role === 'manager' && (
                        <div style={{ gridColumn: '1/-1', fontSize: 12, color: '#6B7280' }}>
                          Stone cost: ${pricing.mainStoneCost.toFixed(4)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div style={{ marginBottom: 10 }}>
                        <label style={labelStyle}>Gemstone Description</label>
                        <input
                          style={inputStyle}
                          value={gemDescription}
                          onChange={e => setGemDescription(e.target.value)}
                          onFocus={e => (e.target.style.borderColor = '#635BFF')}
                          onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                          placeholder="e.g. 1ct Round Brilliant Lab Diamond"
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Cost Price ($)</label>
                        <input
                          style={inputStyle}
                          type="number"
                          min="0"
                          step="0.01"
                          value={gemCostPrice}
                          onChange={e => setGemCostPrice(e.target.value)}
                          onFocus={e => (e.target.style.borderColor = '#635BFF')}
                          onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                          placeholder="0.00"
                        />
                      </div>
                      <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#92400E', marginTop: 8 }}>
                        ⚠️ Senior staff only — confirm cost with Sam or Ben before saving
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Accent stones */}
            <div>
              <Toggle on={includeAccentStones} onChange={setIncludeAccentStones} label="Include Accent / Melee Stones" />
              {includeAccentStones && (
                <div style={{ marginTop: 12, paddingLeft: 12, borderLeft: '2px solid #E8E8F0' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Size</label>
                      <select style={{ ...inputStyle, cursor: 'pointer' }} value={accentCaratSize} onChange={e => setAccentCaratSize(e.target.value)}>
                        {CARAT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Stone Type</label>
                      <select style={{ ...inputStyle, cursor: 'pointer' }} value={accentStoneType} onChange={e => setAccentStoneType(e.target.value)}>
                        <option value="Lab Grown">Lab Grown</option>
                        <option value="Natural">Natural</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Quantity</label>
                      <input style={inputStyle} type="number" min="1" value={accentQty} onChange={e => setAccentQty(e.target.value)} />
                    </div>
                    {user?.role === 'manager' && (
                      <div style={{ gridColumn: '1/-1', fontSize: 12, color: '#6B7280' }}>
                        Accent stone cost: ${pricing.accentStoneCost.toFixed(4)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Add-ons */}
          <div style={sectionCard}>
            <div style={sectionHeading}>Add-ons & Labour</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Toggle on={labour} onChange={setLabour} label="Labour" />
              <Toggle on={mainStoneSetting} onChange={setMainStoneSetting} label="Main Stone Setting" />

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
                      {user?.role === 'manager' && (
                        <span style={{ fontSize: 12, color: '#6B7280' }}>= ${((parseInt(smallSettingsQty) || 0) * 30).toFixed(2)}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Toggle on={butterflies} onChange={setButterflies} label="Butterflies (earrings)" />
              <Toggle on={chain} onChange={setChain} label="Chain (bracelet/necklace)" />

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

            {/* Manager cost breakdown */}
            {user?.role === 'manager' && (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Toggle on={showCostBreakdown} onChange={setShowCostBreakdown} label="Show cost breakdown" />
                </div>
                {showCostBreakdown && (
                  <div style={{ background: '#F9FAFB', border: '1px solid #E8E8F0', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>
                    {pricing.metalCost > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#6B7280' }}>Metal ({weight}g × ${metalRates.find(r => r.metal_type === metalType)?.price_per_gram.toFixed(2)})</span>
                        <span style={{ fontWeight: 500 }}>${pricing.metalCost.toFixed(2)}</span>
                      </div>
                    )}
                    {pricing.mainStoneCost > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#6B7280' }}>Main Stone</span>
                        <span style={{ fontWeight: 500 }}>${pricing.mainStoneCost.toFixed(2)}</span>
                      </div>
                    )}
                    {pricing.accentStoneCost > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#6B7280' }}>Accent Stones</span>
                        <span style={{ fontWeight: 500 }}>${pricing.accentStoneCost.toFixed(2)}</span>
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
                        <span style={{ color: '#6B7280' }}>Main Stone Setting</span>
                        <span style={{ fontWeight: 500 }}>${pricing.costMap.mainStoneSetting.toFixed(2)}</span>
                      </div>
                    )}
                    {pricing.costMap.smallSettings !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ color: '#6B7280' }}>Small Settings ({smallSettingsQty})</span>
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
                        <span style={{ color: '#6B7280' }}>Additional Labour</span>
                        <span style={{ fontWeight: 500 }}>${pricing.extraLabour.toFixed(2)}</span>
                      </div>
                    )}
                    <div style={{ borderTop: '1px solid #E8E8F0', marginTop: 8, paddingTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: '#6B7280', fontWeight: 500 }}>Total Cost</span>
                        <span style={{ fontWeight: 600 }}>${pricing.totalCost.toFixed(2)}</span>
                      </div>
                      {pricing.bracket && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ color: '#6B7280' }}>Multiplier</span>
                          <span style={{ fontWeight: 500, color: '#635BFF' }}>×{pricing.bracket.multiplier.toFixed(3)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#6B7280' }}>Raw price</span>
                        <span style={{ fontWeight: 500 }}>${pricing.rawPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Quoted price */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Quoted Price (incl. GST)</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: '#1A1A2E', lineHeight: 1 }}>
                {pricing.quotedPrice > 0
                  ? `$${pricing.quotedPrice.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                  : '—'}
              </div>
              {pricing.quotedPrice > 0 && (
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>Rounded to nearest $50</div>
              )}
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
