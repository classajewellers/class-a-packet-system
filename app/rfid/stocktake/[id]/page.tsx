"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { RFID_LOOKUP_DEBOUNCE_MS, parseScanLines, splitScanBuffer } from "@/lib/rfid-scan";
import type { StocktakePayload, StocktakeRow } from "@/lib/rfid-stocktake";
import { StocktakeGroupsView } from "@/components/StocktakeGroups";

function when(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

export default function StocktakeCountPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const { user, hydrated } = useUser();
  const manager = hydrated && canManage(user?.role);
  const [payload, setPayload] = useState<StocktakePayload | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const seenEpcs = useRef(new Set<string>());
  const seenSkus = useRef(new Set<string>());
  const queue = useRef<{ epcs: string[]; skus: string[] }>({ epcs: [], skus: [] });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushing = useRef(false);

  const remember = useCallback((next: StocktakePayload) => {
    const scanned = [
      ...next.groups.found,
      ...next.groups.elsewhere,
      ...next.groups.notInStock,
      ...next.groups.unknown,
      ...next.groups.blank,
    ];
    for (const row of scanned) {
      if (row.epc) seenEpcs.current.add(row.epc);
      if (row.sku) seenSkus.current.add(row.sku.toLowerCase());
    }
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rfid/stocktake/${id}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not open this count");
      return;
    }
    remember(json);
    setPayload(json);
  }, [id, remember]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { inputRef.current?.focus(); }, [payload?.stocktake.status]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    const epcs = queue.current.epcs.splice(0, 200);
    const skus = queue.current.skus.splice(0, Math.max(0, 200 - epcs.length));
    if (!epcs.length && !skus.length) return;
    flushing.current = true;
    try {
      const res = await fetch(`/api/rfid/stocktake/${id}/scans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epcs, skus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not save the scan");
      remember(json);
      setPayload(json);
      setError("");
    } catch (err) {
      for (const epc of epcs) seenEpcs.current.delete(epc);
      for (const sku of skus) seenSkus.current.delete(sku.toLowerCase());
      setError(err instanceof Error ? err.message : "Could not save the scan");
    } finally {
      flushing.current = false;
      if (queue.current.epcs.length || queue.current.skus.length) {
        timer.current = setTimeout(() => { void flush(); }, RFID_LOOKUP_DEBOUNCE_MS);
      }
    }
  }, [id, remember]);

  function schedule() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, RFID_LOOKUP_DEBOUNCE_MS);
  }

  function pushLines(lines: string[]) {
    const parsed = parseScanLines(lines);
    let queued = false;
    for (const epc of parsed.epcs) {
      if (seenEpcs.current.has(epc)) continue;
      seenEpcs.current.add(epc);
      queue.current.epcs.push(epc);
      queued = true;
    }
    for (const sku of parsed.skus) {
      const key = sku.toLowerCase();
      if (seenSkus.current.has(key)) continue;
      seenSkus.current.add(key);
      queue.current.skus.push(sku);
      queued = true;
    }
    if (queued) schedule();
  }

  function ingest(value: string) {
    const { complete, rest } = splitScanBuffer(value);
    if (complete.length) pushLines(complete);
    setDraft(rest);
  }

  async function moveHere(row: StocktakeRow) {
    if (!payload || !row.pieceId) return;
    setMovingId(row.pieceId);
    setError("");
    const res = await fetch("/api/rfid/stocktake/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        piece_id: row.pieceId,
        to_location_id: payload.stocktake.location_id,
        stocktake_id: payload.stocktake.id,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setMovingId(null);
    if (!res.ok) {
      setError(json.error || "Could not move the piece");
      return;
    }
    await load();
  }

  async function finish() {
    setFinishing(true);
    setError("");
    const res = await fetch(`/api/rfid/stocktake/${id}/finish`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setFinishing(false);
    if (!res.ok) {
      setError(json.error || "Could not finish the count");
      return;
    }
    remember(json);
    setPayload(json);
    setConfirming(false);
  }

  const session = payload?.stocktake;
  const open = session?.status === "in_progress";
  const statusLabel = session?.status === "completed" ? "Finished" : session?.status === "cancelled" ? "Cancelled" : "In progress";

  return (
    <div
      className="stocktake-page"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("a, button, textarea")) return;
        inputRef.current?.focus();
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>
        {session?.location_name || "Stocktake"}
      </h1>
      {session && (
        <p style={{ margin: "0 0 12px", color: "#4B5563", fontSize: 14 }}>
          {statusLabel} · Started {when(session.started_at)}
          {session.started_by_name ? ` by ${session.started_by_name}` : ""}
          {session.status === "completed" && ` · Finished ${when(session.finished_at)}`}
          {session.status === "completed" && session.finished_by_name ? ` by ${session.finished_by_name}` : ""}
        </p>
      )}
      {error && <p style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "12px 14px" }}>{error}</p>}
      {payload?.warnings?.map((warning) => (
        <p key={warning} style={{ background: "#FFFBEB", color: "#92400E", borderRadius: 10, padding: "12px 14px" }}>{warning}</p>
      ))}
      {open && (
        <textarea
          ref={inputRef}
          value={draft}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          rows={2}
          placeholder="Scan a tag"
          aria-label="Scan input"
          onChange={(event) => ingest(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            ingest(`${draft}\n`);
          }}
          onBlur={(event) => {
            const next = event.relatedTarget as HTMLElement | null;
            if (next?.closest("a, button")) return;
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            minHeight: 64,
            fontSize: 18,
            padding: "14px 12px",
            borderRadius: 12,
            border: "1px solid #D1D5DB",
            resize: "none",
            marginBottom: 12,
          }}
        />
      )}
      {confirming && payload && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>Finish this count?</div>
          <p style={{ fontSize: 14, color: "#374151", margin: "8px 0" }}>
            These pieces were not scanned. They will be recorded as missing. Their status will not change.
          </p>
          {payload.groups.missing.length === 0 && <p style={{ margin: "8px 0", color: "#374151" }}>Nothing is missing.</p>}
          <ul style={{ margin: "8px 0", paddingLeft: 18 }}>
            {payload.groups.missing.map((row) => (
              <li key={row.key} style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700 }}>{row.sku || row.pieceId}</li>
            ))}
          </ul>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" onClick={() => { void finish(); }} disabled={finishing} style={{ ...primaryButton, width: "100%" }}>
              {finishing ? "Saving…" : "Record missing and finish"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} style={{ ...secondaryButton, width: "100%" }}>Back</button>
          </div>
        </div>
      )}
      {payload && (
        <StocktakeGroupsView
          groups={payload.groups}
          counts={payload.counts}
          countLocationId={session?.location_id ?? null}
          allowMove={open}
          movingId={movingId}
          onMoveHere={(row) => { void moveHere(row); }}
        />
      )}
      {open && !confirming && (
        manager ? (
          <button type="button" onClick={() => setConfirming(true)} style={{ ...primaryButton, width: "100%", marginTop: 20 }}>
            Finish count
          </button>
        ) : (
          <p style={{ marginTop: 20, color: "#4B5563", fontSize: 15 }}>A manager finishes the count.</p>
        )
      )}
      <style>{`.stocktake-page { max-width: 720px; margin: 0 auto; overflow-x: hidden; }`}</style>
    </div>
  );
}

const primaryButton: CSSProperties = {
  minHeight: 52,
  padding: "0 16px",
  borderRadius: 10,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};
const secondaryButton: CSSProperties = {
  minHeight: 52,
  padding: "0 16px",
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  background: "#fff",
  color: "#111827",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};
