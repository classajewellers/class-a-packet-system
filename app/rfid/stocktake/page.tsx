"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";

type ZoneRow = {
  id: string;
  name: string;
  lastCountedAt: string | null;
  open: boolean;
};

function countedOn(iso: string | null): string {
  if (!iso) return "Never counted";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never counted";
  const label = date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return `Last counted ${label}`;
}

export default function StocktakeHomePage() {
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/rfid/stocktake/board")
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setError(json.error || "Could not load zones");
        else {
          setZones(json.zones ?? []);
          setError(typeof json.warning === "string" ? json.warning : "");
        }
      })
      .catch(() => { if (!cancelled) setError("Could not load zones"); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="stocktake-page">
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 10px" }}>Stocktake</h1>
      {error && <p style={errorStyle}>{error}</p>}
      {!error && zones.length === 0 && <p style={{ color: "#6B7280", margin: 0 }}>No zones yet.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {zones.map((zone) => (
          <Link key={zone.id} href={`/rfid/stocktake/zone/${zone.id}`} style={rowStyle}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 18, fontWeight: 700, color: "#111827" }}>{zone.name}</span>
              <span style={{ display: "block", fontSize: 14, color: "#4B5563", marginTop: 2 }}>{countedOn(zone.lastCountedAt)}</span>
            </span>
            {zone.open && <span style={badge}>Continue</span>}
          </Link>
        ))}
      </div>
      <style>{pageCss}</style>
    </div>
  );
}

const pageCss = `.stocktake-page { max-width: 720px; margin: 0 auto; overflow-x: hidden; padding-bottom: 128px; }`;

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  minHeight: 56,
  padding: "12px 14px",
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  textDecoration: "none",
  color: "#111827",
};

const badge: CSSProperties = {
  flex: "0 0 auto",
  background: "#111827",
  color: "#fff",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 13,
  fontWeight: 700,
};

const errorStyle: CSSProperties = {
  background: "#FEF2F2",
  color: "#991B1B",
  borderRadius: 10,
  padding: "12px 14px",
  margin: "0 0 10px",
};
