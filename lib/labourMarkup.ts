// Labour & setting markup from pricing_component_rules (Settings → Pricing
// Engine, label "Labour & setting markup"). Quote-builder labour and addons
// are wholesale costs. Retail is cost × this multiplier — the same rule
// calculate_price already applies to labour + setting outside ad-hoc mode.
// A missing rule is not ×1. Callers must show that the markup did not load
// instead of labelling the cost as "no multiplier".

export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function labourMultiplierFromRules(
  rules: Array<{ component_type?: string | null; multiplier?: number | string | null }>
): number | null {
  const row = rules.find((rule) => rule.component_type === "labour");
  if (!row || row.multiplier == null || row.multiplier === "") return null;
  const multiplier = Number(row.multiplier);
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
  return multiplier;
}

export function applyLabourMarkup(cost: number, multiplier: number | null): number {
  const safeCost = Number.isFinite(cost) ? cost : 0;
  if (multiplier == null) return roundMoney(safeCost);
  return roundMoney(safeCost * multiplier);
}

export function formatLabourMarkup(cost: number, multiplier: number | null): string {
  const amount = Number.isFinite(cost) ? cost : 0;
  const costLabel = `$${amount.toFixed(2)}`;
  if (multiplier == null) return `${costLabel} · markup not set`;
  return `${costLabel} × ${multiplier.toFixed(2)} = $${applyLabourMarkup(amount, multiplier).toFixed(2)}`;
}
