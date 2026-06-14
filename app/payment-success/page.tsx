"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { BLACK_LOGO_DATA_URI } from "@/lib/logoDataURIs";

function PaymentSuccessContent() {
  const searchParams = useSearchParams();
  const quoteId = searchParams.get("quote_id");

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F9FAFB",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 16px",
      fontFamily: "Arial, Helvetica, sans-serif",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: 16,
        padding: "48px 40px",
        maxWidth: 520,
        width: "100%",
        textAlign: "center",
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
      }}>
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={BLACK_LOGO_DATA_URI}
          alt="Class A Jewellers"
          style={{ maxHeight: 48, width: "auto", marginBottom: 32, display: "inline-block" }}
        />

        {/* Checkmark */}
        <div style={{
          width: 64,
          height: 64,
          background: "#D1FAE5",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", marginBottom: 12 }}>
          Payment received — thank you!
        </h1>

        {quoteId && (
          <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20, fontFamily: "monospace" }}>
            Reference: {quoteId}
          </p>
        )}

        <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, marginBottom: 32 }}>
          Your deposit has been received. A member of our team will be in touch
          shortly to confirm your order and discuss next steps.
        </p>

        <div style={{
          borderTop: "1px solid #E5E7EB",
          paddingTop: 24,
          fontSize: 13,
          color: "#6B7280",
          lineHeight: 1.7,
        }}>
          <strong style={{ color: "#111827" }}>Class A Jewellers</strong><br />
          40 North East Road, Walkerville SA 5081<br />
          08 8344 7722 &nbsp;·&nbsp; classa.com.au
        </div>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif", color: "#6B7280" }}>
        Loading…
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}
