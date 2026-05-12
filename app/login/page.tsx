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
        background: "rgba(5,5,10,0.75)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: "var(--bg-sidebar)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        boxShadow: "var(--shadow-lg)",
        padding: "32px 28px 28px",
        width: 320,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
      }}>
        {/* Staff identity */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: "linear-gradient(135deg, #7C6AFE, #4D3CE0)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 700, color: "#fff",
            margin: "0 auto 12px",
            boxShadow: "0 0 20px rgba(124,106,254,0.4)",
          }}>
            {member.initials}
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text)" }}>{member.name}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Enter your PIN</div>
        </div>

        {/* PIN dots */}
        <div style={{
          display: "flex", gap: 14, alignItems: "center",
          animation: shake ? "pinShake 0.5s ease" : undefined,
        }}>
          {[0,1,2,3].map((i) => (
            <div key={i} style={{
              width: 16, height: 16, borderRadius: "50%",
              border: `2px solid ${digits.length > i ? "var(--violet)" : "var(--border-strong)"}`,
              background: digits.length > i ? "var(--violet)" : "transparent",
              boxShadow: digits.length > i ? "0 0 10px var(--violet-glow)" : "none",
              transition: "all 0.15s ease",
            }} />
          ))}
        </div>

        {/* Error */}
        <div style={{ minHeight: 20, fontSize: 13, color: "var(--danger)", textAlign: "center" }}>
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
                  height: 60, borderRadius: 12,
                  background: isBack ? "transparent" : "var(--bg-elevated)",
                  border: `1px solid ${isBack ? "transparent" : "var(--border-subtle)"}`,
                  color: isDisabled ? "var(--text-dim)" : "var(--text)",
                  fontSize: isBack ? 20 : 22,
                  fontWeight: 600,
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  transition: "all 0.12s",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { if (!isDisabled && !isBack) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-card-alt)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
                onMouseLeave={(e) => { if (!isBack) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-elevated)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-subtle)"; }}
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
            color: "var(--text-muted)", fontSize: 13, cursor: "pointer",
            padding: "4px 12px", borderRadius: 8, fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
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
        gap: 12, padding: "20px 12px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 16,
        cursor: "pointer",
        transition: "all 0.15s",
        minHeight: 150, width: "100%",
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.borderColor = "var(--violet)";
        el.style.boxShadow = "0 0 0 1px rgba(124,106,254,0.3), 0 4px 14px rgba(0,0,0,0.3)";
        el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement;
        el.style.borderColor = "var(--border-subtle)";
        el.style.boxShadow = "none";
        el.style.transform = "none";
      }}
      onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(0.97)"; }}
      onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: "linear-gradient(135deg, #7C6AFE, #4D3CE0)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, fontWeight: 700, color: "#fff",
        boxShadow: "0 0 16px rgba(124,106,254,0.3)",
      }}>
        {member.initials}
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", textAlign: "center", lineHeight: 1.3 }}>
        {member.name}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
        padding: "3px 10px", borderRadius: 99,
        background: member.role === "manager" ? "rgba(124,106,254,0.15)" : "rgba(255,255,255,0.05)",
        color: member.role === "manager" ? "#C9C0FF" : "var(--text-muted)",
        border: `1px solid ${member.role === "manager" ? "rgba(124,106,254,0.3)" : "var(--border-subtle)"}`,
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
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={{
        background: "var(--bg-sidebar)",
        borderBottom: "1px solid var(--border-subtle)",
        padding: "16px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #20202C, #15151D)",
            border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: "var(--text)" }}>CLASS A</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em" }}>JEWELLERS · OS</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Order System</div>
      </header>

      {/* Body */}
      <main style={{ flex: 1, maxWidth: 960, margin: "0 auto", width: "100%", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, color: "var(--text)", textAlign: "center", marginBottom: 6, letterSpacing: "-0.015em" }}>
          Who&apos;s serving today?
        </h1>
        <p style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center", marginBottom: 40 }}>
          Select your name, then enter your PIN
        </p>

        {ROLE_SECTION_ORDER.map((role) => {
          const members = STAFF_LIST.filter((m) => m.role === role);
          if (members.length === 0) return null;
          return (
            <section key={role} style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <h2 style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.12em", margin: 0 }}>
                  {ROLE_SECTION_LABELS[role]}
                </h2>
                <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
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
      <footer style={{ textAlign: "center", padding: "16px", fontSize: 12, color: "var(--text-dim)" }}>
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
