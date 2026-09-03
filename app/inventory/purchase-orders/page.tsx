"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage, canSeeCosts } from "@/lib/userTypes";
import { Plus, Package, AlertCircle } from "lucide-react";
import { color, radius, shadow, type as typo } from "@/lib/theme";
import SharedStatusBadge, { type StatusTone } from "@/components/StatusBadge";

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

const STATUS_CONFIG: Record<POStatus, { label: string; tone: StatusTone }> = {
  draft:              { label: "Draft",              tone: "neutral" },
  ordered:            { label: "Ordered",            tone: "info" },
  partially_received: { label: "Partly Received",    tone: "warning" },
  received:           { label: "Received",           tone: "success" },
  cancelled:          { label: "Cancelled",          tone: "danger" },
};

function StatusBadge({ status }: { status: POStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return <SharedStatusBadge tone={cfg.tone} label={cfg.label} />;
}

function SkeletonRow() {
  return (
    <tr>
      {[200, 120, 80, 100, 80, 70, 90, 60].map((w, i) => (
        <td key={i} style={{ padding: "14px 16px" }}>
          <div style={{ height: 14, width: w, background: color.fill, borderRadius: 4 }} />
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
  const [showCancelled, setShowCancelled] = useState(false);

  const headers = { "x-tenant-id": tenantId };

  const fetchPos = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const res = await fetch("/api/inventory/purchase-orders", { headers });
    if (res.ok) {
      const json = await res.json();
      setPos(json.purchase_orders ?? []);
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
    <div style={{ padding: "32px 32px 64px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ ...typo.h1, margin: 0 }}>Purchase Orders</h1>
          <p style={{ fontSize: 14, color: color.textMuted, margin: "6px 0 0" }}>
            {loading ? "Loading…" : `${displayedPos.length} order${displayedPos.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {pos.some(p => p.status === "cancelled") && (
            <button
              onClick={() => setShowCancelled(s => !s)}
              style={{ padding: "9px 18px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, fontSize: 14, fontWeight: 500, cursor: "pointer", color: showCancelled ? color.ink : color.textFaint }}
            >
              {showCancelled ? "Hide Cancelled" : "Show Cancelled"}
            </button>
          )}
          {isManager && (
            <button
              onClick={() => router.push("/inventory/purchase-orders/new")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 18px", borderRadius: radius.pill, fontSize: 14, fontWeight: 500,
                background: color.ink, color: color.white, border: "none", cursor: "pointer",
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

      {/* Table */}
      <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, boxShadow: shadow.card, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: color.white, borderBottom: `1px solid ${color.line}` }}>
              {["PO Number", "Supplier", "Status", "Order Date", "Expected", "Lines", "Received", ""].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontFamily: "var(--font-mono)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase", color: color.textMuted, fontSize: 11, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
            ) : displayedPos.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 48, textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <Package size={32} style={{ color: color.textFaint }} />
                    <div style={{ fontSize: 15, fontWeight: 500, color: color.ink }}>No purchase orders yet</div>
                    {isManager && (
                      <button
                        onClick={() => router.push("/inventory/purchase-orders/new")}
                        style={{ padding: "9px 18px", borderRadius: radius.pill, background: color.ink, color: color.white, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, marginTop: 4 }}
                      >
                        Create your first PO
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : displayedPos.map((po, i) => (
              <tr
                key={po.id}
                onClick={() => router.push(`/inventory/purchase-orders/${po.id}`)}
                style={{
                  borderBottom: i < displayedPos.length - 1 ? `1px solid ${color.line}` : "none",
                  cursor: "pointer",
                  opacity: po.status === "cancelled" ? 0.6 : 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = color.hover)}
                onMouseLeave={e => (e.currentTarget.style.background = "")}
              >
                <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontWeight: 600, color: color.ink }}>{po.po_number}</td>
                <td style={{ padding: "12px 16px", color: color.ink }}>{supplierName(po)}</td>
                <td style={{ padding: "12px 16px" }}><StatusBadge status={po.status} /></td>
                <td style={{ padding: "12px 16px", color: color.textMuted }}>{po.order_date ? new Date(po.order_date).toLocaleDateString("en-AU") : "—"}</td>
                <td style={{ padding: "12px 16px", color: color.textMuted }}>{po.expected_date ? new Date(po.expected_date).toLocaleDateString("en-AU") : "—"}</td>
                <td style={{ padding: "12px 16px", color: color.ink, textAlign: "center" }}>{po.line_count}</td>
                <td style={{ padding: "12px 16px", color: color.ink, textAlign: "center" }}>
                  {po.received_count}/{po.line_count}
                </td>
                <td style={{ padding: "12px 16px", color: color.textMuted, fontSize: 12 }}>View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
