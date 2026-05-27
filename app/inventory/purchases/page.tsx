"use client";

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import {
  InventoryPurchaseInvoice,
  InventoryPurchaseLine,
  InventorySupplier,
  InventoryVariant,
  InvoiceStatus,
  BomComponentType,
} from "@/lib/types";
import { generatePurchaseInvoiceHTML } from "@/lib/purchaseInvoiceGenerator";
import { Plus, X, Eye, AlertTriangle, Printer, Trash2 } from "lucide-react";

const fmtCurrency = (v: number | null | undefined) => v != null ? `$${Number(v).toFixed(2)}` : "—";

const STATUS_STYLE: Record<InvoiceStatus, { bg: string; fg: string }> = {
  pending:  { bg: "#FEF3C7", fg: "#92400E" },
  received: { bg: "#D1FAE5", fg: "#065F46" },
  partial:  { bg: "#DBEAFE", fg: "#1E40AF" },
  disputed: { bg: "#FEE2E2", fg: "#991B1B" },
};

const STATUSES: InvoiceStatus[] = ["pending", "received", "partial", "disputed"];
const COMPONENT_TYPES: BomComponentType[] = ["casting", "diamond", "labour", "settings", "findings", "other"];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export default function PurchasesPage() {
  const { user } = useUser();
  const isManager = canManage(user?.role);

  const [invoices, setInvoices] = useState<InventoryPurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [variants, setVariants] = useState<InventoryVariant[]>([]);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [loading, setLoading] = useState(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerInvoice, setDrawerInvoice] = useState<InventoryPurchaseInvoice | null>(null);
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterSupplier) params.set("supplier_id", filterSupplier);
      const res = await fetch("/api/inventory/purchase-invoices?" + params.toString());
      const json = await res.json();
      setInvoices(json.invoices ?? []);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSupplier]);

  const fetchSuppliers = useCallback(async () => {
    const res = await fetch("/api/inventory/suppliers");
    const json = await res.json();
    setSuppliers(json.suppliers ?? []);
  }, []);

  const fetchVariants = useCallback(async () => {
    const res = await fetch("/api/inventory/variants");
    const json = await res.json();
    setVariants(json.variants ?? []);
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { fetchSuppliers(); fetchVariants(); }, [fetchSuppliers, fetchVariants]);

  const openInvoice = async (id: string) => {
    const res = await fetch(`/api/inventory/purchase-invoices/${id}`);
    const json = await res.json();
    if (json.invoice) {
      setDrawerInvoice(json.invoice);
      setDrawerOpen(true);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Purchase Invoices</h1>
        {isManager && (
          <button
            onClick={() => setNewInvoiceOpen(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "#635BFF", color: "#fff", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
          >
            <Plus size={16} /> New Invoice
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 13, background: "#fff" }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterSupplier}
          onChange={(e) => setFilterSupplier(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 13, background: "#fff" }}
        >
          <option value="">All suppliers</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E8E8F0" }}>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Invoice #</th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Supplier</th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Date</th>
              <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</th>
              <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
              <th style={{ padding: "12px 16px" }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>Loading...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>No purchase invoices yet.</td></tr>
            ) : (
              invoices.map((inv) => {
                const style = STATUS_STYLE[inv.status];
                return (
                  <tr key={inv.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "12px 16px", fontFamily: "monospace", color: "#1A1A2E" }}>{inv.invoice_number}</td>
                    <td style={{ padding: "12px 16px", color: "#1A1A2E" }}>{inv.supplier?.name ?? "—"}</td>
                    <td style={{ padding: "12px 16px", color: "#6B7280" }}>{fmtDate(inv.invoice_date)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#1A1A2E" }}>{fmtCurrency(inv.total_amount)}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ display: "inline-flex", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: style.bg, color: style.fg, textTransform: "capitalize" }}>
                        {inv.status}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <button
                        onClick={() => openInvoice(inv.id)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: "#EEF2FF", color: "#4338CA", border: "none", fontSize: 12, cursor: "pointer" }}
                      >
                        <Eye size={12} /> View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* New invoice modal */}
      {newInvoiceOpen && (
        <NewInvoiceModal
          suppliers={suppliers}
          onClose={() => setNewInvoiceOpen(false)}
          onCreated={async (id) => {
            setNewInvoiceOpen(false);
            await fetchInvoices();
            await openInvoice(id);
          }}
        />
      )}

      {/* Detail drawer */}
      {drawerOpen && drawerInvoice && (
        <InvoiceDrawer
          invoice={drawerInvoice}
          suppliers={suppliers}
          variants={variants}
          onClose={() => { setDrawerOpen(false); setDrawerInvoice(null); fetchInvoices(); }}
          onChanged={async () => {
            await fetchInvoices();
            const res = await fetch(`/api/inventory/purchase-invoices/${drawerInvoice.id}`);
            const json = await res.json();
            if (json.invoice) setDrawerInvoice(json.invoice);
          }}
        />
      )}
    </div>
  );
}

// ── NewInvoiceModal ────────────────────────────────────────────────────────
function NewInvoiceModal({ suppliers, onClose, onCreated }: { suppliers: InventorySupplier[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [totalAmount, setTotalAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!invoiceNumber.trim()) return alert("Invoice number is required");
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/purchase-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_number: invoiceNumber,
          supplier_id: supplierId || null,
          invoice_date: invoiceDate || null,
          total_amount: totalAmount ? parseFloat(totalAmount) : null,
          notes,
        }),
      });
      const json = await res.json();
      if (json.invoice) onCreated(json.invoice.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 60, display: "flex", justifyContent: "center", alignItems: "center" }} onClick={onClose}>
      <div style={{ width: 480, background: "#fff", borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", gap: 14 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#1A1A2E" }}>New Purchase Invoice</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={18} /></button>
        </div>
        <Field label="Invoice Number *"><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} style={inputStyle} /></Field>
        <Field label="Supplier">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inputStyle}>
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Invoice Date"><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} style={inputStyle} /></Field>
        <Field label="Total Amount ($)"><input type="number" step="any" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} style={inputStyle} /></Field>
        <Field label="Notes"><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }} /></Field>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button onClick={onClose} style={{ padding: "8px 14px", background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "8px 14px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── InvoiceDrawer ──────────────────────────────────────────────────────────
function InvoiceDrawer({ invoice, suppliers, variants, onClose, onChanged }: {
  invoice: InventoryPurchaseInvoice;
  suppliers: InventorySupplier[];
  variants: InventoryVariant[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const lines = invoice.lines ?? [];

  const updateStatus = async (status: InvoiceStatus) => {
    await fetch(`/api/inventory/purchase-invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onChanged();
  };

  const addLine = async () => {
    await fetch("/api/inventory/purchase-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice_id: invoice.id,
        description: "New item",
        quantity: 1,
        unit_cost: 0,
      }),
    });
    onChanged();
  };

  const printInvoice = () => {
    const supplierName = invoice.supplier?.name ?? (suppliers.find((s) => s.id === invoice.supplier_id)?.name ?? "—");
    const html = generatePurchaseInvoiceHTML(invoice, lines, supplierName);
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  };

  const linesTotal = lines.reduce((sum, l) => sum + Number(l.total_cost ?? 0), 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: 620, height: "100%", background: "#fff", boxShadow: "-4px 0 12px rgba(0,0,0,0.1)", overflowY: "auto", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8F0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Invoice</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A2E", marginTop: 2, fontFamily: "monospace" }}>{invoice.invoice_number}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={printInvoice} style={{ padding: "6px 12px", background: "#EEF2FF", color: "#4338CA", border: "none", borderRadius: 6, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <Printer size={12} /> Print
              </button>
              <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={20} /></button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12, fontSize: 12 }}>
            <div><span style={{ color: "#6B7280" }}>Supplier:</span> <strong>{invoice.supplier?.name ?? "—"}</strong></div>
            <div><span style={{ color: "#6B7280" }}>Date:</span> <strong>{fmtDate(invoice.invoice_date)}</strong></div>
            <div><span style={{ color: "#6B7280" }}>Total:</span> <strong>{fmtCurrency(invoice.total_amount)}</strong></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#6B7280" }}>Status:</span>
              <select value={invoice.status} onChange={(e) => updateStatus(e.target.value as InvoiceStatus)} style={{ padding: "3px 6px", borderRadius: 4, border: "1px solid #E5E7EB", fontSize: 12 }}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Lines */}
        <div style={{ padding: 20, flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1A1A2E" }}>Line Items</h4>
            <button onClick={addLine} style={{ padding: "5px 10px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Plus size={12} /> Add Line
            </button>
          </div>
          {lines.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#9CA3AF", fontStyle: "italic", fontSize: 12 }}>No lines yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lines.map((line) => (
                <LineEditor key={line.id} line={line} variants={variants} onChanged={onChanged} />
              ))}
            </div>
          )}

          {/* Total */}
          <div style={{ marginTop: 16, padding: 12, background: "#FAFAFC", borderRadius: 8, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "#6B7280" }}>Lines total:</span>
            <strong style={{ color: "#1A1A2E" }}>{fmtCurrency(linesTotal)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── LineEditor ─────────────────────────────────────────────────────────────
function LineEditor({ line, variants, onChanged }: { line: InventoryPurchaseLine; variants: InventoryVariant[]; onChanged: () => void }) {
  const [description, setDescription] = useState(line.description ?? "");
  const [componentType, setComponentType] = useState<string>(line.component_type ?? "");
  const [quantity, setQuantity] = useState(line.quantity?.toString() ?? "1");
  const [unitCost, setUnitCost] = useState(line.unit_cost?.toString() ?? "");
  const [variantId, setVariantId] = useState(line.variant_id ?? "");
  const [isFaulty, setIsFaulty] = useState(line.is_faulty ?? false);
  const [faultyNotes, setFaultyNotes] = useState(line.faulty_notes ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const markDirty = () => setDirty(true);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/inventory/purchase-lines/${line.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          component_type: componentType || null,
          quantity: parseFloat(quantity) || 0,
          unit_cost: unitCost ? parseFloat(unitCost) : null,
          variant_id: variantId || null,
          is_faulty: isFaulty,
          faulty_notes: faultyNotes || null,
        }),
      });
      setDirty(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete this line?")) return;
    await fetch(`/api/inventory/purchase-lines/${line.id}`, { method: "DELETE" });
    onChanged();
  };

  const toggleFaulty = async () => {
    const newFaulty = !isFaulty;
    setIsFaulty(newFaulty);
    await fetch(`/api/inventory/purchase-lines/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_faulty: newFaulty }),
    });
    onChanged();
  };

  const total = (parseFloat(quantity) || 0) * (parseFloat(unitCost) || 0);

  return (
    <div style={{ padding: 12, background: isFaulty ? "#FEF2F2" : "#F9FAFB", border: isFaulty ? "1px solid #FCA5A5" : "1px solid #E5E7EB", borderRadius: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.7fr 1fr 1fr auto", gap: 8 }}>
        <select value={variantId} onChange={(e) => { setVariantId(e.target.value); markDirty(); }} style={miniInputStyle}>
          <option value="">— No variant —</option>
          {variants.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}
        </select>
        <input placeholder="Description" value={description} onChange={(e) => { setDescription(e.target.value); markDirty(); }} style={miniInputStyle} />
        <input type="number" step="any" placeholder="Qty" value={quantity} onChange={(e) => { setQuantity(e.target.value); markDirty(); }} style={miniInputStyle} />
        <select value={componentType} onChange={(e) => { setComponentType(e.target.value); markDirty(); }} style={miniInputStyle}>
          <option value="">type…</option>
          {COMPONENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="number" step="any" placeholder="Unit cost" value={unitCost} onChange={(e) => { setUnitCost(e.target.value); markDirty(); }} style={miniInputStyle} />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#1A1A2E", minWidth: 60, textAlign: "right" }}>{fmtCurrency(total)}</span>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <button
          onClick={toggleFaulty}
          style={{ padding: "4px 8px", background: isFaulty ? "#DC2626" : "transparent", color: isFaulty ? "#fff" : "#DC2626", border: "1px solid #DC2626", borderRadius: 4, fontSize: 11, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <AlertTriangle size={10} /> {isFaulty ? "Faulty" : "Mark faulty"}
        </button>
        <div style={{ flex: 1 }}>
          {isFaulty && (
            <input placeholder="Faulty notes..." value={faultyNotes} onChange={(e) => { setFaultyNotes(e.target.value); markDirty(); }} onBlur={save} style={{ ...miniInputStyle, width: "100%", background: "#fff" }} />
          )}
        </div>
        {dirty && (
          <button onClick={save} disabled={saving} style={{ padding: "4px 10px", background: "#635BFF", color: "#fff", border: "none", borderRadius: 4, fontSize: 11, cursor: "pointer" }}>
            {saving ? "..." : "Save"}
          </button>
        )}
        <button onClick={remove} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#DC2626", padding: 4 }}>
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = { padding: "8px 10px", borderRadius: 6, border: "1px solid #E5E7EB", fontSize: 13, outline: "none", width: "100%", background: "#fff" };
const miniInputStyle: React.CSSProperties = { padding: "5px 8px", borderRadius: 4, border: "1px solid #E5E7EB", fontSize: 12, outline: "none", background: "#fff" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      {children}
    </label>
  );
}
