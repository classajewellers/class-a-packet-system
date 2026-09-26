/**
 * Server-side stocktake reads and writes.
 *
 * stocktake_sessions and stocktake_scans force RLS, and app.tenant_id is
 * transaction-local, so the browser cannot see these rows. Every query here
 * uses the service-role client with the session tenant and an explicit
 * tenant_id filter (tenantScoped), the same way inventory_rfid_tags is read.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { tenantScoped } from "@/lib/tenantScoped";
import { applyHandheldTagReads } from "@/lib/rfid-tag-read";
import { isUuid, loadLocationLabels, loadLocations, uuidIds } from "@/lib/load-locations";
import { formatLocationLabel, locationsForPicker } from "@/lib/location-label";
import { movePieceToLocation } from "@/lib/move-piece-location";
import {
  IN_STOCK_STATUS,
  annotateSameZoneLines,
  assembleStocktake,
  buildStocktakeGroups,
  classifySnapshotRow,
  classifyStocktakeHit,
  classifyZoneScan,
  isStocktakeSchemaError,
  NEARBY_READ_DETAIL,
  missingPieceIds,
  planStocktakeInserts,
  preferredTag,
  preferredTagEpc,
  type ExpectedPiece,
  type PlannedLine,
  type ReportPiece,
  type SnapshotPiece,
  type MoveTarget,
  type StocktakeCounts,
  type StocktakeKind,
  type StocktakePayload,
  type StocktakeReport,
  type StocktakeSession,
  type StocktakeStatus,
  type StocktakeUnit,
  type StoredLine,
  type StoredResult,
  WHOLE_SHOP_PART_NOTE,
  wholeShopProgressLabel,
} from "@/lib/rfid-stocktake";
import { compareLocations, isActiveLocation } from "@/lib/location-label";

const EPC_RE = /^[0-9a-f]{24}$/;
const PIECE_COLUMNS = "id, sku, status, location_id, metal_karat, metal_colour";

type PieceRow = {
  id: string;
  sku: string | null;
  status: string | null;
  location_id: string | null;
  metal_karat: string | null;
  metal_colour: string | null;
};

type SessionRow = {
  id: string;
  status: string;
  location_id: string | null;
  started_at: string;
  finished_at: string | null;
  started_by: string | null;
  finished_by: string | null;
  confirmed_missing_piece_ids: string[] | null;
  snapshot_at: string | null;
  kind: StocktakeKind;
  zone_id: string | null;
  parent_session_id: string | null;
};

type ExpectedDbRow = {
  piece_id: string;
  snapshot_location_id: string | null;
  snapshot_status: string;
  snapshot_sku: string;
  snapshot_epc: string | null;
  snapshot_rfid_tag_id: string | null;
  seen_by: string | null;
  seen_at: string | null;
  resolution: "found" | "still_missing" | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolved_location_id: string | null;
  resolution_movement_id: string | null;
};

const SESSION_COLUMNS = "id, status, location_id, started_at, finished_at, started_by, finished_by, confirmed_missing_piece_ids";
const SESSION_RICH = `${SESSION_COLUMNS}, snapshot_at, kind, zone_id, parent_session_id`;
const EXPECTED_COLUMNS = "piece_id, snapshot_location_id, snapshot_status, snapshot_sku, snapshot_epc, snapshot_rfid_tag_id, seen_by, seen_at, resolution, resolved_by, resolved_at, resolved_location_id, resolution_movement_id";

type ScanRow = {
  id: string;
  epc: string;
  piece_id: string | null;
  result_group: string;
  scanned_at: string;
};

export type ResolvedPiece = {
  id: string;
  sku: string | null;
  locationId: string | null;
  metal: string | null;
  status: string | null;
};

export type EpcHit = { epc: string; piece: ResolvedPiece | null; tagStatus: string | null };
export type SkuHit = { sku: string; piece: ResolvedPiece | null; tagEpc: string | null; tagStatus: string | null };

export type { StocktakePayload };

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function metalOf(row: PieceRow | undefined): string | null {
  if (!row) return null;
  const metal = [asText(row.metal_karat), asText(row.metal_colour)].filter(Boolean).join(" ");
  return metal || null;
}

function pieceOf(row: PieceRow): ResolvedPiece {
  return {
    id: String(row.id),
    sku: asText(row.sku),
    locationId: asText(row.location_id),
    metal: metalOf(row),
    status: asText(row.status),
  };
}

function asStatus(value: string): StocktakeStatus {
  if (value === "completed" || value === "cancelled") return value;
  return "in_progress";
}

function uuidList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function relationMissing(error: { code?: string; message?: string } | null, name: string): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = error.message?.toLowerCase() ?? "";
  return message.includes(name) && (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find"));
}

function columnMissing(error: { code?: string; message?: string } | null, name: string): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") {
    const message = error.message?.toLowerCase() ?? "";
    return !message || message.includes(name) || message.includes("schema cache") || message.includes("could not find");
  }
  const message = error.message?.toLowerCase() ?? "";
  return message.includes(name) && (message.includes("does not exist") || message.includes("schema cache") || message.includes("could not find"));
}

function schemaOrMessage(error: { code?: string; message?: string } | null): { schema: boolean; message: string } | null {
  if (!error) return null;
  if (isStocktakeSchemaError(error)) return { schema: true, message: error.message ?? "missing table" };
  return { schema: false, message: error.message ?? "Stocktake failed" };
}

async function nameMap(supabase: SupabaseClient, tenantId: string, ids: readonly unknown[]): Promise<Map<string, string>> {
  const unique = uuidIds(ids);
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const { data } = await tenantScoped(supabase, tenantId)
    .from("profiles")
    .select("id, full_name, email")
    .in("id", unique);
  for (const row of data ?? []) {
    const name = asText(row.full_name) || asText(row.email);
    if (name) map.set(String(row.id), name);
  }
  return map;
}

async function loadPieces(supabase: SupabaseClient, tenantId: string, ids: readonly unknown[]): Promise<Map<string, PieceRow>> {
  const map = new Map<string, PieceRow>();
  const unique = uuidIds(ids);
  if (!unique.length) return map;
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("inventory_pieces")
    .select(PIECE_COLUMNS)
    .in("id", unique);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as PieceRow[]) map.set(String(row.id), row);
  return map;
}

async function locationNames(supabase: SupabaseClient, tenantId: string, ids: readonly unknown[]): Promise<Map<string, string>> {
  return loadLocationLabels(supabase, tenantId, ids, { markHidden: true });
}

async function liveExpected(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
): Promise<PieceRow[]> {
  if (!isUuid(locationId)) return [];
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("inventory_pieces")
    .select(PIECE_COLUMNS)
    .eq("location_id", locationId)
    .eq("status", IN_STOCK_STATUS);
  if (error) throw new Error(error.message);
  return (data ?? []) as PieceRow[];
}

function expectedFromPieces(rows: PieceRow[], names: Map<string, string>, onlyIds?: Set<string>): ExpectedPiece[] {
  const out: ExpectedPiece[] = [];
  for (const row of rows) {
    if (onlyIds && !onlyIds.has(String(row.id))) continue;
    const locationId = asText(row.location_id);
    out.push({
      pieceId: String(row.id),
      sku: asText(row.sku),
      metal: metalOf(row),
      status: asText(row.status),
      locationName: locationId ? names.get(locationId) ?? null : null,
    });
  }
  return out;
}

function linesFromScans(scans: ScanRow[], pieces: Map<string, PieceRow>, names: Map<string, string>): StoredLine[] {
  return scans.map((row) => {
    const pieceId = asText(row.piece_id);
    const piece = pieceId ? pieces.get(pieceId) : undefined;
    const locationId = piece ? asText(piece.location_id) : null;
    const result = row.result_group as StoredResult;
    return {
      id: String(row.id),
      epc: asText(row.epc),
      sku: piece ? asText(piece.sku) : null,
      pieceId,
      result,
      metal: metalOf(piece),
      status: piece ? asText(piece.status) : null,
      locationName: locationId ? names.get(locationId) ?? null : null,
      locationId,
    };
  });
}

function asKind(value: unknown): StocktakeKind {
  if (value === "zone" || value === "whole_shop") return value;
  return "location";
}

function normaliseSession(row: Record<string, unknown>): SessionRow {
  return {
    id: String(row.id),
    status: String(row.status ?? "in_progress"),
    location_id: asText(row.location_id),
    started_at: String(row.started_at),
    finished_at: row.finished_at ? String(row.finished_at) : null,
    started_by: asText(row.started_by),
    finished_by: asText(row.finished_by),
    confirmed_missing_piece_ids: uuidList(row.confirmed_missing_piece_ids),
    snapshot_at: row.snapshot_at ? String(row.snapshot_at) : null,
    kind: asKind(row.kind),
    zone_id: asText(row.zone_id),
    parent_session_id: asText(row.parent_session_id),
  };
}

async function querySessions(
  supabase: SupabaseClient,
  tenantId: string,
  stocktakeId?: string,
): Promise<{ ok: true; rows: SessionRow[] } | { ok: false; status: number; error: string; schema?: boolean }> {
  const run = (columns: string) => {
    let query = tenantScoped(supabase, tenantId).from("stocktake_sessions").select(columns);
    if (stocktakeId) return query.eq("id", stocktakeId).maybeSingle();
    return query.is("parent_session_id", null).order("started_at", { ascending: false }).limit(100);
  };
  let result = await run(SESSION_RICH);
  if (columnMissing(result.error, "kind") || columnMissing(result.error, "zone_id") || columnMissing(result.error, "parent_session")) {
    let query = tenantScoped(supabase, tenantId).from("stocktake_sessions").select(`${SESSION_COLUMNS}, snapshot_at`);
    result = stocktakeId
      ? await query.eq("id", stocktakeId).maybeSingle()
      : await query.order("started_at", { ascending: false }).limit(100);
  }
  if (columnMissing(result.error, "snapshot_at")) {
    let query = tenantScoped(supabase, tenantId).from("stocktake_sessions").select(SESSION_COLUMNS);
    result = stocktakeId
      ? await query.eq("id", stocktakeId).maybeSingle()
      : await query.order("started_at", { ascending: false }).limit(100);
  }
  const failed = schemaOrMessage(result.error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  const raw = stocktakeId ? (result.data ? [result.data] : []) : (result.data ?? []);
  return { ok: true, rows: (raw as Record<string, unknown>[]).map(normaliseSession) };
}

async function loadSession(
  supabase: SupabaseClient,
  tenantId: string,
  stocktakeId: string,
): Promise<{ ok: true; session: SessionRow } | { ok: false; status: number; error: string; schema?: boolean }> {
  const loaded = await querySessions(supabase, tenantId, stocktakeId);
  if (!loaded.ok) return loaded;
  const session = loaded.rows[0];
  if (!session) return { ok: false, status: 404, error: "Count not found" };
  return { ok: true, session };
}

async function loadExpected(
  supabase: SupabaseClient,
  tenantId: string,
  stocktakeId: string,
): Promise<{ available: boolean; rows: ExpectedDbRow[] }> {
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_expected")
    .select(EXPECTED_COLUMNS)
    .eq("session_id", stocktakeId);
  if (error) {
    if (relationMissing(error, "stocktake_expected") || columnMissing(error, "snapshot_")) return { available: false, rows: [] };
    throw new Error(error.message);
  }
  return { available: true, rows: ((data ?? []) as ExpectedDbRow[]).map((row) => ({
    ...row,
    piece_id: String(row.piece_id),
    snapshot_epc: row.snapshot_epc ? String(row.snapshot_epc).toLowerCase() : null,
    snapshot_rfid_tag_id: row.snapshot_rfid_tag_id ? String(row.snapshot_rfid_tag_id) : null,
    seen_by: row.seen_by ? String(row.seen_by) : null,
    seen_at: row.seen_at ? String(row.seen_at) : null,
    snapshot_location_id: row.snapshot_location_id ? String(row.snapshot_location_id) : null,
    resolution: row.resolution === "found" || row.resolution === "still_missing" ? row.resolution : null,
    resolved_by: row.resolved_by ? String(row.resolved_by) : null,
    resolved_at: row.resolved_at ? String(row.resolved_at) : null,
    resolved_location_id: row.resolved_location_id ? String(row.resolved_location_id) : null,
    resolution_movement_id: row.resolution_movement_id ? String(row.resolution_movement_id) : null,
  })) };
}

export async function getStocktake(
  supabase: SupabaseClient,
  tenantId: string,
  stocktakeId: string,
  warnings: string[] = [],
): Promise<{ ok: true; payload: StocktakePayload } | { ok: false; status: number; error: string; schema?: boolean }> {
  const loaded = await loadSession(supabase, tenantId, stocktakeId);
  if (!loaded.ok) return loaded;
  const session = loaded.session;
  if (session.kind === "whole_shop") return presentWholeShop(supabase, tenantId, session, warnings);
  const status = asStatus(session.status);
  const confirmedIds = uuidList(session.confirmed_missing_piece_ids);

  const scanQuery = tenantScoped(supabase, tenantId)
    .from("stocktake_scans")
    .select("id, epc, piece_id, result_group, scanned_at")
    .eq("session_id", stocktakeId)
    .order("scanned_at", { ascending: true });
  const peopleQuery = nameMap(
    supabase,
    tenantId,
    [session.started_by, session.finished_by].filter((id): id is string => typeof id === "string"),
  );

  let scans: ScanRow[];
  let expectedLoad: { available: boolean; rows: ExpectedDbRow[] };
  let people: Map<string, string>;
  try {
    const [scanResult, expectedResult, peopleResult] = await Promise.all([
      scanQuery,
      loadExpected(supabase, tenantId, stocktakeId),
      peopleQuery,
    ]);
    const scanFailed = schemaOrMessage(scanResult.error);
    if (scanFailed) return { ok: false, status: scanFailed.schema ? 503 : 500, error: scanFailed.message, schema: scanFailed.schema };
    scans = (scanResult.data ?? []) as ScanRow[];
    expectedLoad = expectedResult;
    people = peopleResult;
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load the count" };
  }

  const useV2 = expectedLoad.available && (expectedLoad.rows.length > 0 || !!session.snapshot_at);
  let v1Rows: PieceRow[] = [];
  if (!useV2) {
    try {
      if (status === "in_progress" && session.location_id) {
        v1Rows = await liveExpected(supabase, tenantId, session.location_id);
      } else {
        const found = await loadPieces(supabase, tenantId, confirmedIds);
        v1Rows = confirmedIds.map((id) => found.get(id) ?? {
          id,
          sku: null,
          status: null,
          location_id: null,
          metal_karat: null,
          metal_colour: null,
        });
      }
    } catch (err) {
      return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load the count" };
    }
  }

  const pieces = new Map<string, PieceRow>();
  for (const row of v1Rows) pieces.set(String(row.id), row);
  const pieceIds: string[] = [];
  if (useV2) {
    for (const row of expectedLoad.rows) pieceIds.push(row.piece_id);
  }
  for (const row of scans) {
    if (row.piece_id && !pieces.has(String(row.piece_id))) pieceIds.push(String(row.piece_id));
  }
  const seenIds: string[] = [];
  if (useV2) {
    for (const row of expectedLoad.rows) {
      if (row.seen_by && !people.has(row.seen_by)) seenIds.push(row.seen_by);
    }
  }

  let names: Map<string, string>;
  try {
    const [extra, seenPeople] = await Promise.all([
      pieceIds.length ? loadPieces(supabase, tenantId, pieceIds) : Promise.resolve(new Map<string, PieceRow>()),
      seenIds.length ? nameMap(supabase, tenantId, seenIds) : Promise.resolve(new Map<string, string>()),
    ]);
    extra.forEach((row, id) => pieces.set(id, row));
    seenPeople.forEach((name, id) => people.set(id, name));
    const locationIds = session.location_id ? [session.location_id] : [];
    pieces.forEach((row) => {
      if (row.location_id) locationIds.push(row.location_id);
    });
    if (useV2) {
      for (const row of expectedLoad.rows) {
        if (row.snapshot_location_id) locationIds.push(row.snapshot_location_id);
      }
    }
    names = await locationNames(supabase, tenantId, locationIds);
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load the count" };
  }

  let lines = linesFromScans(scans, pieces, names);
  if (session.kind === "location" && session.location_id) {
    const placeCatalogue = await loadZoneCatalogue(supabase, tenantId);
    if (placeCatalogue.ok) lines = annotateSameZoneLines(lines, session.location_id, placeCatalogue.trays);
  }
  const countLocationId = session.location_id ?? "";
  let scopeLocationIds: string[] | null = null;
  let moveTargets: MoveTarget[] | undefined;
  let zoneLabel: string | null = null;
  if (session.kind === "zone" && session.zone_id) {
    const catalogue = await loadZoneCatalogue(supabase, tenantId);
    if (!catalogue.ok) return { ok: false, status: catalogue.schema ? 503 : 500, error: catalogue.error, schema: catalogue.schema };
    const scope = scopeForZone(session.zone_id, catalogue);
    scopeLocationIds = scope.locationIds;
    moveTargets = scope.trays.map((tray) => ({ id: tray.id, label: tray.label }));
    zoneLabel = catalogue.zones.find((zone) => zone.id === session.zone_id)?.label ?? null;
    scope.trays.forEach((tray) => names.set(tray.id, tray.label));
  }
  let view: { groups: StocktakePayload["groups"]; counts: StocktakeCounts };
  let snapshot: SnapshotPiece[] | null = null;
  if (useV2) {
    snapshot = expectedLoad.rows.map((row) => {
      const piece = pieces.get(row.piece_id);
      const liveLocationId = piece ? asText(piece.location_id) : null;
      const snapshotLabel = row.snapshot_location_id ? names.get(row.snapshot_location_id) ?? null : null;
      return {
        pieceId: row.piece_id,
        sku: asText(row.snapshot_sku) || (piece ? asText(piece.sku) : null),
        metal: metalOf(piece),
        epc: row.snapshot_epc,
        snapshotLocationId: row.snapshot_location_id,
        snapshotLocationCode: codeFromLabel(snapshotLabel),
        snapshotLocationLabel: snapshotLabel,
        snapshotStatus: row.snapshot_status || IN_STOCK_STATUS,
        liveStatus: piece ? asText(piece.status) : null,
        liveLocationId,
        liveLocationLabel: liveLocationId ? names.get(liveLocationId) ?? null : null,
        seenAt: row.seen_at,
        seenByName: row.seen_by ? people.get(row.seen_by) ?? null : null,
        resolution: row.resolution,
        resolvedLocationId: row.resolved_location_id,
      };
    });
    view = assembleStocktake({ lines, countLocationId, snapshot, v1Missing: [], scopeLocationIds });
  } else {
    const scannedIds = scans.map((row) => (row.piece_id ? String(row.piece_id) : null));
    const missingIds = new Set(missingPieceIds(v1Rows.map((row) => String(row.id)), scannedIds));
    const missing = expectedFromPieces(v1Rows.filter((row) => missingIds.has(String(row.id))), names);
    view = buildStocktakeGroups(lines, missing, countLocationId);
  }

  const stocktake: StocktakeSession = {
    id: String(session.id),
    status,
    kind: session.kind,
    location_id: session.location_id,
    zone_id: session.zone_id,
    parent_session_id: session.parent_session_id,
    location_name: session.kind === "zone" ? zoneLabel : (session.location_id ? names.get(session.location_id) ?? null : null),
    started_at: String(session.started_at),
    finished_at: session.finished_at ? String(session.finished_at) : null,
    started_by_name: session.started_by ? people.get(session.started_by) ?? null : null,
    finished_by_name: session.finished_by ? people.get(session.finished_by) ?? null : null,
  };

  return {
    ok: true,
    payload: { stocktake, groups: view.groups, counts: view.counts, warnings, snapshot, scopeLocationIds, moveTargets },
  };
}

export type ListedStocktake = StocktakeSession & { counts: StocktakeCounts };

export async function listStocktakes(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true; stocktakes: ListedStocktake[]; warning: string | null } | { ok: false; status: number; error: string; schema?: boolean }> {
  const listed = await querySessions(supabase, tenantId);
  if (!listed.ok) return listed;
  const sessions = listed.rows.filter((row) => !row.parent_session_id);
  if (!sessions.length) return { ok: true, stocktakes: [], warning: null };

  const ids = uuidIds(sessions.map((row) => row.id));
  const openLocationIds = uuidIds(
    sessions
      .filter((row) => asStatus(row.status) === "in_progress" && row.kind === "location")
      .map((row) => row.location_id),
  );
  const pieceQuery = openLocationIds.length
    ? tenantScoped(supabase, tenantId)
      .from("inventory_pieces")
      .select("id, location_id")
      .eq("status", IN_STOCK_STATUS)
      .in("location_id", openLocationIds)
    : Promise.resolve({ data: [] as { id: string; location_id: string }[], error: null });

  let scanData: { session_id: string; id: string; epc: string; piece_id: string | null; result_group: string }[] = [];
  let pieceData: { id: string; location_id: string }[] = [];
  let names = new Map<string, string>();
  let people = new Map<string, string>();
  let expectedAvailable = true;
  const warnings: string[] = [];
  let expectedData: {
    session_id: string;
    piece_id: string;
    snapshot_epc: string | null;
    snapshot_location_id: string | null;
    seen_at: string | null;
    resolution: "found" | "still_missing" | null;
    resolved_location_id: string | null;
  }[] = [];
  const [scanResult, pieceResult, nameResult, peopleResult, expectedResult] = await Promise.all([
    ids.length
      ? tenantScoped(supabase, tenantId)
        .from("stocktake_scans")
        .select("id, session_id, epc, piece_id, result_group")
        .in("session_id", ids)
      : Promise.resolve({ data: [], error: null }),
    pieceQuery,
    locationNames(supabase, tenantId, sessions.map((row) => row.location_id)).catch((err: unknown) => {
      warnings.push(err instanceof Error ? err.message : "Could not load locations");
      return new Map<string, string>();
    }),
    nameMap(supabase, tenantId, sessions.flatMap((row) => [row.started_by, row.finished_by])).catch((err: unknown) => {
      warnings.push(err instanceof Error ? err.message : "Could not load names");
      return new Map<string, string>();
    }),
    ids.length
      ? tenantScoped(supabase, tenantId)
        .from("stocktake_expected")
        .select("session_id, piece_id, snapshot_epc, snapshot_location_id, seen_at, resolution, resolved_location_id")
        .in("session_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (scanResult.error) warnings.push(scanResult.error.message);
  else scanData = scanResult.data ?? [];
  if (pieceResult.error) warnings.push(pieceResult.error.message);
  else pieceData = pieceResult.data ?? [];
  names = nameResult;
  people = peopleResult;
  if (expectedResult.error) {
    expectedAvailable = false;
    if (!relationMissing(expectedResult.error, "stocktake_expected") && !columnMissing(expectedResult.error, "snapshot_")) {
      warnings.push(expectedResult.error.message);
    }
  } else {
    expectedData = expectedResult.data ?? [];
  }

  const expectedBySession = new Map<string, ExpectedDbRow[]>();
  for (const row of expectedData) {
    const sessionId = String(row.session_id);
    const list = expectedBySession.get(sessionId) ?? [];
    list.push({
      piece_id: String(row.piece_id),
      snapshot_location_id: row.snapshot_location_id ? String(row.snapshot_location_id) : null,
      snapshot_status: IN_STOCK_STATUS,
      snapshot_sku: "",
      snapshot_epc: row.snapshot_epc ? String(row.snapshot_epc).toLowerCase() : null,
      snapshot_rfid_tag_id: null,
      seen_by: null,
      seen_at: row.seen_at ? String(row.seen_at) : null,
      resolution: row.resolution === "found" || row.resolution === "still_missing" ? row.resolution : null,
      resolved_by: null,
      resolved_at: null,
      resolved_location_id: row.resolved_location_id ? String(row.resolved_location_id) : null,
      resolution_movement_id: null,
    });
    expectedBySession.set(sessionId, list);
  }
  const livePieceIds: string[] = [];
  expectedBySession.forEach((rows) => {
    for (const row of rows) livePieceIds.push(row.piece_id);
  });
  let livePieces = new Map<string, PieceRow>();
  if (livePieceIds.length) {
    try {
      livePieces = await loadPieces(supabase, tenantId, livePieceIds);
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : "Could not load pieces");
    }
    const extraLocations: string[] = [];
    livePieces.forEach((piece) => {
      if (piece.location_id && !names.has(piece.location_id)) extraLocations.push(piece.location_id);
    });
    if (extraLocations.length) {
      const more = await locationNames(supabase, tenantId, extraLocations);
      more.forEach((label, id) => names.set(id, label));
    }
  }

  const scansBySession = new Map<string, ScanRow[]>();
  for (const row of scanData ?? []) {
    const sessionId = String(row.session_id);
    const list = scansBySession.get(sessionId) ?? [];
    list.push({
      id: String(row.id),
      epc: String(row.epc),
      piece_id: row.piece_id ? String(row.piece_id) : null,
      result_group: String(row.result_group),
      scanned_at: "",
    });
    scansBySession.set(sessionId, list);
  }

  const expectedByLocation = new Map<string, string[]>();
  for (const row of pieceData) {
    const locationId = String(row.location_id);
    const list = expectedByLocation.get(locationId) ?? [];
    list.push(String(row.id));
    expectedByLocation.set(locationId, list);
  }

  let catalogue: ZoneCatalogue | null = null;
  if (sessions.some((row) => row.kind === "zone" || row.kind === "whole_shop")) {
    const loadedCatalogue = await loadZoneCatalogue(supabase, tenantId);
    if (!loadedCatalogue.ok) warnings.push(loadedCatalogue.error);
    else catalogue = loadedCatalogue;
  }
  const startedByParent = new Map<string, number>();
  const shopIds = uuidIds(sessions.filter((row) => row.kind === "whole_shop").map((row) => row.id));
  if (shopIds.length) {
    const childCount = await tenantScoped(supabase, tenantId)
      .from("stocktake_sessions")
      .select("parent_session_id, kind")
      .in("parent_session_id", shopIds);
    if (childCount.error) warnings.push(childCount.error.message);
    else {
      for (const row of childCount.data ?? []) {
        if (row.kind !== "zone" || !row.parent_session_id) continue;
        const parent = String(row.parent_session_id);
        startedByParent.set(parent, (startedByParent.get(parent) ?? 0) + 1);
      }
    }
  }
  const activeZoneTotal = catalogue ? catalogue.zones.filter((zone) => zone.active).length : null;

  const stocktakes: ListedStocktake[] = sessions.map((session) => {
    const id = String(session.id);
    const status = asStatus(session.status);
    const scans = scansBySession.get(id) ?? [];
    const scannedIds = scans.map((row) => row.piece_id);
    const expectedIds = status === "in_progress"
      ? (session.location_id ? expectedByLocation.get(session.location_id) ?? [] : [])
      : uuidList(session.confirmed_missing_piece_ids);
    const missingIds = missingPieceIds(expectedIds, scannedIds);
    const lines = linesFromScans(scans, livePieces, names);
    const expectedRows = expectedBySession.get(id) ?? [];
    const useV2 = expectedAvailable && (expectedRows.length > 0 || !!session.snapshot_at);
    const zoneScope = session.kind === "zone" && session.zone_id && catalogue
      ? scopeForZone(session.zone_id, catalogue)
      : null;
    let view: { counts: StocktakeCounts };
    if (useV2) {
      const snapshot: SnapshotPiece[] = expectedRows.map((row) => {
        const piece = livePieces.get(row.piece_id);
        const liveLocationId = piece ? asText(piece.location_id) : null;
        const snapshotLabel = row.snapshot_location_id ? names.get(row.snapshot_location_id) ?? null : null;
        return {
          pieceId: row.piece_id,
          sku: piece ? asText(piece.sku) : null,
          metal: metalOf(piece),
          epc: row.snapshot_epc,
          snapshotLocationId: row.snapshot_location_id,
          snapshotLocationCode: codeFromLabel(snapshotLabel),
          snapshotLocationLabel: snapshotLabel,
          snapshotStatus: row.snapshot_status,
          liveStatus: piece ? asText(piece.status) : null,
          liveLocationId,
          liveLocationLabel: liveLocationId ? names.get(liveLocationId) ?? null : null,
          seenAt: row.seen_at,
          seenByName: null,
          resolution: row.resolution,
          resolvedLocationId: row.resolved_location_id,
        };
      });
      view = assembleStocktake({
        lines,
        countLocationId: session.location_id ?? "",
        snapshot,
        v1Missing: [],
        scopeLocationIds: zoneScope?.locationIds ?? null,
      });
    } else {
      const missing = missingIds.map((pieceId) => ({
        pieceId,
        sku: null,
        metal: null,
        status: null,
        locationName: null,
      }));
      view = buildStocktakeGroups(lines, missing, session.location_id ?? "");
    }
    const zoneLabel = session.zone_id && catalogue
      ? catalogue.zones.find((zone) => zone.id === session.zone_id)?.label ?? null
      : null;
    return {
      id,
      status,
      kind: session.kind,
      location_id: session.location_id,
      zone_id: session.zone_id,
      parent_session_id: session.parent_session_id,
      location_name: session.kind === "whole_shop"
        ? wholeShopProgressLabel(startedByParent.get(id) ?? 0, activeZoneTotal ?? (startedByParent.get(id) ?? 0))
        : session.kind === "zone"
          ? zoneLabel
          : (session.location_id ? names.get(session.location_id) ?? null : null),
      started_at: String(session.started_at),
      finished_at: session.finished_at ? String(session.finished_at) : null,
      started_by_name: session.started_by ? people.get(session.started_by) ?? null : null,
      finished_by_name: session.finished_by ? people.get(session.finished_by) ?? null : null,
      counts: view.counts,
    };
  });

  return { ok: true, stocktakes, warning: warnings[0] ?? null };
}

async function openSession(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
): Promise<{ ok: true; id: string | null; started_at: string | null } | { ok: false; status: number; error: string; schema?: boolean }> {
  if (!isUuid(locationId)) return { ok: true, id: null, started_at: null };
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .select("id, started_at")
    .eq("location_id", locationId)
    .eq("status", "in_progress")
    .maybeSingle();
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  return {
    ok: true,
    id: data?.id ? String(data.id) : null,
    started_at: data?.started_at ? String(data.started_at) : null,
  };
}

export async function createStocktake(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  locationId: string,
  options?: { fresh?: boolean },
): Promise<
  | { ok: true; id: string; continued: boolean; started_at: string | null }
  | { ok: false; status: number; error: string; schema?: boolean }
> {
  if (!isUuid(locationId)) return { ok: false, status: 400, error: "Location not found" };
  const [locationResult, existing] = await Promise.all([
    tenantScoped(supabase, tenantId).from("inventory_locations").select("id").eq("id", locationId).maybeSingle(),
    openSession(supabase, tenantId, locationId),
  ]);
  if (locationResult.error) return { ok: false, status: 500, error: locationResult.error.message };
  if (!locationResult.data) return { ok: false, status: 404, error: "Location not found" };
  if (!existing.ok) return existing;

  if (existing.id && !options?.fresh) {
    return { ok: true, id: existing.id, continued: true, started_at: existing.started_at };
  }

  if (existing.id && options?.fresh) {
    const now = new Date().toISOString();
    const { data: closed, error: closeErr } = await tenantScoped(supabase, tenantId)
      .from("stocktake_sessions")
      .update({ status: "cancelled", finished_at: now, finished_by: userId })
      .eq("id", existing.id)
      .eq("status", "in_progress")
      .select("id");
    if (closeErr) return { ok: false, status: 500, error: closeErr.message };
    if (!closed?.length) {
      const again = await openSession(supabase, tenantId, locationId);
      if (!again.ok) return again;
      if (again.id) return { ok: false, status: 409, error: "The open count changed. Continue it, or start fresh again." };
    }
  }

  const startedAt = new Date().toISOString();
  const { data: created, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .insert({
      location_id: locationId,
      status: "in_progress",
      started_by: userId,
      started_at: startedAt,
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const again = await openSession(supabase, tenantId, locationId);
    if (!again.ok) return again;
    if (again.id) return { ok: true, id: again.id, continued: true, started_at: again.started_at };
  }
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  if (!created?.id) return { ok: false, status: 500, error: "Could not start the count" };
  const sessionId = String(created.id);
  const snap = await writeSnapshot(supabase, tenantId, sessionId, [locationId]);
  if (!snap.ok) return snap;
  return { ok: true, id: sessionId, continued: false, started_at: startedAt };
}

async function deleteSession(supabase: SupabaseClient, tenantId: string, sessionId: string): Promise<void> {
  await tenantScoped(supabase, tenantId).from("stocktake_sessions").delete().eq("id", sessionId);
}

/** One row per in-stock piece, then snapshot_at. A missing table leaves a v1 count. */
async function writeSnapshot(
  supabase: SupabaseClient,
  tenantId: string,
  sessionId: string,
  locationIds: string[],
): Promise<{ ok: true } | { ok: false; status: number; error: string; schema?: boolean }> {
  let pieces: { id: string; sku: string | null; status: string | null; location_id: string | null }[] | null = [];
  let error: { message: string } | null = null;
  if (locationIds.length) {
    const pieceResult = await tenantScoped(supabase, tenantId)
      .from("inventory_pieces")
      .select("id, sku, status, location_id")
      .in("location_id", locationIds)
      .eq("status", IN_STOCK_STATUS);
    pieces = pieceResult.data as typeof pieces;
    error = pieceResult.error;
  }
  if (error) {
    await deleteSession(supabase, tenantId, sessionId);
    return { ok: false, status: 500, error: error.message };
  }
  const pieceRows = (pieces ?? []) as { id: string; sku: string | null; status: string | null; location_id: string | null }[];
  const ids = pieceRows.map((row) => String(row.id));
  const tagsByPiece = new Map<string, { id: string; epc: string; status: string }[]>();
  if (ids.length) {
    const tagResult = await tenantScoped(supabase, tenantId)
      .from("inventory_rfid_tags")
      .select("id, epc, inventory_piece_id, status")
      .in("inventory_piece_id", ids);
    if (tagResult.error) {
      await deleteSession(supabase, tenantId, sessionId);
      return { ok: false, status: 500, error: tagResult.error.message };
    }
    for (const tag of tagResult.data ?? []) {
      const pieceId = String(tag.inventory_piece_id);
      const list = tagsByPiece.get(pieceId) ?? [];
      list.push({ id: String(tag.id), epc: String(tag.epc), status: String(tag.status) });
      tagsByPiece.set(pieceId, list);
    }
  }
  const rows = pieceRows.map((piece) => {
    const tag = preferredTag(tagsByPiece.get(String(piece.id)) ?? []);
    return {
      session_id: sessionId,
      piece_id: piece.id,
      snapshot_location_id: piece.location_id,
      snapshot_status: piece.status || IN_STOCK_STATUS,
      snapshot_sku: asText(piece.sku) || "",
      snapshot_epc: tag?.epc ?? null,
      snapshot_rfid_tag_id: tag?.id ?? null,
    };
  });
  if (rows.length) {
    const { error: insertErr } = await tenantScoped(supabase, tenantId).from("stocktake_expected").insert(rows);
    if (insertErr) {
      if (relationMissing(insertErr, "stocktake_expected") || columnMissing(insertErr, "snapshot_")) return { ok: true };
      await deleteSession(supabase, tenantId, sessionId);
      return { ok: false, status: 500, error: insertErr.message };
    }
  }
  const { error: stampErr } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .update({ snapshot_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (stampErr) {
    if (columnMissing(stampErr, "snapshot_at")) return { ok: true };
    await deleteSession(supabase, tenantId, sessionId);
    return { ok: false, status: 500, error: stampErr.message };
  }
  return { ok: true };
}

export async function resolveScanCodes(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  epcs: string[],
  skus: string[],
): Promise<{ epcs: EpcHit[]; skus: SkuHit[] }> {
  const tagByEpc = new Map<string, { pieceId: string; status: string }>();
  if (epcs.length) {
    const { data, error } = await tenantScoped(supabase, tenantId)
      .from("inventory_rfid_tags")
      .select("epc, inventory_piece_id, status")
      .in("epc", epcs);
    if (error) throw new Error(error.message);
    for (const tag of data ?? []) {
      tagByEpc.set(String(tag.epc).toLowerCase(), {
        pieceId: String(tag.inventory_piece_id),
        status: String(tag.status),
      });
    }
  }

  const skuPieces: PieceRow[] = [];
  if (skus.length) {
    const filter = skus.map((sku) => {
      const escaped = sku.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "\\%").replace(/_/g, "\\_");
      return `sku.ilike."${escaped}"`;
    }).join(",");
    const { data, error } = await tenantScoped(supabase, tenantId)
      .from("inventory_pieces")
      .select(PIECE_COLUMNS)
      .or(filter);
    if (error) throw new Error(error.message);
    skuPieces.push(...((data ?? []) as PieceRow[]));
  }

  const pieceIds = skuPieces.map((row) => String(row.id));
  tagByEpc.forEach((tag) => { pieceIds.push(tag.pieceId); });
  const pieces = await loadPieces(supabase, tenantId, pieceIds);

  const tagsByPiece = new Map<string, { epc: string; status: string }[]>();
  if (skuPieces.length) {
    const { data, error } = await tenantScoped(supabase, tenantId)
      .from("inventory_rfid_tags")
      .select("epc, inventory_piece_id, status")
      .in("inventory_piece_id", skuPieces.map((row) => String(row.id)));
    if (error) throw new Error(error.message);
    for (const tag of data ?? []) {
      const pieceId = String(tag.inventory_piece_id);
      const list = tagsByPiece.get(pieceId) ?? [];
      list.push({ epc: String(tag.epc).toLowerCase(), status: String(tag.status) });
      tagsByPiece.set(pieceId, list);
    }
  }

  const reads: { epc: string; status: string }[] = [];
  const seenReads = new Set<string>();
  function addRead(epc: string, status: string) {
    if (seenReads.has(epc)) return;
    seenReads.add(epc);
    reads.push({ epc, status });
  }
  for (const epc of epcs) {
    const tag = tagByEpc.get(epc);
    if (tag) addRead(epc, tag.status);
  }

  const skuHits: SkuHit[] = skus.map((sku) => {
    const row = skuPieces.find((piece) => asText(piece.sku)?.toLowerCase() === sku.toLowerCase());
    if (!row) return { sku, piece: null, tagEpc: null, tagStatus: null };
    const tags = tagsByPiece.get(String(row.id)) ?? [];
    const tagEpc = preferredTagEpc(tags);
    const tag = tags.find((item) => item.epc === tagEpc);
    if (tagEpc && tag) addRead(tagEpc, tag.status);
    return { sku, piece: pieceOf(row), tagEpc, tagStatus: tag?.status ?? null };
  });

  if (reads.length) await applyHandheldTagReads(supabase, tenantId, userId, reads);

  return {
    epcs: epcs.map((epc) => {
      const tag = tagByEpc.get(epc);
      const row = tag ? pieces.get(tag.pieceId) : undefined;
      return { epc, piece: row ? pieceOf(row) : null, tagStatus: tag?.status ?? null };
    }),
    skus: skuHits,
  };
}

function normaliseCodes(rawEpcs: unknown, rawSkus: unknown): { epcs: string[]; skus: string[] } | { error: string } {
  if (!Array.isArray(rawEpcs)) return { error: "epcs must be an array of strings" };
  const skusIn = Array.isArray(rawSkus) ? rawSkus : [];
  if (rawEpcs.length + skusIn.length > 200) return { error: "At most 200 codes per request" };
  const epcs: string[] = [];
  const seenEpc = new Set<string>();
  for (const value of rawEpcs) {
    if (typeof value !== "string") continue;
    const epc = value.trim().toLowerCase();
    if (!EPC_RE.test(epc) || seenEpc.has(epc)) continue;
    seenEpc.add(epc);
    epcs.push(epc);
  }
  const skus: string[] = [];
  const seenSku = new Set<string>();
  for (const value of skusIn) {
    if (typeof value !== "string") continue;
    const sku = value.trim();
    if (!sku || EPC_RE.test(sku.toLowerCase())) continue;
    const key = sku.toLowerCase();
    if (seenSku.has(key)) continue;
    seenSku.add(key);
    skus.push(sku);
  }
  return { epcs, skus };
}

function asResult(value: string): StoredResult {
  if (
    value === "found"
    || value === "wrong_tray"
    || value === "nearby_zone"
    || value === "wrong_location"
    || value === "not_in_stock"
    || value === "unknown"
  ) return value;
  return "unknown";
}

export async function recordStocktakeScans(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  stocktakeId: string,
  body: { epcs?: unknown; skus?: unknown },
): Promise<{ ok: true; added: StoredLine[]; warnings: string[] } | { ok: false; status: number; error: string; schema?: boolean }> {
  const codes = normaliseCodes(body.epcs, body.skus);
  if ("error" in codes) return { ok: false, status: 400, error: codes.error };

  const [loaded, existingResult] = await Promise.all([
    loadSession(supabase, tenantId, stocktakeId),
    tenantScoped(supabase, tenantId).from("stocktake_scans").select("epc").eq("session_id", stocktakeId),
  ]);
  if (!loaded.ok) return loaded;
  if (loaded.session.status !== "in_progress") {
    return { ok: false, status: 409, error: "This count is already finished" };
  }
  if (loaded.session.kind === "whole_shop") {
    return { ok: false, status: 409, error: "Open a zone from this whole-shop count to scan." };
  }
  const countLocationId = loaded.session.location_id ?? "";
  const existingFailed = schemaOrMessage(existingResult.error);
  if (existingFailed) return { ok: false, status: existingFailed.schema ? 503 : 500, error: existingFailed.message, schema: existingFailed.schema };
  const existingRows = existingResult.data;

  let resolved: Awaited<ReturnType<typeof resolveScanCodes>>;
  try {
    resolved = await resolveScanCodes(supabase, tenantId, userId, codes.epcs, codes.skus);
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Lookup failed" };
  }

  let zoneLocations: string[] | null = null;
  let neighbourLocations: string[] = [];
  const snapshotLocationByPiece = new Map<string, string | null>();
  if (loaded.session.kind === "zone" && loaded.session.zone_id) {
    const catalogue = await loadZoneCatalogue(supabase, tenantId);
    if (!catalogue.ok) return { ok: false, status: catalogue.schema ? 503 : 500, error: catalogue.error, schema: catalogue.schema };
    const scope = scopeForZone(loaded.session.zone_id, catalogue);
    zoneLocations = scope.locationIds;
    neighbourLocations = scope.neighbourLocationIds;
    const expected = await loadExpected(supabase, tenantId, stocktakeId);
    for (const row of expected.rows) snapshotLocationByPiece.set(row.piece_id, row.snapshot_location_id);
  }

  function classifyHit(piece: { id: string; status: string | null; locationId: string | null } | null, hasEpc: boolean): StoredResult | "ignore" {
    if (zoneLocations) {
      return classifyZoneScan({
        hasPiece: !!piece,
        hasEpc,
        status: piece?.status ?? null,
        locationId: piece?.locationId ?? null,
        zoneLocationIds: zoneLocations,
        neighbourLocationIds: neighbourLocations,
        snapshotLocationId: piece ? snapshotLocationByPiece.get(piece.id) ?? null : null,
        inSnapshot: !!piece && snapshotLocationByPiece.has(piece.id),
      });
    }
    return classifyStocktakeHit({
      hasPiece: !!piece,
      hasEpc,
      status: piece?.status ?? null,
      locationId: piece?.locationId ?? null,
      countLocationId,
    });
  }

  const warnings: string[] = [];
  const incoming: PlannedLine[] = [];
  const scannedLocationByPiece = new Map<string, string | null>();
  for (const hit of resolved.epcs) {
    const result = classifyHit(hit.piece, true);
    if (result === "ignore") continue;
    if (hit.piece) scannedLocationByPiece.set(hit.piece.id, hit.piece.locationId);
    incoming.push({
      epc: hit.epc,
      sku: hit.piece?.sku ?? null,
      pieceId: hit.piece?.id ?? null,
      result,
    });
  }
  for (const hit of resolved.skus) {
    if (!hit.piece) continue;
    if (!hit.tagEpc) {
      warnings.push(`${hit.piece.sku || hit.sku} has no RFID tag, so this scan was not saved.`);
      continue;
    }
    const result = classifyHit(hit.piece, true);
    if (result === "ignore") continue;
    scannedLocationByPiece.set(hit.piece.id, hit.piece.locationId);
    incoming.push({
      epc: hit.tagEpc,
      sku: hit.piece.sku,
      pieceId: hit.piece.id,
      result,
    });
  }

  const planned = planStocktakeInserts(
    (existingRows ?? []).map((row: { epc: string }) => String(row.epc).toLowerCase()),
    incoming,
  );

  if (!planned.length) return { ok: true, added: [], warnings };

  const scannedAt = new Date().toISOString();
  const { data: inserted, error: insertErr } = await tenantScoped(supabase, tenantId)
    .from("stocktake_scans")
    .upsert(
      planned.map((line) => ({
        session_id: stocktakeId,
        epc: line.epc,
        piece_id: line.pieceId,
        result_group: line.result,
        scanned_by: userId,
        scanned_at: scannedAt,
        scanned_location_id: line.pieceId ? scannedLocationByPiece.get(line.pieceId) ?? null : null,
      })),
      { onConflict: "session_id,epc", ignoreDuplicates: true },
    )
    .select("id, epc, piece_id, result_group");
  if (insertErr && insertErr.code !== "23505") {
    const insertFailed = schemaOrMessage(insertErr);
    if (insertFailed?.schema) return { ok: false, status: 503, error: insertFailed.message, schema: true };
    return { ok: false, status: 500, error: insertErr.message };
  }

  const pieceById = new Map<string, ResolvedPiece>();
  for (const hit of resolved.epcs) {
    if (hit.piece) pieceById.set(hit.piece.id, hit.piece);
  }
  for (const hit of resolved.skus) {
    if (hit.piece) pieceById.set(hit.piece.id, hit.piece);
  }
  const locationIds: string[] = [];
  pieceById.forEach((piece) => {
    if (piece.locationId) locationIds.push(piece.locationId);
  });
  let names = new Map<string, string>();
  try {
    names = await locationNames(supabase, tenantId, locationIds);
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load locations" };
  }

  const added: StoredLine[] = (inserted ?? []).map((row: { id: string; epc: string; piece_id: string | null; result_group: string }) => {
    const piece = row.piece_id ? pieceById.get(String(row.piece_id)) : undefined;
    const locationId = piece?.locationId ?? null;
    return {
      id: String(row.id),
      epc: String(row.epc).toLowerCase(),
      sku: piece?.sku ?? null,
      pieceId: row.piece_id ? String(row.piece_id) : null,
      result: asResult(String(row.result_group)),
      metal: piece?.metal ?? null,
      status: piece?.status ?? null,
      locationId,
      locationName: locationId ? names.get(locationId) ?? null : null,
    };
  });
  return { ok: true, added, warnings };
}

export async function finishStocktake(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  stocktakeId: string,
  options?: { allowChild?: boolean },
): Promise<{ ok: true; payload: StocktakePayload } | { ok: false; status: number; error: string; schema?: boolean }> {
  const loaded = await loadSession(supabase, tenantId, stocktakeId);
  if (!loaded.ok) return loaded;
  if (loaded.session.status === "cancelled") {
    return { ok: false, status: 409, error: "This count is cancelled" };
  }

  if (loaded.session.parent_session_id && !options?.allowChild) {
    return { ok: false, status: 409, error: "Finish the whole-shop count. This zone stays open until then." };
  }

  if (loaded.session.status === "in_progress" && loaded.session.kind === "whole_shop") {
    const { data: children, error: childErr } = await tenantScoped(supabase, tenantId)
      .from("stocktake_sessions")
      .select("id")
      .eq("parent_session_id", stocktakeId)
      .eq("status", "in_progress");
    if (childErr) return { ok: false, status: 500, error: childErr.message };
    for (const child of children ?? []) {
      const done = await finishStocktake(supabase, tenantId, userId, String(child.id), { allowChild: true });
      if (!done.ok) return done;
    }
    const { data: closed, error: closedErr } = await tenantScoped(supabase, tenantId)
      .from("stocktake_sessions")
      .select("confirmed_missing_piece_ids")
      .eq("parent_session_id", stocktakeId);
    if (closedErr) return { ok: false, status: 500, error: closedErr.message };
    const confirmed = new Set<string>();
    for (const row of closed ?? []) {
      for (const id of uuidList(row.confirmed_missing_piece_ids)) confirmed.add(id);
    }
    const now = new Date().toISOString();
    const { error: updateErr } = await tenantScoped(supabase, tenantId)
      .from("stocktake_sessions")
      .update({
        status: "completed",
        finished_by: userId,
        finished_at: now,
        confirmed_missing_piece_ids: Array.from(confirmed),
        confirmed_missing_by: userId,
        confirmed_missing_at: now,
      })
      .eq("id", stocktakeId)
      .eq("status", "in_progress");
    if (updateErr) return { ok: false, status: 500, error: updateErr.message };
    return getStocktake(supabase, tenantId, stocktakeId);
  }

  if (loaded.session.status === "in_progress") {
    const locationId = loaded.session.location_id ?? "";
    let expectedLoad: { available: boolean; rows: ExpectedDbRow[] };
    let scanRows: { piece_id: string | null }[];
    try {
      const [expectedResult, scanResult] = await Promise.all([
        loadExpected(supabase, tenantId, stocktakeId),
        tenantScoped(supabase, tenantId)
          .from("stocktake_scans")
          .select("piece_id")
          .eq("session_id", stocktakeId),
      ]);
      const scanFailed = schemaOrMessage(scanResult.error);
      if (scanFailed) return { ok: false, status: scanFailed.schema ? 503 : 500, error: scanFailed.message, schema: scanFailed.schema };
      expectedLoad = expectedResult;
      scanRows = scanResult.data ?? [];
    } catch (err) {
      return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not finish the count" };
    }

    const useV2 = expectedLoad.available && (expectedLoad.rows.length > 0 || !!loaded.session.snapshot_at);
    let confirmed: string[];
    if (useV2) {
      let live = new Map<string, PieceRow>();
      try {
        live = await loadPieces(supabase, tenantId, expectedLoad.rows.map((row) => row.piece_id));
      } catch (err) {
        return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not finish the count" };
      }
      const scanned = new Set<string>();
      for (const row of scanRows) {
        if (row.piece_id) scanned.add(String(row.piece_id));
      }
      let scopeLocationIds: string[] | null = null;
      if (loaded.session.kind === "zone" && loaded.session.zone_id) {
        const catalogue = await loadZoneCatalogue(supabase, tenantId);
        if (!catalogue.ok) return { ok: false, status: catalogue.schema ? 503 : 500, error: catalogue.error, schema: catalogue.schema };
        scopeLocationIds = scopeForZone(loaded.session.zone_id, catalogue).locationIds;
      }
      confirmed = [];
      for (const row of expectedLoad.rows) {
        const piece = live.get(row.piece_id);
        const kind = classifySnapshotRow({
          snapshotEpc: row.snapshot_epc,
          snapshotLocationId: row.snapshot_location_id,
          liveStatus: piece ? asText(piece.status) : null,
          liveLocationId: piece ? asText(piece.location_id) : null,
          scanned: scanned.has(row.piece_id),
          resolvedLocationId: row.resolved_location_id,
          scopeLocationIds,
        });
        if (kind === "missing") confirmed.push(row.piece_id);
      }
    } else if (!isUuid(locationId)) {
      confirmed = missingPieceIds([], scanRows.map((row) => row.piece_id));
    } else {
      const { data: liveRows, error: liveErr } = await tenantScoped(supabase, tenantId)
        .from("inventory_pieces")
        .select("id")
        .eq("location_id", locationId)
        .eq("status", IN_STOCK_STATUS);
      if (liveErr) return { ok: false, status: 500, error: liveErr.message };
      confirmed = missingPieceIds(
        (liveRows ?? []).map((row: { id: string }) => String(row.id)),
        scanRows.map((row) => row.piece_id),
      );
    }
    const now = new Date().toISOString();
    const { data: updated, error: updateErr } = await tenantScoped(supabase, tenantId)
      .from("stocktake_sessions")
      .update({
        status: "completed",
        finished_by: userId,
        finished_at: now,
        confirmed_missing_piece_ids: confirmed,
        confirmed_missing_by: userId,
        confirmed_missing_at: now,
      })
      .eq("id", stocktakeId)
      .eq("status", "in_progress")
      .select("id, status");
    if (updateErr) return { ok: false, status: 500, error: updateErr.message };
    if (!updated?.length) {
      const again = await loadSession(supabase, tenantId, stocktakeId);
      if (!again.ok) return again;
      if (again.session.status === "in_progress") {
        return { ok: false, status: 409, error: "This count did not finish. It is still open." };
      }
    }
  }

  return getStocktake(supabase, tenantId, stocktakeId);
}

export async function markLineMovedHere(
  supabase: SupabaseClient,
  tenantId: string,
  stocktakeId: string,
  pieceId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string; schema?: boolean }> {
  const loaded = await loadSession(supabase, tenantId, stocktakeId);
  if (!loaded.ok) return loaded;
  if (loaded.session.status !== "in_progress") return { ok: true };

  const { data: piece, error: pieceErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_pieces")
    .select("id, status, location_id")
    .eq("id", pieceId)
    .maybeSingle();
  if (pieceErr) return { ok: false, status: 500, error: pieceErr.message };
  if (!piece) return { ok: true };
  if (piece.status !== IN_STOCK_STATUS) return { ok: true };
  let nextResult: StoredResult = "found";
  if (loaded.session.kind === "zone" && loaded.session.zone_id) {
    const catalogue = await loadZoneCatalogue(supabase, tenantId);
    if (!catalogue.ok) return { ok: false, status: catalogue.schema ? 503 : 500, error: catalogue.error, schema: catalogue.schema };
    const scope = scopeForZone(loaded.session.zone_id, catalogue);
    if (!piece.location_id || !scope.locationIds.includes(String(piece.location_id))) return { ok: true };
    const expected = await loadExpected(supabase, tenantId, stocktakeId);
    const snap = expected.rows.find((row) => row.piece_id === pieceId);
    if (snap?.snapshot_location_id && snap.snapshot_location_id !== piece.location_id) nextResult = "wrong_tray";
  } else if (piece.location_id !== loaded.session.location_id) {
    return { ok: true };
  }

  const { error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_scans")
    .update({ result_group: nextResult, scanned_location_id: piece.location_id })
    .eq("session_id", stocktakeId)
    .eq("piece_id", pieceId)
    .eq("result_group", "wrong_location");
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  return { ok: true };
}

export async function setExpectedSeen(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  stocktakeId: string,
  pieceId: string,
  seen: boolean,
): Promise<{ ok: true; pieceId: string; seenAt: string | null; seenByName: string | null } | { ok: false; status: number; error: string; schema?: boolean }> {
  const loaded = await loadSession(supabase, tenantId, stocktakeId);
  if (!loaded.ok) return loaded;
  if (loaded.session.status !== "in_progress") {
    return { ok: false, status: 409, error: "This count is already finished" };
  }
  const seenAt = seen ? new Date().toISOString() : null;
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_expected")
    .update({ seen_by: seen ? userId : null, seen_at: seenAt })
    .eq("session_id", stocktakeId)
    .eq("piece_id", pieceId)
    .is("snapshot_epc", null)
    .select("piece_id, seen_at");
  if (error) {
    if (relationMissing(error, "stocktake_expected")) {
      return { ok: false, status: 503, error: error.message, schema: true };
    }
    return { ok: false, status: 500, error: error.message };
  }
  if (!data?.length) return { ok: false, status: 404, error: "That piece is not an untagged piece on this count" };
  let seenByName: string | null = null;
  if (seen) {
    const names = await nameMap(supabase, tenantId, [userId]);
    seenByName = names.get(userId) ?? null;
  }
  return {
    ok: true,
    pieceId,
    seenAt: data[0].seen_at ? String(data[0].seen_at) : seenAt,
    seenByName,
  };
}

function epcTail(epc: string | null): string | null {
  if (!epc) return null;
  const clean = epc.trim();
  if (!clean) return null;
  return clean.slice(-6).toUpperCase();
}

function money(value: unknown): string | null {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);
}

function stocktakeDay(iso: string | null): string {
  const date = iso ? new Date(iso) : new Date();
  const when = Number.isNaN(date.getTime()) ? new Date() : date;
  return when.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Adelaide",
  });
}

