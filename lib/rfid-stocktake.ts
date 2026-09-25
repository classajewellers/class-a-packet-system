/**
 * Stocktake grouping for the handheld count.
 * Blank tags are unknown rows whose EPC still has the Impinj prefix.
 * Missing is not a scan result: it is computed from in-stock pieces at the
 * location, and stored only when a manager finishes the count.
 */
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
};

export type StocktakeGroups = {
  found: StocktakeRow[];
  missing: StocktakeRow[];
  elsewhere: StocktakeRow[];
  notInStock: StocktakeRow[];
  unknown: StocktakeRow[];
  blank: StocktakeRow[];
};

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

/** EPC to store for a barcode hit. Damaged, retired and replaced tags are skipped. */
export function preferredTagEpc(tags: { epc: string; status: string }[]): string | null {
  let bestEpc: string | null = null;
  let bestRank = READABLE_TAG_STATUSES.length;
  for (const tag of tags) {
    const rank = READABLE_TAG_STATUSES.indexOf(tag.status);
    if (rank < 0 || rank >= bestRank) continue;
    bestRank = rank;
    bestEpc = tag.epc.toLowerCase();
  }
  return bestEpc;
}

export function formatStocktakeCounts(counts: StocktakeCounts): string {
  const parts = [
    `Found ${counts.found}`,
    `Missing ${counts.missing}`,
    `Somewhere else ${counts.elsewhere}`,
    `Unknown ${counts.unknown}`,
  ];
  if (counts.notInStock) parts.push(`Not in stock ${counts.notInStock}`);
  if (counts.blank) parts.push(`${counts.blank} blank`);
  return parts.join(" · ");
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
  const groups = { found, missing: missingRows, elsewhere, notInStock, unknown, blank };
  return {
    groups,
    counts: {
      found: found.length,
      missing: missingRows.length,
      elsewhere: elsewhere.length,
      notInStock: notInStock.length,
      unknown: unknown.length,
      blank: blank.length,
    },
  };
}

export function isStocktakeSchemaError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message?.toLowerCase() ?? "";
  return (message.includes("stocktake_session") || message.includes("stocktake_scan"))
    && (message.includes("does not exist") || message.includes("schema cache"));
}
