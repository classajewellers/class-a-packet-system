"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { parseScanLine } from "@/lib/rfid-scan";
import { WEDGE_MAX_GAP_MS, wedgeToken, type WedgeKey } from "@/lib/wedge-burst";
import { formatLocationLabel, locationsForPicker, type LocationFields } from "@/lib/location-label";

type LocationRow = LocationFields & { id: string; name: string };
type MoveRow = {
  pieceId: string;
  sku: string;
  name: string | null;
  locationId: string | null;
  locationName: string | null;
  toLocationId: string;
};
type SearchHit = {
  id: string;
  sku: string;
  name: string | null;
  location_id: string | null;
  location_name: string | null;
};
type LookupPiece = {
  id: string;
  sku: string | null;
  name?: string | null;
  location_id: string | null;
  location_name: string | null;
};

const SEARCH_DEBOUNCE_MS = 300;

export default function StockMovementPage() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [rows, setRows] = useState<MoveRow[]>([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [moveAll, setMoveAll] = useState("");
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [highlightId, setHighlightId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<MoveRow[]>([]);
  const suggestionsRef = useRef<SearchHit[]>([]);
  const moveAllRef = useRef("");
  const keysRef = useRef<WedgeKey[]>([]);
  const knownCode = useRef(new Map<string, string>());
  const searchGen = useRef(0);
  const lookupQueue = useRef<{ epcs: string[]; skus: string[] }>({ epcs: [], skus: [] });
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveRef = useRef<(token: string) => void>(() => {});
  const addSearchRef = useRef<(hit: SearchHit) => void>(() => {});
  rowsRef.current = rows;
  suggestionsRef.current = suggestions;
  moveAllRef.current = moveAll;

  useEffect(() => {
    void fetch("/api/inventory/locations")
      .then((res) => res.json())
      .then((json) => setLocations(locationsForPicker((json.locations ?? []) as LocationRow[])))
      .catch(() => setError("Could not load locations"));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    const gen = ++searchGen.current;
    const timer = setTimeout(() => {
      setSearching(true);
      void fetch(`/api/rfid/stocktake/move/search?q=${encodeURIComponent(q)}`)
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          if (gen !== searchGen.current) return;
          if (!res.ok) {
            setError(json.error || "Could not search");
            setSuggestions([]);
            return;
          }
          setSuggestions(Array.isArray(json.pieces) ? json.pieces : []);
        })
        .catch(() => {
          if (gen !== searchGen.current) return;
          setError("Could not search");
          setSuggestions([]);
        })
        .finally(() => {
          if (gen === searchGen.current) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  function flash(pieceId: string) {
    setHighlightId(pieceId);
    window.setTimeout(() => {
      setHighlightId((current) => (current === pieceId ? "" : current));
    }, 700);
  }

  function remember(code: string, pieceId: string) {
    const key = code.trim().toLowerCase();
    if (key) knownCode.current.set(key, pieceId);
  }

  function addPieces(pieces: LookupPiece[]): string[] {
    const existing: string[] = [];
    setRows((prev) => {
      const next = [...prev];
      const seen = new Set(next.map((row) => row.pieceId));
      for (const piece of pieces) {
        if (!piece.id) continue;
        if (seen.has(piece.id)) {
          existing.push(piece.id);
          continue;
        }
        seen.add(piece.id);
        next.push({
          pieceId: piece.id,
          sku: piece.sku || "Piece",
          name: piece.name ?? null,
          locationId: piece.location_id,
          locationName: piece.location_name,
          toLocationId: moveAllRef.current || piece.location_id || "",
        });
      }
      return next;
    });
    return existing;
  }

  function highlightKnown(code: string): boolean {
    const pieceId = knownCode.current.get(code.trim().toLowerCase());
    if (!pieceId || !rowsRef.current.some((row) => row.pieceId === pieceId)) return false;
    flash(pieceId);
    return true;
  }

  async function flushLookup() {
    const epcs = lookupQueue.current.epcs.splice(0);
    const skus = lookupQueue.current.skus.splice(0);
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
    const missed: string[] = [];
    for (const hit of json.epcs ?? []) {
      if (hit.found && hit.piece?.id) {
        pieces.push(hit.piece);
        remember(hit.epc, hit.piece.id);
        if (hit.piece.sku) remember(hit.piece.sku, hit.piece.id);
      } else missed.push(String(hit.epc || ""));
    }
    for (const hit of json.skus ?? []) {
      if (hit.found && hit.piece?.id) {
        pieces.push(hit.piece);
        remember(hit.sku, hit.piece.id);
        if (hit.piece.sku) remember(hit.piece.sku, hit.piece.id);
      } else missed.push(String(hit.sku || ""));
    }
    const already = addPieces(pieces);
    for (const pieceId of already) flash(pieceId);
    const missing = missed.map((code) => code.trim()).filter(Boolean);
    setNotFound(missing.length ? `Not found: ${missing.join(", ")}` : "");
    if (pieces.length) setSuccess("");
  }

  function queueLookup(epcs: string[], skus: string[]) {
    const seenEpc = new Set(lookupQueue.current.epcs);
    const seenSku = new Set(lookupQueue.current.skus.map((sku) => sku.toLowerCase()));
    for (const epc of epcs) {
      if (seenEpc.has(epc)) continue;
      seenEpc.add(epc);
      lookupQueue.current.epcs.push(epc);
    }
    for (const sku of skus) {
      const key = sku.toLowerCase();
      if (seenSku.has(key)) continue;
      seenSku.add(key);
      lookupQueue.current.skus.push(sku);
    }
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(() => { void flushLookup(); }, 80);
  }

  function resolveCode(token: string) {
    searchGen.current += 1;
    setQuery("");
    setSuggestions([]);
    const parsed = parseScanLine(token);
    const epcs: string[] = [];
    const skus: string[] = [];
    let highlighted = false;
    for (const epc of parsed.epcs) {
      if (highlightKnown(epc)) highlighted = true;
      else epcs.push(epc);
    }
    if (parsed.sku) {
      if (highlightKnown(parsed.sku)) highlighted = true;
      else skus.push(parsed.sku);
    }
    if (!epcs.length && !skus.length) {
      if (highlighted) setNotFound("");
      return;
    }
    queueLookup(epcs, skus);
  }

  function addFromSearch(hit: SearchHit) {
    searchGen.current += 1;
    setQuery("");
    setSuggestions([]);
    setError("");
    setSuccess("");
    setNotFound("");
    remember(hit.sku, hit.id);
    if (rowsRef.current.some((row) => row.pieceId === hit.id)) {
      flash(hit.id);
      return;
    }
    addPieces([{
      id: hit.id,
      sku: hit.sku,
      name: hit.name,
      location_id: hit.location_id,
      location_name: hit.location_name,
    }]);
    inputRef.current?.focus();
  }

  resolveRef.current = resolveCode;
  addSearchRef.current = addFromSearch;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const search = target === inputRef.current;
      const otherText = !search && !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (otherText || event.isComposing || event.repeat) return;
      if (event.key === "Enter") {
        const token = wedgeToken(keysRef.current, performance.now());
        keysRef.current = [];
        if (token) {
          event.preventDefault();
          event.stopPropagation();
          resolveRef.current(token);
          return;
        }
        if (search) {
          event.preventDefault();
          const first = suggestionsRef.current[0];
          if (first) addSearchRef.current(first);
        }
        return;
      }
      if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!search) event.preventDefault();
      const now = performance.now();
      const prev = keysRef.current[keysRef.current.length - 1];
      if (prev && now - prev.at > WEDGE_MAX_GAP_MS) keysRef.current = [];
      keysRef.current.push({ at: now, key: event.key });
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

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
    knownCode.current.clear();
    setSuccess(changed.length === 1 ? "Moved 1 piece" : `Moved ${changed.length} pieces`);
    inputRef.current?.focus();
  }

  return (
    <div
      className="stocktake-page"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("a, button, input, select")) return;
        inputRef.current?.focus();
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>Stock Movement</h1>
      {error && <p style={errorStyle}>{error}</p>}
      {success && <p style={successStyle}>{success}</p>}
      <input
        ref={inputRef}
        value={query}
        autoFocus
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search SKU or name"
        aria-label="Search SKU or name"
        onChange={(event) => {
          setNotFound("");
          setQuery(event.target.value);
        }}
        style={searchBox}
      />
      {notFound && <p style={notFoundStyle}>{notFound}</p>}
      {suggestions.length > 0 && (
        <div aria-label="Matching pieces" style={suggestList}>
          {suggestions.map((hit) => (
            <button key={hit.id} type="button" onClick={() => addFromSearch(hit)} style={suggestButton}>
              <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{hit.sku}</span>
              {hit.name && <span style={{ display: "block", fontSize: 14 }}>{hit.name}</span>}
              <span style={{ display: "block", fontSize: 13, color: "#6B7280" }}>{hit.location_name || "No location"}</span>
            </button>
          ))}
        </div>
      )}
      {searching && query.trim() && suggestions.length === 0 && <p style={hintStyle}>Searching…</p>}
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
          <div key={row.pieceId} style={{ ...card, background: highlightId === row.pieceId ? "#FEF3C7" : "#fff" }}>
            <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700 }}>{row.sku}</div>
            {row.name && <div style={{ fontSize: 15, marginTop: 2 }}>{row.name}</div>}
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

const searchBox: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 56,
  fontSize: 18,
  padding: "14px 12px",
  borderRadius: 12,
  border: "1px solid #D1D5DB",
};

const suggestList: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginTop: 8,
};

const suggestButton: CSSProperties = {
  textAlign: "left",
  width: "100%",
  minHeight: 56,
  padding: "8px 12px",
  borderRadius: 12,
  border: "1px solid #E5E7EB",
  background: "#fff",
  fontSize: 16,
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
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: "12px 14px",
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

const notFoundStyle: CSSProperties = {
  color: "#991B1B",
  fontSize: 14,
  margin: "8px 0 0",
};

const hintStyle: CSSProperties = {
  color: "#6B7280",
  fontSize: 14,
  margin: "8px 0 0",
};

const successStyle: CSSProperties = {
  background: "#DCFCE7",
  color: "#14532D",
  borderRadius: 10,
  padding: "12px 14px",
  margin: "0 0 10px",
  fontWeight: 700,
};
