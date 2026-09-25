import fs from "fs";
import net from "net";
import path from "path";
import { BridgeConfig, PrintJob } from "./types";
import {
  readRfidCounters,
  rfidEncodeDelta,
  RFID_VALID_COUNTER,
  RFID_VOID_COUNTER,
  sendZpl,
  type RfidCounters,
} from "./zebra";
import { countLogLines, fetchRfidLog, findEpcWriteInLog, printerWebUrl } from "./rfidlog";
import { DEFAULT_DPI, generateJewelleryZpl, type LabelData } from "./label";

const ENCODE_WAIT_MS = 20000;
const ENCODE_POLL_MS = 1000;
// Void-and-retry feeds another label about once a second. Require the void
// count to sit still across several reads before calling the encode a failure,
// so a pause between retries is not treated as the final result.
const ENCODE_STABLE_FAIL_READS = 4;

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

function writeLastJobZpl(zpl: string): string | null {
  try {
    const dir = path.resolve(process.cwd(), "logs");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "last-job.zpl");
    fs.writeFileSync(file, zpl, { encoding: "utf8" });
    return file;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log("warn", `Could not write logs/last-job.zpl (${message})`);
    return null;
  }
}

function zplDimensions(zpl: string): { pw: string; ll: string } {
  return {
    pw: zpl.match(/\^PW(\d+)/)?.[1] ?? "missing",
    ll: zpl.match(/\^LL(\d+)/)?.[1] ?? "missing",
  };
}

async function readCountersRetry(config: BridgeConfig, tries: number): Promise<RfidCounters | null> {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const counters = await readRfidCounters(
      config.printer.host,
      config.printer.port,
      config.printer.connectTimeoutMs
    );
    if (counters) return counters;
    if (attempt < tries) await sleep(ENCODE_POLL_MS);
  }
  return null;
}

/**
 * Poll the RFID odometers until a valid encode lands, the void count rises and
 * then stays put (the printer has finished its retries), or the wait expires.
 * The printer can refuse port 9100 while it is voiding, so a missed read is retried.
 */
async function watchRfidEncode(config: BridgeConfig, before: RfidCounters): Promise<RfidCounters | null> {
  const deadline = Date.now() + ENCODE_WAIT_MS;
  let latest: RfidCounters | null = null;
  let stableFailures = 0;

  while (Date.now() < deadline) {
    await sleep(ENCODE_POLL_MS);
    const current = await readRfidCounters(
      config.printer.host,
      config.printer.port,
      config.printer.connectTimeoutMs
    );
    if (!current) {
      stableFailures = 0;
      continue;
    }
    const delta = rfidEncodeDelta(before, current);
    if (delta.state === "ok") return current;
    if (delta.state === "failed" && latest && current.valid === latest.valid && current.voided === latest.voided) {
      stableFailures += 1;
      if (stableFailures >= ENCODE_STABLE_FAIL_READS) return current;
    } else {
      stableFailures = delta.state === "failed" ? 1 : 0;
    }
    latest = current;
  }
  return latest;
}

