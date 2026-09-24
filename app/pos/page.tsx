"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { hasPermission } from "@/lib/userTypes";
import { formatCurrency } from "@/lib/formatters";
import { cashVariance, expectedDrawerCash, roundMoney, toCents } from "@/lib/posMoney";

interface PosSession {
  id: string;
  opened_at: string;
  closed_at: string | null;
  expected_cash_float: number | string;
  actual_cash_count: number | string | null;
  variance: number | string | null;
  notes: string | null;
  cash_sales_total: number;
  sales_count: number;
  sales_by_method: { method: string; count: number; total: number }[];
  expected_cash: number;
}

interface SearchPiece {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  metal_karat: string | null;
  metal_colour: string | null;
  available: number;
  sell_price: number | null;
  price_source: "retail_price" | "calculate_price" | null;
  exact: boolean;
}

interface CartLine {
  piece_id: string;
  sku: string;
  name: string;
  available: number;
  quantity: number;
  list_price: number | null;
  price_source: SearchPiece["price_source"];
  custom_price_override: boolean;
  unit_price: number;
}

interface Receipt {
  id: string;
  receipt_number: string;
  created_at: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: string;
  cash_tendered: number;
  change: number;
  gst_registered: boolean;
  customer: { id: string; name: string } | null;
  items: {
    piece_id: string;
    sku: string;
    name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    custom_price_override: boolean;
  }[];
}

