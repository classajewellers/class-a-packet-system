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
import {
  IN_STOCK_STATUS,
  buildStocktakeGroups,
  classifyStocktakeHit,
  isStocktakeSchemaError,
  missingPieceIds,
  planStocktakeInserts,
  preferredTagEpc,
  type ExpectedPiece,
  type PlannedLine,
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
};

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
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return map;
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("inventory_locations")
    .select("id, name")
    .in("id", unique);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const name = asText(row.name);
    if (name) map.set(String(row.id), name);
  }
  return map;
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
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .select("id, status, location_id, started_at, finished_at, started_by, finished_by, confirmed_missing_piece_ids")
    .eq("id", stocktakeId)
    .maybeSingle();
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  if (!data) return { ok: false, status: 404, error: "Count not found" };
  return { ok: true, session: data as SessionRow };
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

  const { data: scanData, error: scanErr } = await tenantScoped(supabase, tenantId)
    .from("stocktake_scans")
    .select("id, epc, piece_id, result_group, scanned_at")
    .eq("session_id", stocktakeId)
    .order("scanned_at", { ascending: true });
  const scanFailed = schemaOrMessage(scanErr);
  if (scanFailed) return { ok: false, status: scanFailed.schema ? 503 : 500, error: scanFailed.message, schema: scanFailed.schema };
  const scans = (scanData ?? []) as ScanRow[];

  let expectedRows: PieceRow[] = [];
  try {
    if (status === "in_progress") {
      expectedRows = await liveExpected(supabase, tenantId, String(session.location_id));
    } else {
      const confirmed = uuidList(session.confirmed_missing_piece_ids);
      const found = await loadPieces(supabase, tenantId, confirmed);
      expectedRows = confirmed.map((id) => found.get(id) ?? {
        id,
        sku: null,
        status: null,
        location_id: null,
        metal_karat: null,
        metal_colour: null,
      });
    }
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load pieces" };
  }

  const pieceIds = [
    ...expectedRows.map((row) => String(row.id)),
    ...scans.map((row) => row.piece_id).filter((id): id is string => !!id),
  ];
  let pieces: Map<string, PieceRow>;
  try {
    pieces = await loadPieces(supabase, tenantId, pieceIds);
    for (const row of expectedRows) pieces.set(String(row.id), row);
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load pieces" };
  }

  const locationIds = [String(session.location_id)];
  for (const piece of Array.from(pieces.values())) {
    if (piece.location_id) locationIds.push(piece.location_id);
  }
  let names: Map<string, string>;
  try {
    names = await locationNames(supabase, tenantId, locationIds);
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load locations" };
  }

  const people = await nameMap(
    supabase,
    tenantId,
    [session.started_by, session.finished_by].filter((id): id is string => typeof id === "string"),
  );

  const scannedIds = scans.map((row) => (row.piece_id ? String(row.piece_id) : null));
  const missingIds = new Set(missingPieceIds(expectedRows.map((row) => String(row.id)), scannedIds));
  const missing = expectedFromPieces(
    expectedRows.filter((row) => missingIds.has(String(row.id))),
    names,
  );
  const lines = linesFromScans(scans, pieces, names);
  const view = buildStocktakeGroups(lines, missing, String(session.location_id));

  const stocktake: StocktakeSession = {
    id: String(session.id),
    status,
    location_id: String(session.location_id),
    location_name: names.get(String(session.location_id)) ?? null,
    started_at: String(session.started_at),
    finished_at: session.finished_at ? String(session.finished_at) : null,
    started_by_name: session.started_by ? people.get(session.started_by) ?? null : null,
    finished_by_name: session.finished_by ? people.get(session.finished_by) ?? null : null,
  };

  return { ok: true, payload: { stocktake, groups: view.groups, counts: view.counts, warnings } };
}

export type ListedStocktake = StocktakeSession & { counts: StocktakeCounts };

