/**
 * Read-only printer check. A fake printer answers getvar and records every
 * byte it was sent.
 *   npm run test:printer-check
 */
import net from "net";
import type { AddressInfo } from "net";
import type { BridgeConfig } from "./types";
import {
  PRINTER_CHECK_QUERIES,
  buildPrinterCheckReport,
  formatPrinterCheckReport,
  judgeClock,
  queryPrinterGetvars,
  sgdGetvarCommand,
} from "./printer-check";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const REPLIES: Record<string, string> = {
  "appl.name": '"V93.21.25Z"\r\n',
  "device.friendly_name": '"Vault ZD621R"\r\n',
  "device.unique_id": '"D6J123456"\r\n',
  "head.resolution.in_dpi": '"300"\r\n',
  "print.width": '"832"\r\n',
  "zpl.label_length": '"425"\r\n',
  "rtc.date": '"09-26-2026"\r\n',
  "rtc.time": '"12:30:00"\r\n',
  "ip.ntp.enable": '"on"\r\n',
  "ip.ntp.servers": '"pool.ntp.org"\r\n',
  "weblink.ip.conn1.location": '""\r\n',
  "weblink.ip.conn1.authentication.entries": '"0"\r\n',
  "weblink.ip.conn1.retry_interval": '"10"\r\n',
  "weblink.logging.max_entries": '"500"\r\n',
  "weblink.enable": '"off"\r\n',
  "weblink.ip.conn1.proxy": '""\r\n',
  "file.dir": "E:WEBLINK1_CA.NRD\r\nE:OTHER.TXT\r\n",
  "usb.host.config": '"read-write"\r\n',
  "usb.host.lock_out": '"off"\r\n',
  "usb.mirror.enable": '"off"\r\n',
  "usb.mirror.auto": '"off"\r\n',
  "ip.dhcp.enable": '"on"\r\n',
  "ip.addr": '"192.168.40.242"\r\n',
};

async function listen(): Promise<{ server: net.Server; port: number; received: string[] }> {
  const received: string[] = [];
  const server = net.createServer((socket) => {
    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let nl = buf.indexOf("\n");
      while (nl !== -1) {
        const line = buf.slice(0, nl + 1);
        buf = buf.slice(nl + 1);
        received.push(line);
        const name = line.match(/getvar "([^"]+)"/)?.[1] ?? "";
        socket.write(REPLIES[name] ?? '"?"\r\n');
        nl = buf.indexOf("\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return { server, port: (server.address() as AddressInfo).port, received };
}

async function main() {
  for (const query of PRINTER_CHECK_QUERIES) {
    const command = sgdGetvarCommand(query);
    assert(command.startsWith("! U1 getvar "), command);
    assert(!/\bsetvar\b/i.test(command), command);
    assert(!/\bdo\b/i.test(command), command);
    assert(!command.includes("^HW"), command);
  }
  assert(PRINTER_CHECK_QUERIES.some((query) => query.name === "file.dir" && query.arg === "E:"), "file.dir E:");
  assert(!PRINTER_CHECK_QUERIES.some((query) => /443|setvar|reset/i.test(query.name)), "no 443 or setvar query");

  const now = new Date("2026-09-26T03:00:00.000Z");
  const adelaide = judgeClock("09-26-2026", "12:30:00", now);
  assert(adelaide.clock === "ok", `expected clock ok, got ${adelaide.clock} ${adelaide.detail}`);
  const skewed = judgeClock("01-01-2020", "00:00:00", now);
  assert(skewed.clock === "skewed", `expected skewed, got ${skewed.clock}`);
  const unknown = judgeClock(null, null, now);
  assert(unknown.clock === "unknown", unknown.clock);

  const { server, port, received } = await listen();
  try {
    const replies = await queryPrinterGetvars("127.0.0.1", port, 2000);
    assert(replies["appl.name"]?.includes("V93.21.25Z"), `firmware ${replies["appl.name"]}`);
    assert(replies["head.resolution.in_dpi"]?.includes("300"), `dpi ${replies["head.resolution.in_dpi"]}`);
    assert(replies["file.dir"]?.includes("WEBLINK1_CA.NRD"), `certs ${replies["file.dir"]}`);
    assert(received.length === PRINTER_CHECK_QUERIES.length, `sent ${received.length}`);
    for (const line of received) {
      assert(line.startsWith("! U1 getvar "), `unexpected bytes: ${JSON.stringify(line)}`);
      assert(!/\bsetvar\b/i.test(line) && !/\bdo\b/i.test(line), line);
    }
    assert(received.some((line) => line.includes('getvar "file.dir" "E:"')), "file.dir argument was not sent");

    const config = {
      vaultApiUrl: "http://127.0.0.1",
      bridgeApiKey: "test",
      pollIntervalMs: 1000,
      heartbeatIntervalMs: 1000,
      printer: {
        host: "127.0.0.1",
        port,
        connectTimeoutMs: 2000,
        writeTimeoutMs: 2000,
        dpi: 300,
        labelLengthDots: 425,
        tagHeadTopMm: 8.7,
        tagHeadLeftMm: 0.5,
      },
      logLevel: "info",
    } as BridgeConfig;
    const report = buildPrinterCheckReport(config, replies, now);
    assert(report.summary.firmware === "V93.21.25Z", report.summary.firmware ?? "no firmware");
    assert(report.summary.dpi === 300, String(report.summary.dpi));
    assert(report.summary.serial === "D6J123456", report.summary.serial ?? "");
    assert(report.summary.weblink_configured === false, "weblink should be no");
    assert(report.summary.cert_files.includes("WEBLINK1_CA.NRD"), report.summary.cert_files.join(","));
    assert(report.summary.port_443_outbound === "skipped", "443");
    assert(report.bridge_overrides.labelLengthDots === 425, "override");
    assert(report.bridge_overrides.dpi === 300, "override dpi");
    const text = formatPrinterCheckReport(report);
    assert(text.includes("Firmware: V93.21.25Z"), text);
    assert(text.includes("Head DPI: 300"), text);
    assert(text.includes("Clock: OK"), text);
    assert(text.includes("Weblink configured: no"), text);
    assert(text.includes("WEBLINK1_CA.NRD"), text);
    assert(!/\bsetvar\b/i.test(text), "report must not mention setvar");

    const linked = buildPrinterCheckReport(config, {
      ...replies,
      "weblink.enable": '"on"\r\n',
      "weblink.ip.conn1.location": '"wss://example.workers.dev/printer/token"\r\n',
    }, now);
    assert(linked.summary.weblink_configured === true, "weblink yes");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log("printer-check-test: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
