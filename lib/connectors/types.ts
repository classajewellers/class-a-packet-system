// Supplier Connector Framework — shared types.
//
// Phase 2.1 of the 2026-09-22 operational-readiness build
// (VAULT_BUILD_CHECKLIST.md). Every connector implements this same shape so
// the supplier-sync UI/API (built once) can drive any of them identically,
// rather than each supplier integration being bespoke — the gap this
// session's audit found in lib/shopify.ts / lib/sendSms.ts / lib/klaviyo.ts,
// each with its own ad-hoc conventions.
//
// Deterministic extraction is the default and preferred path — a connector
// parses a file/feed with real, auditable logic. AI is fallback only, for
// unstructured input a deterministic parser genuinely cannot handle (e.g. a
// scanned PDF price list with no fixed columns), and even then must produce
// a flagged, human-reviewable result, never an auto-committed one — see the
// existing app/api/pricing/melee-import/extract pattern for the established
// convention (forced tool-use, flag uncertain rows, separate /confirm step).

export interface SyncResult {
  ok: boolean;
  rowsProcessed: number;
  rowsFlagged: number;
  error?: string;
  /** Connector-specific diagnostic payload (e.g. parsed rows, stats, row
   *  issues) — shape varies per connector, consumed by whatever calls
   *  syncFromFile, not by the framework itself. */
  detail?: unknown;
}

export interface SupplierConnector {
  /** Matches inventory_suppliers.connector_type (migration 140). */
  type: string;
  /**
   * Deterministic extraction from a raw uploaded file's text content.
   * Must never silently guess — an ambiguous row is a flagged row
   * (counted in rowsFlagged), not a best-effort committed one.
   */
  syncFromFile(fileText: string, filename: string): Promise<SyncResult>;
}
