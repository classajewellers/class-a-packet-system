/**
 * Stocktake grouping for the handheld count.
 * Blank tags are unknown rows whose EPC still has the Impinj prefix.
 * A count with a snapshot compares scans to those expected rows. Older
 * counts, with no expected rows, still use the live in-stock list.
 * Missing is not a scan result. It is stored only when a manager finishes.
 */
import { compareLocations, formatLocationLabel } from "./location-label";
import { FALLBACK_STATUS_OPTIONS } from "./pieceResolution";
import { missingEpcGroup } from "./rfid-scan";

export const STOCKTAKE_SETUP_MESSAGE = "Stocktake isn't set up yet";

export const IN_STOCK_STATUS = "in_stock";

export type StocktakeStatus = "in_progress" | "completed" | "cancelled";
export type StocktakeKind = "location" | "zone" | "whole_shop";
export type StoredResult = "found" | "wrong_tray" | "nearby_zone" | "wrong_location" | "unknown" | "not_in_stock";

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
  resolvedFound: number;
  resolvedMissing: number;
  wrongTray: number;
  nearby: number;
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
  detail?: string | null;
  scannedLocationId?: string | null;
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
  snapshotLocationLabel?: string | null;
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
  wrongTray: StocktakeRow[];
  nearby: StocktakeRow[];
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
  resolution: "found" | "still_missing" | null;
  resolvedLocationId: string | null;
  snapshotLocationCode?: string | null;
  snapshotLocationLabel?: string | null;
};

export type SnapshotKind = "sold" | "moved" | "untagged" | "missing" | "in_count";

export type StocktakeSession = {
  id: string;
  status: StocktakeStatus;
  kind?: StocktakeKind;
  location_id: string | null;
  zone_id?: string | null;
  parent_session_id?: string | null;
  location_name: string | null;
  started_at: string;
  finished_at: string | null;
  started_by_name: string | null;
  finished_by_name: string | null;
};

export type StocktakeUnit = {
  /** Null until this zone or tray is opened and its snapshot is taken. */
  id: string | null;
  kind: "location" | "zone";
  name: string;
  status: StocktakeStatus;
  counts: StocktakeCounts;
  started: boolean;
  zoneId?: string | null;
  locationId?: string | null;
};

export const WHOLE_SHOP_PART_NOTE = "Part of the whole-shop count";

export function wholeShopProgressLabel(started: number, total: number): string {
  return `Whole shop · ${started} of ${total} zones started`;
}

export function sameZonePlaceDetail(place: string): string {
  return `In ${place} (same zone) — probably not moved`;
}

export function movedHereDetail(place: string): string {
  return `Moved to ${place} ✓`;
}

export type ZoneBoardLocation = { id: string; code: string | null; name: string };

export type ZoneBoardZone = {
  id: string;
  code: string | null;
  name: string;
  locations: ZoneBoardLocation[];
};

export type ZoneBoardSession = {
  id: string;
  status: StocktakeStatus;
  kind: StocktakeKind;
  zoneId: string | null;
  locationId: string | null;
  finishedAt: string | null;
  startedAt: string;
};

export type ZoneBoardRow = {
  id: string;
  name: string;
  lastCountedAt: string | null;
  open: boolean;
};

/** A multi-tray zone uses its name. A one-location zone is that location. */
export function zoneBoardLabel(zone: { name: string }, locations: { code: string | null; name: string }[]): string {
  if (locations.length === 1) return formatLocationLabel(locations[0]) || zone.name || "Zone";
  return zone.name || "Zone";
}

function laterIso(current: string | null, next: string | null): string | null {
  if (!next) return current;
  if (!current) return next;
  return next > current ? next : current;
}

