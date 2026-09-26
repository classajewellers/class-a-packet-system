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
import { loadLocationLabels } from "@/lib/load-locations";
import {
  IN_STOCK_STATUS,
  assembleStocktake,
  buildStocktakeGroups,
  classifySnapshotRow,
  classifyStocktakeHit,
  isStocktakeSchemaError,
  missingPieceIds,
  planStocktakeInserts,
  preferredTag,
  preferredTagEpc,
  type ExpectedPiece,
  type PlannedLine,
  type SnapshotPiece,
  type StocktakeCounts,
  type StocktakePayload,
  type StocktakeSession,
  type StocktakeStatus,
  type StoredLine,
  type StoredResult,
} from "@/lib/rfid-stocktake";

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
  location_id: string;
  started_at: string;
  finished_at: string | null;
  started_by: string | null;
  finished_by: string | null;
  confirmed_missing_piece_ids: string[] | null;
  snapshot_at: string | null;
};

type ExpectedDbRow = {
  piece_id: string;
  snapshot_location_id: string | null;
  snapshot_status: string;
  snapshot_sku: string;
  snapshot_epc: string | null;
  seen_by: string | null;
  seen_at: string | null;
};

const SESSION_COLUMNS = "id, status, location_id, started_at, finished_at, started_by, finished_by, confirmed_missing_piece_ids";
const EXPECTED_COLUMNS = "piece_id, snapshot_location_id, snapshot_status, snapshot_sku, snapshot_epc, seen_by, seen_at";

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

async function nameMap(supabase: SupabaseClient, tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
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

async function loadPieces(supabase: SupabaseClient, tenantId: string, ids: string[]): Promise<Map<string, PieceRow>> {
  const map = new Map<string, PieceRow>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return map;
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("inventory_pieces")
    .select(PIECE_COLUMNS)
    .in("id", unique);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as PieceRow[]) map.set(String(row.id), row);
  return map;
}

async function locationNames(supabase: SupabaseClient, tenantId: string, ids: string[]): Promise<Map<string, string>> {
  return loadLocationLabels(supabase, tenantId, ids);
}

