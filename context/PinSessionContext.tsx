"use client";

// context/PinSessionContext.tsx
// A lightweight PIN "session" for gating counter actions (create lead, convert,
// mark contacted) WITHOUT re-typing a PIN for every click. No such mechanism
// existed in the app, so this is intentionally minimal:
//
//   • ensurePin() resolves with { name, pin } — from cache if a session is
//     active, otherwise it opens the modal, verifies via the existing
//     /api/auth/verify-pin endpoint (rate-limited server-side), caches, resolves.
//   • 10-minute IDLE timeout: any ensurePin() call resets the timer; after 10
//     minutes of inactivity the cached credentials are cleared and the next
//     action re-prompts.
//   • Credentials live in memory only (never localStorage/disk) and are re-sent
//     to the leads endpoints, which RE-VERIFY the PIN server-side — so the gate
//     is genuinely enforced, not just a client-side veneer.

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { STAFF_LIST } from "@/lib/staffList";

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export interface PinCredentials {
  name: string;
  pin: string;
}

interface ActiveStaff {
  name: string;
  role: string;
  initials: string;
}

interface PinSessionValue {
  activeStaff: ActiveStaff | null;
  /** Resolve with credentials to attach to a gated request, or null if cancelled. */
  ensurePin: () => Promise<PinCredentials | null>;
  clearPin: () => void;
}

const PinSessionContext = createContext<PinSessionValue | null>(null);

export function usePinSession(): PinSessionValue {
  const ctx = useContext(PinSessionContext);
  if (!ctx) throw new Error("usePinSession must be used within a PinSessionProvider");
  return ctx;
}

export function PinSessionProvider({ children }: { children: React.ReactNode }) {
  const [activeStaff, setActiveStaff] = useState<ActiveStaff | null>(null);
  const credsRef = useRef<PinCredentials | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const resolverRef = useRef<((creds: PinCredentials | null) => void) | null>(null);

  const clearPin = useCallback(() => {
    credsRef.current = null;
    setActiveStaff(null);
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => clearPin(), IDLE_TIMEOUT_MS);
  }, [clearPin]);

  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

  const ensurePin = useCallback((): Promise<PinCredentials | null> => {
    // Active session → reuse cached creds and extend the idle window.
    if (credsRef.current) {
      resetIdle();
      return Promise.resolve(credsRef.current);
    }
    // Otherwise open the modal and wait for the outcome.
    setName("");
    setPin("");
    setError(null);
    setModalOpen(true);
    return new Promise<PinCredentials | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, [resetIdle]);

  const finish = useCallback((creds: PinCredentials | null) => {
    setModalOpen(false);
    resolverRef.current?.(creds);
    resolverRef.current = null;
  }, []);

  async function submit() {
    if (!name || !pin) { setError("Select your name and enter your PIN"); return; }
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pin }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error ?? "Incorrect PIN");
        setPin("");
        return;
      }
      const creds = { name, pin };
      credsRef.current = creds;
      setActiveStaff({ name: json.staff.name, role: json.staff.role, initials: json.staff.initials });
      resetIdle();
      finish(creds);
    } catch {
      setError("Could not verify PIN. Check your connection and try again.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <PinSessionContext.Provider value={{ activeStaff, ensurePin, clearPin }}>
      {children}

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,15,40,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
          onClick={() => !verifying && finish(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 360,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A1760" }}>Staff PIN</h2>
            <p style={{ margin: "6px 0 16px", fontSize: 13, color: "#6B7280" }}>
              Confirm who you are to record this action.
            </p>

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
              Name
            </label>
            <select
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={verifying}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #D1D5DB",
                fontSize: 14, marginBottom: 12, background: "#fff",
              }}
            >
              <option value="">Select your name…</option>
              {STAFF_LIST.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </select>

            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
              PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !verifying) submit(); }}
              disabled={verifying}
              placeholder="••••"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #D1D5DB",
                fontSize: 16, letterSpacing: "0.3em", marginBottom: error ? 8 : 16,
              }}
            />

            {error && (
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "#DC2626", fontWeight: 500 }}>{error}</p>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => finish(null)}
                disabled={verifying}
                style={{
                  flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #D1D5DB",
                  background: "#fff", color: "#374151", fontWeight: 500, fontSize: 14, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={verifying}
                style={{
                  flex: 1, padding: "10px 12px", borderRadius: 8, border: "none",
                  background: "#635BFF", color: "#fff", fontWeight: 600, fontSize: 14,
                  cursor: verifying ? "default" : "pointer", opacity: verifying ? 0.7 : 1,
                }}
              >
                {verifying ? "Checking…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PinSessionContext.Provider>
  );
}
