"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function BuildQuoteForkInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get("quote_id");

  function go(path: string) {
    router.push(quoteId ? `${path}?quote_id=${quoteId}` : path);
  }

  return (
    <div style={{ padding: 24, maxWidth: 680, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
        <Link href="/quotes" style={{ color: "#6B7280", textDecoration: "none", fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Quotes
        </Link>
        <span style={{ color: "#D1D5DB" }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Build Quote</h1>
      </div>

      <p style={{ fontSize: 15, color: "#6B7280", marginBottom: 28 }}>What are you quoting?</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <button
          onClick={() => go("/quotes/builder/new")}
          style={{ background: "#fff", border: "2px solid #E8E8F0", borderRadius: 14, padding: "28px 24px", textAlign: "left", cursor: "pointer", transition: "all .15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#635BFF"; e.currentTarget.style.boxShadow = "0 0 0 3px #EEF2FF"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#E8E8F0"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ fontSize: 28, marginBottom: 12 }}>💍</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A2E", marginBottom: 6 }}>New Item</div>
          <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>Custom order — ring, necklace, bracelet, earrings and more</div>
        </button>

        <button
          onClick={() => go("/quotes/builder/repair")}
          style={{ background: "#fff", border: "2px solid #E8E8F0", borderRadius: 14, padding: "28px 24px", textAlign: "left", cursor: "pointer", transition: "all .15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#635BFF"; e.currentTarget.style.boxShadow = "0 0 0 3px #EEF2FF"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#E8E8F0"; e.currentTarget.style.boxShadow = "none"; }}
        >
          <div style={{ fontSize: 28, marginBottom: 12 }}>🔧</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A2E", marginBottom: 6 }}>Repair</div>
          <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>Resize, restone, restring, claw retip and other repair jobs</div>
        </button>
      </div>
    </div>
  );
}

export default function BuildQuoteForkPage() {
  return (
    <Suspense fallback={null}>
      <BuildQuoteForkInner />
    </Suspense>
  );
}
