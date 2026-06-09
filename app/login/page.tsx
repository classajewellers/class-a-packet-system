"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

const STAFF_NAMES = [
  "Aisha Scott",
  "Arissa Michos",
  "Benjamin Mucklow",
  "Bradley Mucklow",
  "Bridget Moore",
  "Charlotte Beavis",
  "Daniel Beecken",
  "David Johnson",
  "Dior Munro",
  "Donna Cordes",
  "Ivy Wood",
  "Jack Mullan",
  "Jessica D'Alfonso",
  "Joseph Onorato",
  "Joshua Mucklow",
  "Keeley Mucklow",
  "Leah Newton",
  "Melody Abram",
  "Monica Maghsoodi",
  "Paull Scudds",
  "Sam Mucklow",
  "Shahrzad Givi",
  "Sinziana Peters",
  "Vivian Valladares",
  "Zac Mucklow",
];

export default function LoginPage() {
  const router = useRouter();
  const { loginWithPin } = useUser();

  // ── Screen state ────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<"store" | "pin">("store");

  // ── Store selector state ────────────────────────────────────────────────────
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  // ── PIN screen state ────────────────────────────────────────────────────────
  const [staffName, setStaffName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);

  // ── Fetch tenants on mount ──────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/tenants")
      .then((r) => r.json())
      .then((d) => {
        setTenants(d.tenants ?? []);
        setTenantsLoading(false);
      })
      .catch(() => setTenantsLoading(false));
  }, []);

  // ── PIN pad digit press ─────────────────────────────────────────────────────
  function pressDigit(d: string) {
    if (locked) return;
    if (pin.length < 4) setPin((p) => p + d);
  }

  function pressBackspace() {
    setPin((p) => p.slice(0, -1));
    setError(null);
  }

  function pressClear() {
    setPin("");
    setError(null);
  }

  // ── Submit PIN ──────────────────────────────────────────────────────────────
  async function handlePinSubmit() {
    if (!staffName) { setError("Please select your name."); return; }
    if (pin.length < 4) { setError("Enter your 4-digit PIN."); return; }
    if (!selectedTenant) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: staffName, pin }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setLocked(!!data.locked);
        setError(data.error ?? "Incorrect PIN.");
        setPin("");
        setLoading(false);
        return;
      }

      // Success — store session
      loginWithPin({
        name: data.staff.name,
        role: data.staff.role,
        email: data.staff.email,
        initials: data.staff.initials,
        tenantId: selectedTenant.id,
        tenantSlug: selectedTenant.slug,
      });

      router.push("/orders");
    } catch {
      setError("Something went wrong. Please try again.");
      setPin("");
      setLoading(false);
    }
  }

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.length === 4 && staffName && !loading) {
      handlePinSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  // ── Shared layout wrapper ───────────────────────────────────────────────────
  const wrap = (children: React.ReactNode) => (
    <div
      style={{
        minHeight: "100vh",
        background: "#1A1760",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "#635BFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12l4 6-10 12L2 9z" />
          <path d="M2 9h20" />
          <path d="M6 3l4 6m4 0l4-6" />
        </svg>
      </div>

      <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.12em", color: "#FFFFFF", marginBottom: 4 }}>
        VAULT
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 32, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
        Jewellery Management
      </div>

      {/* Card */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 20,
          boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
          padding: "32px 28px",
          width: "100%",
          maxWidth: 400,
        }}
      >
        {children}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>
        Can&apos;t sign in? Contact your manager.
      </p>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  // SCREEN 1 — Store selector
  // ══════════════════════════════════════════════════════════════════════════════
  if (screen === "store") {
    return wrap(
      <>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A2E", marginBottom: 6, textAlign: "center" }}>
          Select your store
        </h1>
        <p style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 24 }}>
          Choose which store you&apos;re signing into
        </p>

        {tenantsLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2].map((i) => (
              <div key={i} style={{ height: 64, borderRadius: 12, background: "#F3F4F6", animation: "pulse 1.5s infinite" }} />
            ))}
          </div>
        ) : tenants.length === 0 ? (
          <div style={{ textAlign: "center", color: "#9CA3AF", fontSize: 14, padding: "24px 0" }}>
            No stores available.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {tenants.map((t) => (
              <button
                key={t.id}
                onClick={() => { setSelectedTenant(t); setScreen("pin"); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 18px",
                  borderRadius: 12,
                  border: "1.5px solid #E5E7EB",
                  background: "#FFFFFF",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.15s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#635BFF";
                  (e.currentTarget as HTMLButtonElement).style.background = "#F5F4FF";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#E5E7EB";
                  (e.currentTarget as HTMLButtonElement).style.background = "#FFFFFF";
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#1A1A2E" }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{t.slug}</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — PIN entry
  // ══════════════════════════════════════════════════════════════════════════════
  return wrap(
    <>
      {/* Store name + back link */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => { setScreen("store"); setSelectedTenant(null); setPin(""); setError(null); setStaffName(""); }}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "#635BFF", fontSize: 13, fontWeight: 500, padding: 0, fontFamily: "inherit" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Change store
        </button>
        <span style={{ color: "#E5E7EB" }}>|</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1A1A2E" }}>{selectedTenant?.name}</span>
      </div>

      <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A2E", marginBottom: 20, textAlign: "center" }}>
        Sign in
      </h1>

      {/* Staff name selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#374151", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 6 }}>
          Your Name
        </label>
        <select
          value={staffName}
          onChange={(e) => { setStaffName(e.target.value); setError(null); setPin(""); }}
          disabled={loading || locked}
          style={{
            width: "100%",
            padding: "10px 14px",
            borderRadius: 8,
            border: "1.5px solid #E5E7EB",
            fontSize: 14,
            color: staffName ? "#1A1A2E" : "#9CA3AF",
            background: "#FFFFFF",
            fontFamily: "inherit",
            outline: "none",
            cursor: loading || locked ? "not-allowed" : "pointer",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#635BFF")}
          onBlur={(e) => (e.target.style.borderColor = "#E5E7EB")}
        >
          <option value="">— Select your name —</option>
          {STAFF_NAMES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {/* PIN display */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#374151", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 10 }}>
          PIN
        </label>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: 52,
                height: 52,
                borderRadius: 10,
                border: `2px solid ${pin.length > i ? "#635BFF" : "#E5E7EB"}`,
                background: pin.length > i ? "#EEF2FF" : "#F9FAFB",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
              }}
            >
              {pin.length > i && (
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#635BFF" }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, fontSize: 13, color: "#DC2626", marginBottom: 16, textAlign: "center" }}>
          {error}
        </div>
      )}

      {/* PIN pad */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {["1","2","3","4","5","6","7","8","9"].map((d) => (
          <PadButton key={d} label={d} onClick={() => pressDigit(d)} disabled={loading || locked || pin.length >= 4} />
        ))}
        <PadButton label="⌫" onClick={pressClear} disabled={loading || locked} variant="ghost" />
        <PadButton label="0" onClick={() => pressDigit("0")} disabled={loading || locked || pin.length >= 4} />
        <PadButton label="⌦" onClick={pressBackspace} disabled={loading || locked} variant="ghost" />
      </div>

      {loading && (
        <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "#6B7280" }}>
          Verifying…
        </div>
      )}
    </>
  );
}

function PadButton({
  label,
  onClick,
  disabled,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "ghost";
}) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 52,
        borderRadius: 10,
        border: variant === "ghost" ? "1.5px solid #E5E7EB" : "1.5px solid #E5E7EB",
        background: disabled ? "#F9FAFB" : hover ? (variant === "ghost" ? "#F3F4F6" : "#EEF2FF") : "#FFFFFF",
        color: disabled ? "#D1D5DB" : variant === "ghost" ? "#6B7280" : "#1A1A2E",
        fontSize: 18,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.12s",
        fontFamily: "inherit",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {label}
    </button>
  );
}
