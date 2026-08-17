/**
 * ZPL label generation for the Vault RFID system.
 *
 * Template: jewellery_v1
 *   - Designed for ~50mm x 30mm jewellery hang-tags at 300 DPI
 *   - RFID encoded via ^RFW (EPC bank, Gen 2, 96-bit)
 *   - Visible fields: SKU barcode, title, metal, stone, SKU text
 *
 * Calibrate ^PW (print width) and ^LL (label length) for your actual
 * label stock. 590 dots = 50mm; 354 dots = 30mm at 300 DPI.
 */

export type LabelData = {
  epc: string;           // 24-char hex
  sku: string;
  title?: string | null;
  metal?: string | null;
  stone?: string | null;
  barcode?: string | null;
};

/**
 * Generate a ZPL II label string for a jewellery piece.
 * The EPC is written to the tag's EPC memory bank (bank 1) using 6×16-bit words.
 */
export function generateJewelleryZpl(data: LabelData): string {
  const { epc, sku, title, metal, stone } = data;
  const barcodeValue = data.barcode || sku;

  // Truncate display fields to fit label width
  const titleLine  = truncate(title  ?? "", 20);
  const metalLine  = truncate(metal  ?? "", 20);
  const stoneLine  = truncate(stone  ?? "", 20);
  const skuLine    = truncate(sku,           20);

  // ^RFW,H,2,6,1 — write EPC bank (2), starting at word 2, 6 words (96 bits), antenna 1
  // The 24-char hex EPC fills exactly 6 × 16-bit = 96-bit words.
  return [
    "^XA",
    "^MMT",           // tear-off mode
    "^PW590",         // print width 590 dots (~50mm)
    "^LL354",         // label length 354 dots (~30mm)
    "^LS0",
    "^CI28",          // UTF-8 encoding

    // RFID write — must appear before ^PQ (print quantity)
    `^RFW,H,2,6,1^FD${epc}^FS`,

    // Title line
    `^FO20,15^A0N,26,26^FD${escZpl(titleLine)}^FS`,
    // Metal
    `^FO20,46^A0N,20,20^FD${escZpl(metalLine)}^FS`,
    // Stone
    `^FO20,70^A0N,20,20^FD${escZpl(stoneLine)}^FS`,
    // SKU text
    `^FO20,96^A0N,20,20^FD${escZpl(skuLine)}^FS`,

    // Code 128 barcode — narrow bar width 2, height 55, with human-readable below
    `^FO20,120^BCN,55,Y,N,N^FD${escZpl(barcodeValue)}^FS`,

    "^PQ1",           // print 1 label
    "^XZ",
  ].join("\n");
}

/** Escape ZPL special characters. */
function escZpl(s: string): string {
  return s.replace(/\^/g, "").replace(/~/g, "").replace(/[^\x20-\x7E]/g, "");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
