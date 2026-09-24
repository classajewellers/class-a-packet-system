// Shapes returned by variant_reorder_snapshot / maybe_create_reorder_draft_po
// (migration 164). Safe to import from client components — no server code.

export type ReorderState = "collecting" | "calculated" | "not_applicable";

export interface ReorderSnapshot {
  state: ReorderState;
  history_days: number;
  history_days_required: number;
  on_hand: number;
  manual_reorder_point: number | null;
  par_level: number | null;
  default_supplier_id: string | null;
  avg_lead_time_days: number | null;
  max_lead_time_days: number | null;
  avg_monthly_sales: number | null;
  max_monthly_sales: number | null;
  safety_stock: number | null;
  calculated_reorder_point: number | null;
  effective_reorder_point: number | null;
  calc_block_reason: "no_supplier" | "missing_lead_time" | null;
}

export interface ReorderDraftResult {
  purchase_order_id: string | null;
  po_number: string | null;
  quantity: number | null;
  skipped: string | null;
}

/** "23 of 90 days" — days elapsed since the first ledger sale, capped at 90. */
export function collectingProgressLabel(historyDays: number, required = 90): string {
  const shown = Math.max(0, Math.min(Number(historyDays) || 0, required));
  return `${shown} of ${required} days`;
}
