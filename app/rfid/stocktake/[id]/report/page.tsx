"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import {
  formatNotTaggedSummary,
  formatResolvedSummary,
  formatStocktakeCounts,
  type ReportPiece,
  type StocktakeReport,
} from "@/lib/rfid-stocktake";
import { trayCode } from "@/lib/stocktake-live";
import { primeStocktakeAudio } from "@/lib/stocktake-audio";
import { StocktakeFinder } from "@/components/StocktakeFinder";

function when(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Adelaide" });
}

export default function StocktakeReportPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const { user, hydrated } = useUser();
  const manager = hydrated && canManage(user?.role);
  const [report, setReport] = useState<StocktakeReport | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [finder, setFinder] = useState<ReportPiece | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/rfid/stocktake/${id}/report`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Could not open the report");
      return;
    }
    setReport(json);
    setError("");
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function resolve(piece: ReportPiece, resolution: "found" | "still_missing") {
    setBusyId(piece.pieceId);
    setError("");
    const res = await fetch(`/api/rfid/stocktake/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        piece_id: piece.pieceId,
        resolution,
        location_id: resolution === "found" ? locations[piece.pieceId] || null : null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(json.error || "Could not save that");
      return;
    }
    await load();
  }

  const session = report?.stocktake;
  const finished = session?.status === "completed";

  return (
    <div className="stocktake-report">
      <div className="no-print" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        <Link href={`/rfid/stocktake/${id}`} style={textLink}>Back to count</Link>
        <button type="button" onClick={() => window.print()} style={primaryButton}>Print</button>
      </div>
      {!session && !error && <p>Loading report…</p>}
      {error && <p className="no-print" style={errorStyle}>{error}</p>}
      {session && report && (
        <>
          <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>{session.location_name || "Stocktake"}</h1>
          <p style={meta}>Started {when(session.started_at)}{session.started_by_name ? ` by ${session.started_by_name}` : ""}</p>
          <p style={meta}>Finished {when(session.finished_at)}{session.finished_by_name ? ` by ${session.finished_by_name}` : ""}</p>
          <p style={{ ...meta, fontWeight: 700, color: "#111827" }}>{formatStocktakeCounts(report.counts)}</p>
          {formatNotTaggedSummary(report.counts) && <p style={{ ...meta, fontWeight: 700, color: "#111827" }}>{formatNotTaggedSummary(report.counts)}</p>}
          {formatResolvedSummary(report.counts) && <p style={{ ...meta, fontWeight: 700, color: "#111827" }}>{formatResolvedSummary(report.counts)}</p>}

          <h2 style={sectionTitle}>Missing</h2>
          {report.missingByLocation.length === 0 && <p style={meta}>No missing pieces.</p>}
          {report.missingByLocation.map((group) => {
            const [first, ...rest] = group.pieces;
            return (
              <section key={group.location} className="stocktake-report-group">
                <div className="report-keep">
                  <h3 style={groupTitle}>{group.location}</h3>
                  {first && (
                    <MissingPiece
                      piece={first}
                      manager={manager}
                      finished={finished}
                      busy={busyId === first.pieceId}
                      locationValue={locations[first.pieceId] ?? ""}
                      locations={report.locations}
                      onLocation={(value) => setLocations((prev) => ({ ...prev, [first.pieceId]: value }))}
                      onResolve={(resolution) => { void resolve(first, resolution); }}
                      onFind={() => { primeStocktakeAudio(); setFinder(first); }}
                    />
                  )}
                </div>
                {rest.map((piece) => (
                  <MissingPiece
                    key={piece.pieceId}
                    piece={piece}
                    manager={manager}
                    finished={finished}
                    busy={busyId === piece.pieceId}
                    locationValue={locations[piece.pieceId] ?? ""}
                    locations={report.locations}
                    onLocation={(value) => setLocations((prev) => ({ ...prev, [piece.pieceId]: value }))}
                      onResolve={(resolution) => { void resolve(piece, resolution); }}
                      onFind={() => { primeStocktakeAudio(); setFinder(piece); }}
                    />
                ))}
              </section>
            );
          })}

          <Extra title="Not tagged, not checked" pieces={report.notTaggedUnchecked} />
          <Extra title="Sold during count" pieces={report.soldDuring} />
          <Extra title="Moved during count" pieces={report.movedDuring} />
          <Extra title="Wrong tray" pieces={report.wrongTray ?? []} />
          <Extra title="Read nearby, probably not moved" pieces={report.nearby ?? []} />

          <section className="report-keep report-sign">
            <div style={{ display: "flex", gap: 24, marginTop: 28, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px" }}>
                <div style={meta}>Signed</div>
                <div style={signLine} />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <div style={meta}>Date</div>
                <div style={signLine} />
              </div>
            </div>
          </section>
        </>
      )}
      {finder?.epc && (
        <StocktakeFinder
          sku={finder.sku}
          pieceId={finder.pieceId}
          epc={finder.epc}
          tray={trayCode(finder.locationLabel)}
          onClose={() => setFinder(null)}
        />
      )}
      <style>{`
        .stocktake-report { max-width: 800px; margin: 0 auto; color: #111827; overflow-x: hidden; }
        .stocktake-report * { box-sizing: border-box; }
        .report-piece, .report-keep { break-inside: avoid; page-break-inside: avoid; }
        @media print {
          .stocktake-report { max-width: none; }
          .stocktake-report .no-print { display: none !important; }
          .stocktake-report .print-only { display: block !important; }
        }
      `}</style>
    </div>
  );
}

function MissingPiece({
  piece,
  manager,
  finished,
  busy,
  locationValue,
  locations,
  onLocation,
  onResolve,
  onFind,
}: {
  piece: ReportPiece;
  manager: boolean;
  finished: boolean;
  busy: boolean;
  locationValue: string;
  locations: { id: string; label: string }[];
  onLocation: (value: string) => void;
  onResolve: (resolution: "found" | "still_missing") => void;
  onFind: () => void;
}) {
  return (
    <article className="report-piece" style={pieceCard}>
      <div style={sku}>{piece.sku}</div>
      <div style={meta}>{[piece.description, piece.metal, piece.price].filter(Boolean).join(" · ") || "—"}</div>
      <div style={meta}>Last seen {piece.lastSeen ? when(piece.lastSeen) : "never"}{piece.epcTail ? ` · Tag ${piece.epcTail}` : ""}</div>
      {piece.resolution && (
        <div style={meta}>
          {piece.resolution === "found" ? "Found" : "Still missing"}
          {piece.resolution === "found" && piece.resolvedLocationLabel ? ` at ${piece.resolvedLocationLabel}` : ""}
          {piece.resolvedByName ? ` · ${piece.resolvedByName}` : ""}
          {piece.resolvedAt ? ` · ${when(piece.resolvedAt)}` : ""}
        </div>
      )}
      <div className="print-only" style={{ marginTop: 8 }}>
        <span style={tick} /> Found
        <span style={{ ...tick, marginLeft: 16 }} /> Still missing
      </div>
      {piece.epc && (
        <button type="button" className="no-print" onClick={onFind} style={{ ...secondaryButton, marginTop: 8 }}>
          Find this ring
        </button>
      )}
      {manager && finished && (
        <div className="no-print" style={{ marginTop: 10 }}>
          <label style={{ display: "block", fontSize: 13, color: "#374151", marginBottom: 4 }} htmlFor={`loc-${piece.pieceId}`}>
            Location if found
          </label>
          <select
            id={`loc-${piece.pieceId}`}
            value={locationValue}
            onChange={(event) => onLocation(event.target.value)}
            style={selectStyle}
          >
            <option value="">Leave location</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.label}</option>
            ))}
          </select>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => onResolve("found")} style={piece.resolution === "found" ? chosen : primaryButton}>
              {busy ? "Saving…" : "Found"}
            </button>
            <button type="button" disabled={busy} onClick={() => onResolve("still_missing")} style={piece.resolution === "still_missing" ? chosen : secondaryButton}>
              Still missing
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function Extra({ title, pieces }: { title: string; pieces: ReportPiece[] }) {
  if (!pieces.length) return null;
  const [first, ...rest] = pieces;
  return (
    <section>
      <div className="report-keep">
        <h2 style={sectionTitle}>{title}</h2>
        <ExtraPiece piece={first} />
      </div>
      {rest.map((piece) => <ExtraPiece key={piece.pieceId} piece={piece} />)}
    </section>
  );
}

