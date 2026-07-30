"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

export default function RepairQuoteBuilderPage() {
  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
        <Link href="/quotes/builder" style={{ color: "#6B7280", textDecoration: "none", fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Build Quote
        </Link>
        <span style={{ color: "#D1D5DB" }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Repair Quote</h1>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "48px 32px", textAlign: "center", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔧</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1A1A2E", margin: "0 0 8px" }}>Repair Quote Builder</h2>
        <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>Coming soon</p>
      </div>
    </div>
  );
}
