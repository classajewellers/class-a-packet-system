"use client";

import type { CSSProperties } from "react";
import {
  DEFAULT_DPI,
  LABEL_LENGTH_MM,
  LABEL_WIDTH_MM,
  placeBack,
  placeFrontLines,
  tagGeometry,
  type TagCopy,
} from "@/lib/rfid-label";

type Props = {
  copy: TagCopy;
  printing: boolean;
  error: string;
  onPrint: () => void;
  onCancel: () => void;
};

/**
 * To-scale flag preview. Coordinates come from the same layout module as the ZPL.
 * 203 dpi is 8 dots per millimetre, which is the stored label and the Labelary check.
 */
export default function RfidTagPreview({ copy, printing, error, onPrint, onCancel }: Props) {
  const geo = tagGeometry(DEFAULT_DPI);
  const front = placeFrontLines(geo.top, geo.dpi, copy);
  const back = placeBack(geo.bottom, geo.dpi, copy.sku);
  const headW = Math.max(1, geo.headRight - geo.headLeft);
  const headH = Math.max(1, geo.headBottom - geo.headTop);
  const tailW = Math.max(1, geo.labelWidth - geo.headRight);

  return (
    <div
      role="dialog"
      aria-label="Preview tag"
      style={overlay}
      onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <div style={sheet}>
        <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Preview tag</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6B7280" }}>
          {LABEL_WIDTH_MM} × {LABEL_LENGTH_MM} mm at {DEFAULT_DPI} dpi. The tail is not printed.
        </p>
        <svg
          viewBox={`0 0 ${geo.labelWidth} ${geo.labelLength}`}
          width="100%"
          role="img"
          aria-label={`${copy.sku} tag preview`}
          style={{ display: "block", background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8 }}
        >
          <defs>
            <clipPath id="rfid-front-flag">
              <rect x={geo.top.x} y={geo.top.y} width={geo.top.w} height={geo.top.h} />
            </clipPath>
            <clipPath id="rfid-back-flag">
              <rect x={geo.bottom.x} y={geo.bottom.y} width={geo.bottom.w} height={geo.bottom.h} />
            </clipPath>
          </defs>
          <rect x={0} y={0} width={geo.labelWidth} height={geo.labelLength} fill="#F9FAFB" />
          <rect x={geo.headLeft} y={geo.headTop} width={headW} height={headH} fill="#fff" stroke="#111827" strokeWidth={2} />
          <line x1={geo.headLeft} y1={geo.fold} x2={geo.headRight} y2={geo.fold} stroke="#9CA3AF" strokeWidth={1} strokeDasharray="4 3" />
          <rect
            x={geo.headRight}
            y={geo.headTop}
            width={tailW}
            height={headH}
            fill="none"
            stroke="#9CA3AF"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <g clipPath="url(#rfid-front-flag)">
            {front.map((line) => (
              <text
                key={line.key}
                x={line.x + line.width / 2}
                y={line.y + line.font * 0.82}
                textAnchor="middle"
                fontSize={line.font}
                fontWeight={line.bold ? 700 : 500}
                fontFamily="Arial, Helvetica, sans-serif"
                fill="#111827"
              >
                {line.text}
              </text>
            ))}
          </g>
          <g clipPath="url(#rfid-back-flag)">
            <text
              x={back.text.x + back.text.width / 2}
              y={back.text.y + back.text.font * 0.82}
              textAnchor="middle"
              fontSize={back.text.font}
              fontFamily="Arial, Helvetica, sans-serif"
              fill="#111827"
              transform={`rotate(180 ${back.text.x + back.text.width / 2} ${back.text.y + back.text.font / 2})`}
            >
              {back.text.text}
            </text>
            {back.barcode && <BarcodeMark barcode={back.barcode} />}
          </g>
        </svg>
        {error && <p style={{ color: "#991B1B", fontSize: 14, margin: "10px 0 0" }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onCancel} style={cancelButton}>Cancel</button>
          <button type="button" onClick={onPrint} disabled={printing} style={printButton}>
            {printing ? "Sending…" : "Print"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BarcodeMark({ barcode }: { barcode: { x: number; y: number; module: number; height: number; data: string } }) {
  const modules = 11 * Math.max(barcode.data.length, 1) + 35;
  const width = modules * barcode.module;
  const bars: Array<{ x: number; w: number }> = [];
  let cursor = 0;
  const steps = barcode.data.length + 8;
  for (let i = 0; i < steps && cursor < width; i += 1) {
    const code = barcode.data.charCodeAt(i % barcode.data.length) || 1;
    const w = barcode.module * ((code + i) % 3 === 0 ? 3 : 1);
    if (i % 2 === 0) bars.push({ x: cursor, w: Math.min(w, width - cursor) });
    cursor += w;
  }
  const cx = barcode.x + width / 2;
  const cy = barcode.y + barcode.height / 2;
  return (
    <g transform={`rotate(180 ${cx} ${cy})`}>
      {bars.map((bar, index) => (
        <rect key={index} x={barcode.x + bar.x} y={barcode.y} width={bar.w} height={barcode.height} fill="#111827" />
      ))}
    </g>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 70,
  background: "rgba(17,24,39,0.45)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  padding: 12,
};

const sheet: CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 16,
  width: "min(440px, 100%)",
  maxHeight: "100%",
  overflow: "auto",
  boxSizing: "border-box",
};

const cancelButton: CSSProperties = {
  flex: 1,
  minHeight: 52,
  borderRadius: 12,
  border: "1px solid #D1D5DB",
  background: "#fff",
  fontSize: 16,
  fontWeight: 700,
};

const printButton: CSSProperties = {
  flex: 1,
  minHeight: 52,
  borderRadius: 12,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
};
