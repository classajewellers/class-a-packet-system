"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { hasPermission } from "@/lib/userTypes";

interface MetalRate { id: string; metal_type: string; price_per_gram: number; updated_at: string; }
interface FixedCost { id: string; key: string; label: string; amount: number; updated_at: string; }
interface MarginBracket { id: string; cost_min: number; cost_max: number | null; multiplier: number; stone_type: string | null; }
interface MeleeStone { id: string; size_label: string; stone_type: string; price_per_stone: number; updated_at: string; }

interface StoneBaseRow    { stone_type: string; base_price_per_carat: number; margin_percent: number; }
interface StoneColourRow  { stone_type: string; colour_grade: string;  adjustment_percent: number; sort_order: number; }
interface StoneClarityRow { stone_type: string; clarity_grade: string; adjustment_percent: number; sort_order: number; }
interface StoneCaratRow   { stone_type: string; carat_from: number; carat_to: number | null; multiplier: number; sort_order: number; }
interface NdPrice         { shape: string; size_from: number; size_to: number; colour_group: string; clarity: string; price_per_ct: number; }

type SaveState = Record<string, 'saving' | 'saved' | 'error'>;

const CARAT_SIZES = ['0.005ct', '0.01ct', '0.02ct', '0.03ct', '0.05ct', '0.10ct'];
const STONE_TYPES = ['Lab Grown', 'Natural'];

const ND_SHAPES = ['round', 'oval', 'cushion', 'pear', 'emerald', 'marquise', 'radiant'] as const;
const ND_BANDS = [
  { label: '0.30–0.49', sf: 0.30, st: 0.49 },
  { label: '0.50–0.69', sf: 0.50, st: 0.69 },
  { label: '0.70–0.89', sf: 0.70, st: 0.89 },
  { label: '0.90–0.99', sf: 0.90, st: 0.99 },
  { label: '1.00–1.49', sf: 1.00, st: 1.49 },
  { label: '1.50–1.99', sf: 1.50, st: 1.99 },
  { label: '2.00–2.99', sf: 2.00, st: 2.99 },
  { label: '3.00–3.99', sf: 3.00, st: 3.99 },
  { label: '4.00–4.99', sf: 4.00, st: 4.99 },
  { label: '5.00–5.99', sf: 5.00, st: 5.99 },
];
const ND_COLOUR_GROUPS = ['D-F', 'G-H', 'I-J', 'K-L', 'M'];
const ND_CLARITIES     = ['IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2'];

