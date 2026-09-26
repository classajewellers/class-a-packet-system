import net from "net";
import type { BridgeConfig } from "./types";
import { vaultFetch } from "./bridge";

/**
 * Read-only printer check. Every command is `! U1 getvar`. No setvar, no do,
 * no ^HWE, and no printer reset. file.dir is still a getvar, with the drive
 * as its argument, so certificate names can come back without a directory command.
 */

export type GetvarQuery = { name: string; arg?: string };

export const PRINTER_CHECK_QUERIES: GetvarQuery[] = [
  { name: "appl.name" },
  { name: "device.friendly_name" },
  { name: "device.unique_id" },
  { name: "head.resolution.in_dpi" },
  { name: "print.width" },
  { name: "zpl.label_length" },
  { name: "rtc.date" },
  { name: "rtc.time" },
  { name: "ip.ntp.enable" },
  { name: "ip.ntp.servers" },
  { name: "weblink.ip.conn1.location" },
  { name: "weblink.ip.conn1.authentication.entries" },
  { name: "weblink.ip.conn1.retry_interval" },
  { name: "weblink.logging.max_entries" },
  { name: "weblink.enable" },
  { name: "weblink.ip.conn1.proxy" },
  { name: "file.dir", arg: "E:" },
  { name: "usb.host.config" },
  { name: "usb.host.lock_out" },
  { name: "usb.mirror.enable" },
  { name: "usb.mirror.auto" },
  { name: "ip.dhcp.enable" },
  { name: "ip.addr" },
];

export type ClockJudgement = "ok" | "skewed" | "unknown";

export type PrinterCheckSummary = {
  firmware: string | null;
  friendly_name: string | null;
  serial: string | null;
  dpi: number | null;
  print_width: string | null;
  label_length: string | null;
  clock: ClockJudgement;
  clock_detail: string;
  ntp_enable: string | null;
  ntp_servers: string | null;
  weblink_configured: boolean;
  weblink_location: string | null;
  cert_files: string[];
  usb_host: string | null;
  usb_mirror: string | null;
  dhcp_enable: string | null;
  ip_addr: string | null;
  /** No SGD getvar reports whether outbound TCP 443 succeeded. */
  port_443_outbound: "skipped";
};

export type BridgeOverrides = {
  dpi: number | null;
  labelLengthDots: number | null;
  labelLengthMm: number | null;
  tagHeadTopMm: number | null;
  tagHeadLeftMm: number | null;
  tagOffsetXMm: number | null;
  tagOffsetYMm: number | null;
};

export type PrinterCheckReport = {
  checked_at: string;
  printer: { host: string; port: number };
  getvars: Record<string, string | null>;
  summary: PrinterCheckSummary;
  bridge_overrides: BridgeOverrides;
  post?: { ok: boolean; error?: string };
};

const GETVAR_NAME = /^[A-Za-z0-9._]+$/;
const GETVAR_ARG = /^[A-Za-z0-9:._-]+$/;

/** The only bytes this check is allowed to write. */
export function sgdGetvarCommand(query: GetvarQuery): string {
  if (!GETVAR_NAME.test(query.name)) throw new Error(`Refusing getvar name ${query.name}`);
  if (query.arg != null && !GETVAR_ARG.test(query.arg)) throw new Error(`Refusing getvar argument ${query.arg}`);
  const extra = query.arg != null ? ` "${query.arg}"` : "";
  const command = `! U1 getvar "${query.name}"${extra}\r\n`;
  if (!command.startsWith("! U1 getvar ")) throw new Error("Refusing a non-getvar command");
  if (/\bsetvar\b/i.test(command) || /\bdo\b/i.test(command)) {
    throw new Error("Refusing setvar or do");
  }
  return command;
}

export function unquoteSgd(value: string | null | undefined): string {
  if (value == null) return "";
  const trimmed = value.trim();
  const quoted = trimmed.match(/^"([\s\S]*)"$/);
  return (quoted ? quoted[1] : trimmed).trim();
}

