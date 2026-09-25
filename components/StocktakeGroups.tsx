"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { FALLBACK_STATUS_OPTIONS } from "@/lib/pieceResolution";
import type { StocktakeCounts, StocktakeGroups, StocktakeRow } from "@/lib/rfid-stocktake";

function statusLabel(value: string | null): string {
  if (!value) return "";
  return FALLBACK_STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function PieceRow({
  row,
  extra,
  action,
}: {
  row: StocktakeRow;
  extra?: string;
  action?: ReactNode;
}) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid #E5E7EB",
      borderRadius: 12,
      padding: "12px 14px",
      minHeight: 64,
    }}>
      <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: "#111827", wordBreak: "break-all" }}>
        {row.sku || "—"}
      </div>
      <div style={{ fontSize: 14, color: "#374151", marginTop: 2 }}>
        {[row.metal, statusLabel(row.status)].filter(Boolean).join(" · ") || "—"}
      </div>
      {extra && <div style={{ fontSize: 14, color: "#4B5563", marginTop: 4 }}>{extra}</div>}
      {row.epc && (
        <div style={{ fontFamily: "monospace", fontSize: 12, color: "#6B7280", wordBreak: "break-all", marginTop: 4 }}>{row.epc}</div>
      )}
      {action}
    </div>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section style={{ marginTop: 16 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>{title} · {count}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </section>
  );
}

export function StocktakeGroupsView({
  groups,
  counts,
  countLocationId,
  onMoveHere,
  movingId,
  allowMove,
}: {
  groups: StocktakeGroups;
  counts: StocktakeCounts;
  countLocationId: string | null;
  onMoveHere?: (row: StocktakeRow) => void;
  movingId?: string | null;
  allowMove?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", lineHeight: 1.4 }}>
        Found {counts.found} · Missing {counts.missing} · Somewhere else {counts.elsewhere} · Unknown {counts.unknown}
        {counts.blank ? ` · ${counts.blank} blank` : ""}
      </div>
      <Group title="Found" count={counts.found}>
        {groups.found.length === 0 && <Empty />}
        {groups.found.map((row) => <PieceRow key={row.key} row={row} />)}
      </Group>
      <Group title="Missing" count={counts.missing}>
        {groups.missing.length === 0 && <Empty />}
        {groups.missing.map((row) => <PieceRow key={row.key} row={row} extra="Expected, not scanned" />)}
      </Group>
      <Group title="Somewhere else" count={counts.elsewhere}>
        {groups.elsewhere.length === 0 && <Empty />}
        {groups.elsewhere.map((row) => {
          const where = row.locationName || "No location";
          const samePlace = !!countLocationId && row.locationId === countLocationId;
          return (
            <PieceRow
              key={row.key}
              row={row}
              extra={row.movedHere ? `Was ${where}. Moved here.` : `Vault: ${where}`}
              action={allowMove && row.pieceId && !row.movedHere && !samePlace ? (
                <button
                  type="button"
                  onClick={() => onMoveHere?.(row)}
                  disabled={movingId === row.pieceId}
                  style={moveButton}
                >
                  {movingId === row.pieceId ? "Moving…" : "Move here"}
                </button>
              ) : null}
            />
          );
        })}
      </Group>
      <Group title="Unknown" count={counts.unknown}>
        {groups.unknown.length === 0 && counts.blank === 0 && <Empty />}
        {groups.unknown.map((row) => (
          <div key={row.key} style={plainCard}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>Not in Vault</div>
            <div style={{ fontFamily: "monospace", fontSize: 13, color: "#6B7280", wordBreak: "break-all", marginTop: 4 }}>{row.epc}</div>
          </div>
        ))}
        {counts.blank > 0 && <BlankGroup rows={groups.blank} />}
      </Group>
    </div>
  );
}

function Empty() {
  return <div style={{ fontSize: 14, color: "#6B7280" }}>None</div>;
}

function BlankGroup({ rows }: { rows: StocktakeRow[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} style={blankButton}>
        {open ? "▾" : "▸"} Blank tag (never printed) · {rows.length}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {rows.map((row) => (
            <div key={row.key} style={plainCard}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>Blank tag (never printed)</div>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: "#6B7280", wordBreak: "break-all", marginTop: 4 }}>{row.epc}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const plainCard: CSSProperties = {
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: "12px 14px",
};

const moveButton: CSSProperties = {
  marginTop: 10,
  minHeight: 48,
  width: "100%",
  borderRadius: 10,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
};

const blankButton: CSSProperties = {
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
};
