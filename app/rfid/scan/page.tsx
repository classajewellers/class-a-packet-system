"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { splitScanBuffer } from "@/lib/rfid-scan";
import { useRfidScan, type ScanRow } from "@/lib/useRfidScan";
import { FALLBACK_STATUS_OPTIONS } from "@/lib/pieceResolution";

function money(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${Number(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return FALLBACK_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function tagLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ScanResult({ row }: { row: ScanRow }) {
  const piece = row.piece;
  const href = piece ? `/inventory/${piece.id}` : null;
  const body = (
    <>
      {row.state === "pending" && (
        <>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>Looking up…</div>
          <div style={{ fontFamily: "monospace", fontSize: 13, color: "#6B7280", wordBreak: "break-all", marginTop: 4 }}>{row.epc}</div>
        </>
      )}
      {row.state === "error" && (
        <>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>Could not look up</div>
          <div style={{ fontFamily: "monospace", fontSize: 13, color: "#6B7280", wordBreak: "break-all", marginTop: 4 }}>{row.epc}</div>
        </>
      )}
      {row.state === "missing" && (
        <>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>Not in Vault</div>
          <div style={{ fontFamily: "monospace", fontSize: 13, color: "#6B7280", wordBreak: "break-all", marginTop: 4 }}>{row.epc}</div>
        </>
      )}
      {row.state === "blank" && (
        <>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>Blank tag (never printed)</div>
          <div style={{ fontFamily: "monospace", fontSize: 13, color: "#6B7280", wordBreak: "break-all", marginTop: 4 }}>{row.epc}</div>
        </>
      )}
      {row.state === "found" && !piece && (
        <>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>Tag {tagLabel(row.tagStatus)}</div>
          <div style={{ fontFamily: "monospace", fontSize: 13, color: "#6B7280", wordBreak: "break-all", marginTop: 4 }}>{row.epc}</div>
        </>
      )}
      {row.state === "found" && piece && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#111827" }}>{piece.sku ?? row.sku ?? "—"}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", flexShrink: 0 }}>{money(piece.retail_price)}</div>
          </div>
          <div style={{ fontSize: 15, color: "#374151", marginTop: 4 }}>{piece.metal || "—"}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, fontSize: 13, color: "#4B5563" }}>
            <span>{statusLabel(piece.status)}</span>
            <span>·</span>
            <span>{piece.location_name || "No location"}</span>
            {row.tagStatus && (
              <>
                <span>·</span>
                <span>Tag {tagLabel(row.tagStatus)}</span>
              </>
            )}
            {row.kind === "sku" && !row.tagStatus && (
              <>
                <span>·</span>
                <span>Barcode</span>
              </>
            )}
          </div>
        </>
      )}
    </>
  );

  const style = {
    display: "block",
    width: "100%",
    boxSizing: "border-box" as const,
    textAlign: "left" as const,
    textDecoration: "none",
    background: "#fff",
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: "14px 14px",
    minHeight: 72,
    color: "inherit",
  };

  if (href) return <Link href={href} style={style}>{body}</Link>;
  return <div style={style}>{body}</div>;
}

export default function RfidScanPage() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [blanksOpen, setBlanksOpen] = useState(false);
  const { rows, pushTokens, clear } = useRfidScan();
  const mainRows = rows.filter((row) => row.state !== "blank");
  const blankRows = rows.filter((row) => row.state === "blank");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function focusInput() {
    inputRef.current?.focus();
  }

  function ingest(value: string) {
    const { complete, rest } = splitScanBuffer(value);
    if (complete.length) pushTokens(complete);
    setDraft(rest);
  }

  const tagCount = `${mainRows.length} tag${mainRows.length === 1 ? "" : "s"}`;
  const countLabel = blankRows.length ? `${tagCount} · ${blankRows.length} blank` : tagCount;

  return (
    <div
      className="rfid-scan-page"
      onPointerDown={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("a, button, textarea")) return;
        focusInput();
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>RFID Scan</h1>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>{countLabel}</div>
        <button
          type="button"
          onClick={() => { clear(); setDraft(""); setBlanksOpen(false); focusInput(); }}
          style={{
            minHeight: 48,
            padding: "0 18px",
            borderRadius: 10,
            border: "1px solid #E5E7EB",
            background: "#fff",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {mainRows.map((row) => <ScanResult key={row.key} row={row} />)}
      </div>
      {blankRows.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            aria-expanded={blanksOpen}
            onClick={() => setBlanksOpen((open) => !open)}
            style={{
              width: "100%",
              minHeight: 48,
              textAlign: "left",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #E5E7EB",
              background: "#F9FAFB",
              fontSize: 16,
              fontWeight: 700,
              color: "#111827",
              cursor: "pointer",
            }}
          >
            {blanksOpen ? "▾" : "▸"} Blank tag (never printed) · {blankRows.length}
          </button>
          {blanksOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {blankRows.map((row) => <ScanResult key={row.key} row={row} />)}
            </div>
          )}
        </div>
      )}
      <style>{`
        .rfid-scan-page { max-width: 720px; margin: 0 auto; overflow-x: hidden; }
        @media (max-width: 640px) {
          .rfid-scan-page { padding-bottom: 24px; }
        }
      `}</style>
    </div>
  );
}
