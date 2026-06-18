"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

interface SyncResult {
  synced?:        number;
  total_scanned?: number;
  message?:       string;
  error?:         string;
}

export default function SettingsPage() {
  const { user, hydrated } = useUser();
  const router             = useRouter();

  const [syncing, setSyncing]       = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && user && !canManage(user.role)) {
      router.replace("/orders");
    }
  }, [hydrated, user, router]);

  useEffect(() => {
    const stored = localStorage.getItem("sapphire_last_sync");
    if (stored) setLastSynced(stored);
  }, []);

  async function runSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res  = await fetch("/api/sapphire/sync", {
        credentials: "include",
        headers: { "x-tenant-id": user?.tenantId ?? "" },
      });
      const json = await res.json() as SyncResult;
      setSyncResult(json);
      if (!json.error) {
        const now = new Date().toLocaleString("en-AU");
        setLastSynced(now);
        localStorage.setItem("sapphire_last_sync", now);
      }
    } catch {
      setSyncResult({ error: "Network error — could not reach sync endpoint" });
    } finally {
      setSyncing(false);
    }
  }

  if (!hydrated || !user) return null;
  if (!canManage(user.role)) return null;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1760", marginBottom: 8 }}>Settings</h1>
      <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 32 }}>Integrations and system configuration.</p>

      <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#635BFF" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#1A1760" }}>Sapphire Export</span>
            </div>
            <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 4 }}>
              Sync melee diamond stock (≤ 0.30ct) from Sapphire Export into the local cache.
              Used for sourcing suggestions in the quote builder.
            </p>
            {lastSynced && (
              <p style={{ fontSize: 12, color: "#9CA3AF" }}>Last synced: {lastSynced}</p>
            )}
          </div>

          <button
            onClick={runSync}
            disabled={syncing}
            style={{
              flexShrink: 0,
              padding: "9px 18px",
              background: syncing ? "#E8E8F0" : "#635BFF",
              color: syncing ? "#9CA3AF" : "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: syncing ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            {syncing ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ animation: "spin 1s linear infinite" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Syncing…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync Stock
              </>
            )}
          </button>
        </div>

        {syncResult && (
          <div style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: syncResult.error ? "#FEF2F2" : "#F0FDF4",
            border: `1px solid ${syncResult.error ? "#FECACA" : "#BBF7D0"}`,
            fontSize: 13,
            color: syncResult.error ? "#DC2626" : "#16A34A",
          }}>
            {syncResult.error
              ? `Error: ${syncResult.error}`
              : syncResult.message
                ? syncResult.message
                : `Synced ${syncResult.synced?.toLocaleString()} melee stones (${syncResult.total_scanned?.toLocaleString()} total scanned)`
            }
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