export async function listStocktakes(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true; stocktakes: ListedStocktake[] } | { ok: false; status: number; error: string; schema?: boolean }> {
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .select("id, status, location_id, started_at, finished_at, started_by, finished_by, confirmed_missing_piece_ids")
    .order("started_at", { ascending: false })
    .limit(50);
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  const sessions = (data ?? []) as SessionRow[];
  if (!sessions.length) return { ok: true, stocktakes: [] };

  const ids = sessions.map((row) => String(row.id));
  const { data: scanData, error: scanErr } = await tenantScoped(supabase, tenantId)
    .from("stocktake_scans")
    .select("id, session_id, epc, piece_id, result_group")
    .in("session_id", ids);
  const scanFailed = schemaOrMessage(scanErr);
  if (scanFailed) return { ok: false, status: scanFailed.schema ? 503 : 500, error: scanFailed.message, schema: scanFailed.schema };

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

  const openLocationIds = sessions
    .filter((row) => asStatus(row.status) === "in_progress")
    .map((row) => String(row.location_id));
  const expectedByLocation = new Map<string, string[]>();
  if (openLocationIds.length) {
    const { data: pieceData, error: pieceErr } = await tenantScoped(supabase, tenantId)
      .from("inventory_pieces")
      .select("id, location_id")
      .eq("status", IN_STOCK_STATUS)
      .in("location_id", Array.from(new Set(openLocationIds)));
    if (pieceErr) return { ok: false, status: 500, error: pieceErr.message };
    for (const row of pieceData ?? []) {
      const locationId = String(row.location_id);
      const list = expectedByLocation.get(locationId) ?? [];
      list.push(String(row.id));
      expectedByLocation.set(locationId, list);
    }
  }

  let names: Map<string, string>;
  try {
    names = await locationNames(supabase, tenantId, sessions.map((row) => String(row.location_id)));
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load locations" };
  }
  const people = await nameMap(
    supabase,
    tenantId,
    sessions.flatMap((row) => [row.started_by, row.finished_by].filter((id): id is string => typeof id === "string")),
  );

  const stocktakes: ListedStocktake[] = sessions.map((session) => {
    const id = String(session.id);
    const status = asStatus(session.status);
    const scans = scansBySession.get(id) ?? [];
    const scannedIds = scans.map((row) => row.piece_id);
    const expectedIds = status === "in_progress"
      ? (expectedByLocation.get(String(session.location_id)) ?? [])
      : uuidList(session.confirmed_missing_piece_ids);
    const missingIds = missingPieceIds(expectedIds, scannedIds);
    const lines = linesFromScans(scans, new Map(), names);
    const missing = missingIds.map((pieceId) => ({
      pieceId,
      sku: null,
      metal: null,
      status: null,
      locationName: null,
    }));
    const view = buildStocktakeGroups(lines, missing, String(session.location_id));
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

async function openSessionId(
  supabase: SupabaseClient,
  tenantId: string,
  locationId: string,
): Promise<{ ok: true; id: string | null } | { ok: false; status: number; error: string; schema?: boolean }> {
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .select("id")
    .eq("location_id", locationId)
    .eq("status", "in_progress")
    .maybeSingle();
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  return { ok: true, id: data?.id ? String(data.id) : null };
}

export async function createStocktake(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  locationId: string,
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string; schema?: boolean }> {
  const { data: location, error: locErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_locations")
    .select("id")
    .eq("id", locationId)
    .maybeSingle();
  if (locErr) return { ok: false, status: 500, error: locErr.message };
  if (!location) return { ok: false, status: 404, error: "Location not found" };

  const existing = await openSessionId(supabase, tenantId, locationId);
  if (!existing.ok) return existing;
  if (existing.id) return { ok: true, id: existing.id };

  const { data: created, error } = await tenantScoped(supabase, tenantId)
    .from("stocktake_sessions")
    .insert({
      location_id: locationId,
      status: "in_progress",
      started_by: userId,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const again = await openSessionId(supabase, tenantId, locationId);
    if (!again.ok) return again;
    if (again.id) return { ok: true, id: again.id };
  }
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  if (!created?.id) return { ok: false, status: 500, error: "Could not start the count" };
  return { ok: true, id: String(created.id) };
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

export async function recordStocktakeScans(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  stocktakeId: string,
  body: { epcs?: unknown; skus?: unknown },
): Promise<{ ok: true; payload: StocktakePayload } | { ok: false; status: number; error: string; schema?: boolean }> {
  const codes = normaliseCodes(body.epcs, body.skus);
  if ("error" in codes) return { ok: false, status: 400, error: codes.error };

  const loaded = await loadSession(supabase, tenantId, stocktakeId);
  if (!loaded.ok) return loaded;
  if (loaded.session.status !== "in_progress") {
    return { ok: false, status: 409, error: "This count is already finished" };
  }
  const countLocationId = String(loaded.session.location_id);

  const { data: existingRows, error: existingErr } = await tenantScoped(supabase, tenantId)
    .from("stocktake_scans")
    .select("epc")
    .eq("session_id", stocktakeId);
  const existingFailed = schemaOrMessage(existingErr);
  if (existingFailed) return { ok: false, status: existingFailed.schema ? 503 : 500, error: existingFailed.message, schema: existingFailed.schema };

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

  if (planned.length) {
    const scannedAt = new Date().toISOString();
    const { error: insertErr } = await tenantScoped(supabase, tenantId)
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
      );
    if (insertErr && insertErr.code !== "23505") {
      const insertFailed = schemaOrMessage(insertErr);
      if (insertFailed?.schema) return { ok: false, status: 503, error: insertFailed.message, schema: true };
      return { ok: false, status: 500, error: insertErr.message };
    }
  }

  return getStocktake(supabase, tenantId, stocktakeId, warnings);
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
    const current = await getStocktake(supabase, tenantId, stocktakeId);
    if (!current.ok) return current;
    const confirmed = current.payload.groups.missing
      .map((row) => row.pieceId)
      .filter((id): id is string => !!id);
    const now = new Date().toISOString();
    const { error: updateErr } = await tenantScoped(supabase, tenantId)
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
      .eq("status", "in_progress");
    if (updateErr) return { ok: false, status: 500, error: updateErr.message };
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

export { normaliseCodes };
