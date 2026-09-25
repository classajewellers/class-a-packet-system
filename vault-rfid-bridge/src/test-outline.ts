/**
 * One-off alignment label for the rat-tail die-cut. No RFID encode.
 * Usage, from vault-rfid-bridge/: npm run test-outline
 * Sends the outline ZPL to the printer in config.json and overwrites logs/last-job.zpl.
 */
import fs from "fs";
import path from "path";
import { loadConfig } from "./index";
import { DEFAULT_DPI, generateOutlineZpl } from "./label";
import { readHeadDpi, sendZpl } from "./zebra";

function writeLastJobZpl(zpl: string): string {
  const dir = path.resolve(process.cwd(), "logs");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "last-job.zpl");
  fs.writeFileSync(file, zpl, { encoding: "utf8" });
  return file;
}

async function main(): Promise<void> {
  const config = loadConfig();
  let dpi = config.printer.dpi;
  if (!dpi) {
    const detected = await readHeadDpi(
      config.printer.host,
      config.printer.port,
      config.printer.connectTimeoutMs,
    );
    dpi = detected ?? DEFAULT_DPI;
    console.log(detected
      ? `Printer head resolution: ${dpi} dpi`
      : `Printer head resolution: no reply, using ${DEFAULT_DPI} dpi`);
  } else {
    console.log(`Printer head resolution: ${dpi} dpi (from printer.dpi in config.json)`);
  }

  const zpl = generateOutlineZpl({
    dpi,
    offsetXMm: config.printer.tagOffsetXMm ?? 0,
    offsetYMm: config.printer.tagOffsetYMm ?? 0,
  });
  const file = writeLastJobZpl(zpl);
  const pw = zpl.match(/\^PW(\d+)/)?.[1] ?? "?";
  const ll = zpl.match(/\^LL(\d+)/)?.[1] ?? "?";
  const bytes = Buffer.byteLength(zpl, "utf8");
  console.log(`Outline test: ${bytes} bytes ^PW${pw} ^LL${ll} written to ${file}`);

  await sendZpl(
    config.printer.host,
    config.printer.port,
    zpl,
    config.printer.connectTimeoutMs,
    config.printer.writeTimeoutMs,
  );
  console.log(`Outline test sent to ${config.printer.host}:${config.printer.port}. No RFID encode.`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Outline test failed: ${message}`);
  process.exit(1);
});
