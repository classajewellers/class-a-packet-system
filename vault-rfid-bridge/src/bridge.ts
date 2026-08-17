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

  const res = await vaultFetch(config, `/api/rfid/bridge/jobs/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    log("warn", `Failed to update job ${jobId} to ${status}: ${res.status} ${text}`);
  }
}

async function processJob(config: BridgeConfig, job: PrintJob): Promise<void> {
  log("info", `Processing job ${job.id} (piece_id=${job.piece_id})`);

  // Claim it
  await updateJobStatus(config, job.id, "claimed");

  // Mark printing
  await updateJobStatus(config, job.id, "printing");

  // Send ZPL to printer
  try {
    await sendZpl(
      config.printer.host,
      config.printer.port,
      job.zpl_payload,
      config.printer.connectTimeoutMs,
      config.printer.writeTimeoutMs
    );
    log("info", `Job ${job.id} sent to printer successfully`);
    await updateJobStatus(config, job.id, "completed");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", `Job ${job.id} failed: ${msg}`);
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
      log("error", "Bridge API key rejected by Vault — check config.json");
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
  try {
    await vaultFetch(config, "/api/rfid/bridge/heartbeat", {
      method: "POST",
      body: JSON.stringify({ version: BRIDGE_VERSION }),
    });
  } catch {
    // Heartbeat failure is non-fatal; poll errors are more informative
  }
}

export async function runBridge(config: BridgeConfig): Promise<never> {
  log("info", `Vault RFID Bridge v${BRIDGE_VERSION} starting`);
  log("info", `Vault URL: ${config.vaultApiUrl}`);
  log("info", `Printer: ${config.printer.host}:${config.printer.port}`);
  log("info", `Poll interval: ${config.pollIntervalMs}ms`);

  // Send initial heartbeat
  await heartbeat(config);

  // Heartbeat timer (separate from poll)
  setInterval(() => heartbeat(config), config.heartbeatIntervalMs);

  // Poll loop — one at a time, no concurrent printer access
  while (true) {
    await poll(config);
    await sleep(config.pollIntervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
