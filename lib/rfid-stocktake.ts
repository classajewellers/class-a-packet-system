/**
 * Stocktake grouping for the handheld count.
 * Blank tags are unknown rows whose EPC still has the Impinj prefix.
 * A count with a snapshot compares scans to those expected rows. Older
 * counts, with no expected rows, still use the live in-stock list.
 * Missing is not a scan result. It is stored only when a manager finishes.
 */
import { FALLBACK_STATUS_OPTIONS } from "./pieceResolution";
import { missingEpcGroup } from "./rfid-scan";

export const STOCKTAKE_SETUP_MESSAGE = "Stocktake isn't set up yet";

export const IN_STOCK_STATUS = "in_stock";

export type StocktakeStatus = "in_progress" | "completed" | "cancelled";
export type StoredResult = "found" | "wrong_location" | "unknown" | "not_in_stock";

export type StocktakeCounts = {
  found: number;
  missing: number;
  elsewhere: number;
  notInStock: number;
  unknown: number;
  blank: number;
  notTaggedSeen: number;
  notTaggedUnchecked: number;
  soldDuring: number;
  movedDuring: number;
};

export type ExpectedPiece = {
  pieceId: string;
  sku: string | null;
  metal: string | null;
  status: string | null;
  locationName: string | null;
};

export type StoredLine = {
  id: string;
  epc: string | null;
  sku: string | null;
  pieceId: string | null;
  result: StoredResult;
  metal: string | null;
  status: string | null;
  locationName: string | null;
  locationId: string | null;
};

export type StocktakeRow = {
  key: string;
  epc: string | null;
  sku: string | null;
  pieceId: string | null;
  metal: string | null;
  status: string | null;
  locationName: string | null;
  locationId: string | null;
  movedHere: boolean;
  detail?: string | null;
  seenAt?: string | null;
  seenByName?: string | null;
};

export type StocktakeGroups = {
  found: StocktakeRow[];
  missing: StocktakeRow[];
  elsewhere: StocktakeRow[];
  notInStock: StocktakeRow[];
  unknown: StocktakeRow[];
  blank: StocktakeRow[];
  notTagged: StocktakeRow[];
  soldDuring: StocktakeRow[];
  movedDuring: StocktakeRow[];
};

/** One in-stock piece frozen when the count started. */
export type SnapshotPiece = {
  pieceId: string;
  sku: string | null;
  metal: string | null;
  epc: string | null;
  snapshotLocationId: string | null;
  snapshotStatus: string;
  liveStatus: string | null;
  liveLocationId: string | null;
  liveLocationLabel: string | null;
  seenAt: string | null;
  seenByName: string | null;
};

export type SnapshotKind = "sold" | "moved" | "untagged" | "missing" | "in_count";

export type StocktakeSession = {
  id: string;
  status: StocktakeStatus;
  location_id: string;
  location_name: string | null;
  started_at: string;
  finished_at: string | null;
  started_by_name: string | null;
  finished_by_name: string | null;
};

export type StocktakePayload = {
  stocktake: StocktakeSession;
  groups: StocktakeGroups;
  counts: StocktakeCounts;
  warnings: string[];
  /** Null on a v1 count. An empty array is a v2 count of an empty location. */
  snapshot?: SnapshotPiece[] | null;
};

/**
 * In stock at the count location is Found. In stock anywhere else, or with
 * no location, is Somewhere else. Any other piece status is not_in_stock.
 * An EPC with no Vault tag is Unknown. A SKU that matches nothing is ignored.
 */
export function classifyStocktakeHit(input: {
  hasPiece: boolean;
  hasEpc: boolean;
  status: string | null;
  locationId: string | null;
  countLocationId: string;
}): StoredResult | "ignore" {
  if (!input.hasPiece) return input.hasEpc ? "unknown" : "ignore";
  if (input.status !== IN_STOCK_STATUS) return "not_in_stock";
  if (input.locationId === input.countLocationId) return "found";
  return "wrong_location";
}

export type PlannedLine = {
  epc: string;
  sku: string | null;
  pieceId: string | null;
  result: StoredResult;
};

