"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { splitScanBuffer } from "@/lib/rfid-scan";
import { useScanBatch } from "@/lib/useRfidScan";
import { absorbStocktakeScans, applyUntaggedSeen, formatStocktakeCounts, movedHereDetail, noteMovedHere, WHOLE_SHOP_PART_NOTE, type SnapshotPiece, type StocktakePayload, type StocktakeUnit, type StoredLine, type StocktakeRow } from "@/lib/rfid-stocktake";
import { StocktakeGroupsView } from "@/components/StocktakeGroups";
import { StocktakeLiveCount } from "@/components/StocktakeLiveCount";
import { StocktakeFinder } from "@/components/StocktakeFinder";
import { trayCode } from "@/lib/stocktake-live";
import { beepFound, primeStocktakeAudio } from "@/lib/stocktake-audio";
import { classifyRead, expectedEpcSet } from "@/lib/stocktake-live";

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
  const [moveError, setMoveError] = useState("");
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [seeingId, setSeeingId] = useState<string | null>(null);
  const [startingFresh, setStartingFresh] = useState(false);
  const [draft, setDraft] = useState("");
  const [heard, setHeard] = useState<Set<string>>(() => new Set());
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState("");
  const [finder, setFinder] = useState<StocktakeRow | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const payloadRef = useRef<StocktakePayload | null>(null);
  const heardRef = useRef<Set<string>>(new Set());
  const finderRef = useRef<StocktakeRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rfid/stocktake/${id}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not open this count");
      return;
    }
    payloadRef.current = json;
    setPayload(json);
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { inputRef.current?.focus(); }, [payload?.stocktake.status]);

  const { pushTokens, remember } = useScanBatch(async ({ epcs, skus }) => {
    try {
      const res = await fetch(`/api/rfid/stocktake/${id}/scans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epcs, skus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Could not save the scan");
      const added = (json.added ?? []) as StoredLine[];
      setPayload((prev) => {
        const next = prev ? absorbStocktakeScans(prev, added, json.warnings ?? []) : prev;
        payloadRef.current = next;
        return next;
      });
      setHeard((prev) => {
        const next = new Set(prev);
        for (const line of added) {
          if (line.pieceId) next.delete(line.pieceId);
        }
        heardRef.current = next;
        return next;
      });
      setError("");
    } catch (err) {
      const snap = payloadRef.current?.snapshot ?? [];
      const byEpc = new Map<string, string>();
      for (const piece of snap) {
        if (piece.epc) byEpc.set(piece.epc.toLowerCase(), piece.pieceId);
      }
      setHeard((prev) => {
        const next = new Set(prev);
        for (const epc of epcs) {
          const pieceId = byEpc.get(epc);
          if (pieceId) next.delete(pieceId);
        }
        heardRef.current = next;
        return next;
      });
      setError(err instanceof Error ? err.message : "Could not save the scan");
      throw err;
    }
  }, { releaseOnError: true });

  useEffect(() => {
    if (!payload) return;
    const epcs: string[] = [];
    const skus: string[] = [];
    const groups = [
      payload.groups.found,
      payload.groups.wrongTray ?? [],
      payload.groups.nearby ?? [],
      payload.groups.elsewhere,
      payload.groups.notInStock,
      payload.groups.unknown,
      payload.groups.blank,
    ];
    for (const rows of groups) {
      for (const row of rows) {
        if (row.epc) epcs.push(row.epc);
        if (row.sku) skus.push(row.sku);
      }
    }
    remember(epcs, skus);
  }, [payload, remember]);

  function noteFresh(epcs: string[]) {
    const current = payloadRef.current;
    if (!current?.snapshot || !epcs.length) return;
    const byEpc = new Map<string, SnapshotPiece>();
    for (const piece of current.snapshot) {
      if (piece.epc) byEpc.set(piece.epc.toLowerCase(), piece);
    }
    const expected = expectedEpcSet(current.snapshot);
    const missing = new Set(current.groups.missing.map((row) => row.pieceId).filter((pieceId): pieceId is string => !!pieceId));
    const newly: SnapshotPiece[] = [];
    for (const epc of epcs) {
      if (classifyRead(epc, new Set(), expected) !== "new") continue;
      const piece = byEpc.get(epc);
      if (!piece || !missing.has(piece.pieceId) || heardRef.current.has(piece.pieceId)) continue;
      newly.push(piece);
    }
    if (!newly.length) return;
    setHeard((prev) => {
      const next = new Set(prev);
      for (const piece of newly) next.add(piece.pieceId);
      heardRef.current = next;
      return next;
    });
    if (finderRef.current) return;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 700);
    const names = newly.slice(0, 3).map((piece) => piece.sku || "Piece");
    setToast(newly.length > 3 ? `${names.join(", ")} +${newly.length - 3}` : names.join(", "));
    window.setTimeout(() => setToast(""), 1600);
    newly.forEach((_, index) => { window.setTimeout(() => beepFound(), index * 80); });
  }

  function openFinder(row: StocktakeRow) {
    if (!row.epc) return;
    primeStocktakeAudio();
    finderRef.current = row;
    setFinder(row);
  }

  function closeFinder() {
    finderRef.current = null;
    setFinder(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function ingest(value: string) {
    const { complete, rest } = splitScanBuffer(value);
    if (complete.length) noteFresh(pushTokens(complete).epcs);
    setDraft(rest);
  }

  function destinationLabel(toLocationId: string): string {
    const target = payloadRef.current?.moveTargets?.find((item) => item.id === toLocationId)?.label;
    const named = target || payloadRef.current?.stocktake.location_name || "";
    return trayCode(named) || named || "here";
  }

  async function moveHere(row: StocktakeRow, toLocationId: string) {
    if (!payload || !row.pieceId || !toLocationId) return;
    setMovingId(row.pieceId);
    setError("");
    setMoveError("");
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
      const message = json.error || "Could not move the piece";
      setError(message);
      setMoveError(message);
      return;
    }
    const label = destinationLabel(toLocationId);
    const pieceId = row.pieceId;
    setPayload((prev) => {
      if (!prev) return prev;
      const next = noteMovedHere(prev, pieceId, { id: toLocationId, label });
      payloadRef.current = next;
      return next;
    });
    setPendingMove(null);
    setToast(movedHereDetail(label));
    window.setTimeout(() => setToast(""), 2200);
  }

  async function openUnit(unit: StocktakeUnit) {
    if (unit.started && unit.id) {
      router.push(`/rfid/stocktake/${unit.id}`);
      return;
    }
    const key = unit.zoneId || unit.locationId || unit.name;
    setOpeningKey(key);
    setError("");
    const body = unit.kind === "zone"
      ? { zone_id: unit.zoneId }
      : { location_id: unit.locationId, shop_parent: id };
    const res = await fetch("/api/rfid/stocktake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.id) {
      setError(json.error || "Could not open this zone");
      setOpeningKey(null);
      return;
    }
    router.push(`/rfid/stocktake/${json.id}`);
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
    payloadRef.current = json;
    setPayload(json);
    setConfirming(false);
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
        primeStocktakeAudio();
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
      {session?.status === "completed" && payload && (
        <section style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Missing ({payload.groups.missing.length})</h2>
          {payload.groups.missing.length === 0 && <p style={{ color: "#6B7280", margin: "0 0 12px" }}>Nothing missing.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {payload.groups.missing.map((row) => (
              <div key={row.key} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: "12px 14px", minHeight: 56 }}>
                <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700 }}>{row.sku || "Piece"}</div>
                {session.kind === "zone" && row.snapshotLocationLabel && (
                  <div style={{ fontSize: 14, color: "#4B5563", marginTop: 2 }}>{trayCode(row.snapshotLocationLabel)}</div>
                )}
              </div>
            ))}
          </div>
          <Link href={`/rfid/stocktake/${id}/report`} style={{ ...primaryButton, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
            Printable report
          </Link>
        </section>
      )}
      {session && session.status !== "in_progress" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
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
        <p style={{ margin: "0 0 12px", color: "#374151" }}>
          {WHOLE_SHOP_PART_NOTE}
          {" · "}
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
            if (finderRef.current) return;
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
          {payload.units.map((unit) => {
            const key = unit.id || unit.zoneId || unit.locationId || unit.name;
            if (unit.started && unit.id) {
              return (
                <Link key={key} href={`/rfid/stocktake/${unit.id}`} style={unitCard}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{unit.name}</div>
                  <div style={{ fontSize: 14, color: "#374151", marginTop: 4 }}>{formatStocktakeCounts(unit.counts)}</div>
                </Link>
              );
            }
            return (
              <button
                key={key}
                type="button"
                disabled={!open || openingKey === key}
                onClick={() => { void openUnit(unit); }}
                style={{ ...unitCard, textAlign: "left", width: "100%", cursor: "pointer" }}
              >
                <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{unit.name}</div>
                <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>{openingKey === key ? "Opening…" : "Not started"}</div>
              </button>
            );
          })}
          {payload.units.length === 0 && <p style={{ color: "#6B7280" }}>No zones to count.</p>}
        </div>
      )}
      {payload && open && !wholeShop && Array.isArray(payload.snapshot) && (
        <StocktakeLiveCount
          payload={payload}
          heardPieceIds={heard}
          zoneCount={session?.kind === "zone"}
          flash={flash}
          toast={toast}
          allowSeen={open}
          seeingId={seeingId}
          onSeen={(row, seen) => { void markSeen(row, seen); }}
          allowMove={open}
          movingId={movingId}
          onMoveHere={(row) => { setPendingMove(row); setMoveTargetId(""); setMoveError(""); }}
          confirmPieceId={pendingMove?.pieceId ?? null}
          moveError={moveError}
          moveTargetId={moveTargetId}
          moveTargets={payload.moveTargets ?? []}
          onMoveTargetId={setMoveTargetId}
          onConfirmMove={(row) => { void moveHere(row, session?.kind === "zone" ? moveTargetId : (session?.location_id || "")); }}
          onCancelMove={() => { setPendingMove(null); setMoveError(""); }}
          onFind={openFinder}
        />
      )}
      {payload && open && !wholeShop && !Array.isArray(payload.snapshot) && (
        <StocktakeGroupsView
          groups={payload.groups}
          counts={payload.counts}
          countLocationId={session?.location_id ?? null}
          allowMove={open}
          movingId={movingId}
          onMoveHere={(row) => { setPendingMove(row); setMoveTargetId(""); setMoveError(""); }}
          confirmPieceId={pendingMove?.pieceId ?? null}
          moveError={moveError}
          zoneCount={session?.kind === "zone"}
          moveTargetId={moveTargetId}
          moveTargets={payload.moveTargets ?? []}
          onMoveTargetId={setMoveTargetId}
          onConfirmMove={(row) => { void moveHere(row, session?.kind === "zone" ? moveTargetId : (session?.location_id || "")); }}
          onCancelMove={() => { setPendingMove(null); setMoveError(""); }}
          allowSeen={open}
          seeingId={seeingId}
          onSeen={(row, seen) => { void markSeen(row, seen); }}
          onFind={openFinder}
        />
      )}
      {finder?.epc && (
        <StocktakeFinder
          sku={finder.sku || "—"}
          pieceId={finder.pieceId || ""}
          epc={finder.epc}
          tray={session?.kind === "zone" ? trayCode(finder.snapshotLocationLabel) : null}
          onScan={(epc) => { noteFresh(pushTokens([epc]).epcs); }}
          onClose={closeFinder}
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
      <style>{`.stocktake-page { max-width: 720px; margin: 0 auto; overflow-x: hidden; padding-bottom: 128px; } .stocktake-skel { background: #E5E7EB; border-radius: 10px; animation: stocktake-pulse 1.2s ease-in-out infinite; } @keyframes stocktake-pulse { 50% { opacity: 0.45; } }`}</style>
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
