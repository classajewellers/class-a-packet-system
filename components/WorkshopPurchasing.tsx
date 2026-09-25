"use client";

import { useEffect, useState } from "react";

export interface PurchaseRow {
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

export type MaterialLineStatus = "needed" | "ordered" | "received";

export interface MaterialLine {
  key: string;
  title: string;
  status: MaterialLineStatus;
  poId: string | null;
  poNumber: string | null;
  supplier: string | null;
}

function purchaseStatus(row: PurchaseRow): MaterialLineStatus {
  const quantity = Number(row.quantity ?? 0);
  const receivedQty = Number(row.received_quantity ?? 0);
  if (row.received || (quantity > 0 && receivedQty >= quantity)) return "received";
  const status = row.purchase_order?.status;
  if (status && status !== "draft" && status !== "cancelled") return "ordered";
  return "needed";
}

// Each row is one inventory_po_lines record whose packet_id is this job
// (migration 087). That is the link. The packet's workshop_supplier,
// workshop_po_number and workshop_due_date are the casting order, not lines.
export function mergeMaterialLines(purchases: PurchaseRow[]): MaterialLine[] {
  return purchases.map((row) => ({
    key: `po-line:${row.id}`,
    title: row.what || "Untitled line",
    status: purchaseStatus(row),
    poId: row.purchase_order?.id ?? null,
    poNumber: row.purchase_order?.po_number ?? null,
    supplier: row.purchase_order?.supplier_name ?? null,
  }));
}

const LINE_STATUS: Record<MaterialLineStatus, { label: string; bg: string; fg: string }> = {
  needed: { label: "Needed", bg: "#F3F4F6", fg: "#374151" },
  ordered: { label: "Ordered", bg: "#EFF6FF", fg: "#1D4ED8" },
  received: { label: "Received", bg: "#ECFDF5", fg: "#047857" },
};

export function materialsSummary(lines: MaterialLine[]): string {
  if (lines.length === 0) return "No materials or purchases on this job yet.";
  const count = (status: MaterialLineStatus) => lines.filter((line) => line.status === status).length;
  return `Materials: ${count("needed")} needed · ${count("ordered")} ordered · ${count("received")} received`;
}

export function useJobPurchases(packetId: string, tenantId: string) {
  const [rows, setRows] = useState<PurchaseRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // One request for the open job. Tab switches must not cancel it: the
    // overview and the Purchasing tab both read this result.
    const ctrl = new AbortController();
    let ignore = false;
    const timeout = window.setTimeout(() => ctrl.abort(), 15000);
    setRows(null);
    setError("");

    (async () => {
      try {
        const res = await fetch(`/api/workshop/packets/${packetId}/purchasing?fresh=${Date.now()}`, {
          cache: "no-store",
          signal: ctrl.signal,
          headers: tenantId ? { "x-tenant-id": tenantId } : {},
        });
        const text = await res.text();
        let json: { purchases?: PurchaseRow[]; error?: unknown } = {};
        try {
          json = text ? JSON.parse(text) as { purchases?: PurchaseRow[]; error?: unknown } : {};
        } catch {
          json = {};
        }
        if (ignore) return;
        if (!res.ok) {
          const message = typeof json.error === "string" && json.error.trim()
            ? json.error.trim()
            : `Could not load purchases (${res.status})`;
          setError(message);
          setRows([]);
          return;
        }
        setRows(Array.isArray(json.purchases) ? json.purchases : []);
      } catch (err) {
        if (ignore) return;
        const aborted = err instanceof DOMException && err.name === "AbortError";
        setError(aborted ? "Purchases took too long to load." : "Could not load purchases");
        setRows([]);
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    return () => {
      ignore = true;
      window.clearTimeout(timeout);
      ctrl.abort();
    };
  }, [packetId, tenantId]);

  return { rows, error };
}

export default function WorkshopPurchasing({
  rows,
  error,
  variant = "list",
  onOpen,
}: {
  rows: PurchaseRow[] | null;
  error: string;
  variant?: "list" | "summary";
  onOpen?: () => void;
}) {
  const lines = rows == null ? null : mergeMaterialLines(rows);

  if (variant === "summary") {
    return (
      <div style={{ marginBottom: 16 }}>
        {error ? (
          <div style={{ fontSize: 13, color: "#B91C1C" }}>{error}</div>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 600, color: "#4338CA", cursor: onOpen ? "pointer" : "default", textAlign: "left" }}
          >
            {lines == null ? "Loading materials…" : materialsSummary(lines)}
          </button>
        )}
      </div>
    );
  }

  return (
    <section>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        Lines
      </div>
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#B91C1C" }}>
          {error}
        </div>
      )}
      {!error && lines == null && (
        <div style={{ fontSize: 13, color: "#9CA3AF" }}>Loading materials…</div>
      )}
      {!error && lines != null && lines.length === 0 && (
        <div style={{ fontSize: 13, color: "#6B7280", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 12px" }}>
          Nothing needed or ordered for this job yet.
        </div>
      )}
      {!error && lines != null && lines.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lines.map((line) => {
            const tone = LINE_STATUS[line.status];
            const poLabel = [line.poNumber, line.supplier].filter(Boolean).join(" · ");
            return (
              <div key={line.key} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{line.title}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: tone.bg, color: tone.fg, whiteSpace: "nowrap" }}>
                    {tone.label}
                  </span>
                </div>
                {poLabel && (
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    {line.poId ? (
                      <a href={`/inventory/purchase-orders/${line.poId}`} style={{ fontWeight: 600, color: "#4338CA" }}>
                        {poLabel}
                      </a>
                    ) : (
                      <span style={{ color: "#374151" }}>{poLabel}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
