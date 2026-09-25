"use client";

import { useCallback, useEffect, useState } from "react";

interface SavedInvoice {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: number | null;
  xero_invoice_id: string | null;
  xero_status: string | null;
}

export default function PurchaseInvoicePanel({
  poId,
  tenantId,
  canSend,
}: {
  poId: string;
  tenantId: string;
  canSend: boolean;
}) {
  const headers = { "x-tenant-id": tenantId, "Content-Type": "application/json" };
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [lineTotal, setLineTotal] = useState<number | null>(null);
  const [missingAccounts, setMissingAccounts] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedInvoice | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/inventory/purchase-orders/${poId}/invoice`, {
      headers: { "x-tenant-id": tenantId },
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({} as { error?: string; invoice?: SavedInvoice | null; line_total?: number; missing_accounts?: string[] }));
    if (!res.ok) {
      setError(json.error ?? "Could not load the supplier invoice");
      return;
    }
    setError(null);
    setLineTotal(typeof json.line_total === "number" ? json.line_total : null);
    setMissingAccounts(json.missing_accounts ?? []);
    const invoice = json.invoice ?? null;
    setSaved(invoice);
    if (invoice && !invoice.xero_invoice_id) {
      setInvoiceNumber(invoice.invoice_number ?? "");
      setInvoiceDate(invoice.invoice_date ?? "");
      setDueDate(invoice.due_date ?? "");
      setTotalAmount(invoice.total_amount != null ? String(invoice.total_amount) : "");
    }
  }, [poId, tenantId]);

  useEffect(() => { load(); }, [load]);

  async function readInvoice() {
    setReading(true);
    setNote(null);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/purchase-orders/${poId}/invoice`, { method: "PUT", headers });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Could not read the invoice");
        return;
      }
      if (json.read !== true) {
        setNote(typeof json.message === "string" ? json.message : "Type the invoice fields.");
        return;
      }
      if (typeof json.invoice_number === "string" && json.invoice_number) setInvoiceNumber(json.invoice_number);
      if (typeof json.invoice_date === "string") setInvoiceDate(json.invoice_date);
      if (typeof json.due_date === "string") setDueDate(json.due_date);
      if (typeof json.total_amount === "number") setTotalAmount(String(json.total_amount));
      setNote(typeof json.file_name === "string"
        ? `Read ${json.file_name}. Check the fields, then send the draft.`
        : "Check the fields, then send the draft.");
    } finally {
      setReading(false);
    }
  }

  async function sendDraft() {
    setSending(true);
    setNote(null);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/purchase-orders/${poId}/invoice`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate || null,
          due_date: dueDate || null,
          total_amount: totalAmount === "" ? null : Number(totalAmount),
        }),
      });
      const json = await res.json().catch(() => ({} as { error?: string; message?: string; xero_invoice_id?: string }));
      if (!res.ok) {
        setError(json.error ?? "The draft bill was not created");
        if (json.xero_invoice_id) await load();
        return;
      }
      setNote(json.message ?? "Xero draft created.");
      await load();
    } finally {
      setSending(false);
    }
  }

  const field = { width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13 };
  const alreadySent = !!saved?.xero_invoice_id;

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, marginTop: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Supplier invoice</div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "#6B7280" }}>
        Attach the invoice above, check the fields, then send a draft bill to Xero. It stays a draft until someone approves it in Xero.
      </p>
      {lineTotal != null && (
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12 }}>
          Purchase order line costs add up to ${lineTotal.toLocaleString("en-AU", { minimumFractionDigits: 2 })}.
        </div>
      )}
      {missingAccounts.length > 0 && (
        <div style={{ fontSize: 12, color: "#92400E", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>
          No Xero account on: {missingAccounts.join(", ")}
        </div>
      )}
      {alreadySent ? (
        <div style={{ fontSize: 13, color: "#065F46", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, padding: "10px 12px" }}>
          Xero draft {saved?.xero_status || "DRAFT"} · {saved?.xero_invoice_id}
          {saved?.invoice_number ? ` · Invoice ${saved.invoice_number}` : ""}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
            Invoice number
            <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} style={{ ...field, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
            Total
            <input type="number" step="0.01" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} style={{ ...field, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
            Invoice date
            <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} style={{ ...field, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
            Due date
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...field, marginTop: 4 }} />
          </label>
        </div>
      )}
      {(note || error) && (
        <div style={{ marginTop: 12, fontSize: 13, color: error ? "#B91C1C" : "#374151", background: error ? "#FEF2F2" : "#F9FAFB", borderRadius: 8, padding: "8px 10px" }}>
          {error || note}
        </div>
      )}
      {canSend && !alreadySent && (
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" onClick={readInvoice} disabled={reading || sending}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 13, cursor: "pointer" }}>
            {reading ? "Reading…" : "Read invoice"}
          </button>
          <button type="button" onClick={sendDraft} disabled={sending || reading || !invoiceNumber.trim()}
            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: invoiceNumber.trim() ? 1 : 0.5 }}>
            {sending ? "Sending draft…" : "Send draft bill to Xero"}
          </button>
        </div>
      )}
    </div>
  );
}
