import net from "net";
import { BridgeConfig, PrintJob } from "./types";
import { sendZpl } from "./zebra";

const BRIDGE_VERSION = "1.0.0";

function log(level: string, msg: string, data?: unknown) {
  const ts = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${ts}] [${level.toUpperCase()}] ${msg}`, data);
  } else {
    console.log(`[${ts}] [${level.toUpperCase()}] ${msg}`);
  }
}

async function vaultFetch(
  config: BridgeConfig,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${config.vaultApiUrl.replace(/\/$/, "")}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${config.bridgeApiKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

async function updateJobStatus(
  config: BridgeConfig,
  jobId: string,
  status: string,
  errorMessage?: string
) {
  const body: Record<string, string> = { status };
  if (errorMessage) body.error_message = errorMessage;

  try {
    const res = await vaultFetch(config, `/api/rfid/bridge/jobs/${jobId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "(no body)");
      log("warn", `Failed to update job ${jobId} to ${status}: HTTP ${res.status} ${text}`);
    }
  } catch (err: unknown) {
    log("warn", `Network error updating job ${jobId}`, err instanceof Error ? err.message : err);
  }
}

/** TCP connectivity check — connect and immediately close. Sends nothing to the printer. */
function checkPrinterReachable(config: BridgeConfig): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, config.printer.connectTimeoutMs);
    socket.connect(config.printer.port, config.printer.host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => { clearTimeout(timer); resolve(false); });
  });
}

async function processJob(config: BridgeConfig, job: PrintJob): Promise<void> {
  log("info", `Claiming job ${job.id} (piece=${job.piece_id})`);
  await updateJobStatus(config, job.id, "claimed");

  log("info", `Sending ZPL for job ${job.id}`);
  await updateJobStatus(config, job.id, "printing");

  try {
    await sendZpl(
      config.printer.host,
      config.printer.port,
      job.zpl_payload,
      config.printer.connectTimeoutMs,
      config.printer.writeTimeoutMs
    );
    // "completed" means ZPL bytes were flushed over TCP.
    // It does NOT mean the RFID chip encoded successfully.
    // Physical verification is required before the tag becomes active in Vault.
    log("info", `Job ${job.id} ZPL transmitted — awaiting physical verification`);
    await updateJobStatus(config, job.id, "completed");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", `Job ${job.id} TCP send failed: ${msg}`);
    await updateJobStatus(config, job.id, "failed", msg);
  }
}

async function poll(config: BridgeConfig): Promise<void> {
  let res: Response;
  try {
    res = await vaultFetch(config, "/api/rfid/bridge/jobs");
  } catch (err: unknown) {
    log("warn", "Poll failed (network error)", err instanceof Error ? err.message : err);
    return;
  }

  if (!res.ok) {
    if (res.status === 401) {
      log("error", "Bridge API key rejected by Vault — check bridgeApiKey in config.json");
    } else {
      log("warn", `Poll returned HTTP ${res.status}`);
    }
    return;
  }

  const data = (await res.json()) as { jobs: PrintJob[] };
  const jobs = data.jobs ?? [];

  if (jobs.length > 0) {
    log("info", `${jobs.length} job(s) queued`);
  }

  // Process jobs sequentially — printer handles one job at a time
  for (const job of jobs) {
    await processJob(config, job);
  }
}

async function heartbeat(config: BridgeConfig): Promise<void> {
  const printerReachable = await checkPrinterReachable(config);
  try {
    await vaultFetch(config, "/api/rfid/bridge/heartbeat", {
      method: "POST",
      body: JSON.stringify({ version: BRIDGE_VERSION, printer_reachable: printerReachable }),
    });
    if (!printerReachable) {
      log("warn", `Heartbeat sent — printer ${config.printer.host}:${config.printer.port} unreachable`);
    }
  } catch {
    // Heartbeat failures are non-fatal
  }
}

export async function runBridge(config: BridgeConfig, initiallyReachable = true): Promise<never> {
  log("info", `Poll interval: ${config.pollIntervalMs}ms | Heartbeat: ${config.heartbeatIntervalMs}ms`);
  if (!initiallyReachable) {
    log("warn", "Starting with printer unreachable — jobs will fail until connectivity restored");
  }

  await heartbeat(config);
  setInterval(() => heartbeat(config), config.heartbeatIntervalMs);

  while (true) {
    await poll(config);
    await sleep(config.pollIntervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
