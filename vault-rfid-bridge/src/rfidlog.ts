import http from "http";
import https from "https";
import { BridgeConfig } from "./types";

/**
 * Reads the Zebra printer's built-in RFID write log (/rfidlog) over its web UI
 * (HTTP Basic auth) and confirms a specific EPC was written. Used for
 * auto-verification — no external deps, no real HTML parsing needed: the log
 * body is plain text inside a single <PRE> block, one entry per line:
 *
 *   Aug-05-2026 00:23:40,W,F4,A1,23,00000000,19785d46c8fe9243e1b56cbe
 *   └ timestamp        └op └───codes────────┘ └ status  └ EPC (last field)
 */

/** GET /rfidlog with Basic auth. Returns the raw body, or null on any failure. */
export function fetchRfidLog(config: BridgeConfig): Promise<string | null> {
  const { host, webUser, webPassword, webScheme, webRejectUnauthorized } = config.printer;
  if (!webUser || !webPassword) return Promise.resolve(null);

  const isHttps = webScheme !== "http";
  const mod = isHttps ? https : http;
  const auth = "Basic " + Buffer.from(`${webUser}:${webPassword}`).toString("base64");

  return new Promise((resolve) => {
    const req = mod.request(
      {
        host,
        path: "/rfidlog",
        method: "GET",
        headers: { Authorization: auth },
        timeout: 5000,
        // Printer web UIs are typically self-signed; default to not verifying.
        ...(isHttps ? { rejectUnauthorized: webRejectUnauthorized === true } : {}),
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve(body));
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

export interface RfidLogMatch {
  epc: string;
  timestamp: string;
}

/**
 * Find a successful WRITE of `expectedEpc` in the log body. Matches on the EPC
 * (unique per tag, so this is the reliable correlation key — not timestamp) plus
 * operation 'W'. The 6th field appears to be a status code ('00000000' on the
 * confirmed-good write); treated as a soft success guard — if a real device ever
 * shows a non-zero code on a good write, relax this. Returns the match or null.
 */
export function findEpcWriteInLog(logBody: string, expectedEpc: string): RfidLogMatch | null {
  const want = expectedEpc.trim().toLowerCase();
  const pre = logBody.match(/<PRE>([\s\S]*?)<\/PRE>/i);
  const text = pre ? pre[1] : logBody; // fall back to whole body if no <PRE>

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const fields = line.split(",").map((f) => f.trim());
    if (fields.length < 3) continue;

    const op = fields[1];
    const epc = fields[fields.length - 1].toLowerCase();
    const status = fields.length >= 7 ? fields[5] : null; // status code, if present

    if (op === "W" && epc === want) {
      // soft success guard: if a status field is present, require all-zeros
      if (status !== null && !/^0+$/.test(status)) continue;
      return { epc, timestamp: fields[0] };
    }
  }
  return null;
}
