import http from "http";
import https from "https";
import { BridgeConfig } from "./types";

/**
 * Reads the Zebra printer's RFID write log over its web UI (HTTP Basic auth).
 * The log is plain text, usually inside one <PRE> block, one entry per line:
 *
 *   Aug-05-2026 00:23:40,W,F4,A1,23,00000000,19785d46c8fe9243e1b56cbe
 *   └ timestamp        └op └───codes────────┘ └ status  └ EPC (last field)
 */

export interface RfidLogMatch {
  epc: string;
  timestamp: string;
}

export type RfidLogFetch =
  | { ok: true; body: string; url: string }
  | { ok: false; url: string; retryable: boolean; logLine: string };

const LOG_PATH = "/rfidlog";

export function printerWebUrl(config: BridgeConfig, path = LOG_PATH): string {
  const scheme = config.printer.webScheme === "http" ? "http" : "https";
  return `${scheme}://${config.printer.host}${path}`;
}

/** GET /rfidlog. Never includes the password in the result. */
export function fetchRfidLog(config: BridgeConfig): Promise<RfidLogFetch> {
  const { host, webUser, webPassword, webScheme, webRejectUnauthorized } = config.printer;
  const url = printerWebUrl(config);
  if (!webUser || !webPassword) {
    return Promise.resolve({
      ok: false,
      url,
      retryable: false,
      logLine: "RFID verify: printer web username or password is not set in config.json",
    });
  }

  const isHttps = webScheme !== "http";
  const mod = isHttps ? https : http;
  const auth = "Basic " + Buffer.from(`${webUser}:${webPassword}`).toString("base64");

  return new Promise((resolve) => {
    const req = mod.request(
      {
        host,
        path: LOG_PATH,
        method: "GET",
        headers: { Authorization: auth },
        timeout: 5000,
        ...(isHttps ? { rejectUnauthorized: webRejectUnauthorized === true } : {}),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status === 401 || status === 403) {
          res.resume();
          resolve({
            ok: false,
            url,
            retryable: false,
            logLine: `RFID verify: could not log in to printer web UI (HTTP ${status}) at ${url}`,
          });
          return;
        }
        if (status !== 200) {
          res.resume();
          resolve({
            ok: false,
            url,
            retryable: false,
            logLine: `RFID verify: printer web UI returned HTTP ${status} at ${url}`,
          });
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          if (looksLikeLoginPage(body)) {
            resolve({
              ok: false,
              url,
              retryable: false,
              logLine: `RFID verify: printer web UI at ${url} returned a login page, not the RFID log. Check printer.webPassword.`,
            });
            return;
          }
          resolve({ ok: true, body, url });
        });
      }
    );
    req.on("error", (err: NodeJS.ErrnoException) => {
      resolve({
        ok: false,
        url,
        retryable: true,
        logLine: `RFID verify: could not reach printer web UI at ${url} (${err.code ?? err.message}).${schemeHint(err, isHttps)}`,
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({
        ok: false,
        url,
        retryable: true,
        logLine: `RFID verify: printer web UI timed out at ${url}`,
      });
    });
    req.end();
  });
}

function schemeHint(err: NodeJS.ErrnoException, isHttps: boolean): string {
  const code = `${err.code ?? ""} ${err.message}`.toLowerCase();
  if (isHttps && (code.includes("wrong version") || code.includes("eproto") || code.includes("econnrefused"))) {
    return ` If the printer web page is HTTP, set printer.webScheme to "http".`;
  }
  if (code.includes("cert") || code.includes("self signed") || code.includes("unable to verify")) {
    return ` The printer certificate was rejected. Set printer.webRejectUnauthorized to false for a self-signed certificate.`;
  }
  return "";
}

function looksLikeLoginPage(body: string): boolean {
  if (extractLogText(body).split(/\r?\n/).some((line) => line.includes(","))) return false;
  return /type\s*=\s*["']password["']/i.test(body) || /<form\b/i.test(body);
}

export function extractLogText(logBody: string): string {
  const pre = logBody.match(/<PRE>([\s\S]*?)<\/PRE>/i);
  return pre ? pre[1] : logBody;
}

export function countLogLines(logBody: string): number {
  return extractLogText(logBody).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
}

/**
 * Find a successful WRITE of `expectedEpc`. The EPC match is case-insensitive
 * and also accepts a longer hex field that ends with that EPC. Operation is
 * W or WRITE. An 8-digit status immediately before the EPC must be all zeros
 * when it is present; other columns (position, antenna, power) are not a failure.
 */
export function findEpcWriteInLog(logBody: string, expectedEpc: string): RfidLogMatch | null {
  const want = expectedEpc.trim().toLowerCase();
  if (!want) return null;
  const text = extractLogText(logBody);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /\b(VOID|FAIL|FAILED)\b/i.test(line)) continue;
    const fields = line.split(",").map((f) => f.trim());
    if (fields.length < 2) continue;

    const op = fields[1] ?? "";
    if (!/^(W|WRITE)$/i.test(op)) continue;

    const epcIndex = fields.findIndex((field) => fieldIsEpc(field, want));
    if (epcIndex < 0) continue;

    const before = epcIndex > 0 ? fields[epcIndex - 1].replace(/\s+/g, "") : "";
    if (/^[0-9a-f]{8}$/i.test(before) && !/^0+$/.test(before)) continue;

    return { epc: want, timestamp: fields[0] };
  }
  return null;
}

function fieldIsEpc(field: string, want: string): boolean {
  const hex = field.replace(/\s+/g, "").toLowerCase();
  if (!/^[0-9a-f]+$/i.test(hex)) return false;
  return hex === want || (hex.length > want.length && hex.endsWith(want));
}
