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
}: {
  sku: string;
  pieceId: string;
  epc: string;
  tray: string | null;
  /** Called for a real read of this tag. Repeats are included; the caller dedupes saves. */
  onScan?: (epc: string) => void;
  onClose: () => void;
}) {
  const target = epc.toLowerCase();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stamps = useRef<number[]>([]);
  const [draft, setDraft] = useState("");
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);

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
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "#F9FAFB", overflow: "auto", padding: "16px 16px 96px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
        <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.45 }}>
          The beep speeds up as this tag is read more often. This page only hears the tag number the gun types, not how strong the signal is. In DataWedge, open the profile, then RFID Input, Configure reader settings, and turn Filter duplicate tags off so the same tag keeps being sent while you hold the trigger.
        </p>
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
        <button
          type="button"
          onClick={onClose}
          style={{ marginTop: 12, minHeight: 48, width: "100%", border: "none", borderRadius: 10, background: "#111827", color: "#fff", fontSize: 16, fontWeight: 700 }}
        >
          Found it
        </button>
      </div>
    </div>
  );
}

const muteButton: CSSProperties = {
  minHeight: 40,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  background: "#fff",
  fontWeight: 700,
};
