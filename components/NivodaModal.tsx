"use client";

import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NivodaStone {
  id: string;
  carats: number;
  shape: string;
  color: string;
  clarity: string;
  cut: string | null;
  polish: string | null;
  symmetry: string | null;
  lab: string | null;
  certNumber: string | null;
  price: number;
  image: string | null;
  video: string | null;
  length_mm: number | null;
  width_mm: number | null;
  depth_mm: number | null;
  labgrown: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectStone: (stone: NivodaStone) => void;
  tenantId: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIMARY_SHAPES  = ["ROUND", "OVAL", "EMERALD", "CUSHION", "MARQUISE", "PEAR", "PRINCESS", "RADIANT"] as const;
const EXTENDED_SHAPES = ["ASSCHER", "HEART", "SQ_RADIANT", "OLD_MINER", "STAR", "ROSE", "TRIANGULAR", "TRILLIANT", "BAGUETTE", "SHIELD", "LOZENGE", "KITE", "EUROPEAN_CUT", "HALF_MOON", "TRAPEZOID", "FLANDERS", "BRIOLETTE", "SQUARE", "OCTAGONAL", "HEXAGONAL", "PENTAGONAL"] as const;

const SHAPE_LABELS: Record<string, string> = {
  ROUND: "Round", OVAL: "Oval", EMERALD: "Emerald", CUSHION: "Cushion",
  MARQUISE: "Marquise", PEAR: "Pear", PRINCESS: "Princess", RADIANT: "Radiant",
  ASSCHER: "Asscher", HEART: "Heart", SQ_RADIANT: "Sq. Radiant",
  OLD_MINER: "Old Miner", STAR: "Star", ROSE: "Rose",
  TRIANGULAR: "Triangular", TRILLIANT: "Trilliant", BAGUETTE: "Baguette",
  SHIELD: "Shield", LOZENGE: "Lozenge", KITE: "Kite",
  EUROPEAN_CUT: "European", HALF_MOON: "Half Moon", TRAPEZOID: "Trapezoid",
  FLANDERS: "Flanders", BRIOLETTE: "Briolette", SQUARE: "Square",
  OCTAGONAL: "Octagonal", HEXAGONAL: "Hexagonal", PENTAGONAL: "Pentagonal",
};

const COLORS    = ["D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"] as const;
const CLARITIES = ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randAlpha(len: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function makeRefId(price: number): string {
  const aud = Math.round(price / 100);
  return `${randAlpha(4)}-${aud}-${randAlpha(4)}`;
}

// ─── Diamond placeholder icon ─────────────────────────────────────────────────

function DiamondIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 8L8 28l24 28 24-28L32 8z" stroke="#C4BFFE" strokeWidth="2" fill="#EEF2FF" />
      <path d="M8 28h48M32 8l-14 20M32 8l14 20M8 28l24 28M56 28l-24 28" stroke="#C4BFFE" strokeWidth="1.5" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NivodaModal({ open, onClose, onSelectStone, tenantId }: Props) {
  // Filters
  const [labgrown, setLabgrown]             = useState(true);
  const [shapes, setShapes]                 = useState<string[]>(["ROUND"]);
  const [showMoreShapes, setShowMoreShapes] = useState(false);
  const [caratFrom, setCaratFrom]           = useState("0.50");
  const [caratTo, setCaratTo]               = useState("2.00");
  const [colorGrades, setColorGrades]       = useState<string[]>(["D", "E", "F", "G", "H"]);
  const [clarityGrades, setClarityGrades]   = useState<string[]>(["VVS1", "VVS2", "VS1", "VS2", "SI1"]);
  const [budget, setBudget]                 = useState("");
  const [hasImage, setHasImage]             = useState(true);

  // Results
  const [results, setResults]               = useState<NivodaStone[]>([]);
  const [refIds, setRefIds]                 = useState<Record<string, string>>({});
  const [totalCount, setTotalCount]         = useState(0);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [searched, setSearched]             = useState(false);

  // Detail view
  const [selectedStone, setSelectedStone]   = useState<NivodaStone | null>(null);

  const PAGE_SIZE = 20;

  function toggleShape(s: string) {
    setShapes(prev => prev.includes(s) ? (prev.length > 1 ? prev.filter(x => x !== s) : prev) : [...prev, s]);
  }

  const runSearch = useCallback(async (offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/nivoda/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({
          shapes,
          caratFrom: parseFloat(caratFrom) || 0.3,
          caratTo:   parseFloat(caratTo)   || 5,
          colorGrades,
          clarityGrades,
          labgrown,
          ...(hasImage ? { has_image: true } : {}),
          budget: budget ? parseFloat(budget) * 100 : undefined,
          limit: PAGE_SIZE,
          offset,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError("Unable to connect to Nivoda. Please enter stone details manually.");
        return;
      }
      const incoming: NivodaStone[] = json.results ?? [];
      if (offset === 0) {
        setResults(incoming);
        // Generate ref IDs once for this batch
        const ids: Record<string, string> = {};
        incoming.forEach(s => { ids[s.id] = makeRefId(s.price); });
        setRefIds(ids);
      } else {
        setResults(prev => [...prev, ...incoming]);
        setRefIds(prev => {
          const ids = { ...prev };
          incoming.forEach(s => { if (!ids[s.id]) ids[s.id] = makeRefId(s.price); });
          return ids;
        });
      }
      setTotalCount(json.total_count ?? 0);
      setSearched(true);
    } catch {
      setError("Unable to connect to Nivoda. Please enter stone details manually.");
    } finally {
      setLoading(false);
    }
  }, [shapes, caratFrom, caratTo, colorGrades, clarityGrades, labgrown, hasImage, budget, tenantId]);

  function handleSearch() {
    setResults([]);
    setRefIds({});
    setTotalCount(0);
    setSelectedStone(null);
    runSearch(0);
  }

  function handleLoadMore() {
    runSearch(results.length);
  }

  function handleSelect(stone: NivodaStone) {
    onSelectStone({ ...stone, labgrown });
    onClose();
  }

  if (!open) return null;

  const numIn: React.CSSProperties = { border: "1px solid #E8E8F0", borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };

  function ShapeBtn({ s }: { s: string }) {
    const active = shapes.includes(s);
    return (
      <button
        onClick={() => toggleShape(s)}
        style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${active ? "#635BFF" : "#E8E8F0"}`, background: active ? "#635BFF" : "#fff", color: active ? "#fff" : "#374151", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all .15s" }}
      >
        {SHAPE_LABELS[s] ?? s}
      </button>
    );
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 1020, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.25)", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid #E8E8F0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 64 64" fill="none"><path d="M32 6L6 28l26 30 26-30L32 6z" stroke="#635BFF" strokeWidth="3" fill="#C7D2FE" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A2E" }}>Browse Stones</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>Powered by Nivoda</div>
            </div>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF", lineHeight: 1, padding: "4px 8px" }}>×</button>
        </div>

        {/* Body */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

          {/* ── Filters panel ── */}
          <div style={{ width: 240, flexShrink: 0, borderRight: "1px solid #E8E8F0", padding: "20px 16px", overflowY: "auto", background: "#FAFBFF" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Filters</div>

            {/* Stone type */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Stone Type</div>
              <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid #E8E8F0" }}>
                {[{ v: true, label: "Lab Grown" }, { v: false, label: "Natural" }].map(({ v, label }) => (
                  <button key={String(v)} onClick={() => setLabgrown(v)} style={{ flex: 1, padding: "7px 4px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, background: labgrown === v ? "#635BFF" : "#fff", color: labgrown === v ? "#fff" : "#374151", transition: "all .15s" }}>{label}</button>
                ))}
              </div>
            </div>

            {/* Shape */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Shape</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {PRIMARY_SHAPES.map(s => <ShapeBtn key={s} s={s} />)}
                {showMoreShapes && EXTENDED_SHAPES.map(s => <ShapeBtn key={s} s={s} />)}
              </div>
              <button
                onClick={() => setShowMoreShapes(v => !v)}
                style={{ marginTop: 6, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#635BFF", fontWeight: 500, padding: 0 }}
              >
                {showMoreShapes ? "− Less shapes" : "+ More shapes"}
              </button>
            </div>

            {/* Carat */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Carat</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 3 }}>From</div>
                  <input style={numIn} type="number" min="0.1" step="0.1" value={caratFrom} onChange={e => setCaratFrom(e.target.value)} placeholder="0.50" onFocus={e => (e.target.style.borderColor = "#635BFF")} onBlur={e => (e.target.style.borderColor = "#E8E8F0")} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 3 }}>To</div>
                  <input style={numIn} type="number" min="0.1" step="0.1" value={caratTo} onChange={e => setCaratTo(e.target.value)} placeholder="2.00" onFocus={e => (e.target.style.borderColor = "#635BFF")} onBlur={e => (e.target.style.borderColor = "#E8E8F0")} />
                </div>
              </div>
            </div>

            {/* Colour */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Colour</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {COLORS.map(c => {
                  const active = colorGrades.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => setColorGrades(prev => active ? (prev.length > 1 ? prev.filter(x => x !== c) : prev) : [...prev, c])}
                      style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${active ? "#635BFF" : "#E8E8F0"}`, background: active ? "#635BFF" : "#fff", color: active ? "#fff" : "#374151", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all .15s" }}
                    >{c}</button>
                  );
                })}
              </div>
            </div>

            {/* Clarity */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Clarity</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {CLARITIES.map(c => {
                  const active = clarityGrades.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => setClarityGrades(prev => active ? (prev.length > 1 ? prev.filter(x => x !== c) : prev) : [...prev, c])}
                      style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${active ? "#635BFF" : "#E8E8F0"}`, background: active ? "#635BFF" : "#fff", color: active ? "#fff" : "#374151", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all .15s" }}
                    >{c}</button>
                  );
                })}
              </div>
            </div>

            {/* Budget */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Max Budget (AUD)</div>
              <input style={numIn} type="number" min="0" step="100" value={budget} onChange={e => setBudget(e.target.value)} placeholder="Optional" onFocus={e => (e.target.style.borderColor = "#635BFF")} onBlur={e => (e.target.style.borderColor = "#E8E8F0")} />
            </div>

            {/* Images only */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={hasImage}
                  onChange={e => setHasImage(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: "#635BFF", cursor: "pointer" }}
                />
                <span style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>Images only</span>
              </label>
            </div>

            <button
              onClick={handleSearch}
              disabled={loading}
              style={{ width: "100%", padding: "10px 0", borderRadius: 10, background: loading ? "#9CA3AF" : "#635BFF", color: "#fff", border: "none", cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, transition: "background .15s" }}
            >{loading && !results.length ? "Searching…" : "Search"}</button>
          </div>

          {/* ── Right panel — grid or detail view ── */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px", minWidth: 0 }}>

            {/* ── Expanded detail view ── */}
            {selectedStone ? (
              <StoneDetailView
                stone={selectedStone}
                refId={refIds[selectedStone.id] ?? ""}
                onBack={() => setSelectedStone(null)}
                onSelect={handleSelect}
              />
            ) : (
              <>
                {/* Loading (initial) */}
                {loading && results.length === 0 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12, color: "#6B7280" }}>
                    <div style={{ width: 32, height: 32, border: "3px solid #635BFF", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                    <span style={{ fontSize: 14 }}>Searching Nivoda…</span>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                )}

                {/* Error */}
                {error && !loading && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 8, textAlign: "center", padding: "0 32px" }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/></svg>
                    <span style={{ fontSize: 14, color: "#6B7280" }}>{error}</span>
                  </div>
                )}

                {/* Empty */}
                {searched && !loading && !error && results.length === 0 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 8, color: "#6B7280" }}>
                    <DiamondIcon />
                    <span style={{ fontSize: 14 }}>No stones found — try adjusting your filters.</span>
                  </div>
                )}

                {/* Not yet searched */}
                {!searched && !loading && !error && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 8, color: "#9CA3AF" }}>
                    <DiamondIcon />
                    <span style={{ fontSize: 14 }}>Set your filters and press Search.</span>
                  </div>
                )}

                {/* Results grid */}
                {results.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 14 }}>
                      Showing {results.length} of {totalCount.toLocaleString()} stones
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                      {results.map(stone => (
                        <StoneCard
                          key={stone.id}
                          stone={stone}
                          onSelect={handleSelect}
                          onExpand={() => setSelectedStone(stone)}
                        />
                      ))}
                    </div>

                    {/* Load more */}
                    {results.length < totalCount && (
                      <div style={{ textAlign: "center", marginTop: 20 }}>
                        <button
                          onClick={handleLoadMore}
                          disabled={loading}
                          style={{ padding: "9px 28px", borderRadius: 8, border: "1px solid #635BFF", background: "#EEF2FF", color: "#635BFF", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}
                        >{loading ? "Loading…" : `Load More (${totalCount - results.length} remaining)`}</button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stone card (grid view) ───────────────────────────────────────────────────

function StoneCard({ stone, onSelect, onExpand }: { stone: NivodaStone; onSelect: (s: NivodaStone) => void; onExpand: () => void }) {
  const price = stone.price > 0
    ? `A$${(stone.price / 100).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : "POA";

  return (
    <div
      onClick={onExpand}
      style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", cursor: "pointer" }}
    >
      {/* Image */}
      <div style={{ height: 110, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
        {stone.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={stone.image} alt={`${stone.carats}ct ${stone.shape}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <DiamondIcon />
        )}
      </div>

      {/* Details */}
      <div style={{ padding: "10px 10px 6px", flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A2E" }}>{stone.carats}ct {SHAPE_LABELS[stone.shape] ?? stone.shape}</div>
        <div style={{ fontSize: 12, color: "#6B7280" }}>
          {stone.color}/{stone.clarity}{stone.cut ? ` · ${stone.cut}` : ""}
        </div>
        {stone.lab && (
          <div style={{ fontSize: 11, color: "#6B7280" }}>{stone.lab}{stone.certNumber ? ` · ${stone.certNumber}` : ""}</div>
        )}
      </div>

      <div style={{ padding: "0 10px 10px" }}>
        <button
          onClick={e => { e.stopPropagation(); onSelect(stone); }}
          style={{ width: "100%", padding: "7px 0", borderRadius: 8, background: "#635BFF", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "background .15s" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#4F46E5")}
          onMouseLeave={e => (e.currentTarget.style.background = "#635BFF")}
        >Select Stone</button>
      </div>
    </div>
  );
}

// ─── Stone detail view ────────────────────────────────────────────────────────

function StoneDetailView({ stone, refId, onBack, onSelect }: { stone: NivodaStone; refId: string; onBack: () => void; onSelect: (s: NivodaStone) => void }) {
  const price = stone.price > 0
    ? `A$${(stone.price / 100).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : "POA";

  const rows: { label: string; value: string | null | undefined }[] = [
    { label: "Shape",      value: SHAPE_LABELS[stone.shape] ?? stone.shape },
    { label: "Carats",     value: `${stone.carats}ct` },
    { label: "Colour",     value: stone.color },
    { label: "Clarity",    value: stone.clarity },
    { label: "Cut",        value: stone.cut },
    { label: "Polish",     value: stone.polish },
    { label: "Symmetry",   value: stone.symmetry },
    { label: "Lab",        value: stone.lab },
    { label: "Cert No.",   value: stone.certNumber },
    { label: "Ref",        value: refId },
  ];

  const hasDimensions = [stone.length_mm, stone.width_mm, stone.depth_mm].some(v => v && v > 0);
  const dimensionsStr = hasDimensions
    ? `${(stone.length_mm ?? 0).toFixed(2)} × ${(stone.width_mm ?? 0).toFixed(2)} × ${(stone.depth_mm ?? 0).toFixed(2)} mm`
    : null;

  const videoUrl = stone.video ? `${stone.video}/autoplay` : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Back link */}
      <button
        onClick={onBack}
        style={{ alignSelf: "flex-start", background: "none", border: "none", cursor: "pointer", color: "#635BFF", fontSize: 13, fontWeight: 500, padding: "0 0 16px", display: "flex", alignItems: "center", gap: 4 }}
      >
        ← Back to results
      </button>

      {/* Image */}
      {stone.image && (
        <div style={{ background: "#F3F4F6", borderRadius: 10, overflow: "hidden", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", maxHeight: 500 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={stone.image} alt={`${stone.carats}ct ${stone.shape}`} style={{ width: "100%", maxHeight: 500, objectFit: "contain" }} />
        </div>
      )}

      {/* Video */}
      {videoUrl && (
        <div style={{ marginBottom: 16, borderRadius: 10, overflow: "hidden", background: "#000", aspectRatio: "16/9" }}>
          <iframe
            src={videoUrl}
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            allow="autoplay"
            allowFullScreen
          />
        </div>
      )}

      {/* No media fallback */}
      {!stone.image && !videoUrl && (
        <div style={{ background: "#F3F4F6", borderRadius: 10, height: 200, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <DiamondIcon />
        </div>
      )}

      {/* Details table */}
      <div style={{ background: "#FAFBFF", border: "1px solid #E8E8F0", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
        {[...rows.filter(r => r.value), ...(dimensionsStr ? [{ label: "Dimensions", value: dimensionsStr }] : [])].map((r, i, arr) => (
          <div
            key={r.label}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: i < arr.length - 1 ? "1px solid #E8E8F0" : "none", background: i % 2 === 0 ? "#fff" : "#FAFBFF" }}
          >
            <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{r.label}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: r.label === "Ref" ? "#9CA3AF" : "#1A1A2E", fontWeight: r.label === "Ref" ? 400 : 500, fontFamily: r.label === "Ref" ? "monospace" : "inherit" }}>
              {r.value}
              {r.label === "Cert No." && r.value && (
                <button
                  onClick={() => navigator.clipboard.writeText(r.value!)}
                  title="Copy to clipboard"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#9CA3AF", display: "flex", alignItems: "center" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Select button */}
      <button
        onClick={() => onSelect(stone)}
        style={{ width: "100%", padding: "12px 0", borderRadius: 10, background: "#635BFF", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "background .15s" }}
        onMouseEnter={e => (e.currentTarget.style.background = "#4F46E5")}
        onMouseLeave={e => (e.currentTarget.style.background = "#635BFF")}
      >Select Stone</button>
    </div>
  );
}
