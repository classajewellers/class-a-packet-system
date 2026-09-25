/**
 * Natural order of the 58 location codes.
 * Run: npx tsx scripts/location-code-order-test.ts
 *
 * A1..A7, then AD1..AD7, then C1..C6, then HA1..HA14 (HA2 before HA10),
 * then HB1..HB14. Word codes sit alphabetically among those.
 */
import assert from "node:assert/strict";
import { compareLocations } from "../lib/location-label.ts";

function numbered(prefix: string, count: number): string[] {
  const codes: string[] = [];
  for (let n = 1; n <= count; n += 1) codes.push(`${prefix}${n}`);
  return codes;
}

const expected = [
  ...numbered("A", 7),
  ...numbered("AD", 7),
  ...numbered("C", 6),
  "Cust Hold",
  "Daniel",
  ...numbered("HA", 14),
  ...numbered("HB", 14),
  "Inf Bor",
  "Marketing",
  "Photo",
  "Portobello",
  "Staff Bor",
  "Trunk",
  "Vault",
  "WS",
];

assert.equal(expected.length, 58);

const rows = [...expected].reverse().map((code) => ({ code, name: `Name ${code}` }));
const sorted = rows.sort(compareLocations).map((row) => row.code);
assert.deepEqual(sorted, expected);

console.log("location-code-order-test: ok");
