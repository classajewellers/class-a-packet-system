/**
 * Location label and sort checks.
 * Run: npx tsx scripts/location-label-test.ts
 */
import assert from "node:assert/strict";
import { compareLocations, formatLocationLabel, locationsForPicker } from "../lib/location-label.ts";

assert.equal(formatLocationLabel({ code: "HA1", name: "Horseshoe A1" }), "HA1 · Horseshoe A1");
assert.equal(formatLocationLabel({ code: null, name: "Display Floor" }), "Display Floor");
assert.equal(formatLocationLabel({ code: "  ", name: "Workshop" }), "Workshop");
assert.equal(formatLocationLabel({ code: "WS", name: "Workshop" }), "WS · Workshop");

const rows = [
  { id: "10", code: "HA10", name: "Horseshoe A10", active: true },
  { id: "2", code: "HA2", name: "Horseshoe A2", active: true },
  { id: "c6", code: "C6", name: "Cabinet 6", active: true },
  { id: "c1", code: "C1", name: "Cabinet 1", active: true },
  { id: "old", code: null, name: "Display Floor", active: false },
  { id: "ws", code: "WS", name: "Workshop", active: true },
];
const sorted = [...rows].sort(compareLocations).map((row) => row.code ?? row.name);
assert.deepEqual(sorted, ["C1", "C6", "HA2", "HA10", "WS", "Display Floor"]);

const picker = locationsForPicker(rows, "old").map((row) => row.id);
assert.deepEqual(picker, ["c1", "c6", "2", "10", "ws", "old"]);
assert.deepEqual(locationsForPicker(rows).map((row) => row.id), ["c1", "c6", "2", "10", "ws"]);

console.log("location-label-test: ok");
