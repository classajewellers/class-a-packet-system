/**
 * Live stocktake progress for a snapshot count.
 * Tagged expected pieces only. Untagged, sold, and moved stay out of the fraction.
 */
import {
  assembleStocktake,
  linesFromGroups,
  type SnapshotPiece,
  type StocktakeGroups,
  type StocktakePayload,
  type StocktakeRow,
  type StoredLine,
} from "@/lib/rfid-stocktake";

export type ReadKind = "new" | "repeat" | "unknown";

/** First read of an expected tag, a repeat of one already accepted, or not on this count. */
export function classifyRead(
  epc: string,
  seenEpcs: ReadonlySet<string>,
  expectedEpcs: ReadonlySet<string>,
): ReadKind {
  const key = epc.trim().toLowerCase();
  if (!key) return "unknown";
  if (seenEpcs.has(key)) return "repeat";
  if (!expectedEpcs.has(key)) return "unknown";
  return "new";
}

export function expectedEpcSet(pieces: { epc: string | null }[]): Set<string> {
  const set = new Set<string>();
  for (const piece of pieces) {
    if (piece.epc) set.add(piece.epc.toLowerCase());
  }
  return set;
}

export function trayCode(label: string | null | undefined): string | null {
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(" · ");
  return parts.length > 1 ? parts[0] : trimmed;
}

export type LiveProgress = {
  found: number;
  expected: number;
  stillToFind: StocktakeRow[];
  foundRows: StocktakeRow[];
  groups: StocktakeGroups;
};

function optimisticLine(piece: SnapshotPiece): StoredLine {
  return {
    id: `heard:${piece.pieceId}`,
    epc: piece.epc,
    sku: piece.sku,
    pieceId: piece.pieceId,
    result: "found",
    metal: piece.metal,
    status: piece.snapshotStatus,
    locationName: piece.snapshotLocationLabel ?? null,
    locationId: piece.snapshotLocationId,
  };
}

/**
 * `heardPieceIds` are tags just read on this phone, before the save comes back.
 * They leave Still to find immediately and count as found until the server says otherwise.
 */
export function liveProgress(
  payload: StocktakePayload,
  heardPieceIds: ReadonlySet<string>,
): LiveProgress {
  const snapshot = payload.snapshot ?? [];
  const lines = linesFromGroups(payload.groups);
  const lined = new Set<string>();
  for (const line of lines) {
    if (line.pieceId) lined.add(line.pieceId);
  }
  const extra: StoredLine[] = [];
  for (const piece of snapshot) {
    if (!piece.epc || !heardPieceIds.has(piece.pieceId) || lined.has(piece.pieceId)) continue;
    extra.push(optimisticLine(piece));
  }
  const view = assembleStocktake({
    lines: extra.length ? [...lines, ...extra] : lines,
    countLocationId: payload.stocktake.location_id ?? "",
    snapshot,
    v1Missing: [],
    scopeLocationIds: payload.scopeLocationIds,
  });
  const tagged = new Set<string>();
  for (const piece of snapshot) {
    if (piece.epc) tagged.add(piece.pieceId);
  }
  const located: StocktakeRow[] = [];
  const seen = new Set<string>();
  for (const row of [...view.groups.found, ...(view.groups.wrongTray ?? [])]) {
    if (!row.pieceId || !tagged.has(row.pieceId) || seen.has(row.pieceId)) continue;
    seen.add(row.pieceId);
    located.push(row);
  }
  const accounted = new Set<string>(seen);
  for (const row of [
    ...view.groups.missing,
    ...(view.groups.nearby ?? []),
    ...view.groups.elsewhere,
    ...view.groups.notInStock,
  ]) {
    if (row.pieceId && tagged.has(row.pieceId)) accounted.add(row.pieceId);
  }
  return {
    found: located.length,
    expected: accounted.size,
    stillToFind: view.groups.missing,
    foundRows: located,
    groups: view.groups,
  };
}
