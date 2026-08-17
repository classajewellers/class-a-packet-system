/**
 * ZPL label generation for the Vault RFID system.
 *
 * ── EPC encoding ────────────────────────────────────────────────────────────
 * Command: ^RFW,H,1,6,1
 *   H  = hexadecimal format
 *   1  = EPC memory bank (Gen2 banks: 0=Reserved, 1=EPC, 2=TID(R/O), 3=User)
 *   6  = 6 words × 16 bits = 96 bits (one complete 96-bit EPC)
 *   1  = antenna 1
 *
 * The Zebra handles EPC bank layout automatically:
 *   word 0 = CRC-16 (computed by tag hardware, never written)
 *   word 1 = PC (Protocol Control, set by Zebra from length)
 *   words 2–7 = EPC data ← our 24-char hex payload goes here
 *
 * A 24-char hex string = 12 bytes = 96 bits = 6 words. ✓
 *
 * ── Encode failure ───────────────────────────────────────────────────────────
 * The ZD621R does NOT send RFID encode success/failure back over TCP port 9100.
 * On failure, the printer voids the label (prints "VOID") and retries up to the
 * configured retry count (^RS command). After max retries it asserts a printer
 * error visible on the display, but this is not returned via the data channel.
 *
 * Consequence: TCP write success ≠ RFID encode success.
 * Tags must be physically read to confirm encoding. The Vault lifecycle reflects
 * this: job completion → tag status "printed" (transmitted, unverified);
 * physical read confirmation → tag status "active" (verified).
 *
 * ── Label dimensions ─────────────────────────────────────────────────────────
 * widthDots and lengthDots must be calibrated to your actual label stock.
 * 300 DPI: 1mm ≈ 11.81 dots.
 * Common jewellery tag sizes:
 *   50mm × 30mm → ^PW590 ^LL354
 *   38mm × 25mm → ^PW449 ^LL295
 * DO NOT assume dimensions until Sean confirms the label specification.
 */

export type LabelData = {
  epc: string;              // 24-char hex, must be exactly 24 chars
  sku: string;
  title?: string | null;
  metal?: string | null;
  stone?: string | null;
  barcode?: string | null;
  widthDots?: number;       // print width in dots — MUST match physical label
  lengthDots?: number;      // label length in dots — MUST match physical label
};

/**
 * Generate ZPL II for a jewellery RFID label.
 *
 * Caller MUST supply widthDots and lengthDots matching the loaded label stock.
 * The defaults here (406 × 203) are a conservative 34mm × 17mm starting point
 * for initial calibration only — replace once Sean confirms label dimensions.
 */
export function generateJewelleryZpl(data: LabelData): string {
  const { epc, sku, title, metal, stone } = data;
  const barcodeValue = data.barcode || sku;
  const widthDots  = data.widthDots  ?? 406;  // calibrate before production
  const lengthDots = data.lengthDots ?? 203;  // calibrate before production

  if (epc.length !== 24 || !/^[0-9a-f]+$/i.test(epc)) {
    throw new Error(`Invalid EPC: must be exactly 24 lowercase hex chars, got "${epc}"`);
  }

  const titleLine = truncate(title ?? "", 18);
  const metalLine = truncate(metal ?? "", 18);
  const stoneLine = truncate(stone ?? "", 18);
  const skuLine   = truncate(sku,        18);

  return [
    "^XA",
    "^MMT",                           // tear-off mode
    `^PW${widthDots}`,                // print width (calibrate to label)
    `^LL${lengthDots}`,               // label length (calibrate to label)
    "^LS0",
    "^CI28",                          // UTF-8 encoding

    // RFID write — EPC bank 1, 6 words (96 bits), antenna 1
    // Must appear before print fields. Zebra handles PC word and CRC automatically.
    `^RFW,H,1,6,1^FD${epc.toLowerCase()}^FS`,

    `^FO16,12^A0N,24,24^FD${escZpl(titleLine)}^FS`,
    `^FO16,40^A0N,18,18^FD${escZpl(metalLine)}^FS`,
    `^FO16,62^A0N,18,18^FD${escZpl(stoneLine)}^FS`,
    `^FO16,86^A0N,18,18^FD${escZpl(skuLine)}^FS`,

    // Code 128 barcode — adjust height as needed for label height
    `^FO16,108^BCN,45,Y,N,N^FD${escZpl(barcodeValue)}^FS`,

    "^PQ1",
    "^XZ",
  ].join("\n");
}

function escZpl(s: string): string {
  // Strip ^ and ~ (ZPL control chars) and non-printable ASCII
  return s.replace(/\^/g, "").replace(/~/g, "").replace(/[^\x20-\x7E]/g, "");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
