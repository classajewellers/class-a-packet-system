"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { hasPermission } from "@/lib/userTypes";

interface MetalRate { id: string; metal_type: string; price_per_gram: number; updated_at: string; }
interface FixedCost { id: string; key: string; label: string; amount: number; updated_at: string; }
interface MarginBracket { id: string; cost_min: number; cost_max: number | null; multiplier: number; }
interface MeleeStone { id: string; size_label: string; stone_type: string; price_per_stone: number; updated_at: string; }

type SaveState = Record<string, 'saving' | 'saved' | 'error'>;

const CARAT_SIZES = ['0.005ct', '0.01ct', '0.02ct', '0.03ct', '0.05ct', '0.10ct'];
const STONE_TYPES = ['Lab Grown', 'Natural'];

export default function PricingPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const [tab, setTab] = useState<'metal' | 'fixed' | 'margin' | 'melee'>('metal');

  const [metalRates, setMetalRates] = useState<MetalRate[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [marginBrackets, setMarginBrackets] = useState<MarginBracket[]>([]);
  const [meleeStones, setMeleeStones] = useState<MeleeStone[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saveStates, setSaveStates] = useState<SaveState>({});

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "pricing")) router.replace("/");
  }, [hydrated, user, router]);

  useEffect(() => {
    fetch('/api/pricing', { headers: { 'x-tenant-id': user?.tenantId ?? '' } }).then(r => r.json()).then(json => {
      setMetalRates(json.metalRates ?? []);
      setFixedCosts(json.fixedCosts ?? []);
      setMarginBrackets(json.marginBrackets ?? []);
      setMeleeStones(json.meleeStones ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function save(tableName: string, id: string, field: string, value: number) {
    setSaveStates(s => ({ ...s, [id]: 'saving' }));
    const res = await fetch(`/api/pricing/${tableName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': user?.tenantId ?? '' },
      body: JSON.stringify({ id, field, value }),
    });
    if (res.ok) {
      setSaveStates(s => ({ ...s, [id]: 'saved' }));
      // Update local state
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
    const fmt = (v: number) => prefix === '$' ? `$${v.toFixed(2)}` : v.toFixed(4);
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#F3F4F6', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {(['metal', 'fixed', 'margin', 'melee'] as const).map((t) => {
          const labels = { metal: 'Metal Prices', fixed: 'Fixed Costs', margin: 'Margin Brackets', melee: 'Melee Stones' };
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
              <div style={card}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Cost Range</th>
                      <th style={thStyle}>Multiplier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marginBrackets.map(r => (
                      <tr key={r.id}>
                        <td style={tdStyle}>
                          ${r.cost_min.toLocaleString()} – {r.cost_max != null ? `$${r.cost_max.toLocaleString()}` : 'above'}
                        </td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600, color: '#635BFF' }}>
                          ×{r.multiplier.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ ...card, padding: 20, marginTop: 16 }}>
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
        </>
      )}
    </div>
  );
}
