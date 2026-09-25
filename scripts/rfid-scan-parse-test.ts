/**
 * Parser checks for the handheld scan buffer.
 * Run: node --experimental-strip-types scripts/rfid-scan-parse-test.ts
 */
import assert from "node:assert/strict";
import { missingEpcGroup, parseScanLine, parseScanLines, splitScanBuffer } from "../lib/rfid-scan.ts";

const glued = parseScanLine("RING-01E28069150000600B41488D28");
assert.deepEqual(glued.epcs, ["e28069150000600b41488d28"]);
assert.equal(glued.sku, "RING-01");
assert.notEqual(glued.epcs[0], "01e28069150000600b41488d");

const split = splitScanBuffer("3689CDA63ECFE59565756336\nXX-0002");
assert.deepEqual(split.complete, ["3689CDA63ECFE59565756336"]);
assert.equal(split.rest, "XX-0002");
const mixed = parseScanLines([...split.complete, split.rest]);
assert.deepEqual(mixed.epcs, ["3689cda63ecfe59565756336"]);
assert.deepEqual(mixed.skus, ["XX-0002"]);

const burst = parseScanLines([
  "AA3A06D60E1F4EB67B5C0F69",
  "0CFA57CE60C580F65588501E",
  "7BA37D16B67943817D8B64C5",
  "E28069150000600B41488D28",
  "DEADBEEFDEADBEEFDEADBEEF",
]);
assert.deepEqual(burst.epcs, [
  "aa3a06d60e1f4eb67b5c0f69",
  "0cfa57ce60c580f65588501e",
  "7ba37d16b67943817d8b64c5",
  "e28069150000600b41488d28",
  "deadbeefdeadbeefdeadbeef",
]);
assert.deepEqual(burst.skus, []);

const lower = parseScanLine("3689cda63ecfe59565756336");
assert.deepEqual(lower.epcs, ["3689cda63ecfe59565756336"]);
assert.equal(lower.sku, null);

const deduped = parseScanLines([
  "3689CDA63ECFE59565756336",
  "3689cda63ecfe59565756336",
]);
assert.deepEqual(deduped.epcs, ["3689cda63ecfe59565756336"]);

assert.equal(missingEpcGroup("E28069150000600B41488D28"), "blank");
assert.equal(missingEpcGroup("e28069150000700b41487528"), "blank");
assert.equal(missingEpcGroup("DEADBEEFDEADBEEFDEADBEEF"), "unknown");
assert.equal(missingEpcGroup("aa3a06d60e1f4eb67b5c0f69"), "unknown");

console.log("rfid-scan-parse-test: ok");
