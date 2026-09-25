/**
 * Run: node --experimental-strip-types is not used; npx tsx scripts/rfid-tag-read-test.ts
 */
import assert from "node:assert/strict";
import { handheldReadUpdate } from "../lib/rfid-tag-read.ts";

assert.equal(handheldReadUpdate("printed"), "activate");
assert.equal(handheldReadUpdate("active"), "seen");
assert.equal(handheldReadUpdate("pending"), "seen");
assert.equal(handheldReadUpdate("damaged"), "skip");
assert.equal(handheldReadUpdate("retired"), "skip");
assert.equal(handheldReadUpdate("replaced"), "skip");

console.log("rfid-tag-read-test: ok");
