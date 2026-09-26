/**
 * Vault and the relay share one HMAC. Run: npx tsx scripts/relay-sign-test.ts
 */
import { signRelayBody, verifyRelayBody } from "../lib/rfid-relay.ts";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const secret = "shared-secret";
const timestamp = String(Date.now());
const body = JSON.stringify({ job_id: "job-1", printer_id: "p", status: "failed", reason: "RFID error", attempt: 2 });
const sig = signRelayBody(secret, timestamp, body);
assert(verifyRelayBody(secret, timestamp, body, sig), "round trip");
assert(!verifyRelayBody(secret, timestamp, body, sig.replace("a", "b")), "bad signature");
assert(!verifyRelayBody(secret, "1", body, signRelayBody(secret, "1", body)), "stale timestamp");
assert(verifyRelayBody("other", timestamp, body, sig) === false, "wrong secret");

console.log("relay-sign-test: ok");
