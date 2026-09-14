"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";

// Dedicated 403 page for the operator area. Shown to anyone who is not a
// verified operator (unauthenticated, or a signed-in tenant user without
// is_operator). It reveals nothing about the operator area itself.
export default function VaultAdminNotAuthorizedPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f0e2a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "Inter, sans-serif",
    }}>
      <div style={{
        maxWidth: 420,
        width: "100%",
        background: "#161540",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: 32,
        textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#fff" }}>
          Not authorized
        </h1>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
          This area is restricted to Vault operators. Your account doesn&apos;t have
          operator access.
        </p>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            borderRadius: 8,
            background: "#635BFF",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Go to login
        </Link>
      </div>
    </div>
  );
}
