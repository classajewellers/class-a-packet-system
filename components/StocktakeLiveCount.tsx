"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { liveProgress, trayCode } from "@/lib/stocktake-live";
import { STOCKTAKE_MUTE_EVENT, setStocktakeMuted, stocktakeMuted } from "@/lib/stocktake-audio";
import type { MoveTarget, StocktakePayload, StocktakeRow } from "@/lib/rfid-stocktake";
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
  onFind,
  confirmPieceId,
  moveError,
  moveTargetId,
  moveTargets,
  onMoveTargetId,
  onConfirmMove,
  onCancelMove,
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
  onFind: (row: StocktakeRow) => void;
  confirmPieceId: string | null;
  moveError: string;
  moveTargetId: string;
  moveTargets: MoveTarget[];
  onMoveTargetId: (id: string) => void;
  onConfirmMove: (row: StocktakeRow) => void;
  onCancelMove: () => void;
}) {
  const progress = liveProgress(payload, heardPieceIds);
  const [foundOpen, setFoundOpen] = useState(false);
  const movedTick = progress.foundRows.some((row) => (row.detail || "").includes("✓"));
  useEffect(() => {
    if (movedTick) setFoundOpen(true);
  }, [movedTick]);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const sync = () => setMuted(stocktakeMuted());
    sync();
    window.addEventListener(STOCKTAKE_MUTE_EVENT, sync);
    return () => window.removeEventListener(STOCKTAKE_MUTE_EVENT, sync);
  }, []);

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
          <StillRow
            key={row.key}
            row={row}
            tray={zoneCount ? trayCode(row.snapshotLocationLabel) : null}
            action={row.epc ? <FindButton onClick={() => onFind(row)} /> : null}
          />
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
      {progress.groups.found.filter((row) => (row.detail || "").includes("✓") && !progress.foundRows.some((found) => found.pieceId && found.pieceId === row.pieceId)).map((row) => (
        <StillRow key={row.key} row={row} tray={null} extra={row.detail} />
      ))}
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
        confirmPieceId={confirmPieceId}
        moveError={moveError}
        zoneCount={zoneCount}
        moveTargetId={moveTargetId}
        moveTargets={moveTargets}
        onMoveTargetId={onMoveTargetId}
        onConfirmMove={onConfirmMove}
        onCancelMove={onCancelMove}
      />
      <Extra title="Not in stock" rows={progress.groups.notInStock} />
      <Unknown rows={progress.groups.unknown} blank={progress.groups.blank} />
    </div>
  );
}

function StillRow({ row, tray, extra, action }: { row: StocktakeRow; tray: string | null; extra?: string | null; action?: ReactNode }) {
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
      {action}
    </div>
  );
}

function FindButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={findButton}>
      Find this ring
    </button>
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
  confirmPieceId,
  moveError,
  zoneCount,
  moveTargetId,
  moveTargets,
  onMoveTargetId,
  onConfirmMove,
  onCancelMove,
}: {
  rows: StocktakeRow[];
  countLocationId: string | null;
  allowMove: boolean;
  movingId: string | null;
  onMoveHere: (row: StocktakeRow) => void;
  confirmPieceId: string | null;
  moveError: string;
  zoneCount: boolean;
  moveTargetId: string;
  moveTargets: MoveTarget[];
  onMoveTargetId: (id: string) => void;
  onConfirmMove: (row: StocktakeRow) => void;
  onCancelMove: () => void;
}) {
  if (!rows.length) return null;
  return (
    <section>
      <h2 style={sectionTitle}>Somewhere else ({rows.length})</h2>
      {rows.map((row) => {
        const samePlace = !!countLocationId && row.locationId === countLocationId;
        const confirming = !!row.pieceId && confirmPieceId === row.pieceId;
        const busy = movingId === row.pieceId;
        const sameZone = (row.detail || "").includes("(same zone)");
        const place = row.detail || row.locationName || "No location";
        return (
          <div key={row.key} style={{ ...rowStyle, flexWrap: "wrap" }}>
            <PieceThumb pieceId={row.pieceId} />
            <div style={{ flex: "1 1 0", minWidth: 0 }}>
              <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700 }}>{row.sku || row.epc || "—"}</div>
              <div style={{ fontSize: 13, marginTop: 2, color: sameZone ? "#6B7280" : "#111827", fontWeight: sameZone ? 400 : 600 }}>{place}</div>
            </div>
            {allowMove && row.pieceId && !row.movedHere && !samePlace && !confirming && (
              <button type="button" onClick={() => onMoveHere(row)} disabled={busy} style={seenButton}>
                {busy ? "Moving…" : "Move here"}
              </button>
            )}
            {confirming && (
              <div style={{ flex: "1 0 100%", display: "flex", flexDirection: "column", gap: 8, padding: "4px 0 8px" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Move {row.sku || "this piece"} here?</div>
                {zoneCount && (
                  <select aria-label="Tray" value={moveTargetId} onChange={(event) => onMoveTargetId(event.target.value)} style={{ width: "100%", minHeight: 48, fontSize: 16 }}>
                    <option value="">Choose a tray</option>
                    {moveTargets.map((target) => (
                      <option key={target.id} value={target.id}>{target.label}</option>
                    ))}
                  </select>
                )}
                {moveError && <div style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}>{moveError}</div>}
                <button
                  type="button"
                  disabled={busy || (zoneCount && !moveTargetId)}
                  onClick={() => onConfirmMove(row)}
                  style={{ ...seenButton, background: "#111827", color: "#fff", minHeight: 48 }}
                >
                  {busy ? "Moving…" : "Confirm move"}
                </button>
                <button type="button" disabled={busy} onClick={onCancelMove} style={{ ...seenButton, minHeight: 48 }}>
                  Cancel
                </button>
              </div>
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
const findButton: CSSProperties = {
  flex: "0 0 auto",
  minHeight: 40,
  maxWidth: 108,
  padding: "4px 8px",
  borderRadius: 8,
  border: "1px solid #111827",
  background: "#fff",
  color: "#111827",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.15,
};
