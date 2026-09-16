// Type declarations for melee-import-shared.mjs — plain JS so it can run
// standalone under `node` (see that file's header comment for why). Keep this
// in sync with the .mjs implementation.

export interface MeleeImportRow {
  shape: string;
  size_type: "carat_range";
  size_label: string;
  size_from: number;
  size_to: number;
  mm: string;
  quality: string;
  price_per_carat: number | null;
  price_per_stone: number | null;
  flagged: boolean;
}

export interface MeleeImportGroup {
  origin: "natural" | "lab";
  rows: MeleeImportRow[];
}

export interface MeleeQualityMapEntry {
  colour_group: string;
  clarity: string;
  quality: string;
}

export interface MeleeImportStats {
  totalDataRows: number;
  parcelsRows: number;
  droppedNonParcels: number;
  skippedIncomplete: number;
  unrecognizedOrigin: number;
  unrecognizedOriginValues: string[];
  rowsToStore: number;
  qualityMapCombos: number;
  conflicts: Array<{ origin: string; key: string; prices: number[] }>;
}

export interface MeleeImportSkippedSample {
  row: number;
  reason: string;
}

export type BuildMeleeImportResult =
  | {
      ok: true;
      payload: { groups: MeleeImportGroup[]; quality_map: MeleeQualityMapEntry[] };
      stats: MeleeImportStats;
      skippedSamples: MeleeImportSkippedSample[];
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