type ReportSource = {
  pieceId: string;
  sku: string | null;
  metal: string | null;
  epc: string | null;
  detail: string | null;
  locationLabel: string;
};

export async function getStocktakeReport(
  supabase: SupabaseClient,
  tenantId: string,
  stocktakeId: string,
): Promise<{ ok: true; report: StocktakeReport } | { ok: false; status: number; error: string; schema?: boolean }> {
  const head = await loadSession(supabase, tenantId, stocktakeId);
  if (!head.ok) return head;
  if (head.session.kind === "whole_shop") return combinedWholeShopReport(supabase, tenantId, head.session);
  const loaded = await getStocktake(supabase, tenantId, stocktakeId);
  if (!loaded.ok) return loaded;
  const payload = loaded.payload;
  let expectedRows: ExpectedDbRow[] = [];
  try {
    const expected = await loadExpected(supabase, tenantId, stocktakeId);
    expectedRows = expected.rows;
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load the report" };
  }
  const byPiece = new Map<string, ExpectedDbRow>();
  for (const row of expectedRows) byPiece.set(row.piece_id, row);

  const sources: { section: "missing" | "untagged" | "sold" | "moved" | "wrong_tray" | "nearby"; source: ReportSource }[] = [];
  const countLocation = payload.stocktake.location_name || "Location";
  for (const row of payload.groups.missing) {
    if (!row.pieceId) continue;
    const expected = byPiece.get(row.pieceId);
    sources.push({
      section: "missing",
      source: {
        pieceId: row.pieceId,
        sku: row.sku,
        metal: row.metal,
        epc: expected?.snapshot_epc ?? row.epc,
        detail: row.detail ?? null,
        locationLabel: row.snapshotLocationLabel || countLocation,
      },
    });
  }
  for (const row of payload.groups.notTagged) {
    if (!row.pieceId || row.seenAt) continue;
    sources.push({
      section: "untagged",
      source: {
        pieceId: row.pieceId,
        sku: row.sku,
        metal: row.metal,
        epc: null,
        detail: null,
        locationLabel: countLocation,
      },
    });
  }
  for (const row of payload.groups.soldDuring) {
    if (!row.pieceId) continue;
    sources.push({
      section: "sold",
      source: {
        pieceId: row.pieceId,
        sku: row.sku,
        metal: row.metal,
        epc: row.epc,
        detail: row.detail ?? null,
        locationLabel: countLocation,
      },
    });
  }
  for (const row of payload.groups.movedDuring) {
    if (!row.pieceId) continue;
    sources.push({
      section: "moved",
      source: {
        pieceId: row.pieceId,
        sku: row.sku,
        metal: row.metal,
        epc: row.epc,
        detail: row.detail ?? null,
        locationLabel: row.locationName || countLocation,
      },
    });
  }
  for (const row of payload.groups.wrongTray ?? []) {
    if (!row.pieceId) continue;
    sources.push({
      section: "wrong_tray",
      source: {
        pieceId: row.pieceId,
        sku: row.sku,
        metal: row.metal,
        epc: row.epc,
        detail: row.detail || "wrong tray",
        locationLabel: row.snapshotLocationLabel || row.locationName || countLocation,
      },
    });
  }
  for (const row of payload.groups.nearby ?? []) {
    if (!row.pieceId) continue;
    sources.push({
      section: "nearby",
      source: {
        pieceId: row.pieceId,
        sku: row.sku,
        metal: row.metal,
        epc: row.epc,
        detail: row.detail || NEARBY_READ_DETAIL,
        locationLabel: row.locationName || countLocation,
      },
    });
  }

  const pieceIds = uuidIds(sources.map((item) => item.source.pieceId));
  const tagIds = uuidIds(expectedRows.map((row) => row.snapshot_rfid_tag_id));
  type PieceExtra = {
    id: string;
    sku: string | null;
    product_id: string | null;
    retail_price: number | string | null;
    metal_karat: string | null;
    metal_colour: string | null;
  };
  type TagExtra = { id: string; inventory_piece_id: string | null; epc: string | null; status: string | null; last_seen_at: string | null };
  let pieces = new Map<string, PieceExtra>();
  let tags: TagExtra[] = [];
  let productNames = new Map<string, string>();
  let people = new Map<string, string>();
  try {
    const personIds: string[] = [];
    for (const row of expectedRows) {
      if (row.resolved_by) personIds.push(row.resolved_by);
    }
    const [pieceResult, tagByPiece, tagById, peopleResult] = await Promise.all([
      pieceIds.length
        ? tenantScoped(supabase, tenantId)
          .from("inventory_pieces")
          .select("id, sku, product_id, retail_price, metal_karat, metal_colour")
          .in("id", pieceIds)
        : Promise.resolve({ data: [], error: null }),
      pieceIds.length
        ? tenantScoped(supabase, tenantId)
          .from("inventory_rfid_tags")
          .select("id, inventory_piece_id, epc, status, last_seen_at")
          .in("inventory_piece_id", pieceIds)
        : Promise.resolve({ data: [], error: null }),
      tagIds.length
        ? tenantScoped(supabase, tenantId)
          .from("inventory_rfid_tags")
          .select("id, inventory_piece_id, epc, status, last_seen_at")
          .in("id", tagIds)
        : Promise.resolve({ data: [], error: null }),
      nameMap(supabase, tenantId, personIds),
    ]);
    if (pieceResult.error) return { ok: false, status: 500, error: pieceResult.error.message };
    if (tagByPiece.error) return { ok: false, status: 500, error: tagByPiece.error.message };
    if (tagById.error) return { ok: false, status: 500, error: tagById.error.message };
    const productIds: string[] = [];
    for (const row of (pieceResult.data ?? []) as PieceExtra[]) {
      pieces.set(String(row.id), row);
      if (row.product_id) productIds.push(String(row.product_id));
    }
    const seenTags = new Set<string>();
    for (const row of [...(tagById.data ?? []), ...(tagByPiece.data ?? [])] as TagExtra[]) {
      const id = String(row.id);
      if (seenTags.has(id)) continue;
      seenTags.add(id);
      tags.push({ ...row, id, inventory_piece_id: row.inventory_piece_id ? String(row.inventory_piece_id) : null });
    }
    people = peopleResult;
    const productIdList = uuidIds(productIds);
    if (productIdList.length) {
      const { data, error } = await tenantScoped(supabase, tenantId)
        .from("inventory_products")
        .select("id, name, description")
        .in("id", productIdList);
      if (error) return { ok: false, status: 500, error: error.message };
      for (const row of data ?? []) {
        const name = asText(row.name) || asText(row.description);
        if (name) productNames.set(String(row.id), name);
      }
    }
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load the report" };
  }

  const locationIds: string[] = [];
  for (const row of expectedRows) {
    if (row.snapshot_location_id) locationIds.push(row.snapshot_location_id);
    if (row.resolved_location_id) locationIds.push(row.resolved_location_id);
  }
  let labels = new Map<string, string>();
  try {
    labels = await locationNames(supabase, tenantId, locationIds);
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load the report" };
  }

  function lastSeen(pieceId: string, expected: ExpectedDbRow | undefined): string | null {
    if (expected?.snapshot_rfid_tag_id) {
      const tag = tags.find((item) => item.id === expected.snapshot_rfid_tag_id);
      return tag?.last_seen_at ? String(tag.last_seen_at) : null;
    }
    const pieceTags = tags.filter((item) => item.inventory_piece_id === pieceId);
    const best = preferredTag(pieceTags.map((item) => ({ id: item.id, epc: item.epc || "", status: item.status || "" })));
    if (!best) return null;
    const tag = pieceTags.find((item) => (item.epc || "").toLowerCase() === best.epc);
    return tag?.last_seen_at ? String(tag.last_seen_at) : null;
  }

  function toReport(source: ReportSource): ReportPiece {
    const expected = byPiece.get(source.pieceId);
    const piece = pieces.get(source.pieceId);
    const description = piece?.product_id ? productNames.get(piece.product_id) ?? null : null;
    const metal = [asText(piece?.metal_karat), asText(piece?.metal_colour)].filter(Boolean).join(" ") || source.metal;
    const snapshotLocation = expected?.snapshot_location_id ? labels.get(expected.snapshot_location_id) ?? null : null;
    const resolvedLocation = expected?.resolved_location_id ? labels.get(expected.resolved_location_id) ?? null : null;
    return {
      pieceId: source.pieceId,
      sku: asText(source.sku) || asText(piece?.sku) || asText(expected?.snapshot_sku) || "—",
      description,
      metal,
      price: money(piece?.retail_price),
      lastSeen: lastSeen(source.pieceId, expected),
      epcTail: epcTail(source.epc || expected?.snapshot_epc || null),
      epc: (source.epc || expected?.snapshot_epc || "").trim().toLowerCase() || null,
      locationLabel: snapshotLocation || source.locationLabel,
      detail: source.detail,
      resolution: expected?.resolution ?? null,
      resolvedByName: expected?.resolved_by ? people.get(expected.resolved_by) ?? null : null,
      resolvedAt: expected?.resolved_at ?? null,
      resolvedLocationLabel: resolvedLocation,
    };
  }

  const missingPieces = sources.filter((item) => item.section === "missing").map((item) => toReport(item.source));
  const grouped = new Map<string, ReportPiece[]>();
  for (const piece of missingPieces) {
    const list = grouped.get(piece.locationLabel) ?? [];
    list.push(piece);
    grouped.set(piece.locationLabel, list);
  }
  const missingByLocation: { location: string; pieces: ReportPiece[] }[] = [];
  grouped.forEach((groupPieces, location) => missingByLocation.push({ location, pieces: groupPieces }));

  let locations: { id: string; label: string }[] = [];
  try {
    const loadedLocations = await loadLocations(supabase, tenantId);
    locations = locationsForPicker(loadedLocations.locations).map((location) => ({
      id: location.id,
      label: formatLocationLabel(location),
    }));
  } catch {
    locations = [];
  }

  return {
    ok: true,
    report: {
      stocktake: payload.stocktake,
      counts: payload.counts,
      missingByLocation,
      notTaggedUnchecked: sources.filter((item) => item.section === "untagged").map((item) => toReport(item.source)),
      soldDuring: sources.filter((item) => item.section === "sold").map((item) => toReport(item.source)),
      movedDuring: sources.filter((item) => item.section === "moved").map((item) => toReport(item.source)),
      wrongTray: sources.filter((item) => item.section === "wrong_tray").map((item) => toReport(item.source)),
      nearby: sources.filter((item) => item.section === "nearby").map((item) => toReport(item.source)),
      locations,
      usesSnapshot: !!payload.snapshot,
    },
  };
}

