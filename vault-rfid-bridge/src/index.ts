import fs from "fs";
import path from "path";
import net from "net";
import { BridgeConfig } from "./types";
import { runBridge } from "./bridge";
import { readHeadDpi } from "./zebra";
import { DEFAULT_DPI } from "./label";

export function loadConfig(): BridgeConfig {
  const configPath = path.resolve(process.cwd(), "config.json");
  if (!fs.existsSync(configPath)) {
    console.error(`ERROR: config.json not found at ${configPath}`);
    console.error("Copy config.example.json to config.json and fill in your settings.");
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    console.error("ERROR: config.json is not valid JSON:", e);
    process.exit(1);
  }

  const c = raw as Record<string, unknown>;
  const printer = (c.printer ?? {}) as Record<string, unknown>;

  if (!c.vaultApiUrl || !c.bridgeApiKey) {
    console.error("ERROR: config.json must include vaultApiUrl and bridgeApiKey");
    process.exit(1);
  }

  if (!printer.host) {
    console.error("ERROR: config.json printer.host is required (e.g. \"192.168.40.242\")");
    console.error("Do not rely on a default — confirm your printer IP and set it explicitly.");
    process.exit(1);
  }

  const bypass = typeof c.vercelBypassSecret === "string" ? c.vercelBypassSecret.trim() : "";

  return {
    vaultApiUrl:          String(c.vaultApiUrl),
    bridgeApiKey:         String(c.bridgeApiKey),
    ...(bypass ? { vercelBypassSecret: bypass } : {}),
    pollIntervalMs:       Number(c.pollIntervalMs)      || 3000,
    heartbeatIntervalMs:  Number(c.heartbeatIntervalMs) || 30000,
    printer: {
      host:             String(printer.host),
      port:             Number(printer.port)            || 9100,
      connectTimeoutMs: Number(printer.connectTimeoutMs) || 5000,
      writeTimeoutMs:   Number(printer.writeTimeoutMs)  || 10000,
      webUser:              printer.webUser              ? String(printer.webUser) : undefined,
      webPassword:          printer.webPassword          ? String(printer.webPassword) : undefined,
      webScheme:            printer.webScheme === "http" ? "http" : "https",
      webRejectUnauthorized: printer.webRejectUnauthorized === true,  // default false (self-signed)
      ...readPrinterDpi(printer.dpi),
      ...readTagOffset(printer.tagOffsetXMm, "tagOffsetXMm"),
      ...readTagOffset(printer.tagOffsetYMm, "tagOffsetYMm"),
      ...readLabelLengthDots(printer.labelLengthDots),
      ...readMillimetres(printer.labelLengthMm, "labelLengthMm"),
      ...readMillimetres(printer.tagHeadTopMm, "tagHeadTopMm"),
      ...readMillimetres(printer.tagHeadLeftMm, "tagHeadLeftMm"),
    },
    logLevel: (c.logLevel as BridgeConfig["logLevel"]) || "info",
  };
}

function readTagOffset(value: unknown, name: string): { tagOffsetXMm: number } | { tagOffsetYMm: number } | Record<string, never> {
  if (value === undefined || value === null || value === "") return {};
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) {
    console.error(`ERROR: printer.${name} must be a number of millimetres, or omit it`);
    process.exit(1);
  }
  return name === "tagOffsetXMm" ? { tagOffsetXMm: n } : { tagOffsetYMm: n };
}

function readLabelLengthDots(value: unknown): { labelLengthDots: number } | Record<string, never> {
  if (value === undefined || value === null || value === "") return {};
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 1) {
    console.error("ERROR: printer.labelLengthDots must be a positive whole number, or omit it");
    process.exit(1);
  }
  return { labelLengthDots: n };
}

function readMillimetres(
  value: unknown,
  name: "labelLengthMm" | "tagHeadTopMm" | "tagHeadLeftMm",
): { labelLengthMm: number } | { tagHeadTopMm: number } | { tagHeadLeftMm: number } | Record<string, never> {
  if (value === undefined || value === null || value === "") return {};
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) {
    console.error(`ERROR: printer.${name} must be a number of millimetres, or omit it`);
    process.exit(1);
  }
  if (name === "labelLengthMm") return { labelLengthMm: n };
  if (name === "tagHeadTopMm") return { tagHeadTopMm: n };
  return { tagHeadLeftMm: n };
}

function readPrinterDpi(value: unknown): { dpi: number } | Record<string, never> {
  if (value === undefined || value === null || value === "") return {};
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 150 || n > 600) {
    console.error(`ERROR: printer.dpi must be a whole number from 150 to 600, or omit it to auto-detect`);
    process.exit(1);
  }
  return { dpi: n };
}

/** TCP connectivity check — connects and immediately closes. Sends nothing. */
function testTcpReachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      console.log(`[WARN] TCP reachability: connect to ${host}:${port} TIMED OUT after ${timeoutMs}ms`);
      resolve(false);
    }, timeoutMs);
    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      // Surface the real reason instead of swallowing it. ENETUNREACH/EHOSTUNREACH
      // => routing/netns (WSL/container/VPN); ECONNREFUSED => nothing listening
      // from this process's view; ETIMEDOUT => SYN dropped for this context.
      console.log(`[WARN] TCP reachability: connect to ${host}:${port} FAILED — code=${err.code} errno=${err.errno} msg=${err.message}`);
      resolve(false);
    });
  });
}

async function main() {
  const config = loadConfig();
  const ts = new Date().toISOString();
  console.log(`[${ts}] [INFO] Vault RFID Bridge starting`);
  console.log(`[${ts}] [INFO] Vault URL : ${config.vaultApiUrl}`);
  console.log(`[${ts}] [INFO] Printer   : ${config.printer.host}:${config.printer.port}`);

  // Startup connectivity test — TCP connect only, no ZPL sent
  console.log(`[${ts}] [INFO] Testing printer TCP reachability…`);
  const reachable = await testTcpReachable(
    config.printer.host,
    config.printer.port,
    config.printer.connectTimeoutMs
  );
  if (reachable) {
    console.log(`[${ts}] [INFO] Printer ${config.printer.host}:${config.printer.port} is reachable ✓`);
  } else {
    console.log(`[${ts}] [WARN] Printer ${config.printer.host}:${config.printer.port} is NOT reachable — check IP and network`);
    console.log(`[${ts}] [WARN] Bridge will keep running and retry on each poll`);
  }

  if (config.printer.dpi) {
    console.log(`[${ts}] [INFO] Printer head resolution: ${config.printer.dpi} dpi (from printer.dpi in config.json)`);
  } else if (!reachable) {
    config.printer.dpi = DEFAULT_DPI;
    console.log(`[${ts}] [INFO] Printer head resolution: no reply, using ${DEFAULT_DPI} dpi`);
  } else {
    const detected = await readHeadDpi(config.printer.host, config.printer.port, config.printer.connectTimeoutMs);
    if (detected) {
      config.printer.dpi = detected;
      console.log(`[${ts}] [INFO] Printer head resolution: ${detected} dpi`);
    } else {
      config.printer.dpi = DEFAULT_DPI;
      console.log(`[${ts}] [INFO] Printer head resolution: no reply, using ${DEFAULT_DPI} dpi`);
    }
  }

  await runBridge(config, reachable);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error("Bridge crashed:", err);
    process.exit(1);
  });
}
