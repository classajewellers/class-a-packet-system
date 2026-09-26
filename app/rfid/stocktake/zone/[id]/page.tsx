"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

type OpenLocation = { sessionId: string; label: string };
type Detail = {
  id: string;
  name: string;
  expected: number;
  notTagged: number;
  lastCountedAt: string | null;
  openZoneId: string | null;
  openLocations: OpenLocation[];
};

function countedOn(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `Last counted ${date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;
}

export default function ZoneDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/rfid/stocktake/zone/${id}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setError(json.error || "Could not open this zone");
        else setDetail(json);
      })
      .catch(() => { if (!cancelled) setError("Could not open this zone"); });
    return () => { cancelled = true; };
  }, [id]);

  async function start(fresh: boolean) {
    setStarting(true);
    setError("");
    const res = await fetch("/api/rfid/stocktake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zone_id: id, fresh }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.id) {
      setError(json.error || (fresh ? "Could not start a fresh count" : "Could not start the count"));
      setStarting(false);
      return;
    }
    router.push(`/rfid/stocktake/${json.id}`);
  }

  const when = countedOn(detail?.lastCountedAt ?? null);
  const continueId = detail?.openZoneId || detail?.openLocations[0]?.sessionId || "";
  const hasOpen = !!continueId;
  const extraLocations = (detail?.openLocations ?? []).filter((row) => row.sessionId !== continueId);

  return (
    <div className="stocktake-page">
      <Link href="/rfid/stocktake" style={{ color: "#111827", fontWeight: 700, fontSize: 15 }}>Zones</Link>
      {!detail && !error && <p style={{ color: "#6B7280" }}>Loading…</p>}
      {detail && (
        <>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#111827", margin: "8px 0 4px" }}>{detail.name}</h1>
          {when && <p style={{ margin: "0 0 12px", color: "#4B5563" }}>{when}</p>}
          <p style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#111827" }}>{detail.expected} pieces expected</p>
          <p style={{ margin: "0 0 16px", fontSize: 16, color: "#374151" }}>{detail.notTagged} not tagged</p>
          {hasOpen ? (
            <Link href={`/rfid/stocktake/${continueId}`} style={primaryLink}>Continue</Link>
          ) : (
            <button type="button" disabled={starting} onClick={() => { void start(false); }} style={primaryButton}>
              {starting ? "Starting…" : "Start"}
            </button>
          )}
          {hasOpen && (
            <button type="button" disabled={starting} onClick={() => { setError(""); setConfirming(true); }} style={secondaryButton}>
              Start fresh
            </button>
          )}
          {confirming && (
            <div role="group" aria-label="Start fresh" style={confirmBox}>
              <p style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 700, color: "#111827" }}>
                Cancel the open count and start again?
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" disabled={starting} onClick={() => { void start(true); }} style={confirmButton}>
                  {starting ? "Starting…" : "Confirm"}
                </button>
                <button type="button" disabled={starting} onClick={() => setConfirming(false)} style={keepButton}>
                  Keep it
                </button>
              </div>
            </div>
          )}
          {extraLocations.map((row) => (
            <Link key={row.sessionId} href={`/rfid/stocktake/${row.sessionId}`} style={secondaryLink}>
              Continue {row.label}
            </Link>
          ))}
        </>
      )}
      {error && <p style={errorStyle}>{error}</p>}
      <style>{`.stocktake-page { max-width: 720px; margin: 0 auto; overflow-x: hidden; padding-bottom: 128px; }`}</style>
    </div>
  );
}

const primaryButton: CSSProperties = {
  width: "100%",
  minHeight: 56,
  borderRadius: 12,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontSize: 18,
  fontWeight: 700,
  cursor: "pointer",
};

const primaryLink: CSSProperties = {
  ...primaryButton,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  boxSizing: "border-box",
};

const secondaryButton: CSSProperties = {
  ...primaryButton,
  marginTop: 8,
  background: "#fff",
  color: "#111827",
  border: "1px solid #111827",
};

const confirmBox: CSSProperties = {
  marginTop: 12,
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: 14,
};

const confirmButton: CSSProperties = {
  ...primaryButton,
  flex: 1,
  minHeight: 52,
  fontSize: 16,
};

const keepButton: CSSProperties = {
  ...secondaryButton,
  flex: 1,
  marginTop: 0,
  minHeight: 52,
  fontSize: 16,
};

const secondaryLink: CSSProperties = {
  ...primaryLink,
  marginTop: 8,
  background: "#fff",
  color: "#111827",
  border: "1px solid #111827",
};

const errorStyle: CSSProperties = {
  background: "#FEF2F2",
  color: "#991B1B",
  borderRadius: 10,
  padding: "12px 14px",
  marginTop: 12,
};
