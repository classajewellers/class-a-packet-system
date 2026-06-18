"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

interface SupplierCost {
  id: string;
  variant_id: string;
  supplier_name: string;
  supplier_item_code: string | null;
  cost_ex_gst: number;
  cost_inc_gst: number | null;
  currency: string;
  price_list_date: string;
}

interface VariantRow {
  id: string;
  name: string;
  product_id: string;
  pricing_supplier_costs: SupplierCost[];
}

interface SupplierSummary {
  name: string;
  variantCount: number;
  latestDate: string;
  avgCost: number;
  daysOld: number;
  stale: boolean;
}

function daysBetween(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

export default function PricingSupplierPage() {
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

  // Aggregate supplier costs by supplier_name
  const supplierMap = new Map<string, { costs: SupplierCost[]; variantIds: Set<string> }>();
  for (const v of variants) {
    for (const sc of v.pricing_supplier_costs ?? []) {
      const key = sc.supplier_name;
      if (!supplierMap.has(key)) supplierMap.set(key, { costs: [], variantIds: new Set() });
      const entry = supplierMap.get(key)!;
      entry.costs.push(sc);
      entry.variantIds.add(v.id);
    }
  }

  const suppliers: SupplierSummary[] = Array.from(supplierMap.entries())
    .map(([name, { costs, variantIds }]) => {
      const sorted = [...costs].sort((a, b) => b.price_list_date.localeCompare(a.price_list_date));
      const latestDate = sorted[0]?.price_list_date ?? "";
      const avgCost = costs.reduce((s, c) => s + Number(c.cost_ex_gst), 0) / costs.length;
      const daysOld = latestDate ? daysBetween(latestDate) : 999;
      return { name, variantCount: variantIds.size, latestDate, avgCost, daysOld, stale: daysOld > 60 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const thStyle: React.CSSProperties = {
    padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#6B7280",
    textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em",
    background: "#F9FAFB", borderBottom: "1px solid #E8E8F0",
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 840 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1760", marginBottom: 4 }}>Suppliers</h1>
        <p style={{ fontSize: 14, color: "#6B7280" }}>Aggregated view of all supplier costs across product variants.</p>
      </div>

      {suppliers.some(s => s.stale) && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#92400E" }}>
          Some supplier quotes are older than 60 days. Check the <Link href="/pricing-hub/audit" style={{ color: "#92400E", fontWeight: 600 }}>Audit page</Link> for details.
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Supplier</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Variants Quoted</th>
              <th style={thStyle}>Latest Quote</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Avg Cost (ex GST)</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Freshness</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>Loading…</td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#9CA3AF", fontSize: 14 }}>No supplier costs recorded yet.</td></tr>
            ) : suppliers.map((s, i) => (
              <tr key={s.name} style={{ borderBottom: i < suppliers.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                <td style={{ padding: "12px 14px", fontSize: 14, color: "#1A1760", fontWeight: 600 }}>{s.name}</td>
                <td style={{ padding: "12px 14px", fontSize: 13, color: "#374151", textAlign: "center" }}>{s.variantCount}</td>
                <td style={{ padding: "12px 14px", fontSize: 13, color: "#374151" }}>
                  {s.latestDate ? new Date(s.latestDate).toLocaleDateString("en-AU") : "—"}
                </td>
                <td style={{ padding: "12px 14px", fontSize: 13, color: "#374151", textAlign: "right" }}>
                  ${s.avgCost.toFixed(2)}
                </td>
                <td style={{ padding: "12px 14px", textAlign: "center" }}>
                  <span style={{
                    display: "inline-block", padding: "2px 10px", borderRadius: 20,
                    fontSize: 11, fontWeight: 600,
                    background: s.stale ? "#FEF2F2" : "#F0FDF4",
                    color: s.stale ? "#DC2626" : "#16A34A",
                  }}>
                    {s.stale ? `${s.daysOld}d old` : "Current"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