async function liveExpected(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
): Promise<PieceRow[]> {
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

async function loadSession(
  supabase: SupabaseClient,
  tenantId: string,
  stocktakeId: string,
): Promise<{ ok: true; session: SessionRow } | { ok: false; status: number; error: string; schema?: boolean }> {
  const first = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .select(`${SESSION_COLUMNS}, snapshot_at`)
    .eq("id", stocktakeId)
    .maybeSingle();
  let data = first.data as (SessionRow & { snapshot_at?: string | null }) | null;
  let error = first.error;
  if (columnMissing(error, "snapshot_at")) {
    const retry = await tenantScoped(supabase, tenantId)
      .from("stocktake_sessions")
      .select(SESSION_COLUMNS)
      .eq("id", stocktakeId)
      .maybeSingle();
    data = retry.data ? { ...(retry.data as SessionRow), snapshot_at: null } : null;
    error = retry.error;
  }
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  if (!data) return { ok: false, status: 404, error: "Count not found" };
  return { ok: true, session: { ...data, snapshot_at: data.snapshot_at ? String(data.snapshot_at) : null } };
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
    seen_by: row.seen_by ? String(row.seen_by) : null,
    seen_at: row.seen_at ? String(row.seen_at) : null,
    snapshot_location_id: row.snapshot_location_id ? String(row.snapshot_location_id) : null,
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
      if (status === "in_progress") {
        v1Rows = await liveExpected(supabase, tenantId, String(session.location_id));
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
    const locationIds = [String(session.location_id)];
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

  const lines = linesFromScans(scans, pieces, names);
  const countLocationId = String(session.location_id);
  let view: { groups: StocktakePayload["groups"]; counts: StocktakeCounts };
  let snapshot: SnapshotPiece[] | null = null;
  if (useV2) {
    snapshot = expectedLoad.rows.map((row) => {
      const piece = pieces.get(row.piece_id);
      const liveLocationId = piece ? asText(piece.location_id) : null;
      return {
        pieceId: row.piece_id,
        sku: asText(row.snapshot_sku) || (piece ? asText(piece.sku) : null),
        metal: metalOf(piece),
        epc: row.snapshot_epc,
        snapshotLocationId: row.snapshot_location_id,
        snapshotStatus: row.snapshot_status || IN_STOCK_STATUS,
        liveStatus: piece ? asText(piece.status) : null,
        liveLocationId,
        liveLocationLabel: liveLocationId ? names.get(liveLocationId) ?? null : null,
        seenAt: row.seen_at,
        seenByName: row.seen_by ? people.get(row.seen_by) ?? null : null,
      };
    });
    view = assembleStocktake({ lines, countLocationId, snapshot, v1Missing: [] });
  } else {
    const scannedIds = scans.map((row) => (row.piece_id ? String(row.piece_id) : null));
    const missingIds = new Set(missingPieceIds(v1Rows.map((row) => String(row.id)), scannedIds));
    const missing = expectedFromPieces(v1Rows.filter((row) => missingIds.has(String(row.id))), names);
    view = buildStocktakeGroups(lines, missing, countLocationId);
  }

  const stocktake: StocktakeSession = {
    id: String(session.id),
    status,
    location_id: countLocationId,
    location_name: names.get(countLocationId) ?? null,
    started_at: String(session.started_at),
    finished_at: session.finished_at ? String(session.finished_at) : null,
    started_by_name: session.started_by ? people.get(session.started_by) ?? null : null,
    finished_by_name: session.finished_by ? people.get(session.finished_by) ?? null : null,
  };

  return { ok: true, payload: { stocktake, groups: view.groups, counts: view.counts, warnings, snapshot } };
}

export type ListedStocktake = StocktakeSession & { counts: StocktakeCounts };

export async function listStocktakes(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true; stocktakes: ListedStocktake[] } | { ok: false; status: number; error: string; schema?: boolean }> {
  const first = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .select(`${SESSION_COLUMNS}, snapshot_at`)
    .order("started_at", { ascending: false })
    .limit(50);
  let data = first.data as SessionRow[] | null;
  let error = first.error;
  if (columnMissing(error, "snapshot_at")) {
    const retry = await tenantScoped(supabase, tenantId)
      .from("stocktake_sessions")
      .select(SESSION_COLUMNS)
      .order("started_at", { ascending: false })
      .limit(50);
    data = ((retry.data ?? []) as SessionRow[]).map((row) => ({ ...row, snapshot_at: null }));
    error = retry.error;
  }
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  const sessions = (data ?? []) as SessionRow[];
  if (!sessions.length) return { ok: true, stocktakes: [] };

  const ids = sessions.map((row) => String(row.id));
  const openLocationIds = Array.from(new Set(
    sessions.filter((row) => asStatus(row.status) === "in_progress").map((row) => String(row.location_id)),
  ));
  const pieceQuery = openLocationIds.length
    ? tenantScoped(supabase, tenantId)
      .from("inventory_pieces")
      .select("id, location_id")
      .eq("status", IN_STOCK_STATUS)
      .in("location_id", openLocationIds)
    : Promise.resolve({ data: [] as { id: string; location_id: string }[], error: null });

  let scanData: { session_id: string; id: string; epc: string; piece_id: string | null; result_group: string }[];
  let pieceData: { id: string; location_id: string }[];
  let names: Map<string, string>;
  let people: Map<string, string>;
  let expectedAvailable = true;
  let expectedData: {
    session_id: string;
    piece_id: string;
    snapshot_epc: string | null;
    snapshot_location_id: string | null;
    seen_at: string | null;
  }[] = [];
  try {
    const [scanResult, pieceResult, nameResult, peopleResult, expectedResult] = await Promise.all([
      tenantScoped(supabase, tenantId)
        .from("stocktake_scans")
        .select("id, session_id, epc, piece_id, result_group")
        .in("session_id", ids),
      pieceQuery,
      locationNames(supabase, tenantId, sessions.map((row) => String(row.location_id))),
      nameMap(
        supabase,
        tenantId,
        sessions.flatMap((row) => [row.started_by, row.finished_by].filter((id): id is string => typeof id === "string")),
      ),
      tenantScoped(supabase, tenantId)
        .from("stocktake_expected")
        .select("session_id, piece_id, snapshot_epc, snapshot_location_id, seen_at")
        .in("session_id", ids),
    ]);
    const scanFailed = schemaOrMessage(scanResult.error);
    if (scanFailed) return { ok: false, status: scanFailed.schema ? 503 : 500, error: scanFailed.message, schema: scanFailed.schema };
    if (pieceResult.error) return { ok: false, status: 500, error: pieceResult.error.message };
    if (expectedResult.error) {
      if (relationMissing(expectedResult.error, "stocktake_expected") || columnMissing(expectedResult.error, "snapshot_")) {
        expectedAvailable = false;
      } else {
        return { ok: false, status: 500, error: expectedResult.error.message };
      }
    } else {
      expectedData = expectedResult.data ?? [];
    }
    scanData = scanResult.data ?? [];
    pieceData = pieceResult.data ?? [];
    names = nameResult;
    people = peopleResult;
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load counts" };
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
      seen_by: null,
      seen_at: row.seen_at ? String(row.seen_at) : null,
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
      return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load counts" };
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

  const stocktakes: ListedStocktake[] = sessions.map((session) => {
    const id = String(session.id);
    const status = asStatus(session.status);
    const scans = scansBySession.get(id) ?? [];
    const scannedIds = scans.map((row) => row.piece_id);
    const expectedIds = status === "in_progress"
      ? (expectedByLocation.get(String(session.location_id)) ?? [])
      : uuidList(session.confirmed_missing_piece_ids);
    const missingIds = missingPieceIds(expectedIds, scannedIds);
    const lines = linesFromScans(scans, livePieces, names);
    const expectedRows = expectedBySession.get(id) ?? [];
    const useV2 = expectedAvailable && (expectedRows.length > 0 || !!session.snapshot_at);
    let view: { counts: StocktakeCounts };
    if (useV2) {
      const snapshot: SnapshotPiece[] = expectedRows.map((row) => {
        const piece = livePieces.get(row.piece_id);
        const liveLocationId = piece ? asText(piece.location_id) : null;
        return {
          pieceId: row.piece_id,
          sku: piece ? asText(piece.sku) : null,
          metal: metalOf(piece),
          epc: row.snapshot_epc,
          snapshotLocationId: row.snapshot_location_id,
          snapshotStatus: row.snapshot_status,
          liveStatus: piece ? asText(piece.status) : null,
          liveLocationId,
          liveLocationLabel: liveLocationId ? names.get(liveLocationId) ?? null : null,
          seenAt: row.seen_at,
          seenByName: null,
        };
      });
      view = assembleStocktake({
        lines,
        countLocationId: String(session.location_id),
        snapshot,
        v1Missing: [],
      });
    } else {
      const missing = missingIds.map((pieceId) => ({
        pieceId,
        sku: null,
        metal: null,
        status: null,
        locationName: null,
      }));
      view = buildStocktakeGroups(lines, missing, String(session.location_id));
    }
    return {
      id,
      status,
      location_id: String(session.location_id),
      location_name: names.get(String(session.location_id)) ?? null,
      started_at: String(session.started_at),
      finished_at: session.finished_at ? String(session.finished_at) : null,
      started_by_name: session.started_by ? people.get(session.started_by) ?? null : null,
      finished_by_name: session.finished_by ? people.get(session.finished_by) ?? null : null,
      counts: view.counts,
    };
  });

  return { ok: true, stocktakes };
}

async function openSession(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
): Promise<{ ok: true; id: string | null; started_at: string | null } | { ok: false; status: number; error: string; schema?: boolean }> {
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
  const snap = await writeSnapshot(supabase, tenantId, sessionId, locationId);
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
  locationId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string; schema?: boolean }> {
  const { data: pieces, error } = await tenantScoped(supabase, tenantId)
    .from("inventory_pieces")
    .select("id, sku, status, location_id")
    .eq("location_id", locationId)
    .eq("status", IN_STOCK_STATUS);
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
  if (value === "found" || value === "wrong_location" || value === "not_in_stock" || value === "unknown") return value;
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
  const countLocationId = String(loaded.session.location_id);
  const existingFailed = schemaOrMessage(existingResult.error);
  if (existingFailed) return { ok: false, status: existingFailed.schema ? 503 : 500, error: existingFailed.message, schema: existingFailed.schema };
  const existingRows = existingResult.data;

  let resolved: Awaited<ReturnType<typeof resolveScanCodes>>;
  try {
    resolved = await resolveScanCodes(supabase, tenantId, userId, codes.epcs, codes.skus);
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Lookup failed" };
  }

  const warnings: string[] = [];
  const incoming: PlannedLine[] = [];
  for (const hit of resolved.epcs) {
    const result = classifyStocktakeHit({
      hasPiece: !!hit.piece,
      hasEpc: true,
      status: hit.piece?.status ?? null,
      locationId: hit.piece?.locationId ?? null,
      countLocationId,
    });
    if (result === "ignore") continue;
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
    const result = classifyStocktakeHit({
      hasPiece: true,
      hasEpc: true,
      status: hit.piece.status,
      locationId: hit.piece.locationId,
      countLocationId,
    });
    if (result === "ignore") continue;
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
): Promise<{ ok: true; payload: StocktakePayload } | { ok: false; status: number; error: string; schema?: boolean }> {
  const loaded = await loadSession(supabase, tenantId, stocktakeId);
  if (!loaded.ok) return loaded;
  if (loaded.session.status === "cancelled") {
    return { ok: false, status: 409, error: "This count is cancelled" };
  }

  if (loaded.session.status === "in_progress") {
    const locationId = String(loaded.session.location_id);
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
      confirmed = [];
      for (const row of expectedLoad.rows) {
        const piece = live.get(row.piece_id);
        const kind = classifySnapshotRow({
          snapshotEpc: row.snapshot_epc,
          snapshotLocationId: row.snapshot_location_id,
          liveStatus: piece ? asText(piece.status) : null,
          liveLocationId: piece ? asText(piece.location_id) : null,
          scanned: scanned.has(row.piece_id),
        });
        if (kind === "missing") confirmed.push(row.piece_id);
      }
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
  if (piece.status !== IN_STOCK_STATUS || piece.location_id !== loaded.session.location_id) return { ok: true };

  const { error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_scans")
    .update({ result_group: "found" })
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

export { normaliseCodes };