export function bridgeOverridesFrom(config: BridgeConfig): BridgeOverrides {
  const printer = config.printer;
  return {
    dpi: printer.dpi ?? null,
    labelLengthDots: printer.labelLengthDots ?? null,
    labelLengthMm: printer.labelLengthMm ?? null,
    tagHeadTopMm: printer.tagHeadTopMm ?? null,
    tagHeadLeftMm: printer.tagHeadLeftMm ?? null,
    tagOffsetXMm: printer.tagOffsetXMm ?? null,
    tagOffsetYMm: printer.tagOffsetYMm ?? null,
  };
}

export function certFilesFromReplies(replies: Record<string, string | null>): string[] {
  const found = new Set<string>();
  for (const value of Object.values(replies)) {
    if (!value) continue;
    const matches = value.match(/[A-Za-z0-9_.-]+\.NRD/gi) ?? [];
    for (const match of matches) found.add(match);
  }
  return Array.from(found);
}

function truthySetting(value: string | null): boolean {
  const text = unquoteSgd(value).toLowerCase();
  return text === "on" || text === "yes" || text === "true" || text === "1" || text === "enabled";
}

function weblinkConfigured(replies: Record<string, string | null>): boolean {
  const location = unquoteSgd(replies["weblink.ip.conn1.location"]);
  if (!location || location === "?" || location.toLowerCase() === "none") return false;
  const enable = replies["weblink.enable"];
  const enableText = unquoteSgd(enable);
  if (!enableText || enableText === "?") return true;
  return truthySetting(enable);
}

function parseTime(raw: string): { h: number; m: number; s: number } | null {
  const match = unquoteSgd(raw).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3] ?? "0");
  if (h > 23 || m > 59 || s > 59) return null;
  return { h, m, s };
}

function normalizeYear(year: number): number {
  if (year >= 100) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function civilDate(year: number, month: number, day: number, time: { h: number; m: number; s: number }): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day, time.h, time.m, time.s));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/** Dates whose UTC fields are the printer's wall-clock numbers. */
export function printerClockCandidates(dateRaw: string | null, timeRaw: string | null): Date[] {
  if (!dateRaw || !timeRaw) return [];
  const time = parseTime(timeRaw);
  const nums = unquoteSgd(dateRaw).match(/\d+/g)?.map(Number) ?? [];
  if (!time || nums.length < 3) return [];
  const [a, b, c] = nums;
  const out: Date[] = [];
  const add = (month: number, day: number, year: number) => {
    const date = civilDate(normalizeYear(year), month, day, time);
    if (date) out.push(date);
  };
  if (a > 31) {
    add(b, c, a);
    add(c, b, a);
  } else {
    add(a, b, c);
    add(b, a, c);
  }
  return out;
}

function civilNow(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour"), pick("minute"), pick("second")));
}

export function judgeClock(
  dateRaw: string | null,
  timeRaw: string | null,
  now: Date,
): { clock: ClockJudgement; detail: string } {
  const candidates = printerClockCandidates(dateRaw, timeRaw);
  if (candidates.length === 0) {
    return { clock: "unknown", detail: "The printer did not return a date and time that could be read." };
  }
  const zones = ["Australia/Adelaide", "UTC"] as const;
  let bestMs = Infinity;
  let bestZone: (typeof zones)[number] = "Australia/Adelaide";
  for (const candidate of candidates) {
    for (const zone of zones) {
      const delta = Math.abs(candidate.getTime() - civilNow(now, zone).getTime());
      if (delta < bestMs) {
        bestMs = delta;
        bestZone = zone;
      }
    }
  }
  const minutes = Math.round(bestMs / 60000);
  if (minutes <= 5) {
    return { clock: "ok", detail: `Within ${minutes} min of ${bestZone}.` };
  }
  return { clock: "skewed", detail: `About ${minutes} min from ${bestZone}.` };
}

function dpiFrom(value: string | null): number | null {
  const text = unquoteSgd(value);
  if (!/^\d+$/.test(text)) return null;
  const dpi = Number(text);
  if (dpi < 150 || dpi > 600) return null;
  return dpi;
}

