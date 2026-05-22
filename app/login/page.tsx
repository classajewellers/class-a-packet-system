"use client";

import { useState, useEffect, useCallback } from "react";
import { STAFF_LIST, StaffMember, ROLE_LABELS } from "@/lib/staffList";
import { LoggedInUser, UserRole } from "@/lib/userTypes";
import { useUser } from "@/context/UserContext";

const ROLE_SECTION_ORDER: UserRole[] = ["manager", "staff"];
const ROLE_SECTION_LABELS: Record<UserRole, string> = {
  manager: "Managers",
  staff:   "Staff",
};

// ── PIN Pad overlay ────────────────────────────────────────────────────────────
interface PinPadProps {
  member: StaffMember;
  onSuccess: (user: LoggedInUser) => void;
  onCancel: () => void;
}

function PinPad({ member, onSuccess, onCancel }: PinPadProps) {
  const [digits, setDigits]     = useState<string[]>([]);
  const [error, setError]       = useState<string | null>(null);
  const [shake, setShake]       = useState(false);
  const [locked, setLocked]     = useState(false);
  const [verifying, setVerifying] = useState(false);

  const verify = useCallback(async (pin: string) => {
    setVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: member.name, pin }),
      });
      const json = await res.json();
      if (json.success) {
        onSuccess({
          name:       json.staff.name,
          role:       json.staff.role,
          email:      json.staff.email,
          initials:   json.staff.initials,
          loggedInAt: new Date().toISOString(),
        });
      } else {
        setShake(true);
        setDigits([]);
        setError(json.error ?? "Incorrect PIN");
        if (json.locked) setLocked(true);
        setTimeout(() => setShake(false), 600);
      }
    } catch {
      setShake(true);
      setDigits([]);
      setError("Network error — please try again");
      setTimeout(() => setShake(false), 600);
    } finally {
      setVerifying(false);
    }
  }, [member.name, onSuccess]);

  useEffect(() => {
    if (digits.length === 4 && !verifying) {
      verify(digits.join(""));
    }
  }, [digits, verifying, verify]);

  function pressDigit(d: string) {
    if (locked || verifying || digits.length >= 4) return;
    setError(null);
    setDigits((prev) => [...prev, d]);
  }

  function pressBack() {
    if (locked || verifying) return;
    setError(null);
    setDigits((prev) => prev.slice(0, -1));
  }

  const PAD = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: "#FFFFFF",
        borderRadius: 24,
        boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
        padding: "32px",
        width: 360,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
      }}>
        {/* Staff identity */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "#635BFF",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 700, color: "#fff",
            margin: "0 auto 12px",
          }}>
            {member.initials}
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "#1A1A2E" }}>{member.name}</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>Enter your PIN</div>
        </div>

        {/* PIN dots */}
        <div style={{
          display: "flex", gap: 14, alignItems: "center",
          animation: shake ? "pinShake 0.5s ease" : undefined,
        }}>
          {[0,1,2,3].map((i) => (
            <div key={i} style={{
              width: 16, height: 16, borderRadius: "50%",
              border: `2px solid ${digits.length > i ? "#635BFF" : "#E8E8F0"}`,
              background: digits.length > i ? "#635BFF" : "transparent",
              boxShadow: "none",
              transition: "all 0.15s ease",
            }} />
          ))}
        </div>

        {/* Error */}
        <div style={{ minHeight: 20, fontSize: 13, color: "#EF4444", textAlign: "center" }}>
          {error ?? ""}
        </div>

        {/* Number pad */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10,
          width: "100%",
        }}>
          {PAD.map((key, i) => {
            if (key === "") return <div key={i} />;
            const isBack = key === "⌫";
            const isDisabled = locked || verifying;
            return (
              <button
                key={i}
                onClick={() => isBack ? pressBack() : pressDigit(key)}
                disabled={isDisabled}
                style={{
                  width: 56, height: 56, borderRadius: 8,
                  background: isBack ? "transparent" : "#F9FAFB",
                  border: `1px solid ${isBack ? "transparent" : "#E8E8F0"}`,
                  color: isDisabled ? "#9CA3AF" : "#1A1A2E",
                  fontSize: isBack ? 20 : 22,
                  fontWeight: 600,
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  transition: "all 0.12s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { if (!isDisabled && !isBack) (e.currentTarget as HTMLButtonElement).style.background = "#EEF2FF"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#E8E8F0"; }}
                onMouseLeave={(e) => { if (!isBack) (e.currentTarget as HTMLButtonElement).style.background = "#F9FAFB"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#E8E8F0"; }}
                onMouseDown={(e) => { if (!isDisabled) (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.94)"; }}
                onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; }}
              >
                {verifying && key === digits[digits.length - 1] ? "…" : key}
              </button>
            );
          })}
        </div>

        {/* Cancel */}
        <button
          onClick={onCancel}
          style={{
            background: "transparent", border: "none",
            color: "#6B7280", fontSize: 13, cursor: "pointer",
            padding: "4px 12px", borderRadius: 8, fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#1A1A2E"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6B7280"; }}
        >
          Cancel
        </button>
      </div>

      <style>{`
        @keyframes pinShake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
          90% { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}

// ── Staff tile ─────────────────────────────────────────────────────────────────
function StaffTileButton({ member, onClick }: { member: StaffMember; onClick: (m: StaffMember) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick(member)}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 12, padding: "16px",
        background: "#FFFFFF",
        border: "1px solid #E8E8F0",
        borderRadius: 12,
        cursor: "pointer",
        transition: "all 0.15s",
        minHeight: 150, width: "100%",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.borderColor = "#635BFF";
        el.style.boxShadow = "0 2px 8px rgba(99,91,255,0.15)";
        el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.borderColor = "#E8E8F0";
        el.style.boxShadow = "none";
        el.style.transform = "none";
      }}
      onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; }}
      onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        background: "#635BFF",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, fontWeight: 700, color: "#fff",
      }}>
        {member.initials}
      </div>
      <span style={{ fontSize: 14, fontWeight: 500, color: "#1A1A2E", textAlign: "center", lineHeight: 1.3 }}>
        {member.name}
      </span>
      <span style={{
        fontSize: 11, fontWeight: 500, padding: "2px 10px", borderRadius: 999,
        background: member.role === "manager" ? "#635BFF" : "#E5E7EB",
        color: member.role === "manager" ? "#fff" : "#374151",
      }}>
        {ROLE_LABELS[member.role]}
      </span>
    </button>
  );
}

// ── Login page ─────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const { login } = useUser();
  const [pinTarget, setPinTarget] = useState<StaffMember | null>(null);

  function handleTileClick(member: StaffMember) {
    setPinTarget(member);
  }

  function handlePinSuccess(user: LoggedInUser) {
    setPinTarget(null);
    login(user);
    // AuthGuard in ClientProviders handles navigation to "/"
  }

  return (
    <div style={{ minHeight: "100vh", background: "#1A1760", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{
        padding: "16px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "rgba(255,255,255,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: "#FFFFFF" }}>CLASS A</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: "0.1em" }}>JEWELLERS · OS</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Order System</div>
      </header>

      {/* Body */}
      <main style={{ flex: 1, maxWidth: 960, margin: "0 auto", width: "100%", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: "#FFFFFF", textAlign: "center", marginBottom: 6 }}>
          Who&apos;s serving today?
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", textAlign: "center", marginBottom: 40 }}>
          Select your name, then enter your PIN
        </p>

        {ROLE_SECTION_ORDER.map((role) => {
          const members = STAFF_LIST.filter((m) => m.role === role);
          if (members.length === 0) return null;
          return (
            <section key={role} style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <h2 style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>
                  {ROLE_SECTION_LABELS[role]}
                </h2>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                {members.map((member) => (
                  <StaffTileButton key={member.name} member={member} onClick={handleTileClick} />
                ))}
              </div>
            </section>
          );
        })}
      </main>

      {/* Footer */}
      <footer style={{ textAlign: "center", padding: "16px", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
        Class A Jewellers · 40 North East Road, Walkerville SA 5081
      </footer>

      {/* PIN overlay */}
      {pinTarget && (
        <PinPad
          member={pinTarget}
          onSuccess={handlePinSuccess}
          onCancel={() => setPinTarget(null)}
        />
      )}
    </div>
  );
}
