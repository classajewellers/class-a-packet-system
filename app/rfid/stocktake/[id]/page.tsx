"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { RFID_LOOKUP_DEBOUNCE_MS, parseScanLines, splitScanBuffer } from "@/lib/rfid-scan";
import { absorbStocktakeScans, applyUntaggedSeen, formatStocktakeCounts, type StocktakePayload, type StoredLine, type StocktakeRow } from "@/lib/rfid-stocktake";
import { StocktakeGroupsView } from "@/components/StocktakeGroups";

function when(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

export default function StocktakeCountPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const { user, hydrated } = useUser();
  const manager = hydrated && canManage(user?.role);
  const [payload, setPayload] = useState<StocktakePayload | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<StocktakeRow | null>(null);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [seeingId, setSeeingId] = useState<string | null>(null);
  const [startingFresh, setStartingFresh] = useState(false);
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
      const added = (json.added ?? []) as StoredLine[];
      for (const line of added) {
        if (line.epc) seenEpcs.current.add(line.epc);
        if (line.sku) seenSkus.current.add(line.sku.toLowerCase());
      }
      let merged = false;
      setPayload((prev) => {
        if (!prev) return prev;
        merged = true;
        return absorbStocktakeScans(prev, added, json.warnings ?? []);
      });
      if (!merged) await load();
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

  async function moveHere(row: StocktakeRow, toLocationId: string) {
    if (!payload || !row.pieceId || !toLocationId) return;
    setMovingId(row.pieceId);
    setError("");
    const res = await fetch("/api/rfid/stocktake/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        piece_id: row.pieceId,
        to_location_id: toLocationId,
        stocktake_id: payload.stocktake.id,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setMovingId(null);
    if (!res.ok) {
      setError(json.error || "Could not move the piece");
      return;
    }
    setPendingMove(null);
    await load();
  }

  async function markSeen(row: StocktakeRow, seen: boolean) {
    if (!row.pieceId) return;
    setSeeingId(row.pieceId);
    setError("");
    const res = await fetch(`/api/rfid/stocktake/${id}/seen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ piece_id: row.pieceId, seen }),
    });
    const json = await res.json().catch(() => ({}));
    setSeeingId(null);
    if (!res.ok) {
      setError(json.error || "Could not save that");
      return;
    }
    setPayload((prev) => (prev ? applyUntaggedSeen(prev, row.pieceId as string, json.seenAt ?? null, json.seenByName ?? null) : prev));
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
    router.push(`/rfid/stocktake/${id}/report`);
  }

  const session = payload?.stocktake;
  const open = session?.status === "in_progress";
  const wholeShop = session?.kind === "whole_shop";
  const childOfShop = !!session?.parent_session_id;
  const statusLabel = session?.status === "completed" ? "Finished" : session?.status === "cancelled" ? "Cancelled" : "In progress";

  async function startNewHere() {
    if (!session) return;
    setStartingFresh(true);
    setError("");
    const body = session.kind === "whole_shop"
      ? { whole_shop: true, fresh: true }
      : session.kind === "zone"
        ? { zone_id: session.zone_id, fresh: true }
        : { location_id: session.location_id, fresh: true };
    const res = await fetch("/api/rfid/stocktake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.id) {
      setError(json.error || "Could not start a new count");
      setStartingFresh(false);
      return;
    }
    router.push(`/rfid/stocktake/${json.id}`);
  }

  return (
    <div
      className="stocktake-page"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("a, button, textarea")) return;
        inputRef.current?.focus();
      }}
    >
      {!session && !error && (
        <div aria-busy="true" aria-label="Loading count" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="stocktake-skel" style={{ height: 28, width: "70%" }} />
          <div className="stocktake-skel" style={{ height: 16, width: "46%" }} />
          <div className="stocktake-skel" style={{ height: 64, width: "100%" }} />
          <div className="stocktake-skel" style={{ height: 72, width: "100%" }} />
          <div className="stocktake-skel" style={{ height: 72, width: "100%" }} />
        </div>
      )}
      {session && (
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 4px" }}>
        {session.location_name || "Stocktake"}
      </h1>
      )}
      {session && (
        <p style={{ margin: "0 0 12px", color: "#4B5563", fontSize: 14 }}>
          {statusLabel} · Started {when(session.started_at)}
          {session.started_by_name ? ` by ${session.started_by_name}` : ""}
          {session.status === "completed" && ` · Finished ${when(session.finished_at)}`}
          {session.status === "completed" && session.finished_by_name ? ` by ${session.finished_by_name}` : ""}
        </p>
      )}
      {session && session.status !== "in_progress" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {session.status === "completed" && (
            <Link href={`/rfid/stocktake/${id}/report`} style={{ ...primaryButton, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
              Report
            </Link>
          )}
          <button
            type="button"
            onClick={() => { void startNewHere(); }}
            disabled={startingFresh}
            style={{ ...primaryButton, width: "100%", background: session.status === "completed" ? "#fff" : "#111827", color: session.status === "completed" ? "#111827" : "#fff", border: "1px solid #111827" }}
          >
            {startingFresh ? "Starting…" : "Start new count here"}
          </button>
        </div>
      )}
      {error && <p style={{ background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "12px 14px" }}>{error}</p>}
      {payload?.warnings?.map((warning) => (
        <p key={warning} style={{ background: "#FFFBEB", color: "#92400E", borderRadius: 10, padding: "12px 14px" }}>{warning}</p>
      ))}
      {session?.parent_session_id && (
        <p style={{ margin: "0 0 12px" }}>
          <Link href={`/rfid/stocktake/${session.parent_session_id}`} style={{ color: "#111827", fontWeight: 700 }}>Back to whole-shop count</Link>
        </p>
      )}
      {open && !wholeShop && (
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
      {wholeShop && payload?.units && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {payload.units.map((unit) => (
            <Link key={unit.id} href={`/rfid/stocktake/${unit.id}`} style={unitCard}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{unit.name}</div>
              <div style={{ fontSize: 14, color: "#374151", marginTop: 4 }}>{formatStocktakeCounts(unit.counts)}</div>
            </Link>
          ))}
          {payload.units.length === 0 && <p style={{ color: "#6B7280" }}>No zones to count.</p>}
        </div>
      )}
      {pendingMove && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>Move {pendingMove.sku || "this piece"} here?</div>
          <p style={{ fontSize: 14, color: "#374151", margin: "8px 0" }}>This writes a movement. The piece status does not change.</p>
          {session?.kind === "zone" && (
            <select aria-label="Tray" value={moveTargetId} onChange={(event) => setMoveTargetId(event.target.value)} style={{ width: "100%", minHeight: 48, fontSize: 16, marginBottom: 8 }}>
              <option value="">Choose a tray</option>
              {(payload?.moveTargets ?? []).map((target) => (
                <option key={target.id} value={target.id}>{target.label}</option>
              ))}
            </select>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              disabled={!pendingMove || movingId === pendingMove.pieceId || (session?.kind === "zone" ? !moveTargetId : !session?.location_id)}
              onClick={() => { void moveHere(pendingMove, session?.kind === "zone" ? moveTargetId : (session?.location_id || "")); }}
              style={{ ...primaryButton, width: "100%" }}
            >
              {movingId ? "Moving…" : "Confirm move"}
            </button>
            <button type="button" onClick={() => setPendingMove(null)} style={{ ...secondaryButton, width: "100%" }}>Cancel</button>
          </div>
        </div>
      )}
      {payload && !wholeShop && (
        <StocktakeGroupsView
          groups={payload.groups}
          counts={payload.counts}
          countLocationId={session?.location_id ?? null}
          allowMove={open}
          movingId={movingId}
          onMoveHere={(row) => { setPendingMove(row); setMoveTargetId(""); }}
          allowSeen={open}
          seeingId={seeingId}
          onSeen={(row, seen) => { void markSeen(row, seen); }}
        />
      )}
      {open && !confirming && !childOfShop && (
        manager ? (
          <button type="button" onClick={() => setConfirming(true)} style={{ ...primaryButton, width: "100%", marginTop: 20 }}>
            Finish count
          </button>
        ) : (
          <p style={{ marginTop: 20, color: "#4B5563", fontSize: 15 }}>A manager finishes the count.</p>
        )
      )}
      <style>{`.stocktake-page { max-width: 720px; margin: 0 auto; overflow-x: hidden; } .stocktake-skel { background: #E5E7EB; border-radius: 10px; animation: stocktake-pulse 1.2s ease-in-out infinite; } @keyframes stocktake-pulse { 50% { opacity: 0.45; } }`}</style>
    </div>
  );
}

const unitCard: CSSProperties = {
  display: "block",
  textDecoration: "none",
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: "14px",
  minHeight: 64,
};

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