export function summariseCheck(
  replies: Record<string, string | null>,
  now: Date,
): PrinterCheckSummary {
  const clock = judgeClock(replies["rtc.date"] ?? null, replies["rtc.time"] ?? null, now);
  const usbHost = [replies["usb.host.config"], replies["usb.host.lock_out"]]
    .map((value) => unquoteSgd(value))
    .filter(Boolean)
    .join(", ");
  const usbMirror = [replies["usb.mirror.enable"], replies["usb.mirror.auto"]]
    .map((value) => unquoteSgd(value))
    .filter(Boolean)
    .join(", ");
  return {
    firmware: unquoteSgd(replies["appl.name"]) || null,
    friendly_name: unquoteSgd(replies["device.friendly_name"]) || null,
    serial: unquoteSgd(replies["device.unique_id"]) || null,
    dpi: dpiFrom(replies["head.resolution.in_dpi"] ?? null),
    print_width: unquoteSgd(replies["print.width"]) || null,
    label_length: unquoteSgd(replies["zpl.label_length"]) || null,
    clock: clock.clock,
    clock_detail: clock.detail,
    ntp_enable: unquoteSgd(replies["ip.ntp.enable"]) || null,
    ntp_servers: unquoteSgd(replies["ip.ntp.servers"]) || null,
    weblink_configured: weblinkConfigured(replies),
    weblink_location: unquoteSgd(replies["weblink.ip.conn1.location"]) || null,
    cert_files: certFilesFromReplies(replies),
    usb_host: usbHost || null,
    usb_mirror: usbMirror || null,
    dhcp_enable: unquoteSgd(replies["ip.dhcp.enable"]) || null,
    ip_addr: unquoteSgd(replies["ip.addr"]) || null,
    port_443_outbound: "skipped",
  };
}

export function buildPrinterCheckReport(
  config: BridgeConfig,
  replies: Record<string, string | null>,
  now = new Date(),
): PrinterCheckReport {
  return {
    checked_at: now.toISOString(),
    printer: { host: config.printer.host, port: config.printer.port },
    getvars: replies,
    summary: summariseCheck(replies, now),
    bridge_overrides: bridgeOverridesFrom(config),
  };
}

export function formatPrinterCheckReport(report: PrinterCheckReport): string {
  const summary = report.summary;
  const clockWord = summary.clock === "ok" ? "OK" : summary.clock === "skewed" ? "Skewed" : "Unknown";
  const overrides = report.bridge_overrides;
  const lines = [
    `Printer check — ${report.printer.host}:${report.printer.port}`,
    `Checked: ${report.checked_at}`,
    "",
    `Firmware: ${summary.firmware ?? "(no reply)"}`,
    `Name: ${summary.friendly_name ?? "(no reply)"}`,
    `Serial: ${summary.serial ?? "(no reply)"}`,
    `Head DPI: ${summary.dpi ?? "(no reply)"}`,
    `Print width: ${summary.print_width ?? "(no reply)"}`,
    `Label length: ${summary.label_length ?? "(no reply)"}`,
    `Clock: ${clockWord} — ${summary.clock_detail}`,
    `NTP: ${summary.ntp_enable ?? "(no reply)"}${summary.ntp_servers ? `, servers ${summary.ntp_servers}` : ""}`,
    `Weblink configured: ${summary.weblink_configured ? "yes" : "no"}`,
    `Weblink location: ${summary.weblink_location ?? "(empty)"}`,
    `Cert files: ${summary.cert_files.length ? summary.cert_files.join(", ") : "(none listed)"}`,
    `USB host: ${summary.usb_host ?? "(no reply)"}`,
    `USB mirror: ${summary.usb_mirror ?? "(no reply)"}`,
    `IP: dhcp ${summary.dhcp_enable ?? "(no reply)"}, address ${summary.ip_addr ?? "(no reply)"}`,
    "Port 443 outbound: skipped (no getvar reports whether it works)",
    "",
    "Bridge overrides from config.json (these are not sent to the printer):",
    `  dpi: ${overrides.dpi ?? "(not set — the print path uses the head DPI above)"}`,
    `  labelLengthDots: ${overrides.labelLengthDots ?? "(not set)"}`,
    `  labelLengthMm: ${overrides.labelLengthMm ?? "(not set)"}`,
    `  tagHeadTopMm: ${overrides.tagHeadTopMm ?? "(not set)"}`,
    `  tagHeadLeftMm: ${overrides.tagHeadLeftMm ?? "(not set)"}`,
    `  tagOffsetXMm: ${overrides.tagOffsetXMm ?? "(not set)"}`,
    `  tagOffsetYMm: ${overrides.tagOffsetYMm ?? "(not set)"}`,
    "",
  ];
  if (!report.post) lines.push("Not posted to Vault.");
  else if (report.post.ok) lines.push("Posted to Vault.");
  else lines.push(`Could not post to Vault: ${report.post.error ?? "unknown error"}`);
  return lines.join("\n");
}

