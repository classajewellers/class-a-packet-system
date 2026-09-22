// Class A's real team pricing rule (confirmed by Josh, 2026-09-22): round
// UP (never down) to the nearest price ending in 49 or 99 — never to the
// nearest $5. Every $100 block has exactly two valid endings, X49 and X99;
// find the smallest one at or above the raw price.
//
// Shared by the quote builder (app/quotes/builder/new/page.tsx — main
// quoted price and the "Stone Option Prices" comparison) and the charm
// necklace configure route (app/api/charm-necklace/configure/route.ts).
export function roundUpTo49or99(price: number): number {
  if (price <= 0) return 0;
  const p = Math.round(price * 100) / 100; // clear float dust before comparing
  const block = Math.floor(p / 100) * 100;
  const opt49 = block + 49;
  const opt99 = block + 99;
  const EPS = 1e-9;
  if (p <= opt49 + EPS) return opt49;
  if (p <= opt99 + EPS) return opt99;
  return block + 100 + 49;
}