/** Drop an EPC this session already stored. Conflict key is (session, epc). */
export function planStocktakeInserts(existingEpcs: string[], incoming: PlannedLine[]): PlannedLine[] {
  const seen = new Set(existingEpcs);
  const planned: PlannedLine[] = [];
  for (const line of incoming) {
    if (seen.has(line.epc)) continue;
    seen.add(line.epc);
    planned.push(line);
  }
  return planned;
}

const READABLE_TAG_STATUSES = ["active", "printed", "pending"];

/** Usable tag for a piece: active, then printed, then pending. */
export function preferredTag(tags: { id?: string; epc: string; status: string }[]): { id: string | null; epc: string } | null {
  let best: { id: string | null; epc: string } | null = null;
  let bestRank = READABLE_TAG_STATUSES.length;
  for (const tag of tags) {
    const rank = READABLE_TAG_STATUSES.indexOf(tag.status);
    if (rank < 0 || rank >= bestRank) continue;
    bestRank = rank;
    best = { id: tag.id ?? null, epc: tag.epc.toLowerCase() };
  }
  return best;
}

/** EPC to store for a barcode hit. Damaged, retired and replaced tags are skipped. */
export function preferredTagEpc(tags: { epc: string; status: string }[]): string | null {
  return preferredTag(tags)?.epc ?? null;
}

/**
 * Sold wins over a move and over an untagged piece. A move wins over Missing.
 * Untagged pieces are never Missing. Our own Move here puts the piece back
 * at the snapshot location, so it does not count as moved.
 */
export function classifySnapshotRow(row: {
  snapshotEpc: string | null;
  snapshotLocationId: string | null;
  liveStatus: string | null;
  liveLocationId: string | null;
  scanned: boolean;
}): SnapshotKind {
  if (row.liveStatus && row.liveStatus !== IN_STOCK_STATUS) return "sold";
  if (row.liveStatus && (row.liveLocationId ?? null) !== (row.snapshotLocationId ?? null)) return "moved";
  if (!row.snapshotEpc) return "untagged";
  if (!row.scanned) return "missing";
  return "in_count";
}

export function statusDuringCount(status: string | null): string {
  if (!status || status === "sold") return "Sold during count";
  const label = FALLBACK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
  return `${label} during count`;
}

export function movedDuringCount(locationLabel: string | null): string {
  return `Moved during count (now at ${locationLabel || "another location"})`;
}

export function formatStocktakeCounts(counts: StocktakeCounts): string {
  const parts = [
    `Found ${counts.found}`,
    `Missing ${counts.missing}`,
  ];
  if (counts.soldDuring) parts.push(`Sold during count ${counts.soldDuring}`);
  if (counts.movedDuring) parts.push(`Moved during count ${counts.movedDuring}`);
  parts.push(`Somewhere else ${counts.elsewhere}`, `Unknown ${counts.unknown}`);
  if (counts.notInStock) parts.push(`Not in stock ${counts.notInStock}`);
  if (counts.blank) parts.push(`${counts.blank} blank`);
  return parts.join(" · ");
}

/** Own line, kept off the dot list so a v1 summary stays unchanged. */
export function formatNotTaggedSummary(counts: Pick<StocktakeCounts, "notTaggedSeen" | "notTaggedUnchecked">): string | null {
  const seen = counts.notTaggedSeen ?? 0;
  const unchecked = counts.notTaggedUnchecked ?? 0;
  if (seen + unchecked === 0) return null;
  return `Not tagged: ${seen} seen / ${unchecked} not checked`;
}

export function missingPieceIds(expectedIds: string[], scannedPieceIds: Array<string | null>): string[] {
  const scanned = new Set<string>();
  for (const id of scannedPieceIds) {
    if (id) scanned.add(id);
  }
  return expectedIds.filter((id) => !scanned.has(id));
}

function rowFromLine(line: StoredLine, movedHere: boolean): StocktakeRow {
  return {
    key: line.id,
    epc: line.epc,
    sku: line.sku,
    pieceId: line.pieceId,
    metal: line.metal,
    status: line.status,
    locationName: line.locationName,
    locationId: line.locationId,
    movedHere,
  };
}

function rowFromExpected(piece: ExpectedPiece): StocktakeRow {
  return {
    key: `missing:${piece.pieceId}`,
    epc: null,
    sku: piece.sku,
    pieceId: piece.pieceId,
    metal: piece.metal,
    status: piece.status,
    locationName: piece.locationName,
    locationId: null,
    movedHere: false,
  };
}

