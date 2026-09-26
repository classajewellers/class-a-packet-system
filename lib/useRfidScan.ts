"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RFID_LOOKUP_CAP,
  RFID_LOOKUP_DEBOUNCE_MS,
  lookupRfidBatch,
  missingEpcGroup,
  parseScanLine,
  type RfidPieceHit,
} from "@/lib/rfid-scan";

export type ScanBatch = { epcs: string[]; skus: string[] };

/**
 * Dedupe wedge tokens and POST them in short batches. A burst of 20 tags
 * becomes one state update and a few requests, and a batch that arrives
 * while a save is in flight is not left sitting in the queue.
 * Stocktake uses this. The scan screen uses the same queue inside useRfidScan.
 */
export function useScanBatch(
  onBatch: (batch: ScanBatch) => Promise<void>,
  options?: { releaseOnError?: boolean },
) {
  const seenEpcs = useRef(new Set<string>());
  const seenSkus = useRef(new Set<string>());
  const queue = useRef<ScanBatch>({ epcs: [], skus: [] });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef(false);
  const onBatchRef = useRef(onBatch);
  onBatchRef.current = onBatch;
  const releaseOnError = options?.releaseOnError ?? false;

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (queue.current.epcs.length || queue.current.skus.length) {
        const epcs = queue.current.epcs.splice(0, RFID_LOOKUP_CAP);
        const skus = queue.current.skus.splice(0, Math.max(0, RFID_LOOKUP_CAP - epcs.length));
        if (!epcs.length && !skus.length) break;
        try {
          await onBatchRef.current({ epcs, skus });
        } catch {
          if (releaseOnError) {
            for (const epc of epcs) seenEpcs.current.delete(epc);
            for (const sku of skus) seenSkus.current.delete(sku.toLowerCase());
          }
          break;
        }
      }
    } finally {
      flushing.current = false;
      if (queue.current.epcs.length || queue.current.skus.length) void flush();
    }
  }, [releaseOnError]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, RFID_LOOKUP_DEBOUNCE_MS);
  }, [flush]);

  const pushTokens = useCallback((tokens: string[]): ScanBatch => {
    const fresh: ScanBatch = { epcs: [], skus: [] };
    for (const token of tokens) {
      const parsed = parseScanLine(token);
      for (const epc of parsed.epcs) {
        if (seenEpcs.current.has(epc)) continue;
        seenEpcs.current.add(epc);
        queue.current.epcs.push(epc);
        fresh.epcs.push(epc);
      }
      if (parsed.sku) {
        const key = parsed.sku.toLowerCase();
        if (!seenSkus.current.has(key)) {
          seenSkus.current.add(key);
          queue.current.skus.push(parsed.sku);
          fresh.skus.push(parsed.sku);
        }
      }
    }
    if (fresh.epcs.length || fresh.skus.length) schedule();
    return fresh;
  }, [schedule]);

  const remember = useCallback((epcs: string[], skus: string[]) => {
    for (const epc of epcs) seenEpcs.current.add(epc.toLowerCase());
    for (const sku of skus) seenSkus.current.add(sku.toLowerCase());
  }, []);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    queue.current = { epcs: [], skus: [] };
    seenEpcs.current = new Set();
    seenSkus.current = new Set();
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { pushTokens, remember, clear };
}

export type ScanRow = {
  key: string;
  kind: "epc" | "sku";
  epc: string | null;
  sku: string | null;
  state: "pending" | "found" | "missing" | "blank" | "error";
  tagStatus: string | null;
  piece: RfidPieceHit | null;
};

/**
 * Collects wedge tokens, dedupes EPCs, and looks up only the new ones
 * in short debounced batches. SKU tokens that exactly match a piece are
 * barcode hits; any other token is dropped. Stocktake can call pushTokens.
 */
export function useRfidScan() {
  const [rows, setRows] = useState<ScanRow[]>([]);
  const seenEpcs = useRef(new Set<string>());
  const seenSkus = useRef(new Set<string>());
  const queue = useRef<{ epcs: string[]; skus: string[] }>({ epcs: [], skus: [] });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    const epcs = queue.current.epcs.splice(0, RFID_LOOKUP_CAP);
    const room = RFID_LOOKUP_CAP - epcs.length;
    const skus = queue.current.skus.splice(0, room);
    if (!epcs.length && !skus.length) return;
    flushing.current = true;
    try {
      const result = await lookupRfidBatch(epcs, skus);
      setRows((prev) => {
        const next = prev.map((row) => {
          if (row.kind !== "epc" || !row.epc) return row;
          const hit = result.epcs.find((item) => item.epc === row.epc);
          if (!hit) return row;
          if (!hit.found) {
            const group = row.epc ? missingEpcGroup(row.epc) : "unknown";
            return { ...row, state: group === "blank" ? "blank" as const : "missing" as const, tagStatus: null, piece: null };
          }
          return {
            ...row,
            state: "found" as const,
            tagStatus: hit.tag_status,
            piece: hit.piece,
            sku: hit.piece?.sku ?? null,
          };
        });
        const pieceIds = new Set(next.map((row) => row.piece?.id).filter((id): id is string => !!id));
        for (const hit of result.skus) {
          if (!hit.found || !hit.piece) continue;
          if (pieceIds.has(hit.piece.id)) continue;
          pieceIds.add(hit.piece.id);
          next.push({
            key: `sku:${hit.piece.id}`,
            kind: "sku",
            epc: null,
            sku: hit.piece.sku ?? hit.sku,
            state: "found",
            tagStatus: null,
            piece: hit.piece,
          });
        }
        return next;
      });
    } catch {
      const failed = new Set(epcs);
      setRows((prev) => prev.map((row) => (
        row.kind === "epc" && row.epc && failed.has(row.epc) && row.state === "pending"
          ? { ...row, state: "error" }
          : row
      )));
    } finally {
      flushing.current = false;
      if (queue.current.epcs.length || queue.current.skus.length) void flush();
    }
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, RFID_LOOKUP_DEBOUNCE_MS);
  }, [flush]);

  const pushTokens = useCallback((tokens: string[]) => {
    let queued = false;
    const pending: ScanRow[] = [];
    for (const token of tokens) {
      const parsed = parseScanLine(token);
      for (const epc of parsed.epcs) {
        if (seenEpcs.current.has(epc)) continue;
        seenEpcs.current.add(epc);
        queue.current.epcs.push(epc);
        pending.push({
          key: `epc:${epc}`,
          kind: "epc",
          epc,
          sku: null,
          state: "pending",
          tagStatus: null,
          piece: null,
        });
        queued = true;
      }
      if (parsed.sku) {
        const key = parsed.sku.toLowerCase();
        if (!seenSkus.current.has(key)) {
          seenSkus.current.add(key);
          queue.current.skus.push(parsed.sku);
          queued = true;
        }
      }
    }
    if (pending.length) setRows((prev) => [...prev, ...pending]);
    if (queued) schedule();
  }, [schedule]);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    queue.current = { epcs: [], skus: [] };
    seenEpcs.current = new Set();
    seenSkus.current = new Set();
    setRows([]);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { rows, pushTokens, clear };
}
