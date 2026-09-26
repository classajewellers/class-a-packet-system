"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { parseScanLines, splitScanBuffer } from "@/lib/rfid-scan";
import { formatLocationLabel, locationsForPicker, type LocationFields } from "@/lib/location-label";

type LocationRow = LocationFields & { id: string; name: string };
type MoveRow = {
  pieceId: string;
  sku: string;
  locationId: string | null;
  locationName: string | null;
  toLocationId: string;
};

type LookupPiece = {
  id: string;
  sku: string | null;
  location_id: string | null;
  location_name: string | null;
};

export default function StockMovementPage() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [rows, setRows] = useState<MoveRow[]>([]);
  const [draft, setDraft] = useState("");
  const [skuDraft, setSkuDraft] = useState("");
  const [moveAll, setMoveAll] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rowsRef = useRef<MoveRow[]>([]);
  rowsRef.current = rows;

  useEffect(() => {
    void fetch("/api/inventory/locations")
      .then((res) => res.json())
      .then((json) => setLocations(locationsForPicker((json.locations ?? []) as LocationRow[])))
      .catch(() => setError("Could not load locations"));
  }, []);

  function addPieces(pieces: LookupPiece[]) {
    setRows((prev) => {
      const next = [...prev];
      const seen = new Set(next.map((row) => row.pieceId));
      for (const piece of pieces) {
        if (!piece.id || seen.has(piece.id)) continue;
        seen.add(piece.id);
        next.push({
          pieceId: piece.id,
          sku: piece.sku || "Piece",
          locationId: piece.location_id,
          locationName: piece.location_name,
          toLocationId: moveAll || piece.location_id || "",
        });
      }
      return next;
    });
  }

  async function lookup(epcs: string[], skus: string[]) {
    if (!epcs.length && !skus.length) return;
    setError("");
    setSuccess("");
    const res = await fetch("/api/rfid/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epcs, skus }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not look up that scan");
      return;
    }
    const pieces: LookupPiece[] = [];
    let missed = 0;
    for (const hit of json.epcs ?? []) {
      if (hit.found && hit.piece) pieces.push(hit.piece);
      else missed += 1;
    }
    for (const hit of json.skus ?? []) {
      if (hit.found && hit.piece) pieces.push(hit.piece);
      else missed += 1;
    }
    addPieces(pieces);
    if (missed) setError(missed === 1 ? "Not in Vault" : `${missed} not in Vault`);
  }

  function ingest(value: string) {
    const { complete, rest } = splitScanBuffer(value);
    if (complete.length) {
      const parsed = parseScanLines(complete);
      void lookup(parsed.epcs, parsed.skus);
    }
    setDraft(rest);
  }

  function addSku() {
    const sku = skuDraft.trim();
    if (!sku) return;
    setSkuDraft("");
    void lookup([], [sku]);
  }

  function setRowDestination(pieceId: string, toLocationId: string) {
    setMoveAll("");
    setRows((prev) => prev.map((row) => (row.pieceId === pieceId ? { ...row, toLocationId } : row)));
  }

  function setEveryDestination(toLocationId: string) {
    setMoveAll(toLocationId);
    setRows((prev) => prev.map((row) => ({ ...row, toLocationId })));
  }

  async function save() {
    const changed = rowsRef.current.filter((row) => row.toLocationId && row.toLocationId !== row.locationId);
    if (!changed.length) {
      setError("Choose a new location");
      setSuccess("");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    for (const row of changed) {
      const res = await fetch("/api/rfid/stocktake/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ piece_id: row.pieceId, to_location_id: row.toLocationId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaving(false);
        setError(json.error || `Could not move ${row.sku}`);
        return;
      }
    }
    setSaving(false);
    setRows([]);
    setMoveAll("");
    setSuccess(changed.length === 1 ? "Moved 1 piece" : `Moved ${changed.length} pieces`);
  }

  return (
    <div
      className="stocktake-page"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("a, button, textarea, input, select")) return;
        inputRef.current?.focus();
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>Stock Movement</h1>
      {error && <p style={errorStyle}>{error}</p>}
      {success && <p style={successStyle}>{success}</p>}
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
        style={scanBox}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          aria-label="SKU"
          value={skuDraft}
          onChange={(event) => setSkuDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            addSku();
          }}
          placeholder="SKU"
          style={{ ...scanBox, minHeight: 56, margin: 0 }}
        />
        <button type="button" onClick={addSku} style={addButton}>Add SKU</button>
      </div>
      {rows.length > 0 && (
        <label style={{ display: "block", marginTop: 16 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Move all to…</span>
          <select aria-label="Move all to" value={moveAll} onChange={(event) => setEveryDestination(event.target.value)} style={picker}>
            <option value="">Choose a location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{formatLocationLabel(location)}</option>
            ))}
          </select>
        </label>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {rows.map((row) => (
          <div key={row.pieceId} style={card}>
            <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700 }}>{row.sku}</div>
            <div style={{ fontSize: 14, color: "#4B5563", margin: "4px 0 8px" }}>{row.locationName || "No location"}</div>
            <select
              aria-label={`Location for ${row.sku}`}
              value={row.toLocationId}
              onChange={(event) => setRowDestination(row.pieceId, event.target.value)}
              style={picker}
            >
              <option value="">Choose a location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{formatLocationLabel(location)}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {rows.length > 0 && (
        <button type="button" disabled={saving} onClick={() => { void save(); }} style={saveButton}>
          {saving ? "Saving…" : "Save"}
        </button>
      )}
      <style>{`.stocktake-page { max-width: 720px; margin: 0 auto; overflow-x: hidden; padding-bottom: 128px; }`}</style>
    </div>
  );
}

const scanBox: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 64,
  fontSize: 18,
  padding: "14px 12px",
  borderRadius: 12,
  border: "1px solid #D1D5DB",
  resize: "none",
};

const picker: CSSProperties = {
  width: "100%",
  minHeight: 56,
  fontSize: 16,
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  background: "#fff",
  padding: "0 10px",
};

const card: CSSProperties = {
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: "12px 14px",
};

const addButton: CSSProperties = {
  flex: "0 0 auto",
  minHeight: 56,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid #111827",
  background: "#fff",
  fontWeight: 700,
  fontSize: 15,
};

const saveButton: CSSProperties = {
  width: "100%",
  minHeight: 56,
  marginTop: 16,
  borderRadius: 12,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontSize: 18,
  fontWeight: 700,
};

const errorStyle: CSSProperties = {
  background: "#FEF2F2",
  color: "#991B1B",
  borderRadius: 10,
  padding: "12px 14px",
  margin: "0 0 10px",
};

const successStyle: CSSProperties = {
  background: "#DCFCE7",
  color: "#14532D",
  borderRadius: 10,
  padding: "12px 14px",
  margin: "0 0 10px",
  fontWeight: 700,
};