export async function resolveExpectedPiece(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  stocktakeId: string,
  pieceId: string,
  resolution: "found" | "still_missing",
  locationId: string | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string; schema?: boolean }> {
  const loaded = await loadSession(supabase, tenantId, stocktakeId);
  if (!loaded.ok) return loaded;
  if (loaded.session.status !== "completed") {
    return { ok: false, status: 409, error: "Finish the count before resolving missing pieces" };
  }
  let expected: { available: boolean; rows: ExpectedDbRow[] };
  try {
    expected = await loadExpected(supabase, tenantId, stocktakeId);
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not resolve the piece" };
  }
  if (!expected.available) return { ok: false, status: 503, error: "stocktake_expected", schema: true };
  let ownerId = stocktakeId;
  let ownerKind: StocktakeKind = loaded.session.kind;
  let ownerZoneId = loaded.session.zone_id;
  let row = expected.rows.find((item) => item.piece_id === pieceId);
  if (!row && loaded.session.kind === "whole_shop") {
    const { data: children, error: childErr } = await tenantScoped(supabase, tenantId)
      .from("stocktake_sessions")
      .select("id, kind, zone_id")
      .eq("parent_session_id", stocktakeId);
    if (childErr) return { ok: false, status: 500, error: childErr.message };
    for (const child of children ?? []) {
      const childExpected = await loadExpected(supabase, tenantId, String(child.id));
      const found = childExpected.rows.find((item) => item.piece_id === pieceId);
      if (!found) continue;
      row = found;
      ownerId = String(child.id);
      ownerKind = asKind(child.kind);
      ownerZoneId = asText(child.zone_id);
      break;
    }
  }
  if (!row) return { ok: false, status: 404, error: "That piece is not on this count" };
  if (!row.snapshot_epc) return { ok: false, status: 400, error: "Untagged pieces are checked with Seen" };

  let live: PieceRow | undefined;
  let scanned = false;
  try {
    const [pieces, scans] = await Promise.all([
      loadPieces(supabase, tenantId, [pieceId]),
      tenantScoped(supabase, tenantId).from("stocktake_scans").select("piece_id").eq("session_id", ownerId).eq("piece_id", pieceId),
    ]);
    live = pieces.get(pieceId);
    if (scans.error) return { ok: false, status: 500, error: scans.error.message };
    scanned = (scans.data ?? []).length > 0;
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not resolve the piece" };
  }
  let scopeLocationIds: string[] | null = null;
  if (ownerKind === "zone" && ownerZoneId) {
    const catalogue = await loadZoneCatalogue(supabase, tenantId);
    if (catalogue.ok) scopeLocationIds = scopeForZone(ownerZoneId, catalogue).locationIds;
  }
  const kind = classifySnapshotRow({
    snapshotEpc: row.snapshot_epc,
    snapshotLocationId: row.snapshot_location_id,
    liveStatus: live ? asText(live.status) : null,
    liveLocationId: live ? asText(live.location_id) : null,
    scanned,
    resolvedLocationId: row.resolved_location_id,
    scopeLocationIds,
  });
  if (kind !== "missing") return { ok: false, status: 409, error: "That piece is not on the missing list" };

  let movementId: string | null = null;
  let resolvedLocationId: string | null = row.resolved_location_id;
  if (resolution === "found" && locationId) {
    const moved = await movePieceToLocation(supabase, tenantId, {
      pieceId,
      toLocationId: locationId,
      movedBy: userId,
      notes: `Found after stocktake ${stocktakeDay(loaded.session.finished_at)}`,
    });
    if (!moved.ok) return { ok: false, status: moved.status, error: moved.error };
    movementId = moved.movementId;
    resolvedLocationId = locationId;
  } else if (resolution === "found") {
    resolvedLocationId = null;
  }

  const patch: {
    resolution: "found" | "still_missing";
    resolved_by: string;
    resolved_at: string;
    resolved_location_id?: string | null;
    resolution_movement_id?: string;
  } = {
    resolution,
    resolved_by: userId,
    resolved_at: new Date().toISOString(),
  };
  if (resolution === "found") patch.resolved_location_id = resolvedLocationId;
  if (movementId) patch.resolution_movement_id = movementId;
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_expected")
    .update(patch)
    .eq("session_id", ownerId)
    .eq("piece_id", pieceId)
    .select("piece_id");
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data?.length) return { ok: false, status: 404, error: "That piece is not on this count" };
  return { ok: true };
}

