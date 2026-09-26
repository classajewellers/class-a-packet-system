/**
 * Stocktake classification checks.
 * Run: npx tsx scripts/rfid-stocktake-classify-test.ts
 */
import assert from "node:assert/strict";
import {
  absorbStocktakeScans,
  applyUntaggedSeen,
  assembleStocktake,
  buildStocktakeGroups,
  classifySnapshotRow,
  classifyStocktakeHit,
  formatNotTaggedSummary,
  formatStocktakeCounts,
  missingPieceIds,
  planStocktakeInserts,
  preferredTagEpc,
  type SnapshotPiece,
  type StocktakePayload,
  type StoredLine,
} from "../lib/rfid-stocktake.ts";

const floor = "floor";

assert.equal(classifyStocktakeHit({
  hasPiece: true, hasEpc: true, status: "in_stock", locationId: floor, countLocationId: floor,
}), "found");
assert.equal(classifyStocktakeHit({
  hasPiece: true, hasEpc: true, status: "in_stock", locationId: null, countLocationId: floor,
}), "wrong_location");
assert.equal(classifyStocktakeHit({
  hasPiece: true, hasEpc: true, status: "in_stock", locationId: "workshop", countLocationId: floor,
}), "wrong_location");
assert.equal(classifyStocktakeHit({
  hasPiece: true, hasEpc: true, status: "sold", locationId: floor, countLocationId: floor,
}), "not_in_stock");
assert.equal(classifyStocktakeHit({
  hasPiece: true, hasEpc: true, status: "reserved", locationId: null, countLocationId: floor,
}), "not_in_stock");
assert.equal(classifyStocktakeHit({
  hasPiece: false, hasEpc: true, status: null, locationId: null, countLocationId: floor,
}), "unknown");
assert.equal(classifyStocktakeHit({
  hasPiece: false, hasEpc: false, status: null, locationId: null, countLocationId: floor,
}), "ignore");

assert.equal(preferredTagEpc([
  { epc: "aaa", status: "damaged" },
  { epc: "bbb", status: "printed" },
  { epc: "ccc", status: "active" },
]), "ccc");
assert.equal(preferredTagEpc([{ epc: "ddd", status: "retired" }]), null);

const planned = planStocktakeInserts(
  ["aa3a06d60e1f4eb67b5c0f69"],
  [
    { epc: "aa3a06d60e1f4eb67b5c0f69", sku: "RING-01", pieceId: "ring-1", result: "found" },
    { epc: "e28069150000600b41488d28", sku: null, pieceId: null, result: "unknown" },
  ],
);
assert.equal(planned.length, 1);
assert.equal(planned[0].result, "unknown");

assert.deepEqual(missingPieceIds(["ring-1", "ring-3"], ["ring-1"]), ["ring-3"]);

const view = buildStocktakeGroups([
  {
    id: "line-1",
    epc: "aa3a06d60e1f4eb67b5c0f69",
    sku: "RING-01",
    pieceId: "ring-1",
    result: "found",
    metal: "18K Yellow",
    status: "in_stock",
    locationName: "Display Floor",
    locationId: floor,
  },
  {
    id: "line-else",
    epc: "3689cda63ecfe59565756336",
    sku: "XX-0002",
    pieceId: "xx",
    result: "wrong_location",
    metal: null,
    status: "in_stock",
    locationName: null,
    locationId: null,
  },
  {
    id: "line-moved",
    epc: "0cfa57ce60c580f65588501e",
    sku: "RING-02",
    pieceId: "ring-2",
    result: "wrong_location",
    metal: null,
    status: "in_stock",
    locationName: "Display Floor",
    locationId: floor,
  },
  {
    id: "line-sold",
    epc: "111111111111111111111111",
    sku: "SOLD-1",
    pieceId: "sold",
    result: "not_in_stock",
    metal: null,
    status: "sold",
    locationName: "Display Floor",
    locationId: floor,
  },
  {
    id: "line-blank",
    epc: "e28069150000600b41488d28",
    sku: null,
    pieceId: null,
    result: "unknown",
    metal: null,
    status: null,
    locationName: null,
    locationId: null,
  },
  {
    id: "line-unknown",
    epc: "deadbeefdeadbeefdeadbeef",
    sku: null,
    pieceId: null,
    result: "unknown",
    metal: null,
    status: null,
    locationName: null,
    locationId: null,
  },
], [
  { pieceId: "ring-3", sku: "RING-03", metal: "14K Rose", status: "in_stock", locationName: "Display Floor" },
], floor);

