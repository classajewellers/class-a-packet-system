"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatLocationLabel, locationsForPicker, type LocationFields } from "@/lib/location-label";
import { formatStocktakeCounts, type StocktakeCounts, type StocktakeSession } from "@/lib/rfid-stocktake";

type LocationRow = LocationFields & { id: string; name: string };
type Listed = StocktakeSession & { counts: StocktakeCounts };

function when(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

function clock(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s*am$/i, " AM")
    .replace(/\s*pm$/i, " PM");
}

export default function StocktakeHomePage() {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [counts, setCounts] = useState<Listed[]>([]);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/inventory/locations")
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setError(json.error || "Could not load locations");
        else setLocations(locationsForPicker((json.locations ?? []) as LocationRow[]));
      })
      .catch(() => { if (!cancelled) setError("Could not load locations"); });
    void fetch("/api/rfid/stocktake")
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setError(json.error || "Could not load counts");
        else setCounts(json.stocktakes ?? []);
      })
      .catch(() => { if (!cancelled) setError("Could not load counts"); });
    return () => { cancelled = true; };
  }, []);

  const open = counts.filter((row) => row.status === "in_progress");
  const finished = counts.filter((row) => row.status === "completed");
  const cancelled = counts.filter((row) => row.status === "cancelled");
  const openByLocation = useMemo(() => {
    const map = new Map<string, Listed>();
    for (const row of open) map.set(row.location_id, row);
    return map;
  }, [open]);
  const selected = locations.find((row) => row.id === selectedId) ?? null;
  const selectedOpen = selected ? openByLocation.get(selected.id) ?? null : null;

  async function start(locationId: string, fresh: boolean) {
    setStarting(true);
    setError("");
    const res = await fetch("/api/rfid/stocktake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: locationId, fresh }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.id) {
      setError(json.error || "Could not start the count");
      setStarting(false);
      return;
    }
    router.push(`/rfid/stocktake/${json.id}`);
  }

  return (
    <div className="stocktake-page">
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>Stocktake</h1>
      <Link href="/rfid/stocktake/move" style={linkButton}>Stock Movement</Link>
      {error && <p style={errorStyle}>{error}</p>}

      <section style={{ marginTop: 18 }}>
        <h2 style={sectionTitle}>Open counts</h2>
        {open.length === 0 && <p style={{ color: "#6B7280", margin: 0 }}>No count in progress.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {open.map((row) => (
            <div key={row.id} style={cardLink}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{row.location_name || "Location"}</div>
              <div style={{ fontSize: 13, color: "#4B5563", marginTop: 4 }}>
                Continue count started {clock(row.started_at)}
              </div>
              <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>{formatStocktakeCounts(row.counts)}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                <Link href={`/rfid/stocktake/${row.id}`} style={{ ...linkButton, justifyContent: "center" }}>Continue</Link>
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => { void start(row.location_id, true); }}
                  style={secondaryButton}
                >
                  {starting ? "Starting…" : "Start fresh"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <h2 style={sectionTitle}>Start a count</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {locations.map((location) => {
          const picked = location.id === selectedId;
          return (
            <button
              key={location.id}
              type="button"
              aria-pressed={picked}
              onClick={() => setSelectedId(location.id)}
              style={{ ...locationButton, borderColor: picked ? "#111827" : "#D1D5DB", background: picked ? "#F3F4F6" : "#fff" }}
            >
              {formatLocationLabel(location)}
            </button>
          );
        })}
        {locations.length === 0 && !error && <p style={{ color: "#6B7280", margin: 0 }}>No locations yet.</p>}
      </div>
      {selected && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {selectedOpen ? (
            <>
              <Link href={`/rfid/stocktake/${selectedOpen.id}`} style={{ ...linkButton, justifyContent: "center" }}>
                Continue count started {clock(selectedOpen.started_at)}
              </Link>
              <button
                type="button"
                disabled={starting}
                onClick={() => { void start(selected.id, true); }}
                style={secondaryButton}
              >
                {starting ? "Starting…" : "Start fresh"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={starting}
              onClick={() => { void start(selected.id, false); }}
              style={primaryButton}
            >
              {starting ? "Starting…" : "Start"}
            </button>
          )}
        </div>
      )}

      <History title="Finished" rows={finished} empty="No finished counts yet." />
      {cancelled.length > 0 && <History title="Cancelled" rows={cancelled} empty="" />}
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
              {row.status === "completed" && row.finished_by_name ? ` · Finished by ${row.finished_by_name}` : ""}
              {row.status === "cancelled" ? " · Cancelled" : ""}
            </div>
            <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>{formatStocktakeCounts(row.counts)}</div>
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
  width: "100%",
};
const primaryButton: CSSProperties = {
  minHeight: 52,
  width: "100%",
  border: "none",
  borderRadius: 10,
  background: "#111827",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};
const secondaryButton: CSSProperties = {
  minHeight: 52,
  width: "100%",
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  background: "#fff",
  color: "#111827",
  fontSize: 16,
  fontWeight: 700,
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
