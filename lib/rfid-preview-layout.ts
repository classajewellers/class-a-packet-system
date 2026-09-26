import { DEFAULT_DPI } from "@/lib/rfid-label";

/** Geometry the preview shares with the bridge. dpiKnown is false only for the 203 fallback. */
export type PreviewLayout = {
  dpi: number;
  dpiKnown: boolean;
  lengthDots?: number;
  labelLengthMm?: number;
  headLeftMm?: number;
  headTopMm?: number;
  offsetXMm?: number;
  offsetYMm?: number;
};

export const UNKNOWN_PREVIEW_LAYOUT: PreviewLayout = { dpi: DEFAULT_DPI, dpiKnown: false };

function finiteDpi(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 150 || rounded > 600) return null;
  return rounded;
}

function finiteMm(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function positiveInt(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 1) return undefined;
  return n;
}

type CheckShape = {
  summary?: { dpi?: unknown } | null;
  bridge_overrides?: Record<string, unknown> | null;
};

/**
 * Match the bridge: printer.dpi in config wins, otherwise the reported head
 * dpi. When neither is known, the preview stays at 203 and says so.
 */
export function previewLayoutFromCheck(check: unknown, headDpi?: unknown): PreviewLayout {
  const record = check && typeof check === "object" ? (check as CheckShape) : null;
  const overrides = record?.bridge_overrides ?? {};
  const dpi = finiteDpi(overrides.dpi) ?? finiteDpi(record?.summary?.dpi) ?? finiteDpi(headDpi);
  if (dpi == null) return UNKNOWN_PREVIEW_LAYOUT;

  const layout: PreviewLayout = { dpi, dpiKnown: true };
  const lengthDots = positiveInt(overrides.labelLengthDots);
  const labelLengthMm = finiteMm(overrides.labelLengthMm);
  const headTopMm = finiteMm(overrides.tagHeadTopMm);
  const headLeftMm = finiteMm(overrides.tagHeadLeftMm);
  const offsetXMm = finiteMm(overrides.tagOffsetXMm);
  const offsetYMm = finiteMm(overrides.tagOffsetYMm);
  if (lengthDots != null) layout.lengthDots = lengthDots;
  if (labelLengthMm != null) layout.labelLengthMm = labelLengthMm;
  if (headTopMm != null) layout.headTopMm = headTopMm;
  if (headLeftMm != null) layout.headLeftMm = headLeftMm;
  if (offsetXMm != null) layout.offsetXMm = offsetXMm;
  if (offsetYMm != null) layout.offsetYMm = offsetYMm;
  return layout;
}

export function previewDpiCaption(layout: PreviewLayout): string {
  return layout.dpiKnown ? `at ${layout.dpi} dpi` : "at 203 dpi";
}