assert.equal(view.counts.found, 1);
assert.equal(view.counts.missing, 1);
assert.equal(view.groups.missing[0].sku, "RING-03");
assert.equal(view.counts.elsewhere, 2);
assert.equal(view.groups.elsewhere.find((row) => row.sku === "RING-02")?.movedHere, true);
assert.equal(view.groups.elsewhere.find((row) => row.sku === "XX-0002")?.movedHere, false);
assert.equal(view.counts.notInStock, 1);
assert.equal(view.groups.notInStock[0].status, "sold");
assert.equal(view.counts.blank, 1);
assert.equal(view.counts.unknown, 1);
assert.equal(formatStocktakeCounts(view.counts), "Found 1 · Missing 1 · Somewhere else 2 · Unknown 1 · Not in stock 1 · 1 blank");

const finished = buildStocktakeGroups([], [
  { pieceId: "ring-3", sku: "RING-03", metal: null, status: "in_stock", locationName: "Display Floor" },
], floor);
assert.equal(finished.counts.missing, 1);
assert.equal(finished.groups.missing[0].sku, "RING-03");

const live: StocktakePayload = {
  stocktake: {
    id: "session",
    status: "in_progress",
    location_id: floor,
    location_name: "Display Floor",
    started_at: "2026-09-25T23:08:34.489Z",
    finished_at: null,
    started_by_name: null,
    finished_by_name: null,
  },
  groups: {
    found: [],
    missing: [
      { key: "missing:ring-1", epc: null, sku: "RING-01", pieceId: "ring-1", metal: null, status: "in_stock", locationName: "Display Floor", locationId: null, movedHere: false },
      { key: "missing:ring-3", epc: null, sku: "RING-03", pieceId: "ring-3", metal: null, status: "in_stock", locationName: "Display Floor", locationId: null, movedHere: false },
    ],
    elsewhere: [],
    notInStock: [],
    unknown: [],
    blank: [],
  },
  counts: { found: 0, missing: 2, elsewhere: 0, notInStock: 0, unknown: 0, blank: 0 },
  warnings: [],
};
const merged = absorbStocktakeScans(live, [{
  id: "scan-1",
  epc: "aa3a06d60e1f4eb67b5c0f69",
  sku: "RING-01",
  pieceId: "ring-1",
  result: "found",
  metal: null,
  status: "in_stock",
  locationName: "HA1 · Horseshoe A1",
  locationId: floor,
}], ["kept"]);
assert.equal(merged.counts.found, 1);
assert.equal(merged.counts.missing, 1);
assert.equal(merged.groups.missing[0].sku, "RING-03");
assert.equal(merged.groups.found[0].locationName, "HA1 · Horseshoe A1");
assert.deepEqual(merged.warnings, ["kept"]);

const ha1 = "ha1";
const ha3 = "ha3";
function snap(partial: Partial<SnapshotPiece> & Pick<SnapshotPiece, "pieceId">): SnapshotPiece {
  return {
    sku: partial.pieceId,
    metal: null,
    epc: partial.epc === undefined ? "abc" : partial.epc,
    snapshotLocationId: ha1,
    snapshotStatus: "in_stock",
    liveStatus: "in_stock",
    liveLocationId: ha1,
    liveLocationLabel: "HA1 · Horseshoe A1",
    seenAt: null,
    seenByName: null,
    resolution: null,
    resolvedLocationId: null,
    ...partial,
  };
}
assert.equal(classifySnapshotRow({
  snapshotEpc: "abc", snapshotLocationId: ha1, liveStatus: "in_stock", liveLocationId: ha1, scanned: false,
}), "missing");
assert.equal(classifySnapshotRow({
  snapshotEpc: "abc", snapshotLocationId: ha1, liveStatus: "in_stock", liveLocationId: ha1, scanned: true,
}), "in_count");
assert.equal(classifySnapshotRow({
  snapshotEpc: null, snapshotLocationId: ha1, liveStatus: "in_stock", liveLocationId: ha1, scanned: false,
}), "untagged");
assert.equal(classifySnapshotRow({
  snapshotEpc: "abc", snapshotLocationId: ha1, liveStatus: "sold", liveLocationId: ha3, scanned: false,
}), "sold");
assert.equal(classifySnapshotRow({
  snapshotEpc: null, snapshotLocationId: ha1, liveStatus: "workshop", liveLocationId: ha1, scanned: false,
}), "sold");
assert.equal(classifySnapshotRow({
  snapshotEpc: "abc", snapshotLocationId: ha1, liveStatus: "in_stock", liveLocationId: ha3, scanned: true,
}), "moved");
assert.equal(classifySnapshotRow({
  snapshotEpc: "abc", snapshotLocationId: ha1, liveStatus: "in_stock", liveLocationId: ha3, scanned: false, resolvedLocationId: ha3,
}), "missing");

