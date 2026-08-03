"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

/* ── Types ─────────────────────────────────────────────── */
interface SyncResult { synced?: number; total_scanned?: number; message?: string; error?: string; }
interface MetalRate { id: string; metal_type: string; price_per_gram: number; updated_at: string; }
interface FixedCost { id: string; key: string; label: string; amount: number; updated_at: string; }
interface MarginBracket { id: string; cost_min: number; cost_max: number | null; multiplier: number; stone_type: string | null; }
interface MeleeStone { id: string; size_label: string; stone_type: string; price_per_stone: number; updated_at: string; }
interface StoreDetails { bank_name: string; account_name: string; bsb: string; account_number: string; }
type SaveState = Record<string, 'saving' | 'saved' | 'error'>;
interface ShopifyConnection {
  connected: boolean;
  shop_domain?: string | null;
  scopes?: string | null;
  connected_at?: string | null;
  webhook_registered?: boolean;
}
type Section = 'integrations' | 'pricing' | 'store';
type PricingTab = 'metal' | 'fixed' | 'margin' | 'melee';

const CARAT_SIZES = ['0.005ct', '0.01ct', '0.02ct', '0.03ct', '0.05ct', '0.10ct'];
const STONE_TYPES = ['Lab Grown', 'Natural'];

/* ── Shared styles ──────────────────────────────────────── */
const card: React.CSSProperties = { background: '#fff', border: '1px solid #E8E8F0', borderRadius: 12, overflow: 'hidden' };
const thStyle: React.CSSProperties = { padding: '10px 16px', fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#F9FAFB', textAlign: 'left', borderBottom: '1px solid #E8E8F0' };
const tdStyle: React.CSSProperties = { padding: '12px 16px', fontSize: 14, color: '#1A1A2E', borderBottom: '1px solid #E8E8F0' };
const inputStyle: React.CSSProperties = { border: '1px solid #635BFF', borderRadius: 6, padding: '4px 8px', fontSize: 14, width: 100, outline: 'none' };

const formatDateAU = (iso: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

/* ── Page ───────────────────────────────────────────────── */
export default function SettingsPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  const [section, setSection] = useState<Section>('integrations');

  /* Integrations state */
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  /* Shopify connection state */
  const [shopifyConn, setShopifyConn] = useState<ShopifyConnection | null>(null);
  const [shopifyConnLoading, setShopifyConnLoading] = useState(false);
  const [shopInput, setShopInput] = useState('');
  const [shopifyDisconnecting, setShopifyDisconnecting] = useState(false);

  /* Pricing state */
  const [pricingTab, setPricingTab] = useState<PricingTab>('metal');
  const [metalRates, setMetalRates] = useState<MetalRate[]>([]);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);
  const [marginBrackets, setMarginBrackets] = useState<MarginBracket[]>([]);
  const [meleeStones, setMeleeStones] = useState<MeleeStone[]>([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingLoaded, setPricingLoaded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saveStates, setSaveStates] = useState<SaveState>({});

  /* Store state */
  const [store, setStore] = useState<StoreDetails>({ bank_name: '', account_name: '', bsb: '', account_number: '' });
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeSaved, setStoreSaved] = useState(false);

  /* Auth guard */
  useEffect(() => {
    if (hydrated && user && !canManage(user.role)) router.replace("/orders");
  }, [hydrated, user, router]);

  /* Integrations: load last sync */
  useEffect(() => {
    const stored = localStorage.getItem("sapphire_last_sync");
    if (stored) setLastSynced(stored);
  }, []);

  /* Shopify: read query params on load (success/error redirected back from OAuth) */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("shopify_connected") || params.get("shopify_error") || params.get("webhook_warning")) {
      setSection('integrations');
      // Remove query params without full reload
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
  }, []);

  /* Shopify: load connection status when integrations tab is active */
  useEffect(() => {
    if (section !== 'integrations' || !user?.tenantId || shopifyConn !== null || shopifyConnLoading) return;
    setShopifyConnLoading(true);
    fetch('/api/shopify/connection', { headers: { 'x-tenant-id': user.tenantId } })
      .then(r => r.json())
      .then((json: ShopifyConnection) => setShopifyConn(json))
      .catch(() => setShopifyConn({ connected: false }))
      .finally(() => setShopifyConnLoading(false));
  }, [section, user, shopifyConn, shopifyConnLoading]);

  /* Shopify: disconnect */
  async function disconnectShopify() {
    if (!confirm('Disconnect Shopify? Incoming orders will stop syncing.')) return;
    setShopifyDisconnecting(true);
    try {
      await fetch('/api/shopify/connection', {
        method: 'DELETE',
        headers: { 'x-tenant-id': user?.tenantId ?? '' },
      });
      setShopifyConn({ connected: false });
    } finally {
      setShopifyDisconnecting(false);
    }
  }

  /* Pricing: lazy load when section first visited */
  useEffect(() => {
    if (section === 'pricing' && !pricingLoaded && !pricingLoading) {
      setPricingLoading(true);
      fetch('/api/pricing', { headers: { 'x-tenant-id': user?.tenantId ?? '' } })
        .then(r => r.json())
        .then(json => {
          setMetalRates(json.metalRates ?? []);
          setFixedCosts(json.fixedCosts ?? []);
          setMarginBrackets(json.marginBrackets ?? []);
          setMeleeStones(json.meleeStones ?? []);
          setPricingLoaded(true);
        })
        .catch(() => {})
        .finally(() => setPricingLoading(false));
    }
  }, [section, pricingLoaded, pricingLoading, user]);

  /* Store: lazy load when section first visited */
  useEffect(() => {
    if (section === 'store' && !storeLoaded && !storeLoading) {
      setStoreLoading(true);
      fetch('/api/settings/store', { headers: { 'x-tenant-id': user?.tenantId ?? '' } })
        .then(r => r.json())
        .then(json => {
          setStore({ bank_name: json.bank_name ?? '', account_name: json.account_name ?? '', bsb: json.bsb ?? '', account_number: json.account_number ?? '' });
          setStoreLoaded(true);
        })
        .catch(() => {})
        .finally(() => setStoreLoading(false));
    }
  }, [section, storeLoaded, storeLoading, user]);

  /* Integrations: sync */
  async function runSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sapphire/sync", { credentials: "include", headers: { "x-tenant-id": user?.tenantId ?? "" } });
      const json = await res.json() as SyncResult;
      setSyncResult(json);
      if (!json.error) {
        const now = new Date().toLocaleString("en-AU");
        setLastSynced(now);
        localStorage.setItem("sapphire_last_sync", now);
      }
    } catch {
      setSyncResult({ error: "Network error — could not reach sync endpoint" });
    } finally {
      setSyncing(false);
    }
  }

  /* Pricing: save cell */
  async function pricingSave(tableName: string, id: string, field: string, value: number) {
    setSaveStates(s => ({ ...s, [id]: 'saving' }));
    const res = await fetch(`/api/pricing/${tableName}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': user?.tenantId ?? '' },
      body: JSON.stringify({ id, field, value }),
    });
    if (res.ok) {
      setSaveStates(s => ({ ...s, [id]: 'saved' }));
      if (tableName === 'pricing_metal_rates') setMetalRates(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
      else if (tableName === 'pricing_fixed_costs') setFixedCosts(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
      else if (tableName === 'pricing_melee_stones') setMeleeStones(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
      setTimeout(() => setSaveStates(s => { const n = { ...s }; delete n[id]; return n; }), 2000);
    } else {
      setSaveStates(s => ({ ...s, [id]: 'error' }));
      setTimeout(() => setSaveStates(s => { const n = { ...s }; delete n[id]; return n; }), 3000);
    }
    setEditingId(null);
  }

  /* Store: save */
  async function saveStore() {
    setStoreSaving(true);
    setStoreSaved(false);
    try {
      await fetch('/api/settings/store', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify(store),
      });
      setStoreSaved(true);
      setTimeout(() => setStoreSaved(false), 3000);
    } finally {
      setStoreSaving(false);
    }
  }

  if (!hydrated || !user) return null;
  if (!canManage(user.role)) return null;

  /* ── Sub-components ───────────────────────────────────── */
  function SaveBadge({ id }: { id: string }) {
    const state = saveStates[id];
    if (!state) return null;
    if (state === 'saving') return <span style={{ fontSize: 12, color: '#6B7280' }}>Saving…</span>;
    if (state === 'saved') return <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>Saved ✓</span>;
    return <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 600 }}>Error</span>;
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
            <input autoFocus type="number" step={step} min="0" style={inputStyle} value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') pricingSave(tableName, id, field, parseFloat(editValue));
                if (e.key === 'Escape') setEditingId(null);
              }}
            />
            <button onClick={() => pricingSave(tableName, id, field, parseFloat(editValue))}
              style={{ background: '#635BFF', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>Save</button>
            <button onClick={() => setEditingId(null)}
              style={{ background: 'transparent', color: '#6B7280', border: '1px solid #E8E8F0', borderRadius: 6, padding: '4px 10px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
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
          <button onClick={() => { setEditingId(id); setEditValue(String(currentValue)); }}
            style={{ background: '#EEF2FF', color: '#635BFF', border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Edit</button>
        )}
      </td>
    );
  }

  /* ── Section content ──────────────────────────────────── */
  const SECTIONS: { key: Section; label: string }[] = [
    { key: 'integrations', label: 'Integrations' },
    { key: 'pricing', label: 'Pricing' },
    { key: 'store', label: 'Store Details' },
  ];

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div style={{ padding: '32px 40px', maxWidth: 980 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1A1760', marginBottom: 4 }}>Settings</h1>
      <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 28 }}>Manage integrations, pricing, and store configuration.</p>

      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
        {/* Left nav */}
        <nav style={{ width: 168, flexShrink: 0 }}>
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px', marginBottom: 2,
                borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: section === s.key ? 600 : 400,
                background: section === s.key ? '#EEF2FF' : 'transparent',
                color: section === s.key ? '#635BFF' : '#374151',
                transition: 'background .12s, color .12s',
              }}
            >{s.label}</button>
          ))}
        </nav>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* ── Integrations ── */}
          {section === 'integrations' && (
            <>
            <div style={{ ...card, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#635BFF" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1760' }}>Sapphire Export</span>
                  </div>
                  <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 4 }}>
                    Sync melee diamond stock (≤ 0.30ct) from Sapphire Export into the local cache.
                    Used for sourcing suggestions in the quote builder.
                  </p>
                  {lastSynced && <p style={{ fontSize: 12, color: '#9CA3AF' }}>Last synced: {lastSynced}</p>}
                </div>
                <button
                  onClick={runSync}
                  disabled={syncing}
                  style={{
                    flexShrink: 0, padding: '9px 18px',
                    background: syncing ? '#E8E8F0' : '#635BFF',
                    color: syncing ? '#9CA3AF' : '#fff',
                    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: syncing ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    style={syncing ? { animation: 'spin 1s linear infinite' } : undefined}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {syncing ? 'Syncing…' : 'Sync Stock'}
                </button>
              </div>
              {syncResult && (
                <div style={{
                  marginTop: 16, padding: '10px 14px', borderRadius: 8,
                  background: syncResult.error ? '#FEF2F2' : '#F0FDF4',
                  border: `1px solid ${syncResult.error ? '#FECACA' : '#BBF7D0'}`,
                  fontSize: 13, color: syncResult.error ? '#DC2626' : '#16A34A',
                }}>
                  {syncResult.error
                    ? `Error: ${syncResult.error}`
                    : syncResult.message ?? `Synced ${syncResult.synced?.toLocaleString()} melee stones (${syncResult.total_scanned?.toLocaleString()} total scanned)`}
                </div>
              )}
            </div>

            {/* ── Shopify Connect ── */}
            <div style={{ ...card, padding: 24, marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1760' }}>Shopify</span>
                {shopifyConnLoading && <span style={{ fontSize: 12, color: '#9CA3AF' }}>Loading…</span>}
                {!shopifyConnLoading && shopifyConn?.connected && (
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#DCFCE7', color: '#16A34A' }}>Connected</span>
                )}
                {!shopifyConnLoading && shopifyConn && !shopifyConn.connected && (
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#F3F4F6', color: '#6B7280' }}>Not connected</span>
                )}
              </div>

              {shopifyConn?.connected ? (
                <div>
                  <p style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>
                    <strong>{shopifyConn.shop_domain}</strong>
                  </p>
                  {shopifyConn.connected_at && (
                    <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>
                      Connected {formatDateAU(shopifyConn.connected_at.split('T')[0])}
                    </p>
                  )}
                  <p style={{ fontSize: 12, color: shopifyConn.webhook_registered ? '#16A34A' : '#B45309', marginBottom: 12 }}>
                    {shopifyConn.webhook_registered ? '✓ Webhook registered' : '⚠ Webhook not registered — orders may not sync automatically'}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a
                      href={`/api/shopify/oauth/install?shop=${shopifyConn.shop_domain}`}
                      style={{ fontSize: 13, fontWeight: 600, color: '#635BFF', background: '#EEF2FF', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', textDecoration: 'none' }}
                    >
                      Reconnect
                    </a>
                    <button
                      onClick={disconnectShopify}
                      disabled={shopifyDisconnecting}
                      style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', opacity: shopifyDisconnecting ? 0.6 : 1 }}
                    >
                      {shopifyDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>
                    Connect your Shopify store to automatically sync online orders into Workshop.
                  </p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #E8E8F0', borderRadius: 8, overflow: 'hidden', background: '#F9FAFB' }}>
                      <input
                        type="text"
                        value={shopInput}
                        onChange={e => setShopInput(e.target.value.trim())}
                        placeholder="yourstore"
                        style={{ border: 'none', outline: 'none', padding: '8px 10px', fontSize: 13, background: 'transparent', color: '#1A1A2E', width: 140 }}
                      />
                      <span style={{ fontSize: 13, color: '#9CA3AF', paddingRight: 10, whiteSpace: 'nowrap' }}>.myshopify.com</span>
                    </div>
                    <a
                      href={shopInput ? `/api/shopify/oauth/install?shop=${encodeURIComponent(shopInput)}` : '#'}
                      onClick={e => { if (!shopInput) e.preventDefault(); }}
                      style={{
                        fontSize: 13, fontWeight: 600, padding: '8px 16px',
                        background: shopInput ? '#059669' : '#E5E7EB',
                        color: shopInput ? '#fff' : '#9CA3AF',
                        borderRadius: 8, textDecoration: 'none',
                        cursor: shopInput ? 'pointer' : 'default',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Connect Shopify →
                    </a>
                  </div>
                  <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
                    Enter your store subdomain only — e.g. <code>classajewellers</code>, not the full URL.
                  </p>
                </div>
              )}
            </div>
            </>
          )}

          {/* ── Pricing ── */}
          {section === 'pricing' && (
            <div>
              {/* Pricing sub-tabs */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#F3F4F6', borderRadius: 10, padding: 4, width: 'fit-content' }}>
                {(['metal', 'fixed', 'margin', 'melee'] as const).map(t => {
                  const labels = { metal: 'Metal Prices', fixed: 'Fixed Costs', margin: 'Margin Brackets', melee: 'Melee Stones' };
                  return (
                    <button key={t} onClick={() => setPricingTab(t)} style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 500,
                      background: pricingTab === t ? '#fff' : 'transparent',
                      color: pricingTab === t ? '#1A1A2E' : '#6B7280',
                      boxShadow: pricingTab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all .15s',
                    }}>{labels[t]}</button>
                  );
                })}
              </div>

              {pricingLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>Loading…</div>
              ) : (
                <>
                  {pricingTab === 'metal' && (
                    <div style={card}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>
                          <th style={thStyle}>Metal Type</th>
                          <th style={thStyle}>Price Per Gram</th>
                          <th style={thStyle}>Last Updated</th>
                          <th style={{ ...thStyle, width: 80 }}>Actions</th>
                        </tr></thead>
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

                  {pricingTab === 'fixed' && (
                    <div style={card}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>
                          <th style={thStyle}>Label</th>
                          <th style={thStyle}>Amount</th>
                          <th style={{ ...thStyle, width: 80 }}>Actions</th>
                        </tr></thead>
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

                  {pricingTab === 'margin' && (
                    <>
                      {(['natural', 'lab'] as const).map(stoneType => {
                        const brackets = marginBrackets.filter(r => r.stone_type === stoneType);
                        return (
                          <div key={stoneType} style={{ marginBottom: 24 }}>
                            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1A1A2E', marginBottom: 10 }}>
                              {stoneType === 'natural' ? 'Natural Stone Brackets' : 'Lab Grown Stone Brackets'}
                            </h2>
                            <div style={card}>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr>
                                  <th style={thStyle}>Cost Range</th>
                                  <th style={thStyle}>Multiplier</th>
                                </tr></thead>
                                <tbody>
                                  {brackets.length === 0 ? (
                                    <tr><td colSpan={2} style={{ ...tdStyle, color: '#9CA3AF', textAlign: 'center' }}>No brackets found.</td></tr>
                                  ) : brackets.map(r => (
                                    <tr key={r.id}>
                                      <td style={tdStyle}>${Number(r.cost_min).toLocaleString()} – {r.cost_max != null ? `$${Number(r.cost_max).toLocaleString()}` : 'above'}</td>
                                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600, color: '#635BFF' }}>×{Number(r.multiplier).toFixed(3)}</td>
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

                  {pricingTab === 'melee' && (
                    <div style={card}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>
                          <th style={thStyle}>Size</th>
                          {STONE_TYPES.map(st => <th key={st} style={thStyle}>{st}</th>)}
                        </tr></thead>
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
                                        <input autoFocus type="number" step="0.0001" min="0" style={{ ...inputStyle, width: 90 }}
                                          value={editValue} onChange={e => setEditValue(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') pricingSave('pricing_melee_stones', row.id, 'price_per_stone', parseFloat(editValue));
                                            if (e.key === 'Escape') setEditingId(null);
                                          }}
                                        />
                                        <button onClick={() => pricingSave('pricing_melee_stones', row.id, 'price_per_stone', parseFloat(editValue))}
                                          style={{ background: '#635BFF', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer' }}>✓</button>
                                        <button onClick={() => setEditingId(null)}
                                          style={{ background: 'transparent', color: '#9CA3AF', border: 'none', borderRadius: 6, padding: '3px 6px', fontSize: 12, cursor: 'pointer' }}>✕</button>
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <button onClick={() => { setEditingId(row.id); setEditValue(String(row.price_per_stone)); }}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#1A1A2E', padding: 0, textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
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
          )}

          {/* ── Store Details ── */}
          {section === 'store' && (
            <div style={{ ...card, padding: 24, maxWidth: 520 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A1760', marginBottom: 4 }}>Bank Details</h2>
              <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 24 }}>Shown on quote PDFs sent to customers.</p>

              {storeLoading ? (
                <div style={{ color: '#9CA3AF', fontSize: 14 }}>Loading…</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {([
                    { key: 'bank_name', label: 'Bank Name', placeholder: 'e.g. Commonwealth Bank' },
                    { key: 'account_name', label: 'Account Name', placeholder: 'e.g. Acme Jewellers Pty Ltd' },
                    { key: 'bsb', label: 'BSB', placeholder: 'e.g. 062-000' },
                    { key: 'account_number', label: 'Account Number', placeholder: 'e.g. 12345678' },
                  ] as { key: keyof StoreDetails; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>{label}</label>
                      <input
                        type="text"
                        value={store[key]}
                        placeholder={placeholder}
                        onChange={e => setStore(prev => ({ ...prev, [key]: e.target.value }))}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          border: '1px solid #E8E8F0', borderRadius: 8,
                          padding: '9px 12px', fontSize: 14, color: '#1A1A2E',
                          outline: 'none', transition: 'border-color .15s',
                        }}
                        onFocus={e => (e.target.style.borderColor = '#635BFF')}
                        onBlur={e => (e.target.style.borderColor = '#E8E8F0')}
                      />
                    </div>
                  ))}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    <button
                      onClick={saveStore}
                      disabled={storeSaving}
                      style={{
                        padding: '9px 20px',
                        background: storeSaving ? '#E8E8F0' : '#635BFF',
                        color: storeSaving ? '#9CA3AF' : '#fff',
                        border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        cursor: storeSaving ? 'wait' : 'pointer',
                      }}
                    >{storeSaving ? 'Saving…' : 'Save'}</button>
                    {storeSaved && <span style={{ fontSize: 13, color: '#10B981', fontWeight: 600 }}>Saved ✓</span>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