export default function PricingPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const [tab, setTab] = useState<'metal' | 'fixed' | 'margin' | 'melee' | 'lab_diamonds' | 'natural_diamonds' | 'gem_stones'>('metal');

  const [metalRates, setMetalRates] = useState<MetalRate[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [marginBrackets, setMarginBrackets] = useState<MarginBracket[]>([]);
  const [meleeStones, setMeleeStones] = useState<MeleeStone[]>([]);
  const [loading, setLoading] = useState(true);

  // Stone pricing (lab + gem)
  const [stoneBasePrices, setStoneBasePrices]   = useState<StoneBaseRow[]>([]);
  const [stoneColours, setStoneColours]         = useState<StoneColourRow[]>([]);
  const [stoneClarities, setStoneClarities]     = useState<StoneClarityRow[]>([]);
  const [stoneCaratMults, setStoneCaratMults]   = useState<StoneCaratRow[]>([]);
  const [stonesLoaded, setStonesLoaded]         = useState(false);
  const [stonesSaving, setStonesSaving]         = useState(false);
  const [stonesToast, setStonesToast]           = useState<string | null>(null);

  // Natural diamond pricing (RapNet grid)
  const [ndPrices, setNdPrices]               = useState<NdPrice[]>([]);
  const [ndCurrencyRate, setNdCurrencyRate]   = useState(1.538);
  const [ndNaturalMargin, setNdNaturalMargin] = useState(30);
  const [ndLoaded, setNdLoaded]               = useState(false);
  const [ndSaving, setNdSaving]               = useState(false);
  const [ndToast, setNdToast]                 = useState<string | null>(null);
  const [ndShape, setNdShape]                 = useState<string>('round');
  const [ndBandIdx, setNdBandIdx]             = useState(4); // default 1.00–1.49

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saveStates, setSaveStates] = useState<SaveState>({});

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "pricing")) router.replace("/");
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!user?.tenantId) return;
    fetch('/api/pricing', { headers: { 'x-tenant-id': user.tenantId } }).then(r => r.json()).then(json => {
      setMetalRates(json.metalRates ?? []);
      setFixedCosts(json.fixedCosts ?? []);
      setMarginBrackets(json.marginBrackets ?? []);
      setMeleeStones(json.meleeStones ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user?.tenantId]);

  useEffect(() => {
    if ((tab !== 'lab_diamonds' && tab !== 'gem_stones') || stonesLoaded) return;
    fetch('/api/settings/stone-pricing', { headers: { 'x-tenant-id': user?.tenantId ?? '' } })
      .then(r => r.json())
      .then(json => {
        const CATEGORY_MAP: Record<string, string> = { lab_diamond: 'stone_lab', natural_diamond: 'stone_natural', gem_stone: 'stone_gem' };
        const margins = (json.margins ?? []) as Array<{ category: string; margin_percent: number }>;
        setStoneBasePrices(
          (json.base_prices ?? []).map((b: { stone_type: string; base_price_per_carat: number }) => ({
            stone_type: b.stone_type,
            base_price_per_carat: b.base_price_per_carat,
            margin_percent: margins.find(m => m.category === CATEGORY_MAP[b.stone_type])?.margin_percent ?? 0,
          }))
        );
        setStoneColours(json.colour_adjustments ?? []);
        setStoneClarities(json.clarity_adjustments ?? []);
        setStoneCaratMults(
          (json.carat_multipliers ?? []).filter((r: { stone_type: string }) => r.stone_type === 'lab_diamond')
        );
        setStonesLoaded(true);
      })
      .catch(() => {});
  }, [tab, stonesLoaded, user?.tenantId]);

  useEffect(() => {
    if (tab !== 'natural_diamonds' || ndLoaded || !user?.tenantId) return;
    fetch('/api/settings/natural-diamond-prices', { headers: { 'x-tenant-id': user.tenantId } })
      .then(r => r.json())
      .then(json => {
        setNdPrices(json.prices ?? []);
        setNdCurrencyRate(json.currency_rate ?? 1.538);
        setNdNaturalMargin(json.natural_margin ?? 30);
        setNdLoaded(true);
      })
      .catch(() => {});
  }, [tab, ndLoaded, user?.tenantId]);

  async function save(tableName: string, id: string, field: string, value: number) {
    setSaveStates(s => ({ ...s, [id]: 'saving' }));
    const res = await fetch(`/api/pricing/${tableName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': user?.tenantId ?? '' },
      body: JSON.stringify({ id, field, value }),
    });
    if (res.ok) {
      setSaveStates(s => ({ ...s, [id]: 'saved' }));
      if (tableName === 'pricing_metal_rates') {
        setMetalRates(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
      } else if (tableName === 'pricing_fixed_costs') {
        setFixedCosts(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
      } else if (tableName === 'pricing_melee_stones') {
        setMeleeStones(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
      }
      setTimeout(() => setSaveStates(s => { const n = { ...s }; delete n[id]; return n; }), 2000);
    } else {
      setSaveStates(s => ({ ...s, [id]: 'error' }));
      setTimeout(() => setSaveStates(s => { const n = { ...s }; delete n[id]; return n; }), 3000);
    }
    setEditingId(null);
  }

  async function saveStonePricing() {
    if (!user?.tenantId) return;
    setStonesSaving(true);
    const CATEGORY_MAP: Record<string, string> = { lab_diamond: 'stone_lab', natural_diamond: 'stone_natural', gem_stone: 'stone_gem' };
    try {
      const res = await fetch('/api/settings/stone-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': user.tenantId },
        body: JSON.stringify({
          base_prices: stoneBasePrices.map(({ stone_type, base_price_per_carat }) => ({ stone_type, base_price_per_carat })),
          colour_adjustments: stoneColours,
          clarity_adjustments: stoneClarities,
          carat_multipliers: stoneCaratMults.map(({ carat_from, carat_to, multiplier, sort_order }) => ({ carat_from, carat_to, multiplier, sort_order })),
          margins: stoneBasePrices.map(b => ({ category: CATEGORY_MAP[b.stone_type] ?? b.stone_type, margin_percent: b.margin_percent })),
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setStonesToast('Saved ✓');
    } catch {
      setStonesToast('Error saving');
    } finally {
      setStonesSaving(false);
      setTimeout(() => setStonesToast(null), 3000);
    }
  }

  async function saveNdPricing() {
    if (!user?.tenantId) return;
    setNdSaving(true);
    try {
      const res = await fetch('/api/settings/natural-diamond-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': user.tenantId },
        body: JSON.stringify({
          prices: ndPrices.map(({ shape, size_from, size_to, colour_group, clarity, price_per_ct }) => ({ shape, size_from, size_to, colour_group, clarity, price_per_ct })),
          currency_rate: ndCurrencyRate,
          natural_margin: ndNaturalMargin,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setNdToast('Saved ✓');
    } catch {
      setNdToast('Error saving');
    } finally {
      setNdSaving(false);
      setTimeout(() => setNdToast(null), 3000);
    }
  }

  function updateNdCell(shape: string, sf: number, st: number, colourGroup: string, clarity: string, val: string) {
    const ppc = parseFloat(val) || 0;
    setNdPrices(prev => {
      const idx = prev.findIndex(p => p.shape === shape && p.size_from === sf && p.size_to === st && p.colour_group === colourGroup && p.clarity === clarity);
      if (idx >= 0) return prev.map((p, i) => i === idx ? { ...p, price_per_ct: ppc } : p);
      return [...prev, { shape, size_from: sf, size_to: st, colour_group: colourGroup, clarity, price_per_ct: ppc }];
    });
  }

  if (!hydrated || !user) return null;
  if (!hasPermission(user, "pricing")) return null;

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #E8E8F0', borderRadius: 12, overflow: 'hidden' };
  const thStyle: React.CSSProperties = { padding: '10px 16px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F9FAFB', textAlign: 'left', borderBottom: '1px solid #E8E8F0' };
  const tdStyle: React.CSSProperties = { padding: '12px 16px', fontSize: 14, color: '#1A1A2E', borderBottom: '1px solid #E8E8F0' };
  const inputStyle: React.CSSProperties = { border: '1px solid #635BFF', borderRadius: 6, padding: '4px 8px', fontSize: 14, width: 100, outline: 'none' };

  function SaveBadge({ id }: { id: string }) {
    const state = saveStates[id];
    if (!state) return null;
    if (state === 'saving') return <span style={{ fontSize: 12, color: '#6B7280' }}>Saving…</span>;
    if (state === 'saved') return <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>Saved ✓</span>;
    if (state === 'error') return <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 600 }}>Error</span>;
    return null;
  }

  function EditCell({ id, tableName, field, currentValue, prefix = '$', step = '0.01' }: {
    id: string; tableName: string; field: string; currentValue: number; prefix?: string; step?: string;
  }) {
    const isEditing = editingId === id;
    const fmt = (v: number) => prefix === '$' ? `$${Number(v).toFixed(2)}` : Number(v).toFixed(4);
    return (
      <td style={tdStyle}>
        {isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              autoFocus
              type="number"
              step={step}
              min="0"
              style={inputStyle}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') save(tableName, id, field, parseFloat(editValue));
                if (e.key === 'Escape') setEditingId(null);
              }}
            />
            <button
              onClick={() => save(tableName, id, field, parseFloat(editValue))}
              style={{ background: '#635BFF', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}
            >Save</button>
            <button
              onClick={() => setEditingId(null)}
              style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E8E8F0', borderRadius: 6, padding: '4px 10px', fontSize: 13, cursor: 'pointer' }}
            >Cancel</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{fmt(currentValue)}</span>
            <SaveBadge id={id} />
          </div>
        )}
      </td>
    );
  }

  function ActionCell({ id, currentValue }: { id: string; tableName: string; field: string; currentValue: number }) {
    return (
      <td style={{ ...tdStyle, width: 80 }}>
        {editingId !== id && (
          <button
            onClick={() => { setEditingId(id); setEditValue(String(currentValue)); }}
            style={{ background: '#EEF2FF', color: '#635BFF', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
          >Edit</button>
        )}
      </td>
    );
  }

  const formatDateAU = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>Pricing Settings</h1>
        <p style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>Manage metal rates, fixed costs and stone prices</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#F3F4F6', borderRadius: 10, padding: 4, flexWrap: 'wrap' }}>
        {(['metal', 'fixed', 'margin', 'melee', 'natural_diamonds', 'lab_diamonds', 'gem_stones'] as const).map((t) => {
          const labels = {
            metal: 'Metal Prices', fixed: 'Fixed Costs', margin: 'Margin Brackets',
            melee: 'Melee Stones', natural_diamonds: 'Natural Diamonds',
            lab_diamonds: 'Lab Diamonds', gem_stones: 'Gem Stones',
          };
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 500,
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? '#1A1A2E' : '#6B7280',
                boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all .15s',
              }}
            >{labels[t]}</button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>Loading…</div>
      ) : (
        <>
          {/* Tab: Metal Prices */}
          {tab === 'metal' && (
            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Metal Type</th>
                    <th style={thStyle}>Price Per Gram</th>
                    <th style={thStyle}>Last Updated</th>
                    <th style={{ ...thStyle, width: 80 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {metalRates.map(r => (
                    <tr key={r.id}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{r.metal_type}</td>
                      <EditCell id={r.id} tableName="pricing_metal_rates" field="price_per_gram" currentValue={r.price_per_gram} />
                      <td style={{ ...tdStyle, color: '#6B7280', fontSize: 12 }}>{formatDateAU(r.updated_at)}</td>
                      <ActionCell id={r.id} tableName="pricing_metal_rates" field="price_per_gram" currentValue={r.price_per_gram} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab: Fixed Costs */}
          {tab === 'fixed' && (
            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Label</th>
                    <th style={thStyle}>Amount</th>
                    <th style={{ ...thStyle, width: 80 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fixedCosts.map(r => (
                    <tr key={r.id}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{r.label}</td>
                      <EditCell id={r.id} tableName="pricing_fixed_costs" field="amount" currentValue={r.amount} />
                      <ActionCell id={r.id} tableName="pricing_fixed_costs" field="amount" currentValue={r.amount} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab: Margin Brackets */}
          {tab === 'margin' && (
            <>
              {(['natural', 'lab'] as const).map(stoneType => {
                const brackets = marginBrackets.filter(r => r.stone_type === stoneType);
                const heading = stoneType === 'natural' ? 'Natural Stone Brackets' : 'Lab Grown Stone Brackets';
                return (
                  <div key={stoneType} style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A2E', marginBottom: 10 }}>{heading}</h2>
                    <div style={card}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Cost Range</th>
                            <th style={thStyle}>Multiplier</th>
                          </tr>
                        </thead>
                        <tbody>
                          {brackets.length === 0 ? (
                            <tr><td colSpan={2} style={{ ...tdStyle, color: '#9CA3AF', textAlign: 'center' }}>No brackets found.</td></tr>
                          ) : brackets.map(r => (
                            <tr key={r.id}>
                              <td style={tdStyle}>
                                ${Number(r.cost_min).toLocaleString()} – {r.cost_max != null ? `$${Number(r.cost_max).toLocaleString()}` : 'above'}
                              </td>
                              <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600, color: '#635BFF' }}>
                                ×{Number(r.multiplier).toFixed(3)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              <div style={{ ...card, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', marginBottom: 6 }}>Example Calculation</div>
                <div style={{ fontSize: 14, color: '#374151' }}>Total cost <strong>$3,000</strong> → bracket <strong>×2.5</strong> → Quoted price <strong>$7,500</strong></div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>Contact Josh to update margin brackets.</div>
              </div>
            </>
          )}

          {/* Tab: Melee Stones */}
          {tab === 'melee' && (
            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Size</th>
                    {STONE_TYPES.map(st => (
                      <th key={st} style={thStyle}>{st}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CARAT_SIZES.map(size => (
                    <tr key={size}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{size}</td>
                      {STONE_TYPES.map(stoneType => {
                        const row = meleeStones.find(s => s.size_label === size && s.stone_type === stoneType);
                        if (!row) return <td key={stoneType} style={tdStyle}>—</td>;
                        const isEditing = editingId === row.id;
                        return (
                          <td key={stoneType} style={tdStyle}>
                            {isEditing ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input
                                  autoFocus
                                  type="number"
                                  step="0.0001"
                                  min="0"
                                  style={{ ...inputStyle, width: 90 }}
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') save('pricing_melee_stones', row.id, 'price_per_stone', parseFloat(editValue));
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                />
                                <button onClick={() => save('pricing_melee_stones', row.id, 'price_per_stone', parseFloat(editValue))} style={{ background: '#635BFF', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer' }}>✓</button>
                                <button onClick={() => setEditingId(null)} style={{ background: 'transparent', color: '#9CA3AF', border: 'none', borderRadius: 6, padding: '3px 6px', fontSize: 12, cursor: 'pointer' }}>✕</button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button
                                  onClick={() => { setEditingId(row.id); setEditValue(String(row.price_per_stone)); }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#1A1A2E', padding: 0, textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                                >
                                  ${Number(row.price_per_stone).toFixed(4)}
                                </button>
                                <SaveBadge id={row.id} />
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab: Natural Diamonds */}
          {tab === 'natural_diamonds' && (
            <>
              {ndToast && (
                <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 8, background: ndToast.startsWith('Error') ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${ndToast.startsWith('Error') ? '#FECACA' : '#BBF7D0'}`, color: ndToast.startsWith('Error') ? '#DC2626' : '#16A34A', fontSize: 13, fontWeight: 600 }}>
                  {ndToast}
                </div>
              )}

              {/* Settings bar */}
              <div style={{ ...card, padding: 20, marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', marginTop: 0, marginBottom: 16 }}>Settings</h3>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>USD → AUD Rate</label>
                    <input type="number" min="0" step="0.0001" value={ndCurrencyRate}
                      onChange={e => setNdCurrencyRate(parseFloat(e.target.value) || 1)}
                      style={{ ...inputStyle, width: 100 }} />
                    <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4, marginBottom: 0 }}>Default 1.538 (AUD @ 0.65)</p>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block', marginBottom: 6 }}>Natural Diamond Margin %</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="number" min="0" max="999" step="0.1" value={ndNaturalMargin}
                        onChange={e => setNdNaturalMargin(parseFloat(e.target.value) || 0)}
                        style={{ ...inputStyle, width: 80 }} />
                      <span style={{ fontSize: 13, color: '#6B7280' }}>%</span>
                    </div>
                  </div>
                  <button onClick={saveNdPricing} disabled={ndSaving}
                    style={{ background: ndSaving ? '#9CA3AF' : '#635BFF', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 14, fontWeight: 600, cursor: ndSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    {ndSaving ? 'Saving…' : 'Save All'}
                  </button>
                </div>
              </div>

              {/* Shape + band selectors */}
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Array.from(ND_SHAPES).map(s => (
                    <button key={s} onClick={() => setNdShape(s)}
                      style={{ padding: '6px 14px', borderRadius: 8, border: `${ndShape === s ? 2 : 1}px solid ${ndShape === s ? '#635BFF' : '#E8E8F0'}`, background: ndShape === s ? '#EEF2FF' : '#fff', color: ndShape === s ? '#635BFF' : '#374151', fontSize: 13, fontWeight: ndShape === s ? 600 : 400, cursor: 'pointer', textTransform: 'capitalize' }}>
                      {s}
                    </button>
                  ))}
                </div>
                <select value={ndBandIdx} onChange={e => setNdBandIdx(parseInt(e.target.value))}
                  style={{ border: '1px solid #E8E8F0', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: '#1A1A2E', background: '#fff', fontFamily: 'inherit', cursor: 'pointer' }}>
                  {ND_BANDS.map((b, i) => <option key={b.label} value={i}>{b.label} ct</option>)}
                </select>
              </div>

              {/* Price grid */}
              {!ndLoaded ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 14 }}>Loading…</div>
              ) : (
                <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: 60, textAlign: 'center' }}>Colour</th>
                        {ND_CLARITIES.map(cl => (
                          <th key={cl} style={{ ...thStyle, textAlign: 'center', padding: '8px 6px', whiteSpace: 'nowrap' }}>{cl}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ND_COLOUR_GROUPS.map(cg => {
                        const band = ND_BANDS[ndBandIdx];
                        const midpoint = (band.sf + band.st) / 2;
                        return (
                          <tr key={cg}>
                            <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: '#635BFF', padding: '6px 8px', fontSize: 12 }}>{cg}</td>
                            {ND_CLARITIES.map(cl => {
                              const entry = ndPrices.find(p => p.shape === ndShape && p.size_from === band.sf && p.size_to === band.st && p.colour_group === cg && p.clarity === cl);
                              const ppc = entry?.price_per_ct ?? 0;
                              const audHint = ppc > 0 ? ppc * ndCurrencyRate * midpoint : 0;
                              return (
                                <td key={cl} style={{ ...tdStyle, padding: '4px 4px', textAlign: 'center', verticalAlign: 'middle' }}>
                                  <input
                                    type="number" min="0" step="1"
                                    value={ppc || ''}
                                    onChange={e => updateNdCell(ndShape, band.sf, band.st, cg, cl, e.target.value)}
                                    style={{ width: 60, border: '1px solid #E8E8F0', borderRadius: 5, padding: '3px 4px', fontSize: 11, fontFamily: 'monospace', textAlign: 'right', outline: 'none', color: '#1A1A2E' }}
                                  />
                                  {audHint > 0 && (
                                    <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 1 }}>${Math.round(audHint).toLocaleString()}</div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 0, marginBottom: 0 }}>
                Values are RapNet average prices in USD/ct. Grey hint shows estimated total AUD cost at the carat midpoint. Price IS the buy price — no additional discount applied.
              </p>
            </>
          )}

          {/* Tab: Lab Diamonds */}
          {tab === 'lab_diamonds' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 20, gap: 12 }}>
                {stonesToast && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: stonesToast.startsWith('Error') ? '#EF4444' : '#10B981' }}>{stonesToast}</span>
                )}
                <button onClick={saveStonePricing} disabled={stonesSaving} style={{ background: stonesSaving ? '#9CA3AF' : '#635BFF', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 14, fontWeight: 600, cursor: stonesSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {stonesSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>

              {/* Base price + margin */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', marginBottom: 10, marginTop: 0 }}>Base Price per Carat</h3>
                <div style={card}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={thStyle}>Stone Type</th>
                      <th style={thStyle}>Base $/ct</th>
                      <th style={thStyle}>Margin %</th>
                    </tr></thead>
                    <tbody>
                      {stoneBasePrices.filter(row => row.stone_type === 'lab_diamond').map((row) => {
                        const allIdx = stoneBasePrices.findIndex(r => r.stone_type === row.stone_type);
                        return (
                          <tr key={row.stone_type}>
                            <td style={{ ...tdStyle, fontWeight: 500 }}>Lab Diamond</td>
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 13, color: '#6B7280' }}>$</span>
                                <input type="number" min="0" step="0.01" value={row.base_price_per_carat}
                                  onChange={e => setStoneBasePrices(prev => prev.map((r, j) => j === allIdx ? { ...r, base_price_per_carat: parseFloat(e.target.value) || 0 } : r))}
                                  style={inputStyle} />
                              </div>
                            </td>
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input type="number" min="0" max="999" step="0.1" value={row.margin_percent}
                                  onChange={e => setStoneBasePrices(prev => prev.map((r, j) => j === allIdx ? { ...r, margin_percent: parseFloat(e.target.value) || 0 } : r))}
                                  style={inputStyle} />
                                <span style={{ fontSize: 13, color: '#6B7280' }}>%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Colour Adjustments */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', marginBottom: 10, marginTop: 0 }}>Colour Adjustments</h3>
                <div style={card}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={{ ...thStyle, width: 120 }}>Colour Grade</th>
                      <th style={thStyle}>Adjustment %</th>
                    </tr></thead>
                    <tbody>
                      {stoneColours.filter(c => c.stone_type === 'lab_diamond').sort((a, b) => a.sort_order - b.sort_order).map(row => (
                        <tr key={row.colour_grade}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{row.colour_grade}</td>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input type="number" step="0.01" value={row.adjustment_percent}
                                onChange={e => setStoneColours(prev => prev.map(r => r.stone_type === 'lab_diamond' && r.colour_grade === row.colour_grade ? { ...r, adjustment_percent: parseFloat(e.target.value) || 0 } : r))}
                                style={inputStyle} />
                              <span style={{ fontSize: 13, color: '#6B7280' }}>%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Clarity Adjustments */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', marginBottom: 10, marginTop: 0 }}>Clarity Adjustments</h3>
                <div style={card}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={{ ...thStyle, width: 120 }}>Clarity Grade</th>
                      <th style={thStyle}>Adjustment %</th>
                    </tr></thead>
                    <tbody>
                      {stoneClarities.filter(c => c.stone_type === 'lab_diamond').sort((a, b) => a.sort_order - b.sort_order).map(row => (
                        <tr key={row.clarity_grade}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{row.clarity_grade}</td>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input type="number" step="0.01" value={row.adjustment_percent}
                                onChange={e => setStoneClarities(prev => prev.map(r => r.stone_type === 'lab_diamond' && r.clarity_grade === row.clarity_grade ? { ...r, adjustment_percent: parseFloat(e.target.value) || 0 } : r))}
                                style={inputStyle} />
                              <span style={{ fontSize: 13, color: '#6B7280' }}>%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Carat Multipliers */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', margin: 0 }}>Carat Weight Multipliers</h3>
                  <button
                    onClick={() => setStoneCaratMults(prev => [...prev, { stone_type: 'lab_diamond', carat_from: 0, carat_to: null, multiplier: 1, sort_order: prev.length }])}
                    style={{ background: '#EEF2FF', color: '#635BFF', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                  >+ Add Row</button>
                </div>
                <div style={card}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={thStyle}>From (ct)</th>
                      <th style={thStyle}>To (ct)</th>
                      <th style={thStyle}>Multiplier</th>
                      <th style={{ ...thStyle, width: 50 }}></th>
                    </tr></thead>
                    <tbody>
                      {stoneCaratMults.sort((a, b) => a.sort_order - b.sort_order).map((row, i) => (
                        <tr key={i}>
                          <td style={tdStyle}>
                            <input type="number" min="0" step="0.01" value={row.carat_from}
                              onChange={e => setStoneCaratMults(prev => prev.map((r, j) => j === i ? { ...r, carat_from: parseFloat(e.target.value) || 0 } : r))}
                              style={inputStyle} />
                          </td>
                          <td style={tdStyle}>
                            <input type="number" min="0" step="0.01" value={row.carat_to ?? ''}
                              onChange={e => setStoneCaratMults(prev => prev.map((r, j) => j === i ? { ...r, carat_to: e.target.value === '' ? null : parseFloat(e.target.value) || 0 } : r))}
                              style={inputStyle} placeholder="no limit" />
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 13, color: '#6B7280' }}>×</span>
                              <input type="number" min="0" step="0.01" value={row.multiplier}
                                onChange={e => setStoneCaratMults(prev => prev.map((r, j) => j === i ? { ...r, multiplier: parseFloat(e.target.value) || 0 } : r))}
                                style={inputStyle} />
                            </div>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <button onClick={() => setStoneCaratMults(prev => prev.filter((_, j) => j !== i))}
                              style={{ background: '#FEF2F2', color: '#EF4444', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8, marginBottom: 0 }}>Leave "To" blank for no upper limit.</p>
              </div>
            </>
          )}

          {/* Tab: Gem Stones */}
          {tab === 'gem_stones' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 20, gap: 12 }}>
                {stonesToast && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: stonesToast.startsWith('Error') ? '#EF4444' : '#10B981' }}>{stonesToast}</span>
                )}
                <button onClick={saveStonePricing} disabled={stonesSaving} style={{ background: stonesSaving ? '#9CA3AF' : '#635BFF', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 14, fontWeight: 600, cursor: stonesSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {stonesSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', marginBottom: 10, marginTop: 0 }}>Base Price per Carat</h3>
                <div style={card}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={thStyle}>Stone Type</th>
                      <th style={thStyle}>Base $/ct</th>
                      <th style={thStyle}>Margin %</th>
                    </tr></thead>
                    <tbody>
                      {stoneBasePrices.filter(row => row.stone_type === 'gem_stone').map((row) => {
                        const allIdx = stoneBasePrices.findIndex(r => r.stone_type === row.stone_type);
                        return (
                          <tr key={row.stone_type}>
                            <td style={{ ...tdStyle, fontWeight: 500 }}>Gem Stone</td>
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 13, color: '#6B7280' }}>$</span>
                                <input type="number" min="0" step="0.01" value={row.base_price_per_carat}
                                  onChange={e => setStoneBasePrices(prev => prev.map((r, j) => j === allIdx ? { ...r, base_price_per_carat: parseFloat(e.target.value) || 0 } : r))}
                                  style={inputStyle} />
                              </div>
                            </td>
                            <td style={tdStyle}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <input type="number" min="0" max="999" step="0.1" value={row.margin_percent}
                                  onChange={e => setStoneBasePrices(prev => prev.map((r, j) => j === allIdx ? { ...r, margin_percent: parseFloat(e.target.value) || 0 } : r))}
                                  style={inputStyle} />
                                <span style={{ fontSize: 13, color: '#6B7280' }}>%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