/** One row per active zone, newest completed count, and whether a count is open. */
export function buildZoneBoard(zones: ZoneBoardZone[], sessions: ZoneBoardSession[]): ZoneBoardRow[] {
  const rows = zones.map((zone) => {
    const locationIds = new Set(zone.locations.map((location) => location.id));
    let lastCountedAt: string | null = null;
    let open = false;
    for (const session of sessions) {
      if (session.kind === "whole_shop") continue;
      const matches = session.kind === "zone"
        ? session.zoneId === zone.id
        : !!session.locationId && locationIds.has(session.locationId);
      if (!matches) continue;
      if (session.status === "in_progress") open = true;
      if (session.status === "completed") lastCountedAt = laterIso(lastCountedAt, session.finishedAt || session.startedAt);
    }
    return {
      id: zone.id,
      name: zoneBoardLabel(zone, zone.locations),
      lastCountedAt,
      open,
      code: zone.code,
    };
  });
  rows.sort((a, b) => compareLocations({ code: a.code, name: a.name }, { code: b.code, name: b.name }));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    lastCountedAt: row.lastCountedAt,
    open: row.open,
  }));
}

/**
 * Open counts a Start fresh must cancel before a new zone snapshot.
 * A location count inside the zone counts, including one with no zone_id.
 * Completed counts and other zones stay out. Whole-shop parents are not zone counts.
 */
export function openCountIdsInZone(
  zoneId: string,
  locationIds: readonly string[],
  sessions: {
    id: string;
    status: string;
    kind?: string | null;
    zoneId: string | null;
    locationId: string | null;
  }[],
): string[] {
  const locations = new Set(locationIds);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const session of sessions) {
    if (session.status !== "in_progress" || session.kind === "whole_shop") continue;
    const inZone = session.zoneId === zoneId || (!!session.locationId && locations.has(session.locationId));
    if (!inZone || seen.has(session.id)) continue;
    seen.add(session.id);
    ids.push(session.id);
  }
  return ids;
}

export type MoveTarget = { id: string; label: string };

export type ReportPiece = {
  pieceId: string;
  sku: string;
  description: string | null;
  metal: string | null;
  price: string | null;
  lastSeen: string | null;
  epcTail: string | null;
  epc: string | null;
  locationLabel: string;
  detail: string | null;
  resolution: "found" | "still_missing" | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolvedLocationLabel: string | null;
};

export type StocktakeReport = {
  stocktake: StocktakeSession;
  counts: StocktakeCounts;
  missingByLocation: { location: string; pieces: ReportPiece[] }[];
  notTaggedUnchecked: ReportPiece[];
  soldDuring: ReportPiece[];
  movedDuring: ReportPiece[];
  wrongTray: ReportPiece[];
  nearby: ReportPiece[];
  locations: { id: string; label: string }[];
  usesSnapshot: boolean;
};

