// Prana connector — first real implementation of the Supplier Connector
// Framework (migration 140, lib/connectors/types.ts).
//
// Deterministic extraction only, per the framework's own rule ("deterministic
// preferred over AI; AI is fallback only, not default"). This wraps the SAME
// parser already proven correct on Prana's real monthly melee price-list
// file — lib/melee-import-shared.mjs, already used by both
// scripts/import-prana-melee.mjs (local dry-run tool) and the Settings ->
// Melee "Import CSV" upload feature (app/api/pricing/melee-import/parse).
// No new parsing logic is introduced here — this gives that existing,
// working workflow a home in the connector model, nothing more.
//
// Does NOT attempt a live fetch from Prana's own systems — no credentials
// exist for that (VAULT_BUILD_CHECKLIST.md, blocked item 7.3). This
// connector's sync mechanism is "staff uploads the monthly file," exactly as
// today; syncFromFile is the connector-framework entry point for that same
// action, not a new capability.

import { parseCsv, buildMeleeImportPayload } from "@/lib/melee-import-shared.mjs";
import type { SupplierConnector, SyncResult } from "./types";

export const pranaConnector: SupplierConnector = {
  type: "prana_csv",

  async syncFromFile(fileText: string): Promise<SyncResult> {
    const rows = parseCsv(fileText);
    if (rows.length < 2) {
      return { ok: false, rowsProcessed: 0, rowsFlagged: 0, error: "File has no data rows." };
    }

    const [headerRow, ...dataRows] = rows;
    const result = buildMeleeImportPayload(headerRow, dataRows);

    if (!result.ok) {
      return { ok: false, rowsProcessed: 0, rowsFlagged: 0, error: result.error };
    }

    return {
      ok: true,
      rowsProcessed: result.stats.rowsToStore,
      rowsFlagged: result.rowIssues.length,
      detail: { payload: result.payload, stats: result.stats, rowIssues: result.rowIssues },
    };
  },
};
