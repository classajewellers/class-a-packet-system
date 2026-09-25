import net from "net";
import { BridgeConfig, PrintJob } from "./types";
import { sendZpl } from "./zebra";
import { fetchRfidLog, findEpcWriteInLog } from "./rfidlog";

const BRIDGE_VERSION = "1.0.0";

function log(level: string, msg: string, data?: unknown) {
  const ts = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${ts}] [${level.toUpperCase()}] ${msg}`, data);
  } else {
    console.log(`[${ts}] [${level.toUpperCase()}] ${msg}`);
  }
}

const REDIRECT_LIMIT = 20;

function isVercelProtectionHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "vercel.com" || host.endsWith(".vercel.com");
}

function protectionWarning(config: BridgeConfig, status: number, path: string): string {
  const message = `Vercel protection blocked the request (HTTP ${status} ${path}). Set vercelBypassSecret in config.json.`;
  return config.vercelBypassSecret
    ? `${message} The configured secret may be wrong or expired.`
    : message;
}

function vaultHeaders(config: BridgeConfig, extra: HeadersInit | undefined, includeSecrets: boolean): HeadersInit {
  return {
    ...(includeSecrets ? { "Authorization": `Bearer ${config.bridgeApiKey}` } : {}),
    ...(includeSecrets && config.vercelBypassSecret
      ? { "x-vercel-protection-bypass": config.vercelBypassSecret }
      : {}),
    "Content-Type": "application/json",
    ...(extra ?? {}),
  };
}

// Follow non-Vercel redirects the same way fetch did (up to 20 hops; 301/302/303
// become GET). A 3xx to vercel.com is Deployment Protection SSO and is returned
// as that 3xx so callers see a failure. Authorization and the bypass secret stay
// on the original Vault origin only.
export async function vaultFetch(
  config: BridgeConfig,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const startUrl = `${config.vaultApiUrl.replace(/\/$/, "")}${path}`;
  let currentUrl = startUrl;
  let method = options.method ?? "GET";
  let body = options.body;
  const vaultOrigin = new URL(startUrl).origin;

  for (let hop = 0; hop <= REDIRECT_LIMIT; hop++) {
    const sameOrigin = new URL(currentUrl).origin === vaultOrigin;
    const res = await fetch(currentUrl, {
      ...options,
      method,
      body,
      headers: vaultHeaders(config, options.headers, sameOrigin),
      redirect: "manual",
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      let next: URL | null = null;
      try {
        next = location ? new URL(location, currentUrl) : null;
      } catch {
        next = null;
      }
      if (!next || isVercelProtectionHost(next.hostname) || hop === REDIRECT_LIMIT) {
        if (next && isVercelProtectionHost(next.hostname)) {
          log("warn", protectionWarning(config, res.status, path));
        }
        return res;
      }
      await res.body?.cancel().catch(() => undefined);
      currentUrl = next.toString();
      if (res.status === 301 || res.status === 302 || res.status === 303) {
        method = "GET";
        body = undefined;
      }
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      log("warn", protectionWarning(config, res.status, path));
    }
    return res;
  }

  throw new Error(`Vault redirect limit exceeded for ${path}`);
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
    const { host, port, connectTimeoutMs } = config.printer;
    const timer = setTimeout(() => {
      socket.destroy();
      log("warn", `printer reachability: connect to ${host}:${port} TIMED OUT after ${connectTimeoutMs}ms`);
      resolve(false);
    }, connectTimeoutMs);
    socket.connect(port, host, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      log("error", `printer reachability: connect to ${host}:${port} FAILED — code=${err.code} errno=${err.errno} msg=${err.message}`);
      resolve(false);
    });
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
    // Auto-verify from the printer's own write log (skips the manual UHF scan
    // for the base case). Non-fatal: on any failure the tag stays 'printed' and
    // the manual verification path remains available.
    await attemptAutoVerify(config, job);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", `Job ${job.id} TCP send failed: ${msg}`);
    await updateJobStatus(config, job.id, "failed", msg);
  }
}

/**
 * After a job's ZPL is transmitted, confirm from the printer's /rfidlog that the
 * expected EPC was written, then ask Vault to activate the tag automatically.
 * The EPC we told the printer to encode (job.label_data.epc) is the correlation
 * key. Best-effort: skipped if printer web creds aren't configured; never throws.
 */
async function attemptAutoVerify(config: BridgeConfig, job: PrintJob): Promise<void> {
  const expectedEpc =
    job.label_data && typeof job.label_data.epc === "string" ? job.label_data.epc : "";
  if (!expectedEpc) return;

  if (!config.printer.webUser || !config.printer.webPassword) {
    log("info", `Job ${job.id}: printer web creds not set — skipping auto-verify (manual verification still available)`);
    return;
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    const body = await fetchRfidLog(config);
    const match = body ? findEpcWriteInLog(body, expectedEpc) : null;
    if (match) {
      try {
        const res = await vaultFetch(config, "/api/rfid/bridge/verify", {
          method: "POST",
          body: JSON.stringify({
            job_id: job.id,
            epc: match.epc,
            device_id: config.printer.host,
            printer_timestamp: match.timestamp,
          }),
        });
        if (res.ok) {
          const j = (await res.json().catch(() => ({}))) as { result?: { ok?: boolean } };
          log("info", `Job ${job.id}: auto-verified via printer log (EPC ${match.epc}) — ${j?.result?.ok ? "tag active" : "verify result: " + JSON.stringify(j?.result)}`);
        } else {
          log("warn", `Job ${job.id}: auto-verify POST returned HTTP ${res.status}`);
        }
      } catch (err: unknown) {
        log("warn", `Job ${job.id}: auto-verify request failed`, err instanceof Error ? err.message : err);
      }
      return;
    }
    if (attempt < 5) await sleep(2000);
  }
  log("info", `Job ${job.id}: EPC not found in printer log after retries — left for manual verification`);
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
    const res = await vaultFetch(config, "/api/rfid/bridge/heartbeat", {
      method: "POST",
      body: JSON.stringify({ version: BRIDGE_VERSION, printer_reachable: printerReachable }),
    });
    if (!res.ok) return;
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