const foundLine: StoredLine = {
  id: "scan-ring-1",
  epc: "aa3a06d60e1f4eb67b5c0f69",
  sku: "RING-01",
  pieceId: "ring-1",
  result: "found",
  metal: null,
  status: "in_stock",
  locationName: "HA1 · Horseshoe A1",
  locationId: ha1,
};
const elsewhereLine: StoredLine = {
  id: "scan-stray",
  epc: "ffffffffffffffffffffffff",
  sku: "STRAY",
  pieceId: "stray",
  result: "wrong_location",
  metal: null,
  status: "in_stock",
  locationName: "HA3 · Horseshoe A3",
  locationId: ha3,
};
const snapshotView = assembleStocktake({
  lines: [foundLine, elsewhereLine],
  countLocationId: ha1,
  snapshot: [
    snap({ pieceId: "ring-1", sku: "RING-01", epc: "aa3a06d60e1f4eb67b5c0f69" }),
    snap({ pieceId: "ring-3", sku: "RING-03", epc: "7ba37d16b67943817d8b64c5" }),
    snap({ pieceId: "bare", sku: "BARE", epc: null }),
    snap({ pieceId: "gone", sku: "GONE", epc: "111", liveStatus: "sold", liveLocationId: ha1 }),
    snap({
      pieceId: "shifted",
      sku: "SHIFT",
      epc: "222",
      liveLocationId: ha3,
      liveLocationLabel: "HA3 · Horseshoe A3",
    }),
  ],
  v1Missing: [],
});
assert.equal(snapshotView.counts.missing, 1);
assert.equal(snapshotView.groups.missing[0].sku, "RING-03");
assert.equal(snapshotView.counts.found, 1);
assert.equal(snapshotView.counts.elsewhere, 1);
assert.equal(snapshotView.groups.elsewhere[0].sku, "STRAY");
assert.equal(snapshotView.groups.notTagged[0].sku, "BARE");
assert.equal(snapshotView.counts.notTaggedUnchecked, 1);
assert.equal(snapshotView.groups.soldDuring[0].detail, "Sold during count");
assert.equal(snapshotView.groups.movedDuring[0].detail, "Moved during count (now at HA3 · Horseshoe A3)");
assert.equal(formatNotTaggedSummary(snapshotView.counts), "Not tagged: 0 seen / 1 not checked");
assert.equal(
  formatStocktakeCounts(view.counts),
  "Found 1 · Missing 1 · Somewhere else 2 · Unknown 1 · Not in stock 1 · 1 blank",
);

const withSnapshot: StocktakePayload = {
  stocktake: live.stocktake,
  groups: snapshotView.groups,
  counts: snapshotView.counts,
  warnings: [],
  snapshot: [
    snap({ pieceId: "ring-1", sku: "RING-01", epc: "aa3a06d60e1f4eb67b5c0f69" }),
    snap({ pieceId: "ring-3", sku: "RING-03", epc: "7ba37d16b67943817d8b64c5" }),
    snap({ pieceId: "bare", sku: "BARE", epc: null }),
  ],
};
const scannedBare = absorbStocktakeScans(withSnapshot, [foundLine]);
assert.equal(scannedBare.counts.missing, 1);
assert.equal(scannedBare.groups.missing[0].sku, "RING-03");
const seen = applyUntaggedSeen(scannedBare, "bare", "2026-09-25T23:40:00.000Z", "Alex");
assert.equal(seen.counts.notTaggedSeen, 1);
assert.equal(seen.counts.notTaggedUnchecked, 0);
assert.equal(seen.groups.notTagged[0].seenByName, "Alex");
const undone = applyUntaggedSeen(seen, "bare", null, null);
assert.equal(undone.counts.notTaggedUnchecked, 1);

console.log("rfid-stocktake-classify-test: ok");
