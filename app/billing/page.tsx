"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";

export const dynamic = "force-dynamic";

export default function BillingPage() {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", {
        headers: { "x-tenant-id": user?.tenantId ?? "" },
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F9FAFB",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>

        {/* Wordmark */}
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.04em", color: "#635BFF", marginBottom: 40 }}>
          ◆ Vault
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #E8E8F0",
            borderRadius: 12,
            padding: "40px 32px",
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 16 }}>⚠️</div>

          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: "0 0 10px" }}>
            Your subscription has ended
          </h1>

          <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, margin: "0 0 28px" }}>
            Your Vault subscription is no longer active. Reactivate below to continue
            managing your store.
          </p>

          <button
            onClick={openPortal}
            disabled={loading}
            style={{
              display: "block",
              width: "100%",
              background: loading ? "#9CA3AF" : "#635BFF",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "13px 24px",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              marginBottom: 20,
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          >
            {loading ? "Opening billing portal…" : "Reactivate Subscription"}
          </button>

          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>
            Need help?{" "}
            <a
              href="mailto:hello@vaultforjewellers.com.au"
              style={{ color: "#635BFF", textDecoration: "none" }}
            >
              hello@vaultforjewellers.com.au
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
