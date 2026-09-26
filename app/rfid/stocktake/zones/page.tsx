"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { compareLocations } from "@/lib/location-label";

type Place = { id: string; code: string | null; name: string; label: string };
type Zone = Place & { locations: Place[] };
type Pair = { zoneAId: string; zoneBId: string; label: string };
type Admin = { zones: Zone[]; unassigned: Place[]; neighbours: Pair[] };

function placeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function samePlace(a: { code: string | null; name: string }, b: { code: string | null; name: string }): boolean {
  return placeText(a.code) === placeText(b.code) && placeText(a.name) === placeText(b.name);
}

/** One location, and the zone was named after that location: show the row only. */
function mirrorsOnlyLocation(zone: Zone): boolean {
  return zone.locations.length === 1 && samePlace(zone, zone.locations[0]);
}

function trayCount(count: number): string {
  return count === 1 ? "1 tray" : `${count} trays`;
}

function byPlace<T extends { code: string | null; name: string }>(rows: T[]): T[] {
  return [...rows].sort(compareLocations);
}

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

  const zones = admin ? byPlace(admin.zones).map((zone) => ({ ...zone, locations: byPlace(zone.locations) })) : [];
  const unassigned = admin ? byPlace(admin.unassigned) : [];

  return (
    <div className="stocktake-zones">
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>Stocktake zones</h1>
      <Link href="/rfid/stocktake" style={textLink}>Back to stocktake</Link>
      {error && <p style={errorStyle}>{error}</p>}
      {!admin && !error && <p style={{ color: "#6B7280" }}>Loading zones…</p>}
      {admin && (
        <>
          {zones.map((zone) => (
            mirrorsOnlyLocation(zone) ? (
              <LocationRow
                key={zone.locations[0].id}
                location={zone.locations[0]}
                zoneId={zone.id}
                zones={zones}
                busy={busy}
                onAssign={(locationId, zoneId) => { void save({ action: "assign", location_id: locationId, zone_id: zoneId }); }}
              />
            ) : (
              <section key={zone.id}>
                <h2 style={zoneHeader}>{zone.name} · {trayCount(zone.locations.length)}</h2>
                {zone.locations.length === 0 && <p style={meta}>No locations in this zone.</p>}
                {zone.locations.map((location) => (
                  <LocationRow
                    key={location.id}
                    location={location}
                    zoneId={zone.id}
                    zones={zones}
                    busy={busy}
                    onAssign={(locationId, zoneId) => { void save({ action: "assign", location_id: locationId, zone_id: zoneId }); }}
                  />
                ))}
              </section>
            )
          ))}
          {unassigned.length > 0 && (
            <section>
              <h2 style={zoneHeader}>No zone (counted on its own)</h2>
              {unassigned.map((location) => (
                <LocationRow
                  key={location.id}
                  location={location}
                  zoneId=""
                  zones={zones}
                  busy={busy}
                  onAssign={(locationId, zoneId) => { void save({ action: "assign", location_id: locationId, zone_id: zoneId }); }}
                />
              ))}
            </section>
          )}

          <h2 style={sectionTitle}>Neighbour zones</h2>
          {admin.neighbours.length === 0 && <p style={meta}>No neighbour pairs.</p>}
          {admin.neighbours.map((pair) => (
            <div key={`${pair.zoneAId}-${pair.zoneBId}`} className="zone-loc">
              <div className="zone-loc-name">{pair.label}</div>
              <button
                type="button"
                disabled={busy}
                onClick={() => { void save({ action: "remove_neighbour", zone_a_id: pair.zoneAId, zone_b_id: pair.zoneBId }); }}
                style={pairButton}
              >
                Remove
              </button>
            </div>
          ))}
          <div className="zone-neighbour-add">
            <select aria-label="First zone" value={zoneA} onChange={(event) => setZoneA(event.target.value)} style={selectStyle}>
              <option value="">First zone</option>
              {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
            </select>
            <select aria-label="Second zone" value={zoneB} onChange={(event) => setZoneB(event.target.value)} style={selectStyle}>
              <option value="">Second zone</option>
              {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
            </select>
          </div>
          <button
            type="button"
            disabled={busy || !zoneA || !zoneB}
            onClick={() => { void save({ action: "add_neighbour", zone_a_id: zoneA, zone_b_id: zoneB }); }}
            style={primaryButton}
          >
            Add neighbour pair
          </button>
        </>
      )}
      <style>{`
        .stocktake-zones { max-width: 720px; margin: 0 auto; overflow-x: hidden; padding-bottom: 96px; }
        .zone-loc { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 4px 0; border-bottom: 1px solid #E7E5E4; }
        .zone-loc-name { flex: 1 1 0; min-width: 0; font-weight: 600; font-size: 15px; line-height: 1.3; overflow-wrap: anywhere; }
        .zone-loc-control { flex: 1 1 0; min-width: 0; max-width: 50%; }
        .zone-loc-control select { display: block; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; min-height: 40px; font-size: 14px; border-radius: 8px; border: 1px solid #D1D5DB; background: #fff; padding: 0 4px; }
        .zone-neighbour-add { display: flex; gap: 8px; margin-top: 8px; }
        .zone-neighbour-add select { flex: 1 1 0; min-width: 0; width: 0; }
      `}</style>
    </div>
  );
}

function LocationRow({
  location,
  zoneId,
  zones,
  busy,
  onAssign,
}: {
  location: Place;
  zoneId: string;
  zones: Zone[];
  busy: boolean;
  onAssign: (locationId: string, zoneId: string | null) => void;
}) {
  return (
    <div className="zone-loc">
      <div className="zone-loc-name">{location.label}</div>
      <div className="zone-loc-control">
        <select
          aria-label={`Zone for ${location.label}`}
          value={zoneId}
          disabled={busy}
          onChange={(event) => { onAssign(location.id, event.target.value || null); }}
        >
          <option value="">No zone</option>
          {zones.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

const zoneHeader: CSSProperties = { fontSize: 16, fontWeight: 700, color: "#111827", margin: "18px 0 2px" };
const sectionTitle: CSSProperties = { fontSize: 16, fontWeight: 700, margin: "22px 0 8px" };
const meta: CSSProperties = { color: "#6B7280", margin: "8px 0 0" };
const errorStyle: CSSProperties = { background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "12px 14px" };
const textLink: CSSProperties = { color: "#111827", fontWeight: 700 };
const selectStyle: CSSProperties = { minHeight: 40, fontSize: 14, borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff" };
const primaryButton: CSSProperties = { minHeight: 40, width: "100%", marginTop: 8, border: "none", borderRadius: 8, background: "#111827", color: "#fff", fontSize: 15, fontWeight: 700 };
const pairButton: CSSProperties = { flex: "0 0 auto", minHeight: 40, padding: "0 12px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", fontSize: 14, fontWeight: 700 };
