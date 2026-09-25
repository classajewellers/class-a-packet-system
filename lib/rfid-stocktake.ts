/**
 * Pure stocktake classification. The live count, finish, and the scan API
 * all use this so a refresh renders the same four groups.
 * Blank versus unknown reuses missingEpcGroup from the handheld scan parser.
 */
import { missingEpcGroup } from "./rfid-scan";

export const STOCKTAKE_SETUP_MESSAGE =
  "Stocktake tables are not on this database yet. Apply migration 170_inventory_stocktake.sql on staging, then reload.";

export type StocktakeStatus = "in_progress" | "finished";
export type StocktakeResult = "found" | "elsewhere" | "unknown" | "blank" | "missing";

export type StocktakeCounts = {
  found: number;
  missing: number;
  elsewhere: number;
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
  result: StocktakeResult;
  movedHere: boolean;
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
};

/** In-stock text status the piece page and stock list already use. */
export const IN_STOCK_STATUS = "in_stock";

/**
 * A resolved piece that was on the expected snapshot is Found.
 * Any other resolved piece is Somewhere else (other location, or none).
 * An EPC with no Vault tag is Unknown, unless it still has the Impinj
 * factory prefix, in which case it is a blank. A SKU that matches nothing
 * is ignored, same as the handheld scan page.
 */
export function classifyStocktakeHit(input: {
  epc: string | null;
  pieceId: string | null;
  expectedIds: ReadonlySet<string>;
}): "found" | "elsewhere" | "unknown" | "blank" | "ignore" {
  if (!input.pieceId) {
    if (!input.epc) return "ignore";
    return missingEpcGroup(input.epc) === "blank" ? "blank" : "unknown";
  }
  return input.expectedIds.has(input.pieceId) ? "found" : "elsewhere";
}

export type PlannedLine = {
  epc: string | null;
  sku: string | null;
  pieceId: string | null;
  result: "found" | "elsewhere" | "unknown" | "blank";
  recordedLocationId: string | null;
};

/** Drop hits this session already stored. Unique per EPC and per piece. */
export function planStocktakeInserts(
  existing: { epc: string | null; pieceId: string | null }[],
  incoming: PlannedLine[],
): PlannedLine[] {
  const epcs = new Set(existing.map((row) => row.epc).filter((epc): epc is string => !!epc));
  const pieces = new Set(existing.map((row) => row.pieceId).filter((id): id is string => !!id));
  const planned: PlannedLine[] = [];
  for (const line of incoming) {
    if (line.epc && epcs.has(line.epc)) continue;
    if (line.pieceId && pieces.has(line.pieceId)) continue;
    if (line.epc) epcs.add(line.epc);
    if (line.pieceId) pieces.add(line.pieceId);
    planned.push(line);
  }
  return planned;
}

export function missingPieceIds(expectedIds: string[], scannedPieceIds: Array<string | null>): string[] {
  const scanned = new Set<string>();
  for (const id of scannedPieceIds) {
    if (id) scanned.add(id);
  }
  return expectedIds.filter((id) => !scanned.has(id));
}

function rowFromLine(line: StoredLine): StocktakeRow {
  return {
    key: line.id,
    epc: line.epc,
    sku: line.sku,
    pieceId: line.pieceId,
    metal: line.metal,
    status: line.status,
    locationName: line.locationName,
    locationId: line.locationId,
    movedHere: line.movedHere,
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
  status: StocktakeStatus,
  expected: ExpectedPiece[],
  lines: StoredLine[],
): { groups: StocktakeGroups; counts: StocktakeCounts } {
  const found = lines.filter((line) => line.result === "found").map(rowFromLine);
  const elsewhere = lines.filter((line) => line.result === "elsewhere").map(rowFromLine);
  const unknown = lines.filter((line) => line.result === "unknown").map(rowFromLine);
  const blank = lines.filter((line) => line.result === "blank").map(rowFromLine);

  let missing: StocktakeRow[];
  if (status === "finished") {
    missing = lines.filter((line) => line.result === "missing").map(rowFromLine);
  } else {
    const scanned = new Set(lines.map((line) => line.pieceId).filter((id): id is string => !!id));
    missing = expected.filter((piece) => !scanned.has(piece.pieceId)).map(rowFromExpected);
  }

  const groups = { found, missing, elsewhere, unknown, blank };
  return {
    groups,
    counts: {
      found: found.length,
      missing: missing.length,
      elsewhere: elsewhere.length,
      unknown: unknown.length,
      blank: blank.length,
    },
  };
}

export function isStocktakeSchemaError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message?.toLowerCase() ?? "";
  return message.includes("inventory_stocktake") && (message.includes("does not exist") || message.includes("schema cache"));
}
