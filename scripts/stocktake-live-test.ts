/**
 * New-versus-repeat reads, and the live found/expected fraction.
 * Run: npx tsx scripts/stocktake-live-test.ts
 */
import assert from "node:assert/strict";
import { classifyRead, expectedEpcSet, liveProgress, trayCode } from "../lib/stocktake-live.ts";
import { assembleStocktake, type SnapshotPiece, type StocktakePayload } from "../lib/rfid-stocktake.ts";

const epc = (n: number) => n.toString(16).padStart(24, "0");

function piece(n: number, extra?: Partial<SnapshotPiece>): SnapshotPiece {
  return {
    pieceId: `p${n}`,
    sku: `R${n}`,
    metal: null,
    epc: epc(n),
    snapshotLocationId: "ha3",
    snapshotStatus: "in_stock",
    liveStatus: "in_stock",
    liveLocationId: "ha3",
    liveLocationLabel: "HA3 · Horseshoe A3",
    seenAt: null,
    seenByName: null,
    resolution: null,
    resolvedLocationId: null,
    snapshotLocationCode: "HA3",
    snapshotLocationLabel: "HA3 · Horseshoe A3",
    ...extra,
  };
}

const snapshot: SnapshotPiece[] = [];
for (let n = 1; n <= 20; n += 1) snapshot.push(piece(n));
snapshot.push(piece(21, { epc: null, sku: "UNTAGGED" }));
snapshot.push(piece(22, { liveStatus: "sold", sku: "SOLD" }));

const expected = expectedEpcSet(snapshot);
assert.equal(expected.has(epc(1)), true);
assert.equal(expected.has(epc(21)), false);
assert.equal(classifyRead(epc(1), new Set(), expected), "new");
assert.equal(classifyRead(epc(1), new Set([epc(1)]), expected), "repeat");
assert.equal(classifyRead(epc(99), new Set(), expected), "unknown");
assert.equal(classifyRead("  " + epc(2).toUpperCase(), new Set(), expected), "new");

const view = assembleStocktake({
  lines: [],
  countLocationId: "loc",
  snapshot,
  v1Missing: [],
  scopeLocationIds: ["ha3", "ha4"],
});
const payload: StocktakePayload = {
  stocktake: {
    id: "s",
    status: "in_progress",
    kind: "zone",
    location_id: null,
    location_name: "Horseshoe A",
    started_at: "2026-09-26T00:00:00.000Z",
    finished_at: null,
    started_by_name: null,
    finished_by_name: null,
  },
  groups: view.groups,
  counts: view.counts,
  warnings: [],
  snapshot,
  scopeLocationIds: ["ha3", "ha4"],
};

const start = liveProgress(payload, new Set());
assert.equal(start.expected, 20);
assert.equal(start.found, 0);
assert.equal(start.stillToFind.length, 20);
assert.equal(trayCode(start.stillToFind[0].snapshotLocationLabel), "HA3");

const heard = liveProgress(payload, new Set(["p1", "p2"]));
assert.equal(heard.found, 2);
assert.equal(heard.expected, 20);
assert.equal(heard.stillToFind.length, 18);
assert.equal(heard.stillToFind.some((row) => row.pieceId === "p1"), false);

const again = liveProgress(payload, new Set(["p1"]));
assert.equal(classifyRead(epc(1), new Set([epc(1)]), expected), "repeat");
assert.equal(again.found, 1);

console.log("stocktake-live-test: ok");