export type StocktakePayload = {
  stocktake: StocktakeSession;
  groups: StocktakeGroups;
  counts: StocktakeCounts;
  warnings: string[];
  /** Null on a v1 count. An empty array is a v2 count of an empty location. */
  snapshot?: SnapshotPiece[] | null;
  /** Tray ids that still count as "here" on a zone count. */
  scopeLocationIds?: string[] | null;
  units?: StocktakeUnit[];
  moveTargets?: MoveTarget[];
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

/** Softer label when a location-count read is still inside the counted zone. */
export function annotateSameZoneLines(
  lines: StoredLine[],
  countLocationId: string,
  trays: readonly { id: string; code: string | null; zoneId: string | null }[],
): StoredLine[] {
  const byId = new Map(trays.map((tray) => [tray.id, tray]));
  const zoneId = byId.get(countLocationId)?.zoneId ?? null;
  if (!zoneId) return lines;
  return lines.map((line) => {
    if (line.result !== "wrong_location" || !line.locationId || line.detail) return line;
    const tray = byId.get(line.locationId);
    if (!tray?.zoneId || tray.zoneId !== zoneId) return line;
    const place = (tray.code || "").trim() || "this tray";
    return { ...line, detail: sameZonePlaceDetail(place) };
  });
}

/** A zone read is found on any tray in the zone. A different tray is wrong_tray. */
export function classifyZoneScan(input: {
  hasPiece: boolean;
  hasEpc: boolean;
  status: string | null;
  locationId: string | null;
  zoneLocationIds: readonly string[];
  neighbourLocationIds: readonly string[];
  snapshotLocationId: string | null;
  inSnapshot: boolean;
}): StoredResult | "ignore" {
  if (!input.hasPiece) return input.hasEpc ? "unknown" : "ignore";
  if (input.status !== IN_STOCK_STATUS) return "not_in_stock";
  const locationId = input.locationId ?? "";
  if (input.zoneLocationIds.includes(locationId)) {
    if (input.inSnapshot && input.snapshotLocationId && locationId !== input.snapshotLocationId) return "wrong_tray";
    return "found";
  }
  if (input.neighbourLocationIds.includes(locationId)) return "nearby_zone";
  return "wrong_location";
}

export function wrongTrayDetail(expectedCode: string | null): string {
  return `wrong tray (expected ${expectedCode || "another tray"})`;
}

export const NEARBY_READ_DETAIL = "read nearby, probably not moved";

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
  resolvedLocationId?: string | null;
  /** When set, any tray in this list is still inside the count. */
  scopeLocationIds?: readonly string[] | null;
}): SnapshotKind {
  if (row.liveStatus && row.liveStatus !== IN_STOCK_STATUS) return "sold";
  const scope = row.scopeLocationIds;
  const locationChanged = scope
    ? !!row.liveStatus && !scope.includes(row.liveLocationId ?? "")
    : !!row.liveStatus && (row.liveLocationId ?? null) !== (row.snapshotLocationId ?? null);
  const placedByResolution = locationChanged && !!row.resolvedLocationId && row.liveLocationId === row.resolvedLocationId;
  if (locationChanged && !placedByResolution) {
    // A zone read from outside stays on the scan (nearby or far), not Moved.
    if (!(scope && row.scanned)) return "moved";
  }
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
  const parts = [`Found ${counts.found}`];
  if (counts.wrongTray) parts.push(`Wrong tray ${counts.wrongTray}`);
  if (counts.nearby) parts.push(`Nearby ${counts.nearby}`);
  parts.push(`Missing ${counts.missing}`);
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

export function formatResolvedSummary(counts: Pick<StocktakeCounts, "resolvedFound" | "resolvedMissing">): string | null {
  const found = counts.resolvedFound ?? 0;
  const missing = counts.resolvedMissing ?? 0;
  if (found + missing === 0) return null;
  return `Resolved: ${found} found, ${missing} still missing`;
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
    detail: line.detail ?? null,
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
  const wrongTray = lines.filter((line) => line.result === "wrong_tray").map((line) => rowFromLine(line, false));
  const nearby = lines.filter((line) => line.result === "nearby_zone").map((line) => rowFromLine(line, false));
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
    wrongTray,
    nearby,
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
      resolvedFound: 0,
      resolvedMissing: 0,
      wrongTray: wrongTray.length,
      nearby: nearby.length,
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
    snapshotLocationLabel: piece.snapshotLocationLabel ?? null,
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
  scopeLocationIds?: readonly string[] | null;
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
  let resolvedFound = 0;
  let resolvedMissing = 0;
  for (const piece of input.snapshot) {
    const kind = classifySnapshotRow({
      snapshotEpc: piece.epc,
      snapshotLocationId: piece.snapshotLocationId,
      liveStatus: piece.liveStatus,
      liveLocationId: piece.liveLocationId,
      scanned: scanned.has(piece.pieceId),
      resolvedLocationId: piece.resolvedLocationId,
      scopeLocationIds: input.scopeLocationIds,
    });
    if (kind === "sold" || kind === "moved" || kind === "untagged") hide.add(piece.pieceId);
    if (kind === "sold") soldDuring.push(snapshotRow(piece, kind));
    else if (kind === "moved") movedDuring.push(snapshotRow(piece, kind));
    else if (kind === "untagged") {
      notTagged.push(snapshotRow(piece, kind));
      if (piece.seenAt) notTaggedSeen += 1;
      else notTaggedUnchecked += 1;
    } else if (kind === "missing") {
      missing.push(snapshotRow(piece, kind));
      if (piece.resolution === "found") resolvedFound += 1;
      else if (piece.resolution === "still_missing") resolvedMissing += 1;
    }
  }
  const codeByPiece = new Map<string, string | null>();
  for (const piece of input.snapshot) codeByPiece.set(piece.pieceId, piece.snapshotLocationCode ?? null);
  const visible: StoredLine[] = [];
  for (const line of input.lines) {
    if (line.pieceId && hide.has(line.pieceId)) continue;
    if (line.result === "wrong_tray" && !line.detail) {
      const code = line.pieceId ? codeByPiece.get(line.pieceId) ?? null : null;
      visible.push({ ...line, detail: wrongTrayDetail(code) });
    } else if (line.result === "nearby_zone" && !line.detail) {
      visible.push({ ...line, detail: NEARBY_READ_DETAIL });
    } else {
      visible.push(line);
    }
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
      resolvedFound,
      resolvedMissing,
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
    detail: row.detail ?? null,
  }));
}

