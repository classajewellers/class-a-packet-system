"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VaultAdminLoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDigit = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === 4) submit(next);
  };

  const handleBackspace = () => setPin((p) => p.slice(0, -1));

  const submit = (value: string) => {
    setLoading(true);
    if (value === "2204") {
      document.cookie = "vault_operator_auth=1; max-age=" + 86400 * 7 + "; path=/vault-admin; SameSite=Lax";
      router.push("/vault-admin");
    } else {
      setTimeout(() => {
        setError("Incorrect PIN");
        setPin("");
        setLoading(false);
      }, 400);
    }
  };

  const digits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f0e2a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "Inter, sans-serif",
    }}>
      <div style={{
        background: "#1A1760",
        borderRadius: 20,
        padding: "40px 36px",
        width: 320,
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        textAlign: "center",
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
            vault
          </span>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#635BFF",
            background: "rgba(99,91,255,0.15)",
            borderRadius: 4,
            padding: "2px 6px",
            marginLeft: 8,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}>
            operator
          </span>
        </div>
        <p style={{ color: "#a5b4fc", fontSize: 13, marginBottom: 32 }}>
          Enter your operator PIN
        </p>

        {/* PIN dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 32 }}>
          {[0,1,2,3].map((i) => (
            <div key={i} style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: pin.length > i ? "#635BFF" : "rgba(255,255,255,0.2)",
              transition: "background 0.15s",
            }} />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "rgba(239,68,68,0.15)",
            color: "#fca5a5",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 13,
            marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        {/* Keypad */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {digits.map((d, i) => {
            if (d === "") return <div key={i} />;
            const isBack = d === "⌫";
            return (
              <button
                key={i}
                onClick={() => isBack ? handleBackspace() : handleDigit(d)}
                disabled={loading}
                style={{
                  height: 56,
                  borderRadius: 10,
                  border: "none",
                  background: isBack ? "transparent" : "rgba(255,255,255,0.08)",
                  color: "#fff",
                  fontSize: isBack ? 20 : 22,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (!isBack) (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,91,255,0.3)";
                }}
                onMouseLeave={(e) => {
                  if (!isBack) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
