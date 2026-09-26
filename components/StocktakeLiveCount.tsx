"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { liveProgress, trayCode } from "@/lib/stocktake-live";
import { setStocktakeMuted, stocktakeMuted } from "@/lib/stocktake-audio";
import type { StocktakePayload, StocktakeRow } from "@/lib/rfid-stocktake";
import { PieceThumb } from "@/components/PieceThumb";

export function StocktakeLiveCount({
  payload,
  heardPieceIds,
  zoneCount,
  flash,
  toast,
  allowSeen,
  seeingId,
  onSeen,
  allowMove,
  movingId,
  onMoveHere,
}: {
  payload: StocktakePayload;
  heardPieceIds: ReadonlySet<string>;
  zoneCount: boolean;
  flash: boolean;
  toast: string;
  allowSeen: boolean;
  seeingId: string | null;
  onSeen: (row: StocktakeRow, seen: boolean) => void;
  allowMove: boolean;
  movingId: string | null;
  onMoveHere: (row: StocktakeRow) => void;
}) {
  const progress = liveProgress(payload, heardPieceIds);
  const [foundOpen, setFoundOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  useEffect(() => { setMuted(stocktakeMuted()); }, []);

  return (
    <div>
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#F9FAFB", paddingBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            aria-live="polite"
            style={{
              flex: 1,
              fontSize: 40,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "#111827",
              lineHeight: 1,
              padding: "8px 2px",
              borderRadius: 12,
              background: flash ? "#DCFCE7" : "transparent",
              transition: "background 150ms linear",
            }}
          >
            {progress.found} / {progress.expected}
          </div>
          <button
            type="button"
            aria-pressed={muted}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setStocktakeMuted(next);
            }}
            style={muteButton}
          >
            {muted ? "Muted" : "Sound"}
          </button>
        </div>
        {toast && (
          <div style={{ marginTop: 6, background: "#111827", color: "#fff", borderRadius: 10, padding: "8px 12px", fontWeight: 700 }}>
            {toast}
          </div>
        )}
      </div>

      <h2 style={sectionTitle}>Still to find ({progress.stillToFind.length})</h2>
      {progress.stillToFind.length === 0 && <p style={empty}>All tagged pieces have been read.</p>}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {progress.stillToFind.map((row) => (
          <StillRow key={row.key} row={row} tray={zoneCount ? trayCode(row.snapshotLocationLabel) : null} />
        ))}
      </div>

      <button
        type="button"
        aria-expanded={foundOpen}
        onClick={() => setFoundOpen((open) => !open)}
        style={foundToggle}
      >
        Found ({progress.found}) {foundOpen ? "▾" : "▸"}
      </button>
      {foundOpen && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {progress.foundRows.length === 0 && <p style={empty}>None yet.</p>}
          {progress.foundRows.map((row) => (
            <StillRow key={row.key} row={row} tray={zoneCount ? trayCode(row.snapshotLocationLabel) : null} extra={row.detail} />
          ))}
        </div>
      )}

      <NotTagged rows={progress.groups.notTagged ?? []} allowSeen={allowSeen} seeingId={seeingId} onSeen={onSeen} />
      <Extra title="Sold during count" rows={progress.groups.soldDuring ?? []} />
      <Extra title="Moved during count" rows={progress.groups.movedDuring ?? []} />
      <Extra title="Nearby" rows={progress.groups.nearby ?? []} />
      <Elsewhere
        rows={progress.groups.elsewhere}
        countLocationId={payload.stocktake.location_id}
        allowMove={allowMove}
        movingId={movingId}
        onMoveHere={onMoveHere}
      />
      <Extra title="Not in stock" rows={progress.groups.notInStock} />
      <Unknown rows={progress.groups.unknown} blank={progress.groups.blank} />
    </div>
  );
}

function StillRow({ row, tray, extra }: { row: StocktakeRow; tray: string | null; extra?: string | null }) {
  return (
    <div style={rowStyle}>
      <PieceThumb pieceId={row.pieceId} />
      <div style={{ flex: "1 1 0", minWidth: 0 }}>
        <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#111827", wordBreak: "break-all" }}>
          {row.sku || "—"}
        </div>
        {(tray || extra) && (
          <div style={{ fontSize: 13, color: "#4B5563", marginTop: 2 }}>{[tray, extra].filter(Boolean).join(" · ")}</div>
        )}
      </div>
    </div>
  );
}

