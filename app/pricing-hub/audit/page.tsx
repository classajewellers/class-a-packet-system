"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

interface BuildComponent {
  id: string;
  total_cost: number | null;
}

interface SupplierCost {
  id: string;
  cost_ex_gst: number;
  price_list_date: string;
  supplier_name: string;
}

interface VariantRow {
  id: string;
  product_id: string;
  name: string;
  active_pricing_mode: string;
  target_margin_multiplier: number;
  current_retail: number | null;
  pricing_build_components: BuildComponent[];
  pricing_supplier_costs: SupplierCost[];
}

interface AuditFlag {
  variantId: string;
  variantName: string;
  productId: string;
  reason: string;
  severity: "high" | "medium";
}

function daysBetween(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

function buildCostForVariant(v: VariantRow): number | null {
  const comps = v.pricing_build_components ?? [];
  if (comps.length === 0) return null;
  const total = comps.reduce((s, c) => s + (c.total_cost != null ? Number(c.total_cost) : 0), 0);
  return total;
}

function supplierCostForVariant(v: VariantRow): { cost: number; date: string } | null {
  const costs = v.pricing_supplier_costs ?? [];
  if (costs.length === 0) return null;
  const latest = [...costs].sort((a, b) => b.price_list_date.localeCompare(a.price_list_date))[0];
  return { cost: Number(latest.cost_ex_gst), date: latest.price_list_date };
}

function exportCSV(flags: AuditFlag[]) {
  const header = "Variant,Product ID,Severity,Reason";
  const rows = flags.map(f =>
    `"${f.variantName}","${f.productId}","${f.severity}","${f.reason}"`
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pricing_audit.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function PricingAuditPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (hydrated && user && user.role !== "admin") router.replace("/");
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!hydrated || !user || user.role !== "admin") return;
    fetch("/api/pricing-hub/variants", { credentials: "include" })
      .then(r => r.json())
      .then(d => setVariants(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [hydrated, user]);

  if (!hydrated || !user) return null;
  if (user.role !== "admin") return null;

  const flags: AuditFlag[] = [];

  for (const v of variants) {
    const buildCost    = buildCostForVariant(v);
    const supplierInfo = supplierCostForVariant(v);

    // No pricing data
    if (!buildCost && !supplierInfo) {
      flags.push({ variantId: v.id, variantName: v.name, productId: v.product_id, reason: "No build components and no supplier costs — variant is unpriced", severity: "high" });
      continue;
    }

    // Stale supplier quote
    if (supplierInfo && daysBetween(supplierInfo.date) > 60) {
      flags.push({ variantId: v.id, variantName: v.name, productId: v.product_id, reason: `Supplier quote is ${daysBetween(supplierInfo.date)} days old (${new Date(supplierInfo.date).toLocaleDateString("en-AU")})`, severity: "medium" });
    }

    // Margin check
    const retail = v.current_retail != null ? Number(v.current_retail) : null;
    const effectiveCost = buildCost ?? (supplierInfo?.cost ?? null);
    if (retail != null && effectiveCost != null && effectiveCost > 0) {
      const actualMultiplier = retail / effectiveCost;
      if (actualMultiplier < 2) {
        flags.push({ variantId: v.id, variantName: v.name, productId: v.product_id, reason: `Retail margin is ${actualMultiplier.toFixed(2)}x — below the 2× minimum (target: ${v.target_margin_multiplier}×)`, severity: "high" });
      }
    } else if (retail == null && effectiveCost != null) {
      flags.push({ variantId: v.id, variantName: v.name, productId: v.product_id, reason: "No retail price set — cannot verify margin", severity: "medium" });
    }
  }

  const highCount   = flags.filter(f => f.severity === "high").length;
  const mediumCount = flags.filter(f => f.severity === "medium").length;

  const thStyle: React.CSSProperties = {
    padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#6B7280",
    textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em",
    background: "#F9FAFB", borderBottom: "1px solid #E8E8F0",
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 920 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1760", marginBottom: 4 }}>Pricing Audit</h1>
          <p style={{ fontSize: 14, color: "#6B7280" }}>Variants flagged for missing data, stale quotes, or low margin.</p>
        </div>
        {flags.length > 0 && (
          <button
            onClick={() => exportCSV(flags)}
            style={{ padding: "9px 18px", background: "#fff", color: "#374151", border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Export CSV
          </button>
        )}
      </div>

      {!loading && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ padding: "12px 20px", borderRadius: 10, background: highCount > 0 ? "#FEF2F2" : "#F0FDF4", border: `1px solid ${highCount > 0 ? "#FECACA" : "#BBF7D0"}` }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: highCount > 0 ? "#DC2626" : "#16A34A" }}>{highCount}</span>
            <span style={{ fontSize: 13, color: highCount > 0 ? "#DC2626" : "#16A34A", marginLeft: 8 }}>High severity</span>
          </div>
          <div style={{ padding: "12px 20px", borderRadius: 10, background: mediumCount > 0 ? "#FFFBEB" : "#F0FDF4", border: `1px solid ${mediumCount > 0 ? "#FDE68A" : "#BBF7D0"}` }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: mediumCount > 0 ? "#D97706" : "#16A34A" }}>{mediumCount}</span>
            <span style={{ fontSize: 13, color: mediumCount > 0 ? "#D97706" : "#16A34A", marginLeft: 8 }}>Medium severity</span>
          </div>
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "center", width: 90 }}>Severity</th>
              <th style={thStyle}>Variant</th>
              <th style={thStyle}>Issue</th>
              <th style={{ ...thStyle, width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading…</td></tr>
            ) : flags.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ fontSize: 16, color: "#16A34A", fontWeight: 700, marginBottom: 6 }}>All clear</div>
                  <div style={{ fontSize: 13, color: "#6B7280" }}>No pricing issues found.</div>
                </td>
              </tr>
            ) : flags.map((f, i) => (
              <tr key={`${f.variantId}-${i}`} style={{ borderBottom: i < flags.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                <td style={{ padding: "12px 14px", textAlign: "center" }}>
                  <span style={{
                    display: "inline-block", padding: "2px 10px", borderRadius: 20,
                    fontSize: 11, fontWeight: 600,
                    background: f.severity === "high" ? "#FEF2F2" : "#FFFBEB",
                    color: f.severity === "high" ? "#DC2626" : "#D97706",
                  }}>
                    {f.severity.charAt(0).toUpperCase() + f.severity.slice(1)}
                  </span>
                </td>
                <td style={{ padding: "12px 14px", fontSize: 13, color: "#1A1760", fontWeight: 600 }}>{f.variantName}</td>
                <td style={{ padding: "12px 14px", fontSize: 13, color: "#374151" }}>{f.reason}</td>
                <td style={{ padding: "12px 14px" }}>
                  <Link
                    href={`/pricing-hub/products/${f.productId}`}
                    style={{ fontSize: 13, color: "#635BFF", textDecoration: "none", fontWeight: 500 }}
                  >
                    Fix →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
