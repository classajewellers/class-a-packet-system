import { openCountIdsInZone } from "../lib/rfid-stocktake.ts";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

const horseshoe = "zone-horseshoe-a";
const ha2 = "loc-ha2";
const ha1 = "loc-ha1";
const other = "loc-other";

const ids = openCountIdsInZone(horseshoe, [ha1, ha2], [
  { id: "zone-open", status: "in_progress", kind: "zone", zoneId: horseshoe, locationId: null },
  { id: "572834c7", status: "in_progress", kind: "location", zoneId: null, locationId: ha2 },
  { id: "done", status: "completed", kind: "location", zoneId: null, locationId: ha1 },
  { id: "elsewhere", status: "in_progress", kind: "location", zoneId: null, locationId: other },
  { id: "shop", status: "in_progress", kind: "whole_shop", zoneId: null, locationId: null },
]);
assert(ids.join(",") === "zone-open,572834c7", ids.join(","));

const locationOnly = openCountIdsInZone(horseshoe, [ha2], [
  { id: "572834c7", status: "in_progress", kind: "location", zoneId: null, locationId: ha2 },
]);
assert(locationOnly.join(",") === "572834c7", locationOnly.join(","));

const none = openCountIdsInZone(horseshoe, [ha2], [
  { id: "done", status: "completed", kind: "zone", zoneId: horseshoe, locationId: null },
]);
assert(none.length === 0, "completed counts must stay");

const dup = openCountIdsInZone(horseshoe, [ha2], [
  { id: "same", status: "in_progress", kind: "zone", zoneId: horseshoe, locationId: ha2 },
  { id: "same", status: "in_progress", kind: "location", zoneId: horseshoe, locationId: ha2 },
]);
assert(dup.length === 1, "a session listed twice is cancelled once");

console.log("zone-start-fresh-test: ok");