function NotTagged({
  rows,
  allowSeen,
  seeingId,
  onSeen,
}: {
  rows: StocktakeRow[];
  allowSeen: boolean;
  seeingId: string | null;
  onSeen: (row: StocktakeRow, seen: boolean) => void;
}) {
  if (!rows.length) return null;
  return (
    <section style={{ marginTop: 16 }}>
      <h2 style={sectionTitle}>Not tagged ({rows.length})</h2>
      {rows.map((row) => (
        <div key={row.key} style={rowStyle}>
          <PieceThumb pieceId={row.pieceId} />
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700 }}>{row.sku || "—"}</div>
            <div style={{ fontSize: 13, color: "#4B5563", marginTop: 2 }}>
              {row.seenAt ? "Seen" : "No tag. Check this piece by eye."}
            </div>
          </div>
          {allowSeen && (
            <button
              type="button"
              onClick={() => onSeen(row, !row.seenAt)}
              disabled={seeingId === row.pieceId}
              style={seenButton}
            >
              {seeingId === row.pieceId ? "…" : row.seenAt ? "Undo" : "Seen"}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function Extra({ title, rows }: { title: string; rows: StocktakeRow[] }) {
  if (!rows.length) return null;
  return (
    <section>
      <h2 style={sectionTitle}>{title} ({rows.length})</h2>
      {rows.map((row) => (
        <StillRow key={row.key} row={row} tray={null} extra={row.detail} />
      ))}
    </section>
  );
}

function Elsewhere({
  rows,
  countLocationId,
  allowMove,
  movingId,
  onMoveHere,
}: {
  rows: StocktakeRow[];
  countLocationId: string | null;
  allowMove: boolean;
  movingId: string | null;
  onMoveHere: (row: StocktakeRow) => void;
}) {
  if (!rows.length) return null;
  return (
    <section>
      <h2 style={sectionTitle}>Somewhere else ({rows.length})</h2>
      {rows.map((row) => {
        const samePlace = !!countLocationId && row.locationId === countLocationId;
        return (
          <div key={row.key} style={rowStyle}>
            <PieceThumb pieceId={row.pieceId} />
            <div style={{ flex: "1 1 0", minWidth: 0 }}>
              <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700 }}>{row.sku || row.epc || "—"}</div>
              <div style={{ fontSize: 13, color: "#4B5563", marginTop: 2 }}>{row.locationName || "No location"}</div>
            </div>
            {allowMove && row.pieceId && !row.movedHere && !samePlace && (
              <button type="button" onClick={() => onMoveHere(row)} disabled={movingId === row.pieceId} style={seenButton}>
                {movingId === row.pieceId ? "…" : "Move here"}
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Unknown({ rows, blank }: { rows: StocktakeRow[]; blank: StocktakeRow[] }) {
  if (!rows.length && !blank.length) return null;
  return (
    <section>
      <h2 style={sectionTitle}>Unknown ({rows.length + blank.length})</h2>
      {rows.map((row) => (
        <div key={row.key} style={{ padding: "8px 0", borderBottom: "1px solid #E7E5E4", fontSize: 14 }}>
          <div style={{ fontWeight: 700 }}>Not in Vault</div>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#6B7280", wordBreak: "break-all" }}>{row.epc}</div>
        </div>
      ))}
      {blank.length > 0 && <p style={empty}>{blank.length} blank {blank.length === 1 ? "tag" : "tags"}</p>}
    </section>
  );
}

const sectionTitle: CSSProperties = { fontSize: 16, fontWeight: 700, color: "#111827", margin: "14px 0 6px" };
const empty: CSSProperties = { margin: "4px 0 8px", color: "#6B7280", fontSize: 14 };
const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 48,
  padding: "6px 0",
  borderBottom: "1px solid #E7E5E4",
};
const muteButton: CSSProperties = {
  flex: "0 0 auto",
  minHeight: 40,
  minWidth: 72,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  background: "#fff",
  fontWeight: 700,
  fontSize: 14,
};
const foundToggle: CSSProperties = {
  marginTop: 14,
  minHeight: 44,
  width: "100%",
  textAlign: "left",
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #E5E7EB",
  background: "#fff",
  fontSize: 16,
  fontWeight: 700,
};
const seenButton: CSSProperties = {
  flex: "0 0 auto",
  minHeight: 40,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid #D1D5DB",
  background: "#fff",
  fontWeight: 700,
};
