"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage, canSeeCosts } from "@/lib/userTypes";
import { Plus, Package, AlertCircle, ChevronRight } from "lucide-react";

type POStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier?: { id: string; name: string } | null;
  status: POStatus;
  order_date: string | null;
  expected_date: string | null;
  notes: string | null;
  line_count: number;
  received_count: number;
  pending_invoice_total: number;
  pending_invoice_count: number;
  total_value?: number | null;
  created_at: string;
}

const STATUS_CONFIG: Record<POStatus, { label: string; bg: string; fg: string; border: string }> = {
  draft:              { label: "Draft",              bg: "#F3F4F6", fg: "#374151", border: "#E5E7EB" },
  ordered:            { label: "Ordered",            bg: "#EFF6FF", fg: "#1D4ED8", border: "#BFDBFE" },
  partially_received: { label: "Partly Received",    bg: "#FFFBEB", fg: "#92400E", border: "#FDE68A" },
  received:           { label: "Received",           bg: "#ECFDF5", fg: "#065F46", border: "#A7F3D0" },
  cancelled:          { label: "Cancelled",          bg: "#F9FAFB", fg: "#6B7280", border: "#E5E7EB" },
};

function fmtDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-AU");
}

function StatusBadge({ status }: { status: POStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 999,
      fontSize: 12, fontWeight: 500,
      background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {[200, 120, 80, 100, 80, 70, 90, 60].map((w, i) => (
        <td key={i} style={{ padding: "14px 16px" }}>
          <div style={{ height: 14, width: w, background: "#F3F4F6", borderRadius: 4 }} />
        </td>
      ))}
    </tr>
  );
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const tenantId: string = user?.tenantId ?? "";
  const isManager = hydrated ? canManage(user?.role) : false;

  const [pos, setPos]               = useState<PurchaseOrder[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadError, setLoadError]   = useState("");
  const [showCancelled, setShowCancelled] = useState(false);

  const headers = { "x-tenant-id": tenantId };

  const fetchPos = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/inventory/purchase-orders", { headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPos([]);
        setLoadError(json.error ?? "Could not load purchase orders");
      } else {
        setPos(json.purchase_orders ?? []);
      }
    } catch (err) {
      setPos([]);
      setLoadError(err instanceof Error ? err.message : "Could not load purchase orders");
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchPos(); }, [fetchPos]);

  if (!hydrated) return null;

  const supplierName = (po: PurchaseOrder) =>
    po.supplier?.name ?? po.supplier_name ?? "—";

  const displayedPos = showCancelled ? pos : pos.filter(p => p.status !== "cancelled");
  const activePOs = pos.filter(p => p.status !== "draft" && p.status !== "cancelled");
  const totalPendingInvoice = activePOs.reduce((sum, p) => sum + (p.pending_invoice_total ?? 0), 0);
  const totalPendingCount   = activePOs.reduce((sum, p) => sum + (p.pending_invoice_count ?? 0), 0);

  return (
    <div className="po-list-page" style={{ maxWidth: 1200, margin: "0 auto" }}>
      <style>{`
        .po-list-page { padding: 0 0 32px; }
        .po-phone-list { display: flex; flex-direction: column; gap: 10px; }
        .po-desk-list { display: none; }
        @media (min-width: 768px) {
          .po-list-page { padding: 32px 32px 64px; }
          .po-phone-list { display: none; }
          .po-desk-list { display: block; }
        }
      `}</style>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>Purchase Orders</h1>
          <p style={{ fontSize: 14, color: "#6B7280", margin: "4px 0 0" }}>
            {loading ? "Loading…" : `${displayedPos.length} order${displayedPos.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {pos.some(p => p.status === "cancelled") && (
            <button
              onClick={() => setShowCancelled(s => !s)}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 13, cursor: "pointer", color: showCancelled ? "#374151" : "#9CA3AF" }}
            >
              {showCancelled ? "Hide Cancelled" : "Show Cancelled"}
            </button>
          )}
          {isManager && (
            <button
              onClick={() => router.push("/inventory/purchase-orders/new")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 500,
                background: "#111827", color: "#fff", border: "none", cursor: "pointer",
              }}
            >
              <Plus size={15} /> New PO
            </button>
          )}
        </div>
      </div>

      {/* Pending invoice summary — finance-gated */}
      {!loading && totalPendingCount > 0 && canSeeCosts(user) && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, marginBottom: 16 }}>
          <AlertCircle size={18} style={{ color: "#D97706", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#92400E" }}>
              Unbilled work in flight: ${totalPendingInvoice.toLocaleString("en-AU", { minimumFractionDigits: 2 })} estimated
            </div>
            <div style={{ fontSize: 12, color: "#B45309", marginTop: 2 }}>
              {totalPendingCount} line{totalPendingCount !== 1 ? "s" : ""} across active POs have not been invoiced yet
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div style={{ padding: "12px 16px", background: "#FEF2F2", color: "#B91C1C", borderRadius: 10, fontSize: 14, marginBottom: 16 }}>
          {loadError}
        </div>
      )}

      {loading ? (
        <>
          <div className="po-phone-list" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 88, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12 }} />
            ))}
          </div>
          <div className="po-desk-list" style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <tbody>
                {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
              </tbody>
            </table>
          </div>
        </>
      ) : displayedPos.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 48, textAlign: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <Package size={32} style={{ color: "#D1D5DB" }} />
            <div style={{ fontSize: 15, fontWeight: 500, color: "#374151" }}>
              {loadError ? "Purchase orders could not be loaded" : "No purchase orders yet"}
            </div>
            {isManager && (
              <button
                onClick={() => router.push("/inventory/purchase-orders/new")}
                style={{ padding: "8px 16px", borderRadius: 8, background: "#111827", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, marginTop: 4 }}
              >
                Create your first PO
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="po-phone-list">
            {displayedPos.map(po => (
              <Link
                key={po.id}
                href={`/inventory/purchase-orders/${po.id}`}
                aria-label={`Open ${po.po_number}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 14px",
                  background: "#fff",
                  border: "1px solid #E5E7EB",
                  borderRadius: 12,
                  textDecoration: "none",
                  color: "inherit",
                  opacity: po.status === "cancelled" ? 0.6 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 16, color: "#111827", whiteSpace: "nowrap" }}>{po.po_number}</div>
                  <div style={{ marginTop: 4, fontSize: 14, color: supplierName(po) === "—" ? "#9CA3AF" : "#374151" }}>
                    {supplierName(po)}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <StatusBadge status={po.status} />
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: "#6B7280" }}>
                    Ordered {fmtDate(po.order_date)} · Expected {fmtDate(po.expected_date)} · {po.received_count}/{po.line_count} received
                  </div>
                </div>
                <ChevronRight size={20} style={{ color: "#6B7280", flexShrink: 0 }} aria-hidden />
              </Link>
            ))}
          </div>

          <div className="po-desk-list" style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
              {["PO Number", "Supplier", "Status", "Order Date", "Expected", "Lines", "Received", ""].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedPos.map((po, i) => (
              <tr
                key={po.id}
                onClick={() => router.push(`/inventory/purchase-orders/${po.id}`)}
                style={{
                  borderBottom: i < displayedPos.length - 1 ? "1px solid #F3F4F6" : "none",
                  cursor: "pointer",
                  opacity: po.status === "cancelled" ? 0.6 : 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}
              >
                <td style={{ padding: "12px 16px", fontFamily: "monospace", fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>{po.po_number}</td>
                <td style={{ padding: "12px 16px", color: "#374151" }}>{supplierName(po)}</td>
                <td style={{ padding: "12px 16px" }}><StatusBadge status={po.status} /></td>
                <td style={{ padding: "12px 16px", color: "#6B7280", whiteSpace: "nowrap" }}>{fmtDate(po.order_date)}</td>
                <td style={{ padding: "12px 16px", color: "#6B7280", whiteSpace: "nowrap" }}>{fmtDate(po.expected_date)}</td>
                <td style={{ padding: "12px 16px", color: "#374151", textAlign: "center" }}>{po.line_count}</td>
                <td style={{ padding: "12px 16px", color: "#374151", textAlign: "center", whiteSpace: "nowrap" }}>
                  {po.received_count}/{po.line_count}
                </td>
                <td style={{ padding: "12px 16px", color: "#6B7280", fontSize: 12, whiteSpace: "nowrap" }}>View →</td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
        </>
      )}
    </div>
  );
}
