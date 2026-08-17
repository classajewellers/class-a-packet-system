import fs from "fs";
import path from "path";
import net from "net";
import { BridgeConfig } from "./types";
import { runBridge } from "./bridge";

function loadConfig(): BridgeConfig {
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

  return {
    vaultApiUrl:          String(c.vaultApiUrl),
    bridgeApiKey:         String(c.bridgeApiKey),
    pollIntervalMs:       Number(c.pollIntervalMs)      || 3000,
    heartbeatIntervalMs:  Number(c.heartbeatIntervalMs) || 30000,
    printer: {
      host:             String(printer.host),
      port:             Number(printer.port)            || 9100,
      connectTimeoutMs: Number(printer.connectTimeoutMs) || 5000,
      writeTimeoutMs:   Number(printer.writeTimeoutMs)  || 10000,
    },
    logLevel: (c.logLevel as BridgeConfig["logLevel"]) || "info",
  };
}

/** TCP connectivity check — connects and immediately closes. Sends nothing. */
function testTcpReachable(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      clearTimeout(timer);
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

  await runBridge(config, reachable);
}

main().catch((err: unknown) => {
  console.error("Bridge crashed:", err);
  process.exit(1);
});