interface CustomerHit {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

const PAYMENT_METHODS = [
  { id: "cash", label: "Cash", enabled: true },
  { id: "card", label: "Card", enabled: false },
  { id: "bank_transfer", label: "Bank transfer", enabled: false },
  { id: "gift_card", label: "Gift card", enabled: false },
  { id: "customer_account", label: "Customer account", enabled: false },
  { id: "layby", label: "Lay-by", enabled: false },
];

function money(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isNaN(n) ? 0 : n;
}

function priceLabel(source: CartLine["price_source"]): string {
  if (source === "calculate_price") return "Live price";
  if (source === "retail_price") return "Retail price";
  return "Custom price";
}

function customerLabel(c: CustomerHit): string {
  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return name || c.email || "Customer";
}

export default function PosPage() {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const searchRef = useRef<HTMLInputElement>(null);

  const [session, setSession] = useState<PosSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [floatInput, setFloatInput] = useState("");
  const [opening, setOpening] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPiece[]>([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);

  const [custQuery, setCustQuery] = useState("");
  const [custHits, setCustHits] = useState<CustomerHit[]>([]);
  const [customer, setCustomer] = useState<CustomerHit | null>(null);

  const [tendered, setTendered] = useState("");
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const [closing, setClosing] = useState(false);
  const [actualInput, setActualInput] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);
  const [closedSummary, setClosedSummary] = useState<PosSession | null>(null);

  useEffect(() => {
    if (!hydrated || !user) return;
    if (!hasPermission(user, "quotes") && !hasPermission(user, "inventory")) {
      router.replace("/");
    }
  }, [hydrated, user, router]);

  const refreshSession = useCallback(async () => {
    const res = await fetch("/api/pos/sessions");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Could not load the session");
    setSession(json.session ?? null);
  }, []);

  useEffect(() => {
    if (!hydrated || !user) return;
    let cancelled = false;
    setLoading(true);
    refreshSession()
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the session");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [hydrated, user, refreshSession]);

  useEffect(() => {
    if (!session || query.trim().length < 1) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/pos/pieces?q=${encodeURIComponent(query.trim())}`);
        const json = await res.json();
        if (!cancelled) setResults(res.ok ? (json.pieces ?? []) : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query, session]);

  useEffect(() => {
    if (custQuery.trim().length < 2) {
      setCustHits([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/search?q=${encodeURIComponent(custQuery.trim())}`);
        const json = await res.json();
        if (!cancelled) setCustHits(json.results ?? []);
      } catch {
        if (!cancelled) setCustHits([]);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [custQuery]);

  const subtotal = useMemo(
    () => roundMoney(cart.reduce((sum, line) => sum + line.unit_price * line.quantity, 0)),
    [cart]
  );
  const total = subtotal;
  const tenderedAmount = tendered.trim() === "" ? null : Number(tendered);
  const tenderedOk = tenderedAmount != null && !Number.isNaN(tenderedAmount) && toCents(tenderedAmount) >= toCents(total) && toCents(total) > 0;
  const change = tenderedOk && tenderedAmount != null ? roundMoney(tenderedAmount - total) : 0;

  const floatAmount = money(session?.expected_cash_float);
  const cashSales = money(session?.cash_sales_total);
  const expectedCash = session ? expectedDrawerCash(floatAmount, cashSales) : 0;
  const actualAmount = actualInput.trim() === "" ? null : Number(actualInput);
  const variancePreview = actualAmount != null && !Number.isNaN(actualAmount)
    ? cashVariance(actualAmount, floatAmount, cashSales)
    : null;

  function addPiece(piece: SearchPiece) {
    setError("");
    setCart(prev => {
      const existing = prev.find(line => line.piece_id === piece.id);
      if (existing) {
        if (existing.quantity >= piece.available) return prev;
        return prev.map(line => line.piece_id === piece.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...prev, {
        piece_id: piece.id,
        sku: piece.sku,
        name: piece.name,
        available: piece.available,
        quantity: 1,
        list_price: piece.sell_price,
        price_source: piece.price_source,
        custom_price_override: piece.sell_price == null,
        unit_price: piece.sell_price ?? 0,
      }];
    });
    setQuery("");
    setResults([]);
    searchRef.current?.focus();
  }

  function updateLine(pieceId: string, patch: Partial<CartLine>) {
    setCart(prev => prev.map(line => line.piece_id === pieceId ? { ...line, ...patch } : line));
  }

  async function openSession(e: React.FormEvent) {
    e.preventDefault();
    setOpening(true);
    setError("");
    try {
      const res = await fetch("/api/pos/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_cash_float: Number(floatInput) }),
      });
      const json = await res.json();
      if (res.status === 409 && json.session) {
        setSession(json.session);
        setClosedSummary(null);
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Could not open the session");
      setSession(json.session);
      setClosedSummary(null);
      setFloatInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the session");
    } finally {
      setOpening(false);
    }
  }

  async function takeCash(e: React.FormEvent) {
    e.preventDefault();
    if (!session || paying || !tenderedOk) return;
    setPaying(true);
    setError("");
    try {
      const res = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.id,
          customer_id: customer?.id ?? null,
          cash_tendered: tenderedAmount,
          lines: cart.map(line => ({
            piece_id: line.piece_id,
            quantity: line.quantity,
            custom_price_override: line.custom_price_override,
            unit_price: line.unit_price,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Payment failed");
      setReceipt(json.receipt);
      setCart([]);
      setTendered("");
      setCustomer(null);
      setCustQuery("");
      try { await refreshSession(); } catch { /* receipt is already on screen */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
      try { await refreshSession(); } catch { /* keep the payment error */ }
    } finally {
      setPaying(false);
    }
  }

  async function confirmClose(e: React.FormEvent) {
    e.preventDefault();
    if (!session || actualAmount == null || Number.isNaN(actualAmount)) return;
    setCloseBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pos/sessions/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session.id,
          actual_cash_count: actualAmount,
          notes: closeNotes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not close the session");
      setClosedSummary(json.session);
      setSession(null);
      setClosing(false);
      setActualInput("");
      setCloseNotes("");
      setCart([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close the session");
    } finally {
      setCloseBusy(false);
    }
  }

  function printReceipt(current: Receipt) {
    const rows = current.items.map(item =>
      `<tr><td>${item.name}<br><span style="color:#71717A">${item.sku}${item.custom_price_override ? " · custom price" : ""}</span></td><td>${item.quantity}</td><td style="text-align:right">${formatCurrency(item.line_total)}</td></tr>`
    ).join("");
    const html = `<!doctype html><html><head><title>${current.receipt_number}</title>
      <style>body{font-family:Inter,sans-serif;padding:24px;color:#18181B} table{width:100%;border-collapse:collapse} td{padding:6px 0;vertical-align:top;font-size:13px} h1{font-size:18px;margin:0}</style>
      </head><body>
      <h1>Vault</h1>
      <p style="margin:4px 0 16px;color:#71717A">Receipt ${current.receipt_number}</p>
      <p>${new Date(current.created_at).toLocaleString("en-AU")}</p>
      ${current.customer ? `<p>Customer: ${current.customer.name}</p>` : ""}
      <table>${rows}</table>
      <p>GST ${formatCurrency(current.tax)}</p>
      <p><strong>Total ${formatCurrency(current.total)}</strong></p>
      <p>Cash ${formatCurrency(current.cash_tendered)} · Change ${formatCurrency(current.change)}</p>
      </body></html>`;
    const popup = window.open("", "pos-receipt", "width=420,height=720");
    if (!popup) return;
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  if (!hydrated || loading) {
    return <main style={{ padding: 32, color: "var(--vault-text-secondary)" }}>Loading POS…</main>;
  }

  return (
    <main style={{ padding: "24px 24px 48px", maxWidth: 1120, margin: "0 auto" }}>
      <style>{`
        .pos-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.8fr); gap: 16px; align-items: start; }
        @media (max-width: 860px) { .pos-grid { grid-template-columns: 1fr; } }
        .pos-panel { background: var(--vault-canvas); border: 1px solid var(--vault-border); border-radius: var(--vault-radius-md); padding: 16px; }
        .pos-result { width: 100%; text-align: left; background: transparent; border: 0; border-bottom: 1px solid var(--vault-border); padding: 10px 4px; cursor: pointer; }
        .pos-result:hover { background: var(--vault-surface); }
      `}</style>

      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--vault-text-page-title)", fontWeight: 600, letterSpacing: "-0.02em" }}>POS</h1>
          <p style={{ margin: "4px 0 0", color: "var(--vault-text-secondary)", fontSize: 13 }}>
            {session
              ? `Session open ${new Date(session.opened_at).toLocaleString("en-AU")} · cash only`
              : "Open a session to take a cash sale"}
          </p>
        </div>
        {session && !closing && (
          <button type="button" className="vault-btn vault-btn-secondary" onClick={() => { setClosing(true); setError(""); }}>
            Close session
          </button>
        )}
      </header>

      {error && (
        <p role="alert" style={{ margin: "0 0 16px", padding: "10px 12px", borderRadius: 8, background: "#FEF2F2", color: "var(--vault-status-error)", fontSize: 13 }}>
          {error}
        </p>
      )}

      {!session && (
        <section className="pos-panel" style={{ maxWidth: 480 }}>
          {closedSummary && (
            <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--vault-border)" }}>
              <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Session closed</h2>
              <p style={{ margin: 0, fontSize: 14 }}>
                Expected {formatCurrency(money(closedSummary.expected_cash))} · Counted {formatCurrency(money(closedSummary.actual_cash_count))}
              </p>
              <p style={{ margin: "6px 0 0", fontWeight: 600, color: money(closedSummary.variance) === 0 ? "var(--vault-status-success)" : "var(--vault-status-warning)" }}>
                Variance {formatCurrency(money(closedSummary.variance))}
              </p>
              {closedSummary.notes && <p style={{ margin: "8px 0 0", color: "var(--vault-text-secondary)" }}>{closedSummary.notes}</p>}
            </div>
          )}
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Open session</h2>
          <form onSubmit={openSession}>
            <label className="vault-label" htmlFor="pos-float">Opening cash float</label>
            <input
              id="pos-float"
              className="vault-input"
              inputMode="decimal"
              value={floatInput}
              onChange={e => setFloatInput(e.target.value)}
              placeholder="0.00"
              required
              style={{ marginTop: 6 }}
            />
            <button type="submit" className="vault-btn vault-btn-primary" disabled={opening} style={{ marginTop: 12 }}>
              {opening ? "Opening…" : "Open session"}
            </button>
          </form>
        </section>
      )}

      {session && closing && (
        <section className="pos-panel" style={{ maxWidth: 560 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Close session</h2>
          <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 16px", margin: "0 0 16px", fontSize: 14 }}>
            <dt>Opening float</dt><dd style={{ margin: 0 }}>{formatCurrency(floatAmount)}</dd>
            <dt>Cash sales</dt><dd style={{ margin: 0 }}>{formatCurrency(cashSales)} · {session.sales_count} sale{session.sales_count === 1 ? "" : "s"}</dd>
            <dt>Expected cash</dt><dd style={{ margin: 0, fontWeight: 600 }}>{formatCurrency(expectedCash)}</dd>
          </dl>
          {(session.sales_by_method ?? []).length > 0 && (
            <ul style={{ margin: "0 0 16px", padding: 0, listStyle: "none", fontSize: 13, color: "var(--vault-text-secondary)" }}>
              {session.sales_by_method.map(row => (
                <li key={row.method}>{row.method}: {row.count} · {formatCurrency(row.total)}</li>
              ))}
            </ul>
          )}
          <form onSubmit={confirmClose}>
            <label className="vault-label" htmlFor="pos-count">Actual cash count</label>
            <input
              id="pos-count"
              className="vault-input"
              inputMode="decimal"
              value={actualInput}
              onChange={e => setActualInput(e.target.value)}
              placeholder="0.00"
              required
              style={{ marginTop: 6 }}
            />
            {variancePreview != null && (
              <p style={{ margin: "8px 0 0", fontWeight: 600, color: variancePreview === 0 ? "var(--vault-status-success)" : "var(--vault-status-warning)" }}>
                Variance {formatCurrency(variancePreview)}
              </p>
            )}
            <label className="vault-label" htmlFor="pos-notes" style={{ marginTop: 14 }}>Notes (optional)</label>
            <textarea
              id="pos-notes"
              className="vault-input"
              value={closeNotes}
              onChange={e => setCloseNotes(e.target.value)}
              rows={3}
              style={{ marginTop: 6, height: "auto", padding: 12 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="button" className="vault-btn vault-btn-secondary" onClick={() => setClosing(false)}>Back</button>
              <button type="submit" className="vault-btn vault-btn-primary" disabled={closeBusy || variancePreview == null}>
                {closeBusy ? "Closing…" : "Confirm close"}
              </button>
            </div>
          </form>
        </section>
      )}

      {session && !closing && (
        <div className="pos-grid">
          <section className="pos-panel">
            <label className="vault-label" htmlFor="pos-search">Search SKU, barcode, or name</label>
            <input
              id="pos-search"
              ref={searchRef}
              className="vault-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const exact = results.find(piece => piece.exact);
                if (exact) addPiece(exact);
                else if (results.length === 1) addPiece(results[0]);
              }}
              placeholder="Scan or type"
              autoComplete="off"
              style={{ marginTop: 6 }}
            />
            {searching && <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--vault-text-muted)" }}>Searching…</p>}
            {results.length > 0 && (
              <div role="listbox" aria-label="Pieces" style={{ marginTop: 8 }}>
                {results.map(piece => (
                  <button key={piece.id} type="button" className="pos-result" onClick={() => addPiece(piece)}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <span>
                        <strong>{piece.name}</strong>
                        <span style={{ display: "block", color: "var(--vault-text-secondary)", fontSize: 12 }}>
                          {piece.sku}{piece.barcode ? ` · ${piece.barcode}` : ""}
                          {piece.metal_karat ? ` · ${piece.metal_karat}` : ""}
                          {piece.metal_colour ? ` ${piece.metal_colour}` : ""}
                          {piece.available > 1 ? ` · ${piece.available} in stock` : ""}
                        </span>
                      </span>
                      <span>{piece.sell_price != null ? formatCurrency(piece.sell_price) : "No price"}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <h2 style={{ margin: "20px 0 8px", fontSize: 16 }}>Cart</h2>
            {cart.length === 0 && <p style={{ margin: 0, color: "var(--vault-text-secondary)" }}>No pieces yet.</p>}
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {cart.map(line => (
                <li key={line.piece_id} style={{ padding: "12px 0", borderTop: "1px solid var(--vault-border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{line.name}</div>
                      <div style={{ fontSize: 12, color: "var(--vault-text-secondary)" }}>{line.sku} · {priceLabel(line.custom_price_override ? null : line.price_source)}</div>
                    </div>
                    <button type="button" className="vault-btn vault-btn-tertiary" onClick={() => setCart(prev => prev.filter(item => item.piece_id !== line.piece_id))}>
                      Remove
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
                    <label style={{ fontSize: 12, color: "var(--vault-text-secondary)" }}>
                      Qty
                      <input
                        className="vault-input"
                        type="number"
                        min={1}
                        max={line.available}
                        value={line.quantity}
                        onChange={e => {
                          const next = Math.max(1, Math.min(line.available, parseInt(e.target.value, 10) || 1));
                          updateLine(line.piece_id, { quantity: next });
                        }}
                        style={{ width: 80, marginTop: 4 }}
                        aria-label={`Quantity for ${line.name}`}
                      />
                    </label>
                    <label style={{ fontSize: 12, color: "var(--vault-text-secondary)", display: "flex", alignItems: "center", gap: 6, height: 40 }}>
                      <input
                        type="checkbox"
                        checked={line.custom_price_override}
                        onChange={e => updateLine(line.piece_id, {
                          custom_price_override: e.target.checked,
                          unit_price: e.target.checked ? line.unit_price : (line.list_price ?? line.unit_price),
                        })}
                      />
                      Custom price
                    </label>
                    <label style={{ fontSize: 12, color: "var(--vault-text-secondary)" }}>
                      Unit price
                      <input
                        className="vault-input"
                        inputMode="decimal"
                        value={String(line.unit_price)}
                        disabled={!line.custom_price_override}
                        onChange={e => updateLine(line.piece_id, { unit_price: Number(e.target.value) || 0 })}
                        style={{ width: 120, marginTop: 4 }}
                        aria-label={`Unit price for ${line.name}`}
                      />
                    </label>
                    <div style={{ marginLeft: "auto", fontWeight: 600 }}>{formatCurrency(roundMoney(line.unit_price * line.quantity))}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <form className="pos-panel" onSubmit={takeCash}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Pay</h2>
            <label className="vault-label" htmlFor="pos-customer">Customer (optional)</label>
            {customer ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <span>{customerLabel(customer)}</span>
                <button type="button" className="vault-btn vault-btn-tertiary" onClick={() => setCustomer(null)}>Clear</button>
              </div>
            ) : (
              <>
                <input id="pos-customer" className="vault-input" value={custQuery} onChange={e => setCustQuery(e.target.value)} placeholder="Name or email" style={{ marginTop: 6 }} />
                {custHits.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {custHits.map(hit => (
                      <button key={hit.id} type="button" className="pos-result" onClick={() => { setCustomer(hit); setCustQuery(""); setCustHits([]); }}>
                        {customerLabel(hit)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            <div style={{ marginTop: 16 }}>
              <div className="vault-label">Payment method</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                {PAYMENT_METHODS.map(method => (
                  <label key={method.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, color: method.enabled ? "var(--vault-text)" : "var(--vault-text-muted)" }}>
                    <input type="radio" name="payment" checked={method.id === "cash"} disabled={!method.enabled} readOnly />
                    {method.label}
                    {!method.enabled && <span style={{ fontSize: 12 }}>Not in this release</span>}
                  </label>
                ))}
              </div>
            </div>

            <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 12px", margin: "16px 0", fontSize: 14 }}>
              <dt>Subtotal</dt><dd style={{ margin: 0 }}>{formatCurrency(subtotal)}</dd>
              <dt>Discount</dt><dd style={{ margin: 0 }}>{formatCurrency(0)}</dd>
              <dt style={{ fontWeight: 600 }}>Total</dt><dd style={{ margin: 0, fontWeight: 600 }}>{formatCurrency(total)}</dd>
            </dl>

            <label className="vault-label" htmlFor="pos-tendered">Cash tendered</label>
            <input
              id="pos-tendered"
              className="vault-input"
              inputMode="decimal"
              value={tendered}
              onChange={e => setTendered(e.target.value)}
              placeholder="0.00"
              style={{ marginTop: 6 }}
            />
            <button type="button" className="vault-btn vault-btn-tertiary" style={{ marginTop: 6 }} onClick={() => setTendered(total.toFixed(2))} disabled={cart.length === 0}>
              Exact amount
            </button>
            {tenderedOk && <p style={{ margin: "8px 0 0" }}>Change {formatCurrency(change)}</p>}

            <button type="submit" className="vault-btn vault-btn-primary" disabled={!tenderedOk || paying || cart.length === 0} style={{ width: "100%", marginTop: 16 }}>
              {paying ? "Taking cash…" : "Take cash"}
            </button>
          </form>
        </div>
      )}

      {receipt && (
        <div role="dialog" aria-modal="true" aria-labelledby="pos-receipt-title" style={{ position: "fixed", inset: 0, background: "rgba(24,24,27,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 60 }}>
          <div className="pos-panel" style={{ width: "min(440px, 100%)", boxShadow: "var(--vault-shadow-elevated)" }}>
            <h2 id="pos-receipt-title" style={{ margin: "0 0 4px", fontSize: 18 }}>Receipt {receipt.receipt_number}</h2>
            <p style={{ margin: "0 0 12px", color: "var(--vault-text-secondary)", fontSize: 13 }}>
              {new Date(receipt.created_at).toLocaleString("en-AU")}
              {user?.name ? ` · ${user.name}` : ""}
              {receipt.customer ? ` · ${receipt.customer.name}` : ""}
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {receipt.items.map(item => (
                <li key={item.piece_id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid var(--vault-border)", fontSize: 14 }}>
                  <span>{item.name}<span style={{ display: "block", color: "var(--vault-text-secondary)", fontSize: 12 }}>{item.sku} · {item.quantity} × {formatCurrency(item.unit_price)}{item.custom_price_override ? " · custom" : ""}</span></span>
                  <span>{formatCurrency(item.line_total)}</span>
                </li>
              ))}
            </ul>
            <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 12px", margin: "12px 0 0", fontSize: 14 }}>
              <dt>Subtotal</dt><dd style={{ margin: 0 }}>{formatCurrency(receipt.subtotal)}</dd>
              <dt>{receipt.gst_registered ? "GST included" : "GST"}</dt><dd style={{ margin: 0 }}>{formatCurrency(receipt.tax)}</dd>
              <dt style={{ fontWeight: 600 }}>Total</dt><dd style={{ margin: 0, fontWeight: 600 }}>{formatCurrency(receipt.total)}</dd>
              <dt>Cash</dt><dd style={{ margin: 0 }}>{formatCurrency(receipt.cash_tendered)}</dd>
              <dt>Change</dt><dd style={{ margin: 0 }}>{formatCurrency(receipt.change)}</dd>
            </dl>
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <button type="button" className="vault-btn vault-btn-secondary" onClick={() => printReceipt(receipt)}>Print</button>
              <button type="button" className="vault-btn vault-btn-secondary" disabled title="Email receipts are not in this release">Email</button>
              <button type="button" className="vault-btn vault-btn-primary" onClick={() => setReceipt(null)}>New sale</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