function codeFromLabel(label: string | null): string | null {
  if (!label) return null;
  const parts = label.split(" · ");
  return parts.length > 1 ? parts[0] : null;
}

type ZoneRow = { id: string; code: string | null; name: string; label: string; active: boolean };
type TrayRow = { id: string; code: string | null; name: string; label: string; zoneId: string | null; active: boolean };
type NeighbourRow = { zoneAId: string; zoneBId: string };
type ZoneCatalogue = { ok: true; zones: ZoneRow[]; trays: TrayRow[]; neighbours: NeighbourRow[] };

function zoneLabelOf(zone: { code?: string | null; name?: string | null }): string {
  return formatLocationLabel({ code: zone.code, name: zone.name }) || "Zone";
}

async function loadZoneCatalogue(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<ZoneCatalogue | { ok: false; status: number; error: string; schema?: boolean }> {
  const [zoneResult, locationResult, neighbourResult] = await Promise.all([
    tenantScoped(supabase, tenantId).from("stocktake_zones").select("id, code, name, active"),
    tenantScoped(supabase, tenantId).from("inventory_locations").select("id, code, name, active, stocktake_zone_id"),
    tenantScoped(supabase, tenantId).from("stocktake_zone_neighbours").select("zone_a_id, zone_b_id"),
  ]);
  if (relationMissing(zoneResult.error, "stocktake_zones") || columnMissing(locationResult.error, "stocktake_zone_id")) {
    return { ok: false, status: 503, error: zoneResult.error?.message || locationResult.error?.message || "stocktake_zones", schema: true };
  }
  if (zoneResult.error) return { ok: false, status: 500, error: zoneResult.error.message };
  if (locationResult.error) return { ok: false, status: 500, error: locationResult.error.message };
  if (neighbourResult.error && !relationMissing(neighbourResult.error, "stocktake_zone_neighbours")) {
    return { ok: false, status: 500, error: neighbourResult.error.message };
  }
  const zones = ((zoneResult.data ?? []) as { id: string; code: string | null; name: string | null; active: boolean | null }[])
    .map((row) => ({
      id: String(row.id),
      code: asText(row.code),
      name: asText(row.name) || "Zone",
      label: zoneLabelOf(row),
      active: row.active !== false,
    }))
    .sort(compareLocations);
  const trays = ((locationResult.data ?? []) as { id: string; code: string | null; name: string | null; active: boolean | null; stocktake_zone_id: string | null }[])
    .map((row) => ({
      id: String(row.id),
      code: asText(row.code),
      name: asText(row.name) || "Location",
      label: formatLocationLabel(row),
      zoneId: asText(row.stocktake_zone_id),
      active: isActiveLocation(row),
    }))
    .sort(compareLocations);
  const neighbours = neighbourResult.error
    ? []
    : ((neighbourResult.data ?? []) as { zone_a_id: string; zone_b_id: string }[]).map((row) => ({
      zoneAId: String(row.zone_a_id),
      zoneBId: String(row.zone_b_id),
    }));
  return { ok: true, zones, trays, neighbours };
}

function scopeForZone(zoneId: string, catalogue: ZoneCatalogue): { locationIds: string[]; neighbourLocationIds: string[]; trays: TrayRow[] } {
  const trays = catalogue.trays.filter((tray) => tray.zoneId === zoneId);
  const neighbourZones = new Set<string>();
  for (const pair of catalogue.neighbours) {
    if (pair.zoneAId === zoneId) neighbourZones.add(pair.zoneBId);
    if (pair.zoneBId === zoneId) neighbourZones.add(pair.zoneAId);
  }
  const neighbourLocationIds: string[] = [];
  for (const tray of catalogue.trays) {
    if (tray.zoneId && neighbourZones.has(tray.zoneId)) neighbourLocationIds.push(tray.id);
  }
  return { locationIds: trays.map((tray) => tray.id), neighbourLocationIds, trays };
}

function conflictMessage(error: { code?: string; message?: string } | null, fallback: string): string | null {
  if (error?.code !== "23505") return null;
  const message = error.message ?? "";
  if (message.includes("one_open_whole_shop")) return "A whole-shop count is already open.";
  if (message.includes("one_open_per_zone")) return "This zone already has an open count.";
  if (message.includes("one_open_per_location")) return "This location already has an open count.";
  return fallback;
}

function emptyCounts(): StocktakeCounts {
  return buildStocktakeGroups([], [], "").counts;
}

type ShopChildRow = { id: string; kind: string | null; zone_id: string | null; location_id: string | null };

async function presentWholeShop(
  supabase: SupabaseClient,
  tenantId: string,
  session: SessionRow,
  warnings: string[],
): Promise<{ ok: true; payload: StocktakePayload } | { ok: false; status: number; error: string; schema?: boolean }> {
  const catalogueResult = await loadZoneCatalogue(supabase, tenantId);
  const catalogue = catalogueResult.ok ? catalogueResult : null;
  if (!catalogueResult.ok) warnings.push(catalogueResult.error);
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .select("id, kind, zone_id, location_id")
    .eq("parent_session_id", session.id);
  if (error) return { ok: false, status: 500, error: error.message };
  const children = (data ?? []) as ShopChildRow[];
  const units: StocktakeUnit[] = [];
  const used = new Set<string>();

  async function pushChild(child: ShopChildRow, fallbackName: string, zoneId: string | null, locationId: string | null) {
    used.add(String(child.id));
    const view = await getStocktake(supabase, tenantId, String(child.id));
    if (!view.ok) return view;
    units.push({
      id: view.payload.stocktake.id,
      kind: view.payload.stocktake.kind === "zone" ? "zone" : "location",
      name: view.payload.stocktake.location_name || fallbackName,
      status: view.payload.stocktake.status,
      counts: view.payload.counts,
      started: true,
      zoneId,
      locationId,
    });
    return null;
  }

  for (const zone of (catalogue?.zones ?? []).filter((item) => item.active)) {
    const child = children.find((row) => String(row.zone_id || "") === zone.id);
    if (!child) {
      units.push({
        id: null,
        kind: "zone",
        name: zone.label,
        status: "in_progress",
        counts: emptyCounts(),
        started: false,
        zoneId: zone.id,
        locationId: null,
      });
      continue;
    }
    const failed = await pushChild(child, zone.label, zone.id, null);
    if (failed) return failed;
  }
  for (const tray of (catalogue?.trays ?? []).filter((item) => item.active && !item.zoneId)) {
    const child = children.find((row) => row.kind !== "zone" && String(row.location_id || "") === tray.id);
    if (!child) {
      units.push({
        id: null,
        kind: "location",
        name: tray.label,
        status: "in_progress",
        counts: emptyCounts(),
        started: false,
        zoneId: null,
        locationId: tray.id,
      });
      continue;
    }
    const failed = await pushChild(child, tray.label, null, tray.id);
    if (failed) return failed;
  }
  for (const child of children) {
    if (used.has(String(child.id))) continue;
    const failed = await pushChild(
      child,
      "Zone",
      child.zone_id ? String(child.zone_id) : null,
      child.location_id ? String(child.location_id) : null,
    );
    if (failed) return failed;
  }
  units.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }));
  const people = await nameMap(supabase, tenantId, [session.started_by, session.finished_by].filter((id): id is string => !!id));
  const blank = buildStocktakeGroups([], [], "");
  const startedZones = units.filter((unit) => unit.kind === "zone" && unit.started).length;
  const totalZones = catalogue ? catalogue.zones.filter((zone) => zone.active).length : startedZones;
  const stocktake: StocktakeSession = {
    id: session.id,
    status: asStatus(session.status),
    kind: "whole_shop",
    location_id: null,
    zone_id: null,
    parent_session_id: null,
    location_name: wholeShopProgressLabel(startedZones, totalZones),
    started_at: session.started_at,
    finished_at: session.finished_at,
    started_by_name: session.started_by ? people.get(session.started_by) ?? null : null,
    finished_by_name: session.finished_by ? people.get(session.finished_by) ?? null : null,
  };
  return {
    ok: true,
    payload: {
      stocktake,
      groups: blank.groups,
      counts: blank.counts,
      warnings,
      snapshot: null,
      units,
    },
  };
}