const PER_QUERY_MS = 1500;

/**
 * One TCP connection, getvar only, one reply at a time. Never throws.
 * A missing reply is null. Nothing is written except getvar commands.
 */
export function queryPrinterGetvars(
  host: string,
  port: number,
  connectTimeoutMs: number,
  queries: GetvarQuery[] = PRINTER_CHECK_QUERIES,
): Promise<Record<string, string | null>> {
  const replies: Record<string, string | null> = {};
  for (const query of queries) replies[query.name] = null;

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    let index = 0;
    let buf = "";
    let queryTimer: ReturnType<typeof setTimeout> | null = null;
    let quietTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (queryTimer) clearTimeout(queryTimer);
      if (quietTimer) clearTimeout(quietTimer);
      socket.destroy();
      resolve(replies);
    };

    const takeReply = () => {
      if (index >= queries.length) return;
      if (queryTimer) clearTimeout(queryTimer);
      if (quietTimer) clearTimeout(quietTimer);
      replies[queries[index].name] = buf.trim() ? buf.trim() : null;
      index += 1;
      sendNext();
    };

    const sendNext = () => {
      if (index >= queries.length) {
        finish();
        return;
      }
      buf = "";
      const command = sgdGetvarCommand(queries[index]);
      if (queryTimer) clearTimeout(queryTimer);
      queryTimer = setTimeout(() => takeReply(), PER_QUERY_MS);
      socket.write(command);
    };

    const connectTimer = setTimeout(() => finish(), connectTimeoutMs);
    socket.connect(port, host, () => {
      clearTimeout(connectTimer);
      sendNext();
    });
    socket.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      if (!buf.includes("\n") || index >= queries.length) return;
      // Directory listings can arrive as several lines. Wait briefly so the
      // reply is the whole burst, then move to the next getvar.
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => takeReply(), 80);
    });
    socket.on("error", () => finish());
    socket.on("close", () => finish());
  });
}

export async function postPrinterCheck(
  config: BridgeConfig,
  report: PrinterCheckReport,
): Promise<{ ok: boolean; error?: string }> {
  const body = {
    checked_at: report.checked_at,
    printer: report.printer,
    getvars: report.getvars,
    summary: report.summary,
    bridge_overrides: report.bridge_overrides,
  };
  try {
    const res = await vaultFetch(config, "/api/rfid/bridge/printer-check", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status} ${text}`.trim() };
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

/** Query, summarise, print-ready report, and POST. Never throws. */
export async function runPrinterCheck(config: BridgeConfig, now = new Date()): Promise<PrinterCheckReport> {
  const replies = await queryPrinterGetvars(
    config.printer.host,
    config.printer.port,
    config.printer.connectTimeoutMs,
  );
  const report = buildPrinterCheckReport(config, replies, now);
  report.post = await postPrinterCheck(config, report);
  return report;
}

export function printerCheckAnswered(report: PrinterCheckReport): boolean {
  return Boolean(report.summary.firmware || report.summary.dpi);
}
