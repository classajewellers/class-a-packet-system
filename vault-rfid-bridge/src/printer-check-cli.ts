import { loadConfig } from "./index";
import { formatPrinterCheckReport, printerCheckAnswered, runPrinterCheck } from "./printer-check";

/**
 * Read-only printer check. Prints a report and posts it to Vault.
 * Does not start the print loop and does not change the printer.
 */
async function main() {
  const config = loadConfig();
  const report = await runPrinterCheck(config);
  console.log(formatPrinterCheckReport(report));
  process.exit(printerCheckAnswered(report) ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
