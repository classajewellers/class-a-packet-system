"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { epcsFromLines, splitScanBuffer } from "@/lib/rfid-scan";
import { proximityGapMs, proximityLevel, readsPerSecond } from "@/lib/stocktake-live";
import { STOCKTAKE_MUTE_EVENT, beepTick, primeStocktakeAudio, setStocktakeMuted, stocktakeMuted } from "@/lib/stocktake-audio";
import { PieceThumb } from "@/components/PieceThumb";

/**
 * Listens only for one tag. Distance is how often that tag is typed, because
 * the keyboard wedge does not give a signal strength.
 */
export function StocktakeFinder({
  sku,
  pieceId,
  epc,
  tray,
  onScan,
  onClose,
  onCantFind,
  cantFindBusy = false,
  cantFindError = "",
}: {
  sku: string;
  pieceId: string;
  epc: string;
  tray: string | null;
  /** Called for a real read of this tag. Repeats are included; the caller dedupes saves. */
  onScan?: (epc: string) => void;
  onClose: () => void;
  /** Open count: just go back. Finished count: the caller marks Still missing. */
  onCantFind: () => void;
  cantFindBusy?: boolean;
  cantFindError?: string;
}) {
  const target = epc.toLowerCase();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stamps = useRef<number[]>([]);
  const [draft, setDraft] = useState("");
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  useEffect(() => {
    const sync = () => setMuted(stocktakeMuted());
    sync();
    window.addEventListener(STOCKTAKE_MUTE_EVENT, sync);
    return () => window.removeEventListener(STOCKTAKE_MUTE_EVENT, sync);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
    let timer = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const now = Date.now();
      const rate = readsPerSecond(stamps.current, now);
      setLevel(proximityLevel(rate));
      const cutoff = now - 2000;
      if (stamps.current.length > 40) stamps.current = stamps.current.filter((ts) => ts >= cutoff);
      beepTick();
      timer = window.setTimeout(tick, proximityGapMs(rate));
    };
    timer = window.setTimeout(tick, 60);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, []);

  function ingest(value: string) {
    const { complete, rest } = splitScanBuffer(value);
    if (complete.length) {
      for (const read of epcsFromLines(complete)) {
        if (read !== target) continue;
        stamps.current.push(Date.now());
        onScan?.(read);
      }
    }
    setDraft(rest);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "#F9FAFB", overflow: "auto", padding: "16px 16px 176px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <button type="button" onClick={onClose} style={backLink}>Back</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <h1 style={{ flex: 1, fontSize: 22, fontWeight: 800, margin: 0 }}>Find this ring</h1>
          <button
            type="button"
            aria-pressed={muted}
            onClick={() => {
              primeStocktakeAudio();
              setStocktakeMuted(!muted);
            }}
            style={muteButton}
          >
            {muted ? "Muted" : "Sound"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <PieceThumb pieceId={pieceId} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, wordBreak: "break-all" }}>{sku}</div>
            {tray && <div style={{ fontSize: 16, color: "#374151", marginTop: 2 }}>Expected tray {tray}</div>}
          </div>
        </div>
        <div aria-label="Closeness" style={{ marginTop: 18, height: 16, borderRadius: 8, background: "#E5E7EB", overflow: "hidden" }}>
          <div style={{ width: `${Math.round(level * 100)}%`, height: "100%", background: level > 0.66 ? "#16A34A" : level > 0.2 ? "#CA8A04" : "#9CA3AF" }} />
        </div>
        <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.4, margin: "12px 0 0" }}>
          Walk slowly, it beeps faster as you get closer.
        </p>
        <button
          type="button"
          aria-expanded={hintOpen}
          onClick={() => setHintOpen((open) => !open)}
          style={hintLink}
        >
          Not beeping?
        </button>
        {hintOpen && (
          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.45, margin: "4px 0 0" }}>
            In InfoWedge, RFID settings, turn off Filter duplicate tags.
          </p>
        )}
        <textarea
          ref={inputRef}
          value={draft}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          rows={2}
          aria-label="Listening for this tag"
          placeholder="Listening for this tag"
          onChange={(event) => ingest(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            ingest(`${draft}\n`);
          }}
          onBlur={(event) => {
            const next = event.relatedTarget as HTMLElement | null;
            if (next?.closest("button")) return;
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
          style={{ width: "100%", boxSizing: "border-box", minHeight: 56, fontSize: 16, padding: 12, borderRadius: 10, border: "1px solid #D1D5DB" }}
        />
        {cantFindError && <p style={{ color: "#991B1B", fontSize: 14, margin: "10px 0 0" }}>{cantFindError}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 12, marginRight: 72 }}>
          <button type="button" onClick={onClose} style={foundButton}>Found it</button>
          <button type="button" onClick={onCantFind} disabled={cantFindBusy} style={cantButton}>
            {cantFindBusy ? "Saving…" : "Can't find it"}
          </button>
        </div>
      </div>
    </div>
  );
}

const backLink: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  minHeight: 44,
  fontSize: 16,
  fontWeight: 700,
  color: "#111827",
  cursor: "pointer",
};

const hintLink: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  marginTop: 4,
  minHeight: 32,
  fontSize: 14,
  fontWeight: 700,
  color: "#1D4ED8",
  cursor: "pointer",
};

const actionButton: CSSProperties = {
  flex: 1,
  minHeight: 52,
  borderRadius: 10,
  fontSize: 16,
  fontWeight: 700,
  padding: "8px 10px",
  cursor: "pointer",
};

const foundButton: CSSProperties = {
  ...actionButton,
  border: "none",
  background: "#111827",
  color: "#fff",
};

const cantButton: CSSProperties = {
  ...actionButton,
  border: "1px solid #D1D5DB",
  background: "#fff",
  color: "#111827",
};

const muteButton: CSSProperties = {
  minHeight: 40,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  background: "#fff",
  fontWeight: 700,
};
