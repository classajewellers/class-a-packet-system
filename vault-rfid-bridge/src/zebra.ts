import net from "net";

/**
 * Send a ZPL string to a Zebra printer via raw TCP.
 * Resolves when the data is flushed; rejects on connect/write timeout or error.
 */
export function sendZpl(
  host: string,
  port: number,
  zpl: string,
  connectTimeoutMs = 5000,
  writeTimeoutMs = 10000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    const connectTimer = setTimeout(() => done(new Error(`Connect timeout to ${host}:${port}`)), connectTimeoutMs);

    socket.connect(port, host, () => {
      clearTimeout(connectTimer);

      const writeTimer = setTimeout(() => done(new Error("Write timeout")), writeTimeoutMs);

      socket.write(Buffer.from(zpl, "utf8"), (err) => {
        clearTimeout(writeTimer);
        if (err) done(err);
        else done();
      });
    });

    socket.on("error", (err) => {
      clearTimeout(connectTimer);
      done(err);
    });
  });
}

/**
 * Ask the printer for its head DPI over port 9100.
 * SGD: ! U1 getvar "head.resolution.in_dpi"
 * Returns null if the printer does not answer. Never throws.
 */
export function readHeadDpi(host: string, port: number, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buf = "";
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => finish(parseHeadDpi(buf)), timeoutMs);

    socket.connect(port, host, () => {
      socket.write('! U1 getvar "head.resolution.in_dpi"\r\n');
    });
    socket.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const dpi = parseHeadDpi(buf);
      if (dpi) finish(dpi);
    });
    socket.on("error", () => finish(null));
  });
}

export function parseHeadDpi(buf: string): number | null {
  const quoted = buf.match(/"(203|300|600)"/);
  if (quoted) return Number(quoted[1]);
  const bare = buf.match(/\b(203|300|600)\b/);
  return bare ? Number(bare[1]) : null;
}

/** Resettable RFID odometers on the ZD621R. Read only — never set these to 0. */
export const RFID_VALID_COUNTER = "odometer.rfid.valid_resettable";
export const RFID_VOID_COUNTER = "odometer.rfid.void_resettable";

export type RfidCounters = { valid: number; voided: number };

export type RfidEncodeDelta = {
  state: "ok" | "failed" | "pending";
  validDelta: number;
  voidDelta: number;
};

/**
 * Read one SGD variable over port 9100.
 * Returns the raw reply, or null on timeout or connection failure. Never throws.
 */
export function readSgd(
  host: string,
  port: number,
  variable: string,
  timeoutMs: number
): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let buf = "";
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };
    const timer = setTimeout(() => finish(buf.trim() ? buf : null), timeoutMs);

    socket.connect(port, host, () => {
      socket.write(`! U1 getvar "${variable}"\r\n`);
    });
    socket.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      if (buf.includes("\n")) finish(buf);
    });
    socket.on("error", () => finish(null));
  });
}

/** First integer in an SGD getvar reply. `"27"` and a bare `27` both count. */
export function parseSgdInteger(buf: string | null | undefined): number | null {
  if (!buf) return null;
  const quoted = buf.match(/"(\d+)"/);
  if (quoted) return Number(quoted[1]);
  const line = buf.split(/\r?\n/).map((part) => part.trim()).find((part) => part.length > 0);
  if (line && /^\d+$/.test(line)) return Number(line);
  return null;
}

/**
 * RFID valid and void counters. Null when either reply is missing.
 * Never throws, and never resets the counters.
 */
export async function readRfidCounters(
  host: string,
  port: number,
  timeoutMs: number
): Promise<RfidCounters | null> {
  const validBuf = await readSgd(host, port, RFID_VALID_COUNTER, timeoutMs);
  const voidBuf = await readSgd(host, port, RFID_VOID_COUNTER, timeoutMs);
  const valid = parseSgdInteger(validBuf);
  const voided = parseSgdInteger(voidBuf);
  if (valid == null || voided == null) return null;
  return { valid, voided };
}

/** What changed between two counter snapshots. A rising valid count is a write. */
export function rfidEncodeDelta(before: RfidCounters, after: RfidCounters): RfidEncodeDelta {
  const validDelta = after.valid - before.valid;
  const voidDelta = after.voided - before.voided;
  if (validDelta > 0) {
    return { state: "ok", validDelta, voidDelta: Math.max(0, voidDelta) };
  }
  if (voidDelta > 0 && validDelta === 0) {
    return { state: "failed", validDelta: 0, voidDelta };
  }
  return { state: "pending", validDelta: 0, voidDelta: 0 };
}
