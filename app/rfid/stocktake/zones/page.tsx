"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";

type Zone = { id: string; label: string; locations: { id: string; label: string }[] };
type Pair = { zoneAId: string; zoneBId: string; label: string };
type Admin = { zones: Zone[]; unassigned: { id: string; label: string }[]; neighbours: Pair[] };

export default function StocktakeZonesPage() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoneA, setZoneA] = useState("");
  const [zoneB, setZoneB] = useState("");

  async function load() {
    const res = await fetch("/api/rfid/stocktake/zones");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not load zones");
      return;
    }
    setAdmin(json.admin as Admin);
  }

  useEffect(() => { void load(); }, []);

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/rfid/stocktake/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not save");
      return;
    }
    setAdmin(json.admin as Admin);
  }

  return (
    <div className="stocktake-page">
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>Stocktake zones</h1>
      <Link href="/rfid/stocktake" style={textLink}>Back to stocktake</Link>
      {error && <p style={errorStyle}>{error}</p>}
      {!admin && !error && <p style={{ color: "#6B7280" }}>Loading zones…</p>}
      {admin && (
        <>
          <h2 style={sectionTitle}>Locations</h2>
          {admin.zones.map((zone) => (
            <section key={zone.id} style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>{zone.label}</h3>
              {zone.locations.length === 0 && <p style={meta}>No locations in this zone.</p>}
              {zone.locations.map((location) => (
                <div key={location.id} style={rowStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{location.label}</div>
                  <select
                    aria-label={`Zone for ${location.label}`}
                    value={zone.id}
                    disabled={busy}
                    onChange={(event) => { void save({ action: "assign", location_id: location.id, zone_id: event.target.value || null }); }}
                    style={selectStyle}
                  >
                    <option value="">No zone</option>
                    {admin.zones.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </section>
          ))}
          {admin.unassigned.length > 0 && (
            <section style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 16, margin: "0 0 8px" }}>No zone</h3>
              {admin.unassigned.map((location) => (
                <div key={location.id} style={rowStyle}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{location.label}</div>
                  <select
                    aria-label={`Zone for ${location.label}`}
                    value=""
                    disabled={busy}
                    onChange={(event) => { void save({ action: "assign", location_id: location.id, zone_id: event.target.value || null }); }}
                    style={selectStyle}
                  >
                    <option value="">No zone</option>
                    {admin.zones.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </section>
          )}

          <h2 style={sectionTitle}>Neighbour zones</h2>
          {admin.neighbours.length === 0 && <p style={meta}>No neighbour pairs.</p>}
          {admin.neighbours.map((pair) => (
            <div key={`${pair.zoneAId}-${pair.zoneBId}`} style={rowStyle}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{pair.label}</div>
              <button
                type="button"
                disabled={busy}
                onClick={() => { void save({ action: "remove_neighbour", zone_a_id: pair.zoneAId, zone_b_id: pair.zoneBId }); }}
                style={secondaryButton}
              >
                Remove pair
              </button>
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <select aria-label="First zone" value={zoneA} onChange={(event) => setZoneA(event.target.value)} style={selectStyle}>
              <option value="">First zone</option>
              {admin.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
            </select>
            <select aria-label="Second zone" value={zoneB} onChange={(event) => setZoneB(event.target.value)} style={selectStyle}>
              <option value="">Second zone</option>
              {admin.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
            </select>
            <button
              type="button"
              disabled={busy || !zoneA || !zoneB}
              onClick={() => { void save({ action: "add_neighbour", zone_a_id: zoneA, zone_b_id: zoneB }); }}
              style={primaryButton}
            >
              Add neighbour pair
            </button>
          </div>
        </>
      )}
      <style>{`.stocktake-page { max-width: 720px; margin: 0 auto; overflow-x: hidden; }`}</style>
    </div>
  );
}

const sectionTitle: CSSProperties = { fontSize: 16, fontWeight: 700, margin: "18px 0 8px" };
const meta: CSSProperties = { color: "#6B7280", margin: 0 };
const errorStyle: CSSProperties = { background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "12px 14px" };
const textLink: CSSProperties = { color: "#111827", fontWeight: 700 };
const rowStyle: CSSProperties = { background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 12, marginTop: 8 };
const selectStyle: CSSProperties = { width: "100%", minHeight: 48, fontSize: 16, borderRadius: 10, border: "1px solid #D1D5DB", background: "#fff" };
const primaryButton: CSSProperties = { minHeight: 48, width: "100%", border: "none", borderRadius: 10, background: "#111827", color: "#fff", fontSize: 16, fontWeight: 700 };
const secondaryButton: CSSProperties = { minHeight: 48, width: "100%", borderRadius: 10, border: "1px solid #D1D5DB", background: "#fff", fontSize: 16, fontWeight: 700 };
