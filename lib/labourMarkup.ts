// Labour & setting markup from pricing_component_rules (Settings → Pricing
// Engine, label "Labour & setting markup"). Class A has one labour row
// (1.80) and no addon, setting, plating, or bench component type. That
// labour row is the live markup for quote-builder labour and addons.
// Retail is cost × this multiplier. A missing rule is not ×1 and not a
// hardcoded 1.50. Callers must show that the markup did not load.

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
