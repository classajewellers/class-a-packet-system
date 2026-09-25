"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { StocktakeCounts, StocktakeSession } from "@/lib/rfid-stocktake";

type LocationRow = { id: string; name: string };
type Listed = StocktakeSession & { counts: StocktakeCounts };

function when(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

function countLine(counts: StocktakeCounts): string {
  const base = `Found ${counts.found} · Missing ${counts.missing} · Somewhere else ${counts.elsewhere} · Unknown ${counts.unknown}`;
  return counts.blank ? `${base} · ${counts.blank} blank` : base;
}

export default function StocktakeHomePage() {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [counts, setCounts] = useState<Listed[]>([]);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [locRes, countRes] = await Promise.all([
        fetch("/api/inventory/locations"),
        fetch("/api/rfid/stocktake"),
      ]);
      const locJson = await locRes.json().catch(() => ({}));
      const countJson = await countRes.json().catch(() => ({}));
      if (cancelled) return;
      if (!locRes.ok) setError(locJson.error || "Could not load locations");
      else setLocations((locJson.locations ?? []).map((row: LocationRow) => ({ id: row.id, name: row.name })));
      if (!countRes.ok) setError(countJson.error || "Could not load counts");
      else setCounts(countJson.stocktakes ?? []);
    })();
    return () => { cancelled = true; };
  }, []);

  async function start(locationId: string) {
    setStarting(locationId);
    setError("");
    const res = await fetch("/api/rfid/stocktake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: locationId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.id) {
      setError(json.error || "Could not start the count");
      setStarting(null);
      return;
    }
    router.push(`/rfid/stocktake/${json.id}`);
  }

  const open = counts.filter((row) => row.status === "in_progress");
  const finished = counts.filter((row) => row.status === "finished");

  return (
    <div className="stocktake-page">
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>Stocktake</h1>
      <Link href="/rfid/stocktake/move" style={linkButton}>Scan to move</Link>
      {error && <p style={errorStyle}>{error}</p>}
      <h2 style={sectionTitle}>Start a count</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {locations.map((location) => (
          <button
            key={location.id}
            type="button"
            disabled={!!starting}
            onClick={() => { void start(location.id); }}
            style={locationButton}
          >
            {starting === location.id ? "Starting…" : location.name}
          </button>
        ))}
        {locations.length === 0 && !error && <p style={{ color: "#6B7280", margin: 0 }}>No locations yet.</p>}
      </div>
      <History title="In progress" rows={open} empty="No count in progress." />
      <History title="Finished" rows={finished} empty="No finished counts yet." />
      <style>{pageCss}</style>
    </div>
  );
}

function History({ title, rows, empty }: { title: string; rows: Listed[]; empty: string }) {
  return (
    <section style={{ marginTop: 22 }}>
      <h2 style={sectionTitle}>{title}</h2>
      {rows.length === 0 && <p style={{ color: "#6B7280", margin: 0 }}>{empty}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row) => (
          <Link key={row.id} href={`/rfid/stocktake/${row.id}`} style={cardLink}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{row.location_name || "Location"}</div>
            <div style={{ fontSize: 13, color: "#4B5563", marginTop: 4 }}>
              {when(row.started_at)}
              {row.started_by_name ? ` · ${row.started_by_name}` : ""}
              {row.status === "finished" && row.finished_by_name ? ` · Finished by ${row.finished_by_name}` : ""}
            </div>
            <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>{countLine(row.counts)}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

const sectionTitle: CSSProperties = { fontSize: 16, fontWeight: 700, color: "#111827", margin: "18px 0 8px" };
const errorStyle: CSSProperties = { background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "12px 14px", fontSize: 15 };
const locationButton: CSSProperties = {
  minHeight: 52,
  textAlign: "left",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #D1D5DB",
  background: "#fff",
  fontSize: 18,
  fontWeight: 700,
  color: "#111827",
  cursor: "pointer",
};
const linkButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 48,
  padding: "0 16px",
  borderRadius: 10,
  background: "#111827",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 700,
  fontSize: 16,
};
const cardLink: CSSProperties = {
  display: "block",
  textDecoration: "none",
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: "12px 14px",
  minHeight: 72,
};
const pageCss = `.stocktake-page { max-width: 720px; margin: 0 auto; overflow-x: hidden; }`;