export function buildStocktakeGroups(
  lines: StoredLine[],
  missing: ExpectedPiece[],
  countLocationId: string,
): { groups: StocktakeGroups; counts: StocktakeCounts } {
  const found = lines.filter((line) => line.result === "found").map((line) => rowFromLine(line, false));
  const elsewhere = lines
    .filter((line) => line.result === "wrong_location")
    .map((line) => rowFromLine(line, !!line.locationId && line.locationId === countLocationId));
  const notInStock = lines.filter((line) => line.result === "not_in_stock").map((line) => rowFromLine(line, false));
  const unknownLines = lines.filter((line) => line.result === "unknown");
  const blank = unknownLines
    .filter((line) => !!line.epc && missingEpcGroup(line.epc) === "blank")
    .map((line) => rowFromLine(line, false));
  const unknown = unknownLines
    .filter((line) => !line.epc || missingEpcGroup(line.epc) === "unknown")
    .map((line) => rowFromLine(line, false));
  const missingRows = missing.map(rowFromExpected);
  const groups = {
    found,
    missing: missingRows,
    elsewhere,
    notInStock,
    unknown,
    blank,
    notTagged: [],
    soldDuring: [],
    movedDuring: [],
  };
  return {
    groups,
    counts: {
      found: found.length,
      missing: missingRows.length,
      elsewhere: elsewhere.length,
      notInStock: notInStock.length,
      unknown: unknown.length,
      blank: blank.length,
      notTaggedSeen: 0,
      notTaggedUnchecked: 0,
      soldDuring: 0,
      movedDuring: 0,
    },
  };
}

function snapshotRow(piece: SnapshotPiece, kind: SnapshotKind): StocktakeRow {
  let detail: string | null = null;
  if (kind === "sold") detail = statusDuringCount(piece.liveStatus);
  if (kind === "moved") detail = movedDuringCount(piece.liveLocationLabel);
  return {
    key: `${kind}:${piece.pieceId}`,
    epc: piece.epc,
    sku: piece.sku,
    pieceId: piece.pieceId,
    metal: piece.metal,
    status: kind === "sold" ? piece.liveStatus : piece.snapshotStatus,
    locationName: piece.liveLocationLabel,
    locationId: piece.liveLocationId,
    movedHere: false,
    detail,
    seenAt: piece.seenAt,
    seenByName: piece.seenByName,
  };
}

/**
 * v2 groups come from the snapshot. Scans of pieces that are not in it keep
 * the found / somewhere else / unknown / not in stock groups.
 */
export function assembleStocktake(input: {
  lines: StoredLine[];
  countLocationId: string;
  snapshot: SnapshotPiece[] | null | undefined;
  v1Missing: ExpectedPiece[];
}): { groups: StocktakeGroups; counts: StocktakeCounts } {
  if (!input.snapshot) return buildStocktakeGroups(input.lines, input.v1Missing, input.countLocationId);

  const scanned = new Set<string>();
  for (const line of input.lines) {
    if (line.pieceId) scanned.add(line.pieceId);
  }
  const hide = new Set<string>();
  const notTagged: StocktakeRow[] = [];
  const soldDuring: StocktakeRow[] = [];
  const movedDuring: StocktakeRow[] = [];
  const missing: StocktakeRow[] = [];
  let notTaggedSeen = 0;
  let notTaggedUnchecked = 0;
  for (const piece of input.snapshot) {
    const kind = classifySnapshotRow({
      snapshotEpc: piece.epc,
      snapshotLocationId: piece.snapshotLocationId,
      liveStatus: piece.liveStatus,
      liveLocationId: piece.liveLocationId,
      scanned: scanned.has(piece.pieceId),
    });
    if (kind === "sold" || kind === "moved" || kind === "untagged") hide.add(piece.pieceId);
    if (kind === "sold") soldDuring.push(snapshotRow(piece, kind));
    else if (kind === "moved") movedDuring.push(snapshotRow(piece, kind));
    else if (kind === "untagged") {
      notTagged.push(snapshotRow(piece, kind));
      if (piece.seenAt) notTaggedSeen += 1;
      else notTaggedUnchecked += 1;
    } else if (kind === "missing") missing.push(snapshotRow(piece, kind));
  }
  const visible: StoredLine[] = [];
  for (const line of input.lines) {
    if (line.pieceId && hide.has(line.pieceId)) continue;
    visible.push(line);
  }
  const base = buildStocktakeGroups(visible, [], input.countLocationId);
  return {
    groups: { ...base.groups, missing, notTagged, soldDuring, movedDuring },
    counts: {
      ...base.counts,
      missing: missing.length,
      notTaggedSeen,
      notTaggedUnchecked,
      soldDuring: soldDuring.length,
      movedDuring: movedDuring.length,
    },
  };
}

