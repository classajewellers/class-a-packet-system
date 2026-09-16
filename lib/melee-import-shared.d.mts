// Type declarations for melee-import-shared.mjs — plain JS so it can run
// standalone under `node` (see that file's header comment for why). Named
// .d.mts (not .d.ts) because TypeScript's declaration lookup for an `.mjs`
// import specifically requires that extension under moduleResolution:
// "bundler" — a .d.ts companion is silently ignored, falling back to loose
// allowJs inference (this broke discriminated-union narrowing once already —
// see the commit that renamed this file).

export interface MeleeImportRow {
  shape: string;
  size_type: "carat_range";
  size_label: string;
  size_from: number;
  size_to: number;
  mm: string;
  quality: string;        // stored verbatim — pre-combined in the current format
  price_per_carat: number | null;
  price_per_stone: number | null;
  flagged: boolean;
}

export interface MeleeImportGroup {
  origin: "natural" | "lab";
  rows: MeleeImportRow[];
}

export interface MeleeImportStats {
  totalDataRows: number;
  skippedIncomplete: number;
  unrecognizedOrigin: number;
  unrecognizedOriginValues: string[];
  rowsToStore: number;
  distinctQualities: number;
  conflicts: Array<{ origin: string; key: string; prices: number[] }>;
}

export interface MeleeImportRowIssue {
  row: number;
  fields: string[];
  reason: string;
}

export type BuildMeleeImportResult =
  | {
      ok: true;
      payload: { groups: MeleeImportGroup[] };
      stats: MeleeImportStats;
      rowIssues: MeleeImportRowIssue[];
      rowIssuesTruncated: boolean;
    }
  | { ok: false; error: string; missing: string[] };

export function normalizeMm(mm: string | null | undefined): string;
export function resolveOriginValue(raw: unknown): "natural" | "lab" | null;
export function normalizeHeaderName(h: unknown): string;
export function resolveColumns(
  headerRow: unknown[],
  opts?: { originRequired?: boolean }
): { indices: Record<string, number>; missing: string[] };
export function buildMeleeImportPayload(
  headerRow: unknown[],
  dataRows: unknown[][],
  opts?: { forcedOrigin?: "natural" | "lab" | null; rowNumberOffset?: number }
): BuildMeleeImportResult;
export function parseCsv(text: string): string[][];
export function rowsToCsv(
  rows: Array<{
    origin?: string | null; shape?: string | null; quality?: string | null;
    size_from?: number | null; mm?: string | null;
    price_per_carat?: number | null; price_per_stone?: number | null;
  }>
): string;
