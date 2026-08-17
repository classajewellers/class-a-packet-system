import fs from "fs";
import path from "path";
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

  if (!c.vaultApiUrl || !c.bridgeApiKey) {
    console.error("ERROR: config.json must include vaultApiUrl and bridgeApiKey");
    process.exit(1);
  }

  return {
    vaultApiUrl:          String(c.vaultApiUrl),
    bridgeApiKey:         String(c.bridgeApiKey),
    pollIntervalMs:       Number(c.pollIntervalMs)       || 3000,
    heartbeatIntervalMs:  Number(c.heartbeatIntervalMs)  || 30000,
    printer: {
      host:             String((c.printer as any)?.host            || "192.168.40.242"),
      port:             Number((c.printer as any)?.port            || 9100),
      connectTimeoutMs: Number((c.printer as any)?.connectTimeoutMs || 5000),
      writeTimeoutMs:   Number((c.printer as any)?.writeTimeoutMs  || 10000),
    },
    logLevel: (c.logLevel as BridgeConfig["logLevel"]) || "info",
  };
}

const config = loadConfig();
runBridge(config).catch((err: unknown) => {
  console.error("Bridge crashed:", err);
  process.exit(1);
});
