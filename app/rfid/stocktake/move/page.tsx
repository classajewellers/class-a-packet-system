"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { RFID_LOOKUP_DEBOUNCE_MS, parseScanLines, splitScanBuffer } from "@/lib/rfid-scan";

type LocationRow = { id: string; name: string };
type MoveAction = "moved" | "already" | "unknown" | "blank";
type MoveRow = {
  key: string;
  action: MoveAction;
  sku: string | null;
  epc: string | null;
  from_location_name: string | null;
  piece_id: string | null;
};

export default function ScanToMovePage() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [destination, setDestination] = useState<LocationRow | null>(null);
  const [rows, setRows] = useState<MoveRow[]>([]);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [blanksOpen, setBlanksOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seenEpcs = useRef(new Set<string>());
  const seenSkus = useRef(new Set<string>());
  const queue = useRef<{ epcs: string[]; skus: string[] }>({ epcs: [], skus: [] });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef(false);
  const destinationRef = useRef<LocationRow | null>(null);
  destinationRef.current = destination;

  useEffect(() => {
    void fetch("/api/inventory/locations")
      .then((res) => res.json())
      .then((json) => setLocations((json.locations ?? []).map((row: LocationRow) => ({ id: row.id, name: row.name }))))
      .catch(() => setError("Could not load locations"));
  }, []);

  useEffect(() => { if (destination) inputRef.current?.focus(); }, [destination]);

  async function flush() {
    const place = destinationRef.current;
    if (!place || flushing.current) return;
    const epcs = queue.current.epcs.splice(0, 200);
    const skus = queue.current.skus.splice(0, Math.max(0, 200 - epcs.length));
    if (!epcs.length && !skus.length) return;
    flushing.current = true;
    try {
      const res = await fetch("/api/rfid/stocktake/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_location_id: place.id, epcs, skus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not move");
      const incoming = (json.results ?? []) as MoveRow[];
      setRows((prev) => {
        const next = [...prev];
        for (const row of incoming) {
          const index = next.findIndex((item) => item.key === row.key || (row.piece_id && item.piece_id === row.piece_id));
          if (index >= 0) next[index] = row;
          else next.push(row);
        }
        return next;
      });
      setError("");
    } catch (err) {
      for (const epc of epcs) seenEpcs.current.delete(epc);
      for (const sku of skus) seenSkus.current.delete(sku.toLowerCase());
      setError(err instanceof Error ? err.message : "Could not move");
    } finally {
      flushing.current = false;
      if (queue.current.epcs.length || queue.current.skus.length) {
        timer.current = setTimeout(() => { void flush(); }, RFID_LOOKUP_DEBOUNCE_MS);
      }
    }
  }

  function pushLines(lines: string[]) {
    const parsed = parseScanLines(lines);
    let queued = false;
    for (const epc of parsed.epcs) {
      if (seenEpcs.current.has(epc)) continue;
      seenEpcs.current.add(epc);
      queue.current.epcs.push(epc);
      queued = true;
    }
    for (const sku of parsed.skus) {
      const key = sku.toLowerCase();
      if (seenSkus.current.has(key)) continue;
      seenSkus.current.add(key);
      queue.current.skus.push(sku);
      queued = true;
    }
    if (!queued) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, RFID_LOOKUP_DEBOUNCE_MS);
  }

  function ingest(value: string) {
    const { complete, rest } = splitScanBuffer(value);
    if (complete.length) pushLines(complete);
    setDraft(rest);
  }

  const moved = rows.filter((row) => row.action === "moved");
  const already = rows.filter((row) => row.action === "already");
  const unknown = rows.filter((row) => row.action === "unknown");
  const blanks = rows.filter((row) => row.action === "blank");

  return (
    <div
      className="stocktake-page"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("a, button, textarea")) return;
        inputRef.current?.focus();
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>Scan to move</h1>
      <Link href="/rfid/stocktake" style={{ color: "#111827", fontSize: 15 }}>Back to Stocktake</Link>
      {error && <p style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "12px 14px" }}>{error}</p>}
      {!destination && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: "16px 0 8px" }}>Destination</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {locations.map((location) => (
              <button key={location.id} type="button" onClick={() => setDestination(location)} style={locationButton}>
                {location.name}
              </button>
            ))}
          </div>
        </>
      )}
      {destination && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, margin: "12px 0" }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Moving to {destination.name}</div>
            <button type="button" onClick={() => setDestination(null)} style={changeButton}>Change</button>
          </div>
          <textarea
            ref={inputRef}
            value={draft}
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            rows={2}
            placeholder="Scan a tag"
            aria-label="Scan input"
            onChange={(event) => ingest(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              ingest(`${draft}\n`);
            }}
            onBlur={(event) => {
              const next = event.relatedTarget as HTMLElement | null;
              if (next?.closest("a, button")) return;
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              minHeight: 64,
              fontSize: 18,
              padding: "14px 12px",
              borderRadius: 12,
              border: "1px solid #D1D5DB",
              resize: "none",
            }}
          />
          <p style={{ fontSize: 15, fontWeight: 700, margin: "12px 0" }}>
            {moved.length} moved{already.length ? ` · ${already.length} already there` : ""}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {moved.map((row) => (
              <div key={row.key} style={card}>
                <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700 }}>{row.sku || "Piece"}</div>
                <div style={{ fontSize: 14, color: "#374151", marginTop: 4 }}>
                  {row.from_location_name ? `From ${row.from_location_name}` : "From no location"} → {destination.name}
                </div>
              </div>
            ))}
            {already.map((row) => (
              <div key={row.key} style={card}>
                <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700 }}>{row.sku || "Piece"}</div>
                <div style={{ fontSize: 14, color: "#4B5563", marginTop: 4 }}>Already at {destination.name}</div>
              </div>
            ))}
            {unknown.map((row) => (
              <div key={row.key} style={card}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Not in Vault</div>
                <div style={{ fontFamily: "monospace", fontSize: 13, color: "#6B7280", wordBreak: "break-all", marginTop: 4 }}>{row.epc}</div>
              </div>
            ))}
          </div>
          {blanks.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button type="button" aria-expanded={blanksOpen} onClick={() => setBlanksOpen((open) => !open)} style={blankButton}>
                {blanksOpen ? "▾" : "▸"} Blank tag (never printed) · {blanks.length}
              </button>
            </div>
          )}
        </>
      )}
      <style>{`.stocktake-page { max-width: 720px; margin: 0 auto; overflow-x: hidden; }`}</style>
    </div>
  );
}

const locationButton: CSSProperties = {
  minHeight: 52,
  textAlign: "left",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #D1D5DB",
  background: "#fff",
  fontSize: 18,
  fontWeight: 700,
  cursor: "pointer",
};
const changeButton: CSSProperties = {
  minHeight: 44,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: "12px 14px",
};
const blankButton: CSSProperties = {
  width: "100%",
  minHeight: 48,
  textAlign: "left",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #E5E7EB",
  background: "#F9FAFB",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};
