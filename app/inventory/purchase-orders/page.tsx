"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { Plus, Package } from "lucide-react";

type POStatus = "draft" | "ordered" | "partially_received" | "received";

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
  total_value?: number | null;
  created_at: string;
}

const STATUS_CONFIG: Record<POStatus, { label: string; bg: string; fg: string; border: string }> = {
  draft:              { label: "Draft",              bg: "#F3F4F6", fg: "#374151", border: "#E5E7EB" },
  ordered:            { label: "Ordered",            bg: "#EFF6FF", fg: "#1D4ED8", border: "#BFDBFE" },
  partially_received: { label: "Partly Received",    bg: "#FFFBEB", fg: "#92400E", border: "#FDE68A" },
  received:           { label: "Received",           bg: "#ECFDF5", fg: "#065F46", border: "#A7F3D0" },
};

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

  const [pos, setPos]         = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: 0 }}>Purchase Orders</h1>
          <p style={{ fontSize: 14, color: "#6B7280", margin: "4px 0 0" }}>
            {loading ? "Loading…" : `${pos.length} order${pos.length !== 1 ? "s" : ""}`}
          </p>
        </div>
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

      {/* Table */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
              {["PO Number", "Supplier", "Status", "Order Date", "Expected", "Lines", "Received", ""].map(h => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
            ) : pos.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 48, textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <Package size={32} style={{ color: "#D1D5DB" }} />
                    <div style={{ fontSize: 15, fontWeight: 500, color: "#374151" }}>No purchase orders yet</div>
                    {isManager && (
                      <button
                        onClick={() => router.push("/inventory/purchase-orders/new")}
                        style={{ padding: "8px 16px", borderRadius: 8, background: "#111827", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, marginTop: 4 }}
                      >
                        Create your first PO
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : pos.map((po, i) => (
              <tr
                key={po.id}
                onClick={() => router.push(`/inventory/purchase-orders/${po.id}`)}
                style={{
                  borderBottom: i < pos.length - 1 ? "1px solid #F3F4F6" : "none",
                  cursor: "pointer",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}
              >
                <td style={{ padding: "12px 16px", fontFamily: "monospace", fontWeight: 600, color: "#111827" }}>{po.po_number}</td>
                <td style={{ padding: "12px 16px", color: "#374151" }}>{supplierName(po)}</td>
                <td style={{ padding: "12px 16px" }}><StatusBadge status={po.status} /></td>
                <td style={{ padding: "12px 16px", color: "#6B7280" }}>{po.order_date ? new Date(po.order_date).toLocaleDateString("en-AU") : "—"}</td>
                <td style={{ padding: "12px 16px", color: "#6B7280" }}>{po.expected_date ? new Date(po.expected_date).toLocaleDateString("en-AU") : "—"}</td>
                <td style={{ padding: "12px 16px", color: "#374151", textAlign: "center" }}>{po.line_count}</td>
                <td style={{ padding: "12px 16px", color: "#374151", textAlign: "center" }}>
                  {po.received_count}/{po.line_count}
                </td>
                <td style={{ padding: "12px 16px", color: "#6B7280", fontSize: 12 }}>View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