function ExtraPiece({ piece }: { piece: ReportPiece }) {
  return (
    <article className="report-piece" style={pieceCard}>
      <div style={sku}>{piece.sku}</div>
      <div style={meta}>{[piece.description, piece.metal, piece.price, piece.detail].filter(Boolean).join(" · ") || "—"}</div>
      <div style={meta}>Last seen {piece.lastSeen ? when(piece.lastSeen) : "never"}{piece.epcTail ? ` · Tag ${piece.epcTail}` : ""}</div>
    </article>
  );
}

const meta: CSSProperties = { margin: "2px 0", fontSize: 14, color: "#374151", lineHeight: 1.4 };
const sectionTitle: CSSProperties = { fontSize: 18, margin: "22px 0 8px" };
const groupTitle: CSSProperties = { fontSize: 16, margin: "12px 0 8px" };
const sku: CSSProperties = { fontFamily: "monospace", fontSize: 18, fontWeight: 700, wordBreak: "break-all" };
const pieceCard: CSSProperties = { borderBottom: "1px solid #E5E7EB", padding: "10px 0", breakInside: "avoid" };
const tick: CSSProperties = { display: "inline-block", width: 14, height: 14, border: "1.5px solid #111", marginRight: 6, verticalAlign: "-2px" };
const signLine: CSSProperties = { borderBottom: "1px solid #111", height: 36, marginTop: 8 };
const errorStyle: CSSProperties = { background: "#FEF2F2", color: "#991B1B", borderRadius: 10, padding: "12px 14px" };
const textLink: CSSProperties = { color: "#111827", fontWeight: 700 };
const primaryButton: CSSProperties = {
  minHeight: 48, width: "100%", border: "none", borderRadius: 10, background: "#111827", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
};
const secondaryButton: CSSProperties = {
  minHeight: 48, width: "100%", borderRadius: 10, border: "1px solid #D1D5DB", background: "#fff", color: "#111827", fontSize: 16, fontWeight: 700, cursor: "pointer",
};
const chosen: CSSProperties = { ...primaryButton, outline: "3px solid #93C5FD" };
const selectStyle: CSSProperties = {
  width: "100%", minHeight: 48, fontSize: 16, marginBottom: 8, borderRadius: 10, border: "1px solid #D1D5DB", background: "#fff",
};
