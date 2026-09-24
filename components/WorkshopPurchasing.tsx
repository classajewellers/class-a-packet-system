"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/formatters";

interface PurchaseRow {
  id: string;
  what: string;
  category: string | null;
  quantity: number;
  received_quantity: number;
  received: boolean;
  estimated_cost: number | null;
  actual_cost: number | null;
  received_at: string | null;
  purchase_order: {
    id: string;
    po_number: string | null;
    status: string | null;
    order_date: string | null;
    expected_date: string | null;
    supplier_name: string | null;
  } | null;
}

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: "#F3F4F6", fg: "#374151" },
  ordered: { label: "Ordered", bg: "#EFF6FF", fg: "#1D4ED8" },
  partially_received: { label: "Partly received", bg: "#FFFBEB", fg: "#92400E" },
  received: { label: "Received", bg: "#ECFDF5", fg: "#047857" },
  cancelled: { label: "Cancelled", bg: "#FEF2F2", fg: "#B91C1C" },
};

function showDate(value: string | null | undefined): string {
  if (!value) return "—";
  const day = value.slice(0, 10);
  const [y, m, d] = day.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export default function WorkshopPurchasing({
  packetId,
  tenantId,
}: {
  packetId: string;
  tenantId: string;
}) {
  const [rows, setRows] = useState<PurchaseRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError("");
    fetch(`/api/workshop/packets/${packetId}/purchasing`, {
      cache: "no-store",
      headers: { "x-tenant-id": tenantId },
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `Could not load purchases (${res.status})`);
        if (!cancelled) setRows(json.purchases ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load purchases");
      });
    return () => { cancelled = true; };
  }, [packetId, tenantId]);

  return (
    <section style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        Purchasing
      </div>
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#B91C1C" }}>
          {error}
        </div>
      )}
      {!error && rows == null && (
        <div style={{ fontSize: 13, color: "#9CA3AF" }}>Loading purchases…</div>
      )}
      {!error && rows != null && rows.length === 0 && (
        <div style={{ fontSize: 13, color: "#6B7280", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 12px" }}>
          Nothing ordered for this job yet. A purchase order line shows here when it is linked to this packet — castings, stones, and findings.
        </div>
      )}
      {!error && rows != null && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row) => {
            const po = row.purchase_order;
            const status = po?.status ? STATUS[po.status] : null;
            return (
              <div key={row.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{row.what}</div>
                  {status && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: status.bg, color: status.fg, whiteSpace: "nowrap" }}>
                      {status.label}
                    </span>
                  )}
                </div>
                {row.category && (
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{row.category}</div>
                )}
                <div style={{ fontSize: 12, color: "#374151", marginTop: 6, lineHeight: 1.5 }}>
                  <div>Supplier: {po?.supplier_name || "No supplier on this order"}</div>
                  <div>Ordered: {showDate(po?.order_date)}{po?.expected_date ? ` · Expected ${showDate(po.expected_date)}` : ""}</div>
                  <div>Received: {row.received_quantity} of {row.quantity}{row.received_at ? ` · ${showDate(row.received_at)}` : ""}</div>
                  {row.estimated_cost != null && <div>Est. cost: {formatCurrency(Number(row.estimated_cost))}</div>}
                </div>
                <div style={{ marginTop: 8 }}>
                  {po ? (
                    <a
                      href={`/inventory/purchase-orders/${po.id}`}
                      style={{ fontSize: 13, fontWeight: 600, color: "#4338CA" }}
                    >
                      {po.po_number || "Open purchase order"}
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: "#9CA3AF" }}>Purchase order missing</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