/**
 * A successful Move here updates the open count before the next full load.
 * The piece leaves Somewhere else and shows up under Found with a clear tick.
 */
export function noteMovedHere(
  payload: StocktakePayload,
  pieceId: string,
  destination: { id: string | null; label: string },
): StocktakePayload {
  const detail = movedHereDetail(destination.label);
  const lines = linesFromGroups(payload.groups).map((line) => {
    if (line.pieceId !== pieceId) return line;
    if (line.result !== "wrong_location" && line.result !== "nearby_zone") return line;
    return {
      ...line,
      result: "found" as const,
      locationId: destination.id,
      locationName: destination.label,
      detail,
    };
  });
  const snapshot = payload.snapshot
    ? payload.snapshot.map((piece) => (
      piece.pieceId === pieceId
        ? {
          ...piece,
          liveLocationId: destination.id,
          liveLocationLabel: destination.label,
          resolvedLocationId: destination.id,
        }
        : piece
    ))
    : payload.snapshot;
  if (snapshot) {
    const view = assembleStocktake({
      lines,
      countLocationId: payload.stocktake.location_id ?? "",
      snapshot,
      v1Missing: [],
      scopeLocationIds: payload.scopeLocationIds,
    });
    return { ...payload, groups: view.groups, counts: view.counts, snapshot };
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
  const view = buildStocktakeGroups(lines, missing, payload.stocktake.location_id ?? "");
  return { ...payload, groups: view.groups, counts: view.counts, snapshot: null };
}

export function linesFromGroups(groups: StocktakeGroups): StoredLine[] {
  return [
    ...storedFromGroup(groups.found, "found"),
    ...storedFromGroup(groups.wrongTray, "wrong_tray"),
    ...storedFromGroup(groups.nearby, "nearby_zone"),
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
      countLocationId: payload.stocktake.location_id ?? "",
      snapshot: payload.snapshot,
      v1Missing: [],
      scopeLocationIds: payload.scopeLocationIds,
    });
    return {
      stocktake: payload.stocktake,
      groups: view.groups,
      counts: view.counts,
      warnings,
      snapshot: payload.snapshot,
      scopeLocationIds: payload.scopeLocationIds,
      units: payload.units,
      moveTargets: payload.moveTargets,
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
  const view = buildStocktakeGroups(lines, missing, payload.stocktake.location_id ?? "");
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
    countLocationId: payload.stocktake.location_id ?? "",
    snapshot,
    v1Missing: [],
    scopeLocationIds: payload.scopeLocationIds,
  });
  return {
    stocktake: payload.stocktake,
    groups: view.groups,
    counts: view.counts,
    warnings: payload.warnings,
    snapshot,
    scopeLocationIds: payload.scopeLocationIds,
    units: payload.units,
    moveTargets: payload.moveTargets,
  };
}

export function isStocktakeSchemaError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message?.toLowerCase() ?? "";
  return (message.includes("stocktake_session") || message.includes("stocktake_scan") || message.includes("stocktake_expected"))
    && (message.includes("does not exist") || message.includes("schema cache"));
}