function addCounts(total: StocktakeCounts, extra: StocktakeCounts): void {
  total.found += extra.found || 0;
  total.missing += extra.missing || 0;
  total.elsewhere += extra.elsewhere || 0;
  total.notInStock += extra.notInStock || 0;
  total.unknown += extra.unknown || 0;
  total.blank += extra.blank || 0;
  total.notTaggedSeen += extra.notTaggedSeen || 0;
  total.notTaggedUnchecked += extra.notTaggedUnchecked || 0;
  total.soldDuring += extra.soldDuring || 0;
  total.movedDuring += extra.movedDuring || 0;
  total.resolvedFound += extra.resolvedFound || 0;
  total.resolvedMissing += extra.resolvedMissing || 0;
  total.wrongTray += extra.wrongTray || 0;
  total.nearby += extra.nearby || 0;
}

async function combinedWholeShopReport(
  supabase: SupabaseClient,
  tenantId: string,
  session: SessionRow,
): Promise<{ ok: true; report: StocktakeReport } | { ok: false; status: number; error: string; schema?: boolean }> {
  const parent = await getStocktake(supabase, tenantId, session.id);
  if (!parent.ok) return parent;
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .select("id")
    .eq("parent_session_id", session.id);
  if (error) return { ok: false, status: 500, error: error.message };
  const parts: StocktakeReport[] = [];
  for (const child of data ?? []) {
    const report = await getStocktakeReport(supabase, tenantId, String(child.id));
    if (!report.ok) return report;
    parts.push(report.report);
  }
  const counts = buildStocktakeGroups([], [], "").counts;
  const grouped = new Map<string, ReportPiece[]>();
  const notTaggedUnchecked: ReportPiece[] = [];
  const soldDuring: ReportPiece[] = [];
  const movedDuring: ReportPiece[] = [];
  const wrongTray: ReportPiece[] = [];
  const nearby: ReportPiece[] = [];
  for (const report of parts) {
    addCounts(counts, report.counts);
    for (const group of report.missingByLocation) {
      const list = grouped.get(group.location) ?? [];
      list.push(...group.pieces);
      grouped.set(group.location, list);
    }
    notTaggedUnchecked.push(...report.notTaggedUnchecked);
    soldDuring.push(...report.soldDuring);
    movedDuring.push(...report.movedDuring);
    wrongTray.push(...(report.wrongTray ?? []));
    nearby.push(...(report.nearby ?? []));
  }
  const missingByLocation: { location: string; pieces: ReportPiece[] }[] = [];
  grouped.forEach((pieces, location) => missingByLocation.push({ location, pieces }));
  missingByLocation.sort((a, b) => a.location.localeCompare(b.location, "en", { numeric: true, sensitivity: "base" }));
  return {
    ok: true,
    report: {
      stocktake: parent.payload.stocktake,
      counts,
      missingByLocation,
      notTaggedUnchecked,
      soldDuring,
      movedDuring,
      wrongTray,
      nearby,
      locations: parts[0]?.locations ?? [],
      usesSnapshot: true,
    },
  };
}

