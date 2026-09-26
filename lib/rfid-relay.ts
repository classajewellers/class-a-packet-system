import { createHmac, timingSafeEqual } from "crypto";

/** Off unless RFID_PRINT_RELAY is exactly "1". The bridge path stays the default. */
export function printRelayEnabled(): boolean {
  return process.env.RFID_PRINT_RELAY === "1";
}

export function relaySecret(): string {
  return process.env.RFID_RELAY_HMAC_SECRET ?? "";
}

export function signRelayBody(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyRelayBody(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
  nowMs = Date.now(),
): boolean {
  if (!secret || !timestamp || !signature) return false;
  const expected = signRelayBody(secret, timestamp, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const stamp = Number(timestamp);
  if (!Number.isFinite(stamp)) return false;
  return Math.abs(nowMs - stamp) <= 5 * 60 * 1000;
}

export type RelayJob = {
  job_id: string;
  printer_id: string;
  zpl: string;
  expect_epc: string;
};

/** POST /jobs on the relay. Does not throw. */
export async function postRelayJob(job: RelayJob): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = (process.env.RFID_RELAY_URL ?? "").replace(/\/$/, "");
  const secret = relaySecret();
  if (!url || !secret) return { ok: false, error: "RFID_RELAY_URL or RFID_RELAY_HMAC_SECRET is not set" };
  const body = JSON.stringify(job);
  const timestamp = String(Date.now());
  try {
    const res = await fetch(`${url}/jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-relay-timestamp": timestamp,
        "x-relay-signature": signRelayBody(secret, timestamp, body),
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Relay HTTP ${res.status} ${text}`.trim() };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "relay network error" };
  }
}
