/**
 * Stocktake classification checks.
 * Run: node --experimental-strip-types scripts/rfid-stocktake-classify-test.ts
 */
import assert from "node:assert/strict";
import {
  buildStocktakeGroups,
  classifyStocktakeHit,
  missingPieceIds,
  planStocktakeInserts,
} from "../lib/rfid-stocktake";

const expected = new Set(["ring-1", "ring-3"]);

assert.equal(classifyStocktakeHit({ epc: "aa3a06d60e1f4eb67b5c0f69", pieceId: "ring-1", expectedIds: expected }), "found");
assert.equal(classifyStocktakeHit({ epc: "3689cda63ecfe59565756336", pieceId: "xx", expectedIds: expected }), "elsewhere");
assert.equal(classifyStocktakeHit({ epc: "deadbeefdeadbeefdeadbeef", pieceId: null, expectedIds: expected }), "unknown");
assert.equal(classifyStocktakeHit({ epc: "e28069150000600b41488d28", pieceId: null, expectedIds: expected }), "blank");
assert.equal(classifyStocktakeHit({ epc: "E28069150000700B41487528", pieceId: null, expectedIds: expected }), "blank");
assert.equal(classifyStocktakeHit({ epc: null, pieceId: null, expectedIds: expected }), "ignore");

const planned = planStocktakeInserts(
  [{ epc: "aa3a06d60e1f4eb67b5c0f69", pieceId: "ring-1" }],
  [
    { epc: "aa3a06d60e1f4eb67b5c0f69", sku: "RING-01", pieceId: "ring-1", result: "found", recordedLocationId: "floor" },
    { epc: null, sku: "RING-01", pieceId: "ring-1", result: "found", recordedLocationId: "floor" },
    { epc: "e28069150000600b41488d28", sku: null, pieceId: null, result: "blank", recordedLocationId: null },
  ],
);
assert.equal(planned.length, 1);
assert.equal(planned[0].result, "blank");

assert.deepEqual(missingPieceIds(["ring-1", "ring-3"], ["ring-1"]), ["ring-3"]);

const view = buildStocktakeGroups("in_progress", [
  { pieceId: "ring-1", sku: "RING-01", metal: "18K Yellow", status: "in_stock", locationName: "Display Floor" },
  { pieceId: "ring-3", sku: "RING-03", metal: "14K Rose", status: "in_stock", locationName: "Display Floor" },
], [
  {
    id: "line-1",
    epc: "aa3a06d60e1f4eb67b5c0f69",
    sku: "RING-01",
    pieceId: "ring-1",
    result: "found",
    movedHere: false,
    metal: "18K Yellow",
    status: "in_stock",
    locationName: "Display Floor",
    locationId: "floor",
  },
  {
    id: "line-blank",
    epc: "e28069150000600b41488d28",
    sku: null,
    pieceId: null,
    result: "blank",
    movedHere: false,
    metal: null,
    status: null,
    locationName: null,
    locationId: null,
  },
]);
assert.equal(view.counts.found, 1);
assert.equal(view.counts.missing, 1);
assert.equal(view.groups.missing[0].sku, "RING-03");
assert.equal(view.counts.blank, 1);
assert.equal(view.counts.unknown, 0);

const finished = buildStocktakeGroups("finished", [], [
  {
    id: "miss",
    epc: null,
    sku: "RING-03",
    pieceId: "ring-3",
    result: "missing",
    movedHere: false,
    metal: null,
    status: "in_stock",
    locationName: null,
    locationId: null,
  },
]);
assert.equal(finished.counts.missing, 1);
assert.equal(finished.groups.missing[0].sku, "RING-03");

console.log("rfid-stocktake-classify-test: ok");
