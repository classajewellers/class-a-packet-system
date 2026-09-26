/**
 * New-versus-repeat reads, and the live found/expected fraction.
 * Run: npx tsx scripts/stocktake-live-test.ts
 */
import assert from "node:assert/strict";
import { classifyRead, expectedEpcSet, liveProgress, proximityGapMs, readsPerSecond, trayCode } from "../lib/stocktake-live.ts";
import { epcsFromLines } from "../lib/rfid-scan.ts";
import {
  annotateSameZoneLines,
  assembleStocktake,
  buildZoneBoard,
  movedHereDetail,
  noteMovedHere,
  sameZonePlaceDetail,
  wholeShopProgressLabel,
  zoneBoardLabel,
  type SnapshotPiece,
  type StocktakePayload,
  type StoredLine,
} from "../lib/rfid-stocktake.ts";

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

const now = 10_000;
assert.equal(readsPerSecond([], now), 0);
assert.equal(readsPerSecond([now - 100, now - 200, now - 400], now), 2);
assert.equal(readsPerSecond([now - 5000, now - 100], now), 1 / 1.5);
assert.ok(proximityGapMs(0) > proximityGapMs(2));
assert.ok(proximityGapMs(2) > proximityGapMs(8));
const repeated = epcsFromLines([epc(1), epc(1), epc(2)]);
assert.deepEqual(repeated, [epc(1), epc(1), epc(2)]);

assert.equal(wholeShopProgressLabel(0, 32), "Whole shop · 0 of 32 zones started");
assert.equal(wholeShopProgressLabel(32, 32), "Whole shop · 32 of 32 zones started");
assert.equal(sameZonePlaceDetail("HA1"), "In HA1 (same zone) — probably not moved");
assert.equal(movedHereDetail("HA2"), "Moved to HA2 ✓");

const trays = [
  { id: "ha1", code: "HA1", zoneId: "ha" },
  { id: "ha2", code: "HA2", zoneId: "ha" },
  { id: "hb1", code: "HB1", zoneId: "hb" },
];
const elsewhereLine: StoredLine = {
  id: "scan-1",
  epc: epc(9),
  sku: "RING-02",
  pieceId: "ring-02",
  result: "wrong_location",
  metal: null,
  status: "in_stock",
  locationName: "HA1 · Horseshoe A1",
  locationId: "ha1",
};
const farLine: StoredLine = { ...elsewhereLine, id: "scan-2", pieceId: "ring-far", sku: "FAR", locationId: "hb1", locationName: "HB1" };
const annotated = annotateSameZoneLines([elsewhereLine, farLine], "ha2", trays);
assert.equal(annotated[0].detail, "In HA1 (same zone) — probably not moved");
assert.equal(annotated[1].detail, undefined);

const movePayload: StocktakePayload = {
  stocktake: {
    id: "count",
    status: "in_progress",
    kind: "location",
    location_id: "ha2",
    location_name: "HA2 · Horseshoe A2",
    started_at: "2026-09-26T01:00:00.000Z",
    finished_at: null,
    started_by_name: null,
    finished_by_name: null,
  },
  groups: assembleStocktake({ lines: [elsewhereLine], countLocationId: "ha2", snapshot: [], v1Missing: [] }).groups,
  counts: assembleStocktake({ lines: [elsewhereLine], countLocationId: "ha2", snapshot: [], v1Missing: [] }).counts,
  warnings: [],
  snapshot: [],
};
assert.equal(movePayload.groups.elsewhere.length, 1);
const moved = noteMovedHere(movePayload, "ring-02", { id: "ha2", label: "HA2" });
assert.equal(moved.groups.elsewhere.length, 0);
assert.equal(moved.groups.found.length, 1);
assert.equal(moved.groups.found[0].detail, "Moved to HA2 ✓");
assert.equal(moved.groups.found[0].sku, "RING-02");

assert.equal(zoneBoardLabel({ name: "Horseshoe A" }, [
  { code: "HA1", name: "Horseshoe A1" },
  { code: "HA2", name: "Horseshoe A2" },
]), "Horseshoe A");
assert.equal(zoneBoardLabel({ name: "Arch 1" }, [{ code: "A1", name: "Arch 1" }]), "A1 · Arch 1");

const board = buildZoneBoard([
  {
    id: "ha",
    code: "HA",
    name: "Horseshoe A",
    locations: [
      { id: "ha1", code: "HA1", name: "Horseshoe A1" },
      { id: "ha2", code: "HA2", name: "Horseshoe A2" },
    ],
  },
  {
    id: "a1",
    code: "A1",
    name: "Arch 1",
    locations: [{ id: "loc-a1", code: "A1", name: "Arch 1" }],
  },
], [
  {
    id: "ha2-count",
    status: "in_progress",
    kind: "location",
    zoneId: null,
    locationId: "ha2",
    finishedAt: null,
    startedAt: "2026-09-26T01:23:37.000Z",
  },
  {
    id: "old",
    status: "completed",
    kind: "zone",
    zoneId: "ha",
    locationId: null,
    finishedAt: "2026-09-01T00:00:00.000Z",
    startedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "shop",
    status: "in_progress",
    kind: "whole_shop",
    zoneId: null,
    locationId: null,
    finishedAt: null,
    startedAt: "2026-09-26T01:13:10.000Z",
  },
]);
assert.equal(board[0].name, "A1 · Arch 1");
assert.equal(board[0].open, false);
assert.equal(board[0].lastCountedAt, null);
assert.equal(board[1].name, "Horseshoe A");
assert.equal(board[1].open, true);
assert.equal(board[1].lastCountedAt, "2026-09-01T00:00:00.000Z");

console.log("stocktake-live-test: ok");
