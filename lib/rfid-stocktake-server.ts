/**
 * Server-side stocktake reads and writes. Tenant id is the session tenant
 * passed in by the route — never a request header.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { tenantScoped } from "@/lib/tenantScoped";
import {
  IN_STOCK_STATUS,
  buildStocktakeGroups,
  classifyStocktakeHit,
  isStocktakeSchemaError,
  planStocktakeInserts,
  type ExpectedPiece,
  type PlannedLine,
  type StocktakeCounts,
  type StocktakePayload,
  type StocktakeStatus,
  type StoredLine,
} from "@/lib/rfid-stocktake";

const EPC_RE = /^[0-9a-f]{24}$/;

type PieceRow = Record<string, unknown>;

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
  const { data, error } = await supabase
    .from("inventory_pieces")
    .select("*")
    .eq("tenant_id", tenantId)
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

export async function getStocktake(
  supabase: SupabaseClient,
  tenantId: string,
  stocktakeId: string,
): Promise<{ ok: true; payload: StocktakePayload } | { ok: false; status: number; error: string; schema?: boolean }> {
  const { data: session, error } = await tenantScoped(supabase, tenantId)
    .from("inventory_stocktakes")
    .select("*")
    .eq("id", stocktakeId)
    .maybeSingle();
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  if (!session) return { ok: false, status: 404, error: "Count not found" };

  const status: StocktakeStatus = session.status === "finished" ? "finished" : "in_progress";
  const { data: expectedRows, error: expectedErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_stocktake_expected")
    .select("piece_id, sku")
    .eq("stocktake_id", stocktakeId);
  const expectedFailed = schemaOrMessage(expectedErr);
  if (expectedFailed) return { ok: false, status: expectedFailed.schema ? 503 : 500, error: expectedFailed.message, schema: expectedFailed.schema };

  const { data: lineRows, error: lineErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_stocktake_lines")
    .select("*")
    .eq("stocktake_id", stocktakeId)
    .order("scanned_at", { ascending: true });
  const lineFailed = schemaOrMessage(lineErr);
  if (lineFailed) return { ok: false, status: lineFailed.schema ? 503 : 500, error: lineFailed.message, schema: lineFailed.schema };

  const pieceIds = [
    ...(expectedRows ?? []).map((row: { piece_id: string }) => String(row.piece_id)),
    ...(lineRows ?? []).map((row: { piece_id: string | null }) => row.piece_id).filter(Boolean),
  ] as string[];
  let pieces: Map<string, PieceRow>;
  try {
    pieces = await loadPieces(supabase, tenantId, pieceIds);
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load pieces" };
  }

  const locationIds = [String(session.location_id)];
  for (const row of lineRows ?? []) {
    if (row.recorded_location_id) locationIds.push(String(row.recorded_location_id));
  }
  for (const piece of Array.from(pieces.values())) {
    if (typeof piece.location_id === "string") locationIds.push(piece.location_id);
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

  const expected: ExpectedPiece[] = (expectedRows ?? []).map((row: { piece_id: string; sku: string | null }) => {
    const piece = pieces.get(String(row.piece_id));
    const locationId = piece && typeof piece.location_id === "string" ? piece.location_id : null;
    return {
      pieceId: String(row.piece_id),
      sku: asText(piece?.sku) || asText(row.sku),
      metal: metalOf(piece),
      status: asText(piece?.status),
      locationName: locationId ? names.get(locationId) ?? null : null,
    };
  });

  const lines: StoredLine[] = (lineRows ?? []).map((row: Record<string, unknown>) => {
    const pieceId = asText(row.piece_id as string | null);
    const piece = pieceId ? pieces.get(pieceId) : undefined;
    const recordedId = asText(row.recorded_location_id as string | null);
    const liveLocationId = piece && typeof piece.location_id === "string" ? piece.location_id : null;
    return {
      id: String(row.id),
      epc: asText(row.epc as string | null),
      sku: asText(piece?.sku) || asText(row.sku as string | null),
      pieceId,
      result: String(row.result) as StoredLine["result"],
      movedHere: row.moved_here === true,
      metal: metalOf(piece),
      status: asText(piece?.status),
      locationName: recordedId ? names.get(recordedId) ?? null : (liveLocationId ? names.get(liveLocationId) ?? null : null),
      locationId: recordedId ?? liveLocationId,
    };
  });

  const view = buildStocktakeGroups(status, expected, lines);
  return {
    ok: true,
    payload: {
      stocktake: {
        id: String(session.id),
        status,
        location_id: String(session.location_id),
        location_name: names.get(String(session.location_id)) ?? null,
        started_at: String(session.started_at),
        finished_at: session.finished_at ? String(session.finished_at) : null,
        started_by_name: typeof session.started_by === "string" ? people.get(session.started_by) ?? null : null,
        finished_by_name: typeof session.finished_by === "string" ? people.get(session.finished_by) ?? null : null,
      },
      groups: view.groups,
      counts: view.counts,
    },
  };
}

export type ListedStocktake = StocktakePayload["stocktake"] & { counts: StocktakeCounts };

export async function listStocktakes(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true; stocktakes: ListedStocktake[] } | { ok: false; status: number; error: string; schema?: boolean }> {
  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("inventory_stocktakes")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(50);
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  const sessions = data ?? [];
  if (!sessions.length) return { ok: true, stocktakes: [] };

  const ids = sessions.map((row: { id: string }) => String(row.id));
  const { data: expectedRows, error: expectedErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_stocktake_expected")
    .select("stocktake_id, piece_id")
    .in("stocktake_id", ids);
  const expectedFailed = schemaOrMessage(expectedErr);
  if (expectedFailed) return { ok: false, status: expectedFailed.schema ? 503 : 500, error: expectedFailed.message, schema: expectedFailed.schema };

  const { data: lineRows, error: lineErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_stocktake_lines")
    .select("stocktake_id, piece_id, result")
    .in("stocktake_id", ids);
  const lineFailed = schemaOrMessage(lineErr);
  if (lineFailed) return { ok: false, status: lineFailed.schema ? 503 : 500, error: lineFailed.message, schema: lineFailed.schema };

  const locationIds = sessions.map((row: { location_id: string }) => String(row.location_id));
  let names: Map<string, string>;
  try {
    names = await locationNames(supabase, tenantId, locationIds);
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Could not load locations" };
  }
  const people = await nameMap(
    supabase,
    tenantId,
    sessions.flatMap((row: { started_by?: string | null; finished_by?: string | null }) => [row.started_by, row.finished_by].filter((id): id is string => typeof id === "string")),
  );

  const stocktakes: ListedStocktake[] = sessions.map((session: Record<string, unknown>) => {
    const id = String(session.id);
    const status: StocktakeStatus = session.status === "finished" ? "finished" : "in_progress";
    const expected = (expectedRows ?? [])
      .filter((row: { stocktake_id: string }) => String(row.stocktake_id) === id)
      .map((row: { piece_id: string }) => ({ pieceId: String(row.piece_id), sku: null, metal: null, status: null, locationName: null }));
    const lines: StoredLine[] = (lineRows ?? [])
      .filter((row: { stocktake_id: string }) => String(row.stocktake_id) === id)
      .map((row: { piece_id: string | null; result: string }, index: number) => ({
        id: `${id}:${index}`,
        epc: null,
        sku: null,
        pieceId: row.piece_id ? String(row.piece_id) : null,
        result: String(row.result) as StoredLine["result"],
        movedHere: false,
        metal: null,
        status: null,
        locationName: null,
        locationId: null,
      }));
    const view = buildStocktakeGroups(status, expected, lines);
    return {
      id,
      status,
      location_id: String(session.location_id),
      location_name: names.get(String(session.location_id)) ?? null,
      started_at: String(session.started_at),
      finished_at: session.finished_at ? String(session.finished_at) : null,
      started_by_name: typeof session.started_by === "string" ? people.get(session.started_by) ?? null : null,
      finished_by_name: typeof session.finished_by === "string" ? people.get(session.finished_by) ?? null : null,
      counts: view.counts,
    };
  });

  return { ok: true, stocktakes };
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

  const { data: created, error } = await tenantScoped(supabase, tenantId)
    .from("inventory_stocktakes")
    .insert({
      location_id: locationId,
      status: "in_progress",
      started_by: userId,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  if (!created?.id) return { ok: false, status: 500, error: "Could not start the count" };
  const id = String(created.id);

  const { data: pieces, error: pieceErr } = await supabase
    .from("inventory_pieces")
    .select("id, sku, status, location_id")
    .eq("tenant_id", tenantId)
    .eq("location_id", locationId)
    .eq("status", IN_STOCK_STATUS);
  if (pieceErr) return { ok: false, status: 500, error: pieceErr.message };

  const expected = (pieces ?? []).map((piece: { id: string; sku: string | null }) => ({
    stocktake_id: id,
    piece_id: piece.id,
    sku: piece.sku ?? null,
  }));
  if (expected.length) {
    const { error: expectedErr } = await tenantScoped(supabase, tenantId)
      .from("inventory_stocktake_expected")
      .insert(expected);
    const expectedFailed = schemaOrMessage(expectedErr);
    if (expectedFailed) return { ok: false, status: expectedFailed.schema ? 503 : 500, error: expectedFailed.message, schema: expectedFailed.schema };
  }

  return { ok: true, id };
}

type ResolvedPiece = {
  id: string;
  sku: string | null;
  locationId: string | null;
  metal: string | null;
  status: string | null;
};

function pieceOf(row: PieceRow): ResolvedPiece {
  return {
    id: String(row.id),
    sku: asText(row.sku),
    locationId: typeof row.location_id === "string" ? row.location_id : null,
    metal: metalOf(row),
    status: asText(row.status),
  };
}

export async function resolveScanCodes(
  supabase: SupabaseClient,
  tenantId: string,
  epcs: string[],
  skus: string[],
): Promise<{ epcs: { epc: string; piece: ResolvedPiece | null }[]; skus: { sku: string; piece: ResolvedPiece | null }[] }> {
  const tagByEpc = new Map<string, string>();
  if (epcs.length) {
    const { data, error } = await supabase
      .from("inventory_rfid_tags")
      .select("epc, inventory_piece_id")
      .eq("tenant_id", tenantId)
      .in("epc", epcs);
    if (error) throw new Error(error.message);
    for (const tag of data ?? []) tagByEpc.set(String(tag.epc).toLowerCase(), String(tag.inventory_piece_id));
  }

  const pieceIds = Array.from(new Set(Array.from(tagByEpc.values())));
  const pieces = await loadPieces(supabase, tenantId, pieceIds);

  const skuHits: { sku: string; piece: ResolvedPiece | null }[] = [];
  if (skus.length) {
    const filter = skus.map((sku) => {
      const escaped = sku.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%/g, "\\%").replace(/_/g, "\\_");
      return `sku.ilike."${escaped}"`;
    }).join(",");
    const { data, error } = await supabase
      .from("inventory_pieces")
      .select("*")
      .eq("tenant_id", tenantId)
      .or(filter);
    if (error) throw new Error(error.message);
    const bySku = new Map<string, PieceRow>();
    for (const row of (data ?? []) as PieceRow[]) {
      const sku = asText(row.sku);
      if (sku) bySku.set(sku.toLowerCase(), row);
    }
    for (const sku of skus) {
      const row = bySku.get(sku.toLowerCase());
      skuHits.push({ sku, piece: row ? pieceOf(row) : null });
    }
  }

  return {
    epcs: epcs.map((epc) => {
      const pieceId = tagByEpc.get(epc);
      const row = pieceId ? pieces.get(pieceId) : undefined;
      return { epc, piece: row ? pieceOf(row) : null };
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

  const { data: session, error } = await tenantScoped(supabase, tenantId)
    .from("inventory_stocktakes")
    .select("id, status")
    .eq("id", stocktakeId)
    .maybeSingle();
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  if (!session) return { ok: false, status: 404, error: "Count not found" };
  if (session.status === "finished") return { ok: false, status: 409, error: "This count is already finished" };

  const { data: expectedRows, error: expectedErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_stocktake_expected")
    .select("piece_id")
    .eq("stocktake_id", stocktakeId);
  const expectedFailed = schemaOrMessage(expectedErr);
  if (expectedFailed) return { ok: false, status: expectedFailed.schema ? 503 : 500, error: expectedFailed.message, schema: expectedFailed.schema };
  const expectedIds = new Set<string>((expectedRows ?? []).map((row: { piece_id: string }) => String(row.piece_id)));

  const { data: existingRows, error: existingErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_stocktake_lines")
    .select("epc, piece_id")
    .eq("stocktake_id", stocktakeId);
  const existingFailed = schemaOrMessage(existingErr);
  if (existingFailed) return { ok: false, status: existingFailed.schema ? 503 : 500, error: existingFailed.message, schema: existingFailed.schema };

  let resolved: Awaited<ReturnType<typeof resolveScanCodes>>;
  try {
    resolved = await resolveScanCodes(supabase, tenantId, codes.epcs, codes.skus);
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Lookup failed" };
  }

  const incoming: PlannedLine[] = [];
  for (const hit of resolved.epcs) {
    const result = classifyStocktakeHit({
      epc: hit.epc,
      pieceId: hit.piece?.id ?? null,
      expectedIds,
    });
    if (result === "ignore") continue;
    incoming.push({
      epc: hit.epc,
      sku: hit.piece?.sku ?? null,
      pieceId: hit.piece?.id ?? null,
      result,
      recordedLocationId: hit.piece?.locationId ?? null,
    });
  }
  for (const hit of resolved.skus) {
    const result = classifyStocktakeHit({
      epc: null,
      pieceId: hit.piece?.id ?? null,
      expectedIds,
    });
    if (result === "ignore") continue;
    incoming.push({
      epc: null,
      sku: hit.piece?.sku ?? hit.sku,
      pieceId: hit.piece?.id ?? null,
      result,
      recordedLocationId: hit.piece?.locationId ?? null,
    });
  }

  const planned = planStocktakeInserts(
    (existingRows ?? []).map((row: { epc: string | null; piece_id: string | null }) => ({
      epc: row.epc ? String(row.epc) : null,
      pieceId: row.piece_id ? String(row.piece_id) : null,
    })),
    incoming,
  );

  const scannedAt = new Date().toISOString();
  for (const line of planned) {
    const { error: insertErr } = await tenantScoped(supabase, tenantId)
      .from("inventory_stocktake_lines")
      .insert({
        stocktake_id: stocktakeId,
        epc: line.epc,
        sku: line.sku,
        piece_id: line.pieceId,
        result: line.result,
        recorded_location_id: line.recordedLocationId,
        moved_here: false,
        scanned_by: userId,
        scanned_at: scannedAt,
      });
    if (insertErr && insertErr.code !== "23505") {
      const insertFailed = schemaOrMessage(insertErr);
      if (insertFailed?.schema) return { ok: false, status: 503, error: insertFailed.message, schema: true };
      return { ok: false, status: 500, error: insertErr.message };
    }
  }

  return getStocktake(supabase, tenantId, stocktakeId);
}

export async function finishStocktake(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  stocktakeId: string,
): Promise<{ ok: true; payload: StocktakePayload } | { ok: false; status: number; error: string; schema?: boolean }> {
  const { data: session, error } = await tenantScoped(supabase, tenantId)
    .from("inventory_stocktakes")
    .select("id, status")
    .eq("id", stocktakeId)
    .maybeSingle();
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  if (!session) return { ok: false, status: 404, error: "Count not found" };

  if (session.status !== "finished") {
    const { data: expectedRows, error: expectedErr } = await tenantScoped(supabase, tenantId)
      .from("inventory_stocktake_expected")
      .select("piece_id, sku")
      .eq("stocktake_id", stocktakeId);
    const expectedFailed = schemaOrMessage(expectedErr);
    if (expectedFailed) return { ok: false, status: expectedFailed.schema ? 503 : 500, error: expectedFailed.message, schema: expectedFailed.schema };

    const { data: lineRows, error: lineErr } = await tenantScoped(supabase, tenantId)
      .from("inventory_stocktake_lines")
      .select("piece_id")
      .eq("stocktake_id", stocktakeId);
    const lineFailed = schemaOrMessage(lineErr);
    if (lineFailed) return { ok: false, status: lineFailed.schema ? 503 : 500, error: lineFailed.message, schema: lineFailed.schema };

    const scanned = new Set((lineRows ?? []).map((row: { piece_id: string | null }) => row.piece_id).filter(Boolean).map(String));
    const missing = (expectedRows ?? []).filter((row: { piece_id: string }) => !scanned.has(String(row.piece_id)));
    const recordedAt = new Date().toISOString();
    for (const row of missing as { piece_id: string; sku: string | null }[]) {
      const { error: insertErr } = await tenantScoped(supabase, tenantId)
        .from("inventory_stocktake_lines")
        .insert({
          stocktake_id: stocktakeId,
          epc: null,
          sku: row.sku ?? null,
          piece_id: row.piece_id,
          result: "missing",
          recorded_location_id: null,
          moved_here: false,
          scanned_by: userId,
          scanned_at: recordedAt,
        });
      if (insertErr && insertErr.code !== "23505") {
        return { ok: false, status: 500, error: insertErr.message };
      }
    }

    const { error: updateErr } = await tenantScoped(supabase, tenantId)
      .from("inventory_stocktakes")
      .update({
        status: "finished",
        finished_by: userId,
        finished_at: new Date().toISOString(),
      })
      .eq("id", stocktakeId);
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
  const { error } = await tenantScoped(supabase, tenantId)
    .from("inventory_stocktake_lines")
    .update({ moved_here: true })
    .eq("stocktake_id", stocktakeId)
    .eq("piece_id", pieceId);
  const failed = schemaOrMessage(error);
  if (failed) return { ok: false, status: failed.schema ? 503 : 500, error: failed.message, schema: failed.schema };
  return { ok: true };
}

export { normaliseCodes };
