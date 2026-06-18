"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import Link from "next/link";

interface ProductRow {
  id: string;
  name: string;
  active: boolean;
  pricing_product_variants: { id: string }[];
}

interface GoldPrice {
  id: string;
  metal_type: string;
  price_per_gram: number;
  effective_date: string;
}

export default function PricingHubDashboard() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [goldPrices, setGoldPrices] = useState<GoldPrice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hydrated && user && user.role !== "admin") router.replace("/");
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!hydrated || !user || user.role !== "admin") return;
    Promise.all([
      fetch("/api/pricing-hub/products", { credentials: "include" }).then(r => r.json()),
      fetch("/api/pricing-hub/gold-prices", { credentials: "include" }).then(r => r.json()),
    ]).then(([p, g]) => {
      setProducts(Array.isArray(p) ? p : []);
      setGoldPrices(Array.isArray(g) ? g : []);
    }).finally(() => setLoading(false));
  }, [hydrated, user]);

  if (!hydrated || !user) return null;
  if (user.role !== "admin") return null;

  const totalVariants  = products.reduce((n, p) => n + (p.pricing_product_variants?.length ?? 0), 0);
  const activeProducts = products.filter(p => p.active).length;

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    border: "1px solid #E8E8F0",
    borderRadius: 12,
    padding: "20px 24px",
  };

  const statCards = [
    { label: "Products",         value: loading ? "—" : products.length },
    { label: "Variants",         value: loading ? "—" : totalVariants },
    { label: "Active Products",  value: loading ? "—" : activeProducts },
    { label: "Metal Types",      value: loading ? "—" : goldPrices.length },
  ];

  return (
    <div style={{ padding: "32px 40px", maxWidth: 960 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1760", marginBottom: 4 }}>Pricing Hub</h1>
        <p style={{ fontSize: 14, color: "#6B7280" }}>Admin-only pricing management for products, variants, and costs.</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        {statCards.map(c => (
          <div key={c.label} style={cardStyle}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#1A1760", lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 6 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Gold prices */}
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A1760" }}>Current Metal Prices</h2>
            <Link href="/pricing-hub/settings" style={{ fontSize: 12, color: "#635BFF", textDecoration: "none", fontWeight: 500 }}>Edit →</Link>
          </div>
          {loading ? (
            <div style={{ color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
          ) : goldPrices.length === 0 ? (
            <div style={{ color: "#9CA3AF", fontSize: 13 }}>No metal prices set.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {goldPrices.map(g => (
                  <tr key={g.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "7px 0", color: "#374151", fontWeight: 500 }}>{g.metal_type}</td>
                    <td style={{ padding: "7px 0", color: "#1A1760", fontWeight: 600, textAlign: "right" }}>
                      ${Number(g.price_per_gram).toFixed(2)}<span style={{ color: "#9CA3AF", fontWeight: 400 }}>/g</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Quick links */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A1760", marginBottom: 16 }}>Quick Links</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { href: "/pricing-hub/products",  label: "Manage Products & Variants", desc: "Add, edit, price products" },
              { href: "/pricing-hub/suppliers",  label: "Supplier Costs",             desc: "Review supplier pricing" },
              { href: "/pricing-hub/audit",      label: "Pricing Audit",              desc: "Flag pricing issues" },
              { href: "/pricing-hub/settings",   label: "Rates & Settings",           desc: "Gold prices, labour rates" },
            ].map(l => (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  display: "block", padding: "10px 14px", borderRadius: 8,
                  border: "1px solid #E8E8F0", textDecoration: "none",
                  transition: "border-color .15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#635BFF")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#E8E8F0")}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1760" }}>{l.label}</div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{l.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
