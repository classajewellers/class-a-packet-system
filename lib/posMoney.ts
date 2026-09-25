/** Money helpers for POS Slice 1.
 * Vault retail prices are GST-inclusive (quotes and tags already say "incl. GST").
 * Tax on a cash sale is the GST component of that inclusive total, not an extra charge.
 */

export function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function toCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100);
}

/** GST portion of a GST-inclusive amount. Zero when the tenant is not GST registered. */
export function gstFromInclusive(totalIncGst: number, gstRegistered: boolean): number {
  if (!gstRegistered || !(totalIncGst > 0)) return 0;
  return roundMoney(totalIncGst - totalIncGst / 1.1);
}

/** Expected drawer = opening float + cash taken during the session. */
export function expectedDrawerCash(openingFloat: number, cashSales: number): number {
  return roundMoney(Number(openingFloat) + Number(cashSales));
}

/** actual − expected. Positive means the drawer is over; negative means short. */
export function cashVariance(actualCount: number, openingFloat: number, cashSales: number): number {
  return roundMoney(Number(actualCount) - expectedDrawerCash(openingFloat, cashSales));
}
