"use client";

import type { ReactNode } from "react";
import type { PiecePassport } from "@/lib/piecePassport";
import { formatCurrency } from "@/lib/formatters";

const STATUS: Record<string, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partly received",
  received: "Received",
  cancelled: "Cancelled",
  pending: "Pending",
  partial: "Partial",
  disputed: "Disputed",
};

function showDate(value: string | null | undefined): string {
  if (!value) return "—";
  const day = value.slice(0, 10);
  const [y, m, d] = day.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: "#111827" }}>{children}</div>
    </div>
  );
}

export default function PiecePassportCard({
  passport,
  error,
}: {
  passport: PiecePassport | null;
  error: string;
}) {
  if (error) {
    return (
      <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 13, color: "#B91C1C" }}>
        Passport: {error}
      </div>
    );
  }
  if (!passport || !passport.linked) return null;

  const po = passport.purchase_order;
  const job = passport.job?.id ? passport.job : null;
  const jobLabel = job
    ? (job.reference_number?.trim()
      || [job.job_type, job.stage].filter(Boolean).join(" · ")
      || "Workshop job")
    : null;

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Passport
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
        <Field label="What">{passport.what || "—"}{passport.category ? ` · ${passport.category}` : ""}</Field>
        <Field label="Job">
          {jobLabel ? jobLabel : <span style={{ color: "#9CA3AF" }}>No job</span>}
        </Field>
        <Field label="Packet">
          {passport.packet?.reference_number
            ? passport.packet.reference_number
            : <span style={{ color: "#9CA3AF" }}>—</span>}
          {passport.packet?.customer_name ? <div style={{ fontSize: 12, color: "#6B7280" }}>{passport.packet.customer_name}</div> : null}
        </Field>
        <Field label="Purchase order">
          {po ? (
            <a href={`/inventory/purchase-orders/${po.id}`} style={{ color: "#4338CA", fontWeight: 600 }}>
              {po.po_number || "Open purchase order"}
            </a>
          ) : "—"}
          {po?.status ? <div style={{ fontSize: 12, color: "#6B7280" }}>{STATUS[po.status] ?? po.status}</div> : null}
        </Field>
        <Field label="Supplier">{passport.supplier?.name || "No supplier on this order"}</Field>
        <Field label="Received">{showDate(passport.received_at)}</Field>
        <Field label="Invoice">
          {passport.invoice ? (
            <>
              <div>{passport.invoice.invoice_number || "Invoice"}</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>
                {[
                  showDate(passport.invoice.invoice_date) !== "—" ? showDate(passport.invoice.invoice_date) : null,
                  passport.invoice.status ? (STATUS[passport.invoice.status] ?? passport.invoice.status) : null,
                  passport.invoice.total_amount != null ? formatCurrency(passport.invoice.total_amount) : null,
                ].filter(Boolean).join(" · ") || "On file"}
              </div>
            </>
          ) : (
            <span style={{ color: "#9CA3AF" }}>None recorded</span>
          )}
        </Field>
      </div>
    </div>
  );
}
