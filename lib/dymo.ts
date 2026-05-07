// Client-side Dymo Connect integration.
// Calls the Dymo Connect REST API running locally on the counter PC.
// Falls back to window.print() with HTML label if Dymo is unreachable.

import { Packet } from "./types";
import { generateDymoXML, generatePrintHTML } from "./labelGenerator";

function getDymoHost(): string {
  return process.env.NEXT_PUBLIC_DYMO_SERVICE_HOST ?? "localhost";
}

function getDymoBaseUrl(): string {
  return `http://${getDymoHost()}:41951`;
}

// Check if Dymo Connect service is reachable
async function isDymoReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(
      `${getDymoBaseUrl()}/DYMO/DLS/Printing/StatusConnected`,
      { signal: controller.signal, mode: "cors" }
    );
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// Get the first available Dymo printer name
async function getDymoPrinterName(): Promise<string | null> {
  try {
    const res = await fetch(
      `${getDymoBaseUrl()}/DYMO/DLS/Printing/GetPrinters`,
      { mode: "cors" }
    );
    if (!res.ok) return null;
    const text = await res.text();
    // Parse XML response to find first printer name
    const match = text.match(/<Name>([^<]+)<\/Name>/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Print via Dymo Connect REST API
async function printViaDymo(packet: Packet): Promise<boolean> {
  const reachable = await isDymoReachable();
  if (!reachable) return false;

  const printerName = await getDymoPrinterName();
  if (!printerName) return false;

  const labelXml = generateDymoXML(packet);

  try {
    const printParamsXml =
      `<LabelWriterPrintParams><Orientation>Portrait</Orientation></LabelWriterPrintParams>`;

    const body = new URLSearchParams({
      printerName,
      printParamsXml,
      labelXml,
      labelSetXml: "",
    });

    const res = await fetch(
      `${getDymoBaseUrl()}/DYMO/DLS/Printing/PrintLabel`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        mode: "cors",
      }
    );

    return res.ok;
  } catch {
    return false;
  }
}

// HTML fallback: open print dialog in a new tab
function printViaHTML(packet: Packet): boolean {
  try {
    const html = generatePrintHTML(packet);
    const win = window.open("", "_blank");
    if (!win) return false;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
    return true;
  } catch {
    return false;
  }
}

// Main entry point — tries Dymo first, falls back to HTML print
export async function printLabel(packet: Packet): Promise<boolean> {
  const dymoSuccess = await printViaDymo(packet);
  if (dymoSuccess) return true;
  return printViaHTML(packet);
}