async function cancelSession(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const children = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .update({ status: "cancelled", finished_at: now, finished_by: userId })
    .eq("parent_session_id", sessionId)
    .eq("status", "in_progress");
  if (children.error && !columnMissing(children.error, "parent_session")) {
    return { ok: false, error: children.error.message };
  }
  const { error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .update({ status: "cancelled", finished_at: now, finished_by: userId })
    .eq("id", sessionId)
    .eq("status", "in_progress");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function cancelStocktake(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  stocktakeId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string; schema?: boolean }> {
  if (!isUuid(stocktakeId)) return { ok: false, status: 404, error: "Count not found" };
  const loaded = await loadSession(supabase, tenantId, stocktakeId);
  if (!loaded.ok) return loaded;
  if (loaded.session.status !== "in_progress") return { ok: false, status: 409, error: "This count is not open" };
  const closed = await cancelSession(supabase, tenantId, userId, stocktakeId);
  if (!closed.ok) return { ok: false, status: 500, error: closed.error };
  return { ok: true };
}

type ZoneStart =
  | { ok: true; id: string; continued: boolean; started_at: string | null; note: string | null }
  | { ok: false; status: number; error: string; schema?: boolean };

async function findOpenZone(
  supabase: SupabaseClient,
  tenantId: string,
  zoneId: string,
): Promise<{ ok: true; row: { id: string; started_at: string | null; parent_session_id: string | null } | null } | { ok: false; status: number; error: string; schema?: boolean }> {
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .select("id, started_at, parent_session_id")
    .eq("zone_id", zoneId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (error) {
    if (columnMissing(error, "zone_id") || columnMissing(error, "parent_session")) {
      return { ok: false, status: 503, error: error.message, schema: true };
    }
    return { ok: false, status: 500, error: error.message };
  }
  if (!data?.id) return { ok: true, row: null };
  return {
    ok: true,
    row: {
      id: String(data.id),
      started_at: data.started_at ? String(data.started_at) : null,
      parent_session_id: data.parent_session_id ? String(data.parent_session_id) : null,
    },
  };
}

async function findOpenWholeShop(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true; id: string | null } | { ok: false; status: number; error: string; schema?: boolean }> {
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .select("id")
    .eq("kind", "whole_shop")
    .eq("status", "in_progress")
    .maybeSingle();
  if (error) {
    if (columnMissing(error, "kind")) return { ok: false, status: 503, error: error.message, schema: true };
    return { ok: false, status: 500, error: error.message };
  }
  return { ok: true, id: data?.id ? String(data.id) : null };
}

function continuedZone(
  row: { id: string; started_at: string | null; parent_session_id: string | null },
): ZoneStart {
  return {
    ok: true,
    id: row.id,
    continued: true,
    started_at: row.started_at,
    note: row.parent_session_id ? WHOLE_SHOP_PART_NOTE : null,
  };
}

async function insertZoneSession(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  zoneId: string,
  parentId: string | null,
  locationIds: string[],
): Promise<ZoneStart> {
  const startedAt = new Date().toISOString();
  const { data: created, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .insert({
      kind: "zone",
      zone_id: zoneId,
      location_id: null,
      parent_session_id: parentId,
      status: "in_progress",
      started_by: userId,
      started_at: startedAt,
    })
    .select("id")
    .single();
  const conflict = conflictMessage(error, "This zone already has an open count.");
  if (conflict) {
    const again = await findOpenZone(supabase, tenantId, zoneId);
    if (!again.ok) return again;
    if (again.row) return continuedZone(again.row);
    return { ok: false, status: 409, error: conflict };
  }
  if (error) return { ok: false, status: 500, error: error.message };
  if (!created?.id) return { ok: false, status: 500, error: "Could not start the count" };
  const snap = await writeSnapshot(supabase, tenantId, String(created.id), locationIds);
  if (!snap.ok) return snap;
  return {
    ok: true,
    id: String(created.id),
    continued: false,
    started_at: startedAt,
    note: parentId ? WHOLE_SHOP_PART_NOTE : null,
  };
}

export async function createZoneStocktake(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  zoneId: string,
  options?: { fresh?: boolean },
): Promise<ZoneStart> {
  const catalogue = await loadZoneCatalogue(supabase, tenantId);
  if (!catalogue.ok) return catalogue;
  const zone = catalogue.zones.find((item) => item.id === zoneId);
  if (!zone || !zone.active) return { ok: false, status: 404, error: "Zone not found" };
  const existing = await findOpenZone(supabase, tenantId, zoneId);
  if (!existing.ok) return existing;
  if (existing.row?.parent_session_id) return continuedZone(existing.row);
  if (existing.row && !options?.fresh) return continuedZone(existing.row);
  if (existing.row && options?.fresh) {
    const closed = await cancelSession(supabase, tenantId, userId, existing.row.id);
    if (!closed.ok) return { ok: false, status: 500, error: closed.error };
  }
  const shop = await findOpenWholeShop(supabase, tenantId);
  if (!shop.ok) return shop;
  const scope = scopeForZone(zoneId, catalogue);
  return insertZoneSession(supabase, tenantId, userId, zoneId, shop.id, scope.locationIds);
}

export async function createWholeShopStocktake(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  options?: { fresh?: boolean },
): Promise<
  | { ok: true; id: string; continued: boolean; started_at: string | null }
  | { ok: false; status: number; error: string; schema?: boolean }
> {
  const catalogue = await loadZoneCatalogue(supabase, tenantId);
  if (!catalogue.ok) return catalogue;
  const { data: existing, error: existingErr } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .select("id, started_at")
    .eq("kind", "whole_shop")
    .eq("status", "in_progress")
    .maybeSingle();
  if (existingErr) {
    if (columnMissing(existingErr, "kind")) return { ok: false, status: 503, error: existingErr.message, schema: true };
    return { ok: false, status: 500, error: existingErr.message };
  }
  if (existing?.id && !options?.fresh) {
    return { ok: true, id: String(existing.id), continued: true, started_at: existing.started_at ? String(existing.started_at) : null };
  }
  if (existing?.id && options?.fresh) {
    const closed = await cancelSession(supabase, tenantId, userId, String(existing.id));
    if (!closed.ok) return { ok: false, status: 500, error: closed.error };
  }
  const startedAt = new Date().toISOString();
  const { data: created, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .insert({
      kind: "whole_shop",
      zone_id: null,
      location_id: null,
      status: "in_progress",
      started_by: userId,
      started_at: startedAt,
    })
    .select("id")
    .single();
  const parentConflict = conflictMessage(error, "A whole-shop count is already open.");
  if (parentConflict) return { ok: false, status: 409, error: parentConflict };
  if (error || !created?.id) return { ok: false, status: 500, error: error?.message || "Could not start the whole-shop count" };
  return { ok: true, id: String(created.id), continued: false, started_at: startedAt };
}

/** A tray with no zone, opened from the whole-shop screen. Location counts started on their own are left alone. */
export async function openWholeShopLocationChild(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  parentId: string,
  locationId: string,
): Promise<ZoneStart> {
  if (!isUuid(parentId) || !isUuid(locationId)) return { ok: false, status: 404, error: "Count not found" };
  const parent = await loadSession(supabase, tenantId, parentId);
  if (!parent.ok) return parent;
  if (parent.session.kind !== "whole_shop" || parent.session.status !== "in_progress") {
    return { ok: false, status: 409, error: "That whole-shop count is not open" };
  }
  const { data: existing, error: existingErr } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .select("id, started_at, parent_session_id")
    .eq("parent_session_id", parentId)
    .eq("location_id", locationId)
    .eq("status", "in_progress")
    .maybeSingle();
  if (existingErr) return { ok: false, status: 500, error: existingErr.message };
  if (existing?.id) {
    return {
      ok: true,
      id: String(existing.id),
      continued: true,
      started_at: existing.started_at ? String(existing.started_at) : null,
      note: WHOLE_SHOP_PART_NOTE,
    };
  }
  const startedAt = new Date().toISOString();
  const { data: created, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .insert({
      kind: "location",
      zone_id: null,
      location_id: locationId,
      parent_session_id: parentId,
      status: "in_progress",
      started_by: userId,
      started_at: startedAt,
    })
    .select("id")
    .single();
  const conflict = conflictMessage(error, "This location already has an open count.");
  if (conflict) {
    const again = await openSession(supabase, tenantId, locationId);
    if (!again.ok) return again;
    if (again.id) return { ok: true, id: again.id, continued: true, started_at: again.started_at, note: null };
    return { ok: false, status: 409, error: conflict };
  }
  if (error || !created?.id) return { ok: false, status: 500, error: error?.message || "Could not open this location" };
  const snap = await writeSnapshot(supabase, tenantId, String(created.id), [locationId]);
  if (!snap.ok) return snap;
  return { ok: true, id: String(created.id), continued: false, started_at: startedAt, note: WHOLE_SHOP_PART_NOTE };
}

export type ZoneAdmin = {
  zones: {
    id: string;
    code: string | null;
    name: string;
    label: string;
    locations: { id: string; code: string | null; name: string; label: string }[];
  }[];
  unassigned: { id: string; code: string | null; name: string; label: string }[];
  neighbours: { zoneAId: string; zoneBId: string; label: string }[];
};

export async function getZoneAdmin(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true; admin: ZoneAdmin } | { ok: false; status: number; error: string; schema?: boolean }> {
  const catalogue = await loadZoneCatalogue(supabase, tenantId);
  if (!catalogue.ok) return catalogue;
  const zones = catalogue.zones.filter((zone) => zone.active).map((zone) => ({
    id: zone.id,
    code: zone.code,
    name: zone.name,
    label: zone.label,
    locations: catalogue.trays.filter((tray) => tray.zoneId === zone.id).map((tray) => ({
      id: tray.id,
      code: tray.code,
      name: tray.name,
      label: tray.label,
    })),
  }));
  const unassigned = catalogue.trays.filter((tray) => tray.active && !tray.zoneId).map((tray) => ({
    id: tray.id,
    code: tray.code,
    name: tray.name,
    label: tray.label,
  }));
  const nameById = new Map<string, string>();
  for (const zone of catalogue.zones) nameById.set(zone.id, zone.label);
  const neighbours = catalogue.neighbours.map((pair) => ({
    zoneAId: pair.zoneAId,
    zoneBId: pair.zoneBId,
    label: `${nameById.get(pair.zoneAId) || "Zone"} and ${nameById.get(pair.zoneBId) || "Zone"}`,
  }));
  return { ok: true, admin: { zones, unassigned, neighbours } };
}

export async function assignLocationZone(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
  zoneId: string | null,
): Promise<{ ok: true } | { ok: false; status: number; error: string; schema?: boolean }> {
  if (!isUuid(locationId)) return { ok: false, status: 404, error: "Location not found" };
  const zone = isUuid(zoneId) ? zoneId : null;
  if (zone) {
    const catalogue = await loadZoneCatalogue(supabase, tenantId);
    if (!catalogue.ok) return catalogue;
    if (!catalogue.zones.some((item) => item.id === zone)) return { ok: false, status: 404, error: "Zone not found" };
  }
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("inventory_locations")
    .update({ stocktake_zone_id: zone })
    .eq("id", locationId)
    .select("id");
  if (columnMissing(error, "stocktake_zone_id")) return { ok: false, status: 503, error: error?.message || "stocktake_zone_id", schema: true };
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data?.length) return { ok: false, status: 404, error: "Location not found" };
  return { ok: true };
}

export async function addZoneNeighbour(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  zoneA: string,
  zoneB: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string; schema?: boolean }> {
  if (!isUuid(zoneA) || !isUuid(zoneB) || zoneA === zoneB) return { ok: false, status: 400, error: "Pick two different zones" };
  const zoneAId = zoneA < zoneB ? zoneA : zoneB;
  const zoneBId = zoneA < zoneB ? zoneB : zoneA;
  const { error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_zone_neighbours")
    .insert({ zone_a_id: zoneAId, zone_b_id: zoneBId, created_by: userId });
  if (relationMissing(error, "stocktake_zone_neighbours")) return { ok: false, status: 503, error: error?.message || "stocktake_zone_neighbours", schema: true };
  if (error?.code === "23505") return { ok: false, status: 409, error: "Those zones are already neighbours" };
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}

export async function removeZoneNeighbour(
  supabase: SupabaseClient,
  tenantId: string,
  zoneA: string,
  zoneB: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string; schema?: boolean }> {
  if (!isUuid(zoneA) || !isUuid(zoneB)) return { ok: false, status: 400, error: "Pick two different zones" };
  const zoneAId = zoneA < zoneB ? zoneA : zoneB;
  const zoneBId = zoneA < zoneB ? zoneB : zoneA;
  const { error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_zone_neighbours")
    .delete()
    .eq("zone_a_id", zoneAId)
    .eq("zone_b_id", zoneBId);
  if (relationMissing(error, "stocktake_zone_neighbours")) return { ok: false, status: 503, error: error?.message || "stocktake_zone_neighbours", schema: true };
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true };
}

export { normaliseCodes };