function storedFromGroup(rows: StocktakeRow[] | undefined, result: StoredResult): StoredLine[] {
  return (rows ?? []).map((row) => ({
    id: row.key,
    epc: row.epc,
    sku: row.sku,
    pieceId: row.pieceId,
    result,
    metal: row.metal,
    status: row.status,
    locationName: row.locationName,
    locationId: row.locationId,
  }));
}

function linesFromGroups(groups: StocktakeGroups): StoredLine[] {
  return [
    ...storedFromGroup(groups.found, "found"),
    ...storedFromGroup(groups.elsewhere, "wrong_location"),
    ...storedFromGroup(groups.notInStock, "not_in_stock"),
    ...storedFromGroup(groups.unknown, "unknown"),
    ...storedFromGroup(groups.blank, "unknown"),
  ];
}

/**
 * Merge a scan response into the count already on screen.
 * Scanning must not wait for another full count load.
 */
export function absorbStocktakeScans(
  payload: StocktakePayload,
  added: StoredLine[],
  warnings: string[] = [],
): StocktakePayload {
  const lines = linesFromGroups(payload.groups);
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.epc) seen.add(line.epc.toLowerCase());
  }
  for (const line of added) {
    const epc = line.epc ? line.epc.toLowerCase() : "";
    if (epc && seen.has(epc)) continue;
    if (epc) seen.add(epc);
    lines.push({ ...line, epc: epc || line.epc });
  }
  if (payload.snapshot) {
    const view = assembleStocktake({
      lines,
      countLocationId: payload.stocktake.location_id,
      snapshot: payload.snapshot,
      v1Missing: [],
    });
    return {
      stocktake: payload.stocktake,
      groups: view.groups,
      counts: view.counts,
      warnings,
      snapshot: payload.snapshot,
    };
  }
  const scanned = new Set<string>();
  for (const line of lines) {
    if (line.pieceId) scanned.add(line.pieceId);
  }
  const missing: ExpectedPiece[] = [];
  for (const row of payload.groups.missing) {
    if (!row.pieceId || scanned.has(row.pieceId)) continue;
    missing.push({
      pieceId: row.pieceId,
      sku: row.sku,
      metal: row.metal,
      status: row.status,
      locationName: row.locationName,
    });
  }
  const view = buildStocktakeGroups(lines, missing, payload.stocktake.location_id);
  return {
    stocktake: payload.stocktake,
    groups: view.groups,
    counts: view.counts,
    warnings,
    snapshot: null,
  };
}

/** Staff marked an untagged piece seen, or undid it. Keeps the open count on screen. */
export function applyUntaggedSeen(
  payload: StocktakePayload,
  pieceId: string,
  seenAt: string | null,
  seenByName: string | null,
): StocktakePayload {
  if (!payload.snapshot) return payload;
  const snapshot = payload.snapshot.map((piece) => (
    piece.pieceId === pieceId ? { ...piece, seenAt, seenByName } : piece
  ));
  const view = assembleStocktake({
    lines: linesFromGroups(payload.groups),
    countLocationId: payload.stocktake.location_id,
    snapshot,
    v1Missing: [],
  });
  return {
    stocktake: payload.stocktake,
    groups: view.groups,
    counts: view.counts,
    warnings: payload.warnings,
    snapshot,
  };
}

export function isStocktakeSchemaError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message?.toLowerCase() ?? "";
  return (message.includes("stocktake_session") || message.includes("stocktake_scan") || message.includes("stocktake_expected"))
    && (message.includes("does not exist") || message.includes("schema cache"));
}