async function processJob(config: BridgeConfig, job: PrintJob): Promise<void> {
  log("info", `Claiming job ${job.id} (piece=${job.piece_id})`);
  await updateJobStatus(config, job.id, "claimed");

  log("info", `Sending ZPL for job ${job.id}`);
  await updateJobStatus(config, job.id, "printing");

  let zpl: string;
  try {
    zpl = zplForJob(config, job);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", `Job ${job.id}: ${msg} - marked failed`);
    await updateJobStatus(config, job.id, "failed", msg);
    return;
  }
  const bytes = Buffer.byteLength(zpl, "utf8");
  const { pw, ll } = zplDimensions(zpl);
  const zplPath = writeLastJobZpl(zpl);
  log("info", `Job ${job.id}: ${bytes} bytes ^PW${pw} ^LL${ll} written to ${zplPath ?? "logs/last-job.zpl (not written)"}`);

  const before = await readCountersRetry(config, 3);
  if (before) {
    log("info", `Job ${job.id}: RFID counters before valid=${before.valid} void=${before.voided}`);
  } else {
    log("warn", `Job ${job.id}: could not read ${RFID_VALID_COUNTER} / ${RFID_VOID_COUNTER} before the job`);
  }

  try {
    await sendZpl(
      config.printer.host,
      config.printer.port,
      zpl,
      config.printer.connectTimeoutMs,
      config.printer.writeTimeoutMs
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", `Job ${job.id} TCP send failed: ${msg}`);
    await updateJobStatus(config, job.id, "failed", msg);
    return;
  }

  const epc = jobEpc(job);
  if (!before) {
    const reason = `RFID encode FAILED (could not read ${RFID_VOID_COUNTER} before the job)`;
    log("error", `Job ${job.id}: ${reason} - marked failed`);
    await updateJobStatus(config, job.id, "failed", reason);
    return;
  }

  const after = await watchRfidEncode(config, before);
  if (!after) {
    const reason = `RFID encode FAILED (no reply from ${RFID_VALID_COUNTER} / ${RFID_VOID_COUNTER})`;
    log("error", `Job ${job.id}: ${reason} - marked failed`);
    await updateJobStatus(config, job.id, "failed", reason);
    return;
  }

  const delta = rfidEncodeDelta(before, after);
  log("info", `Job ${job.id}: RFID counters after valid=${after.valid} void=${after.voided}`);
  if (delta.state === "ok") {
    log("info", `Job ${job.id}: RFID encode OK (EPC ${epc})`);
    if (delta.voidDelta > 0) {
      log("info", `Job ${job.id}: printer voided ${delta.voidDelta} labels before the successful encode`);
    }
    await updateJobStatus(config, job.id, "completed");
    await attemptAutoVerify(config, job);
    return;
  }

  const voided = delta.state === "failed" ? delta.voidDelta : 0;
  const reason = voided > 0
    ? `RFID encode FAILED (printer voided ${voided} labels)`
    : `RFID encode FAILED (printer RFID counters did not confirm a write)`;
  log("error", `Job ${job.id}: ${reason} - marked failed`);
  await updateJobStatus(config, job.id, "failed", reason);
}

function jobEpc(job: PrintJob): string {
  const epc = job.label_data && typeof job.label_data.epc === "string" ? job.label_data.epc.trim() : "";
  return epc.toLowerCase();
}

/**
 * After a job's ZPL is transmitted, confirm from the printer's /rfidlog that the
 * expected EPC was written, then ask Vault to activate the tag automatically.
 * The EPC we told the printer to encode (job.label_data.epc) is the correlation
 * key. Best-effort: skipped if printer web creds aren't configured; never throws.
 */
function labelDataForJob(job: PrintJob, dpi: number): LabelData | null {
  const data = job.label_data;
  if (!data || typeof data.epc !== "string" || typeof data.sku !== "string") return null;
  if (!data.epc.trim() || !data.sku.trim()) return null;
  return {
    epc: data.epc.trim(),
    sku: data.sku.trim(),
    title: typeof data.title === "string" ? data.title : null,
    metal: typeof data.metal === "string" ? data.metal : null,
    stone: typeof data.stone === "string" ? data.stone : null,
    barcode: typeof data.barcode === "string" ? data.barcode : null,
    programPosition: typeof data.programPosition === "string" ? data.programPosition : undefined,
    dpi,
  };
}

// jewellery_v1 stored on the job was generated before the bridge knew the head
// DPI. Rebuild it at print time so the detected or configured DPI is what prints.
function zplForJob(config: BridgeConfig, job: PrintJob): string {
  if (job.label_template !== "jewellery_v1") return job.zpl_payload;
  const dpi = config.printer.dpi ?? DEFAULT_DPI;
  const label = labelDataForJob(job, dpi);
  if (!label) {
    log("warn", `Job ${job.id}: jewellery_v1 is missing label data, sending the stored ZPL`);
    return job.zpl_payload;
  }
  try {
    const zpl = generateJewelleryZpl(label);
    log("info", `Job ${job.id}: jewellery_v1 laid out at ${dpi} dpi for a 68x26 mm label`);
    return zpl;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "invalid label";
    if (message.startsWith("Invalid EPC:")) throw err;
    log("warn", `Job ${job.id}: could not rebuild jewellery_v1 (${message}), sending the stored ZPL`);
    return job.zpl_payload;
  }
}

async function attemptAutoVerify(config: BridgeConfig, job: PrintJob): Promise<void> {
  const expectedEpc =
    job.label_data && typeof job.label_data.epc === "string" ? job.label_data.epc.trim() : "";
  if (!expectedEpc) {
    log("warn", `RFID verify: no EPC on job ${job.id}, so the printed tag was not checked`);
    return;
  }

  if (!config.printer.webUser || !config.printer.webPassword) {
    log("warn", "RFID verify: printer web username or password is not set in config.json");
    return;
  }

  const tries = 5;
  let lastFail: { retryable: boolean; logLine: string } | null = null;
  let lastBody = "";
  for (let attempt = 1; attempt <= tries; attempt++) {
    const fetched = await fetchRfidLog(config);
    if (!fetched.ok) {
      lastFail = fetched;
      if (!fetched.retryable || attempt === tries) break;
      await sleep(2000);
      continue;
    }
    lastFail = null;
    lastBody = fetched.body;
    const match = findEpcWriteInLog(fetched.body, expectedEpc);
    if (match) {
      await postVerify(config, job, match.epc, match.timestamp);
      return;
    }
    if (attempt < tries) await sleep(2000);
  }

  if (lastFail) {
    log("warn", lastFail.logLine);
    return;
  }
  const lines = countLogLines(lastBody);
  log("warn", `RFID verify: no matching EPC in printer log for tag ${expectedEpc.toLowerCase()} (read ${lines} log lines from ${printerWebUrl(config)})`);
}

async function postVerify(config: BridgeConfig, job: PrintJob, epc: string, printerTimestamp: string): Promise<void> {
  try {
    const res = await vaultFetch(config, "/api/rfid/bridge/verify", {
      method: "POST",
      body: JSON.stringify({
        job_id: job.id,
        epc,
        device_id: config.printer.host,
        printer_timestamp: printerTimestamp,
      }),
    });
    if (!res.ok) {
      log("warn", `RFID verify: Vault verify call failed (HTTP ${res.status}) for tag ${epc}`);
      return;
    }
    const j = (await res.json().catch(() => ({}))) as { result?: { ok?: boolean; code?: string; error?: string } };
    if (j?.result?.ok) {
      log("info", `RFID verify: tag ${epc} is active`);
      return;
    }
    const code = j?.result?.code ?? "unknown";
    const error = j?.result?.error ?? "no details";
    log("warn", `RFID verify: Vault did not activate tag ${epc} (${code}: ${error})`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "network error";
    log("warn", `RFID verify: Vault verify call failed (${message}) for tag ${epc}`);
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
