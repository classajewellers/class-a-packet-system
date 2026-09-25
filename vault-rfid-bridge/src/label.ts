/**
 * jewellery_v1 ZPL for a 68 mm × 26 mm RFID label.
 *
 * Every position is millimetres converted at the printer DPI. 203 dpi heads
 * are 8 dots/mm (544 × 208). 300 dpi heads are 300/25.4 dots/mm (about 803 × 307).
 *
 * EPC write is unchanged: SGD rfid.position.program, then ^RFW,H,1,6,1.
 * The ZD621R does not report encode success on port 9100.
 */

export const LABEL_WIDTH_MM = 68;
export const LABEL_LENGTH_MM = 26;
export const DEFAULT_DPI = 203;

export type LabelData = {
  epc: string;              // 24-char hex
  sku: string;
  title?: string | null;
  metal?: string | null;
  stone?: string | null;
  barcode?: string | null;
  dpi?: number;
  widthDots?: number;       // optional ^PW override
  lengthDots?: number;      // optional ^LL override
  programPosition?: string; // SGD rfid.position.program, default "F4"
};

/** Dots per millimetre for a Zebra head. 203 dpi is exactly 8 dpmm. */
export function dotsPerMm(dpi: number): number {
  if (dpi === 203) return 8;
  if (dpi === 600) return 24;
  return dpi / 25.4;
}

export function mmToDots(mm: number, dpi: number): number {
  return Math.max(1, Math.round(mm * dotsPerMm(dpi)));
}

export function normalizeDpi(dpi: number | undefined): number {
  if (dpi == null || !Number.isFinite(dpi)) return DEFAULT_DPI;
  const rounded = Math.round(dpi);
  if (rounded < 150 || rounded > 600) return DEFAULT_DPI;
  return rounded;
}

/**
 * Generate ZPL II for a jewellery RFID label that fills 68 mm × 26 mm.
 */
export function generateJewelleryZpl(data: LabelData): string {
  const { epc, sku } = data;
  const dpi = normalizeDpi(data.dpi);
  const px = (mm: number) => mmToDots(mm, dpi);
  const barcodeValue = (data.barcode || sku).trim();
  const programPosition = (data.programPosition ?? "F4").replace(/[^A-Za-z0-9]/g, "") || "F4";
  const titleText = cleanText(data.title);
  const showTitle = titleText.length > 0 && titleText.toLowerCase() !== sku.trim().toLowerCase();
  const detailText = [cleanText(data.metal), cleanText(data.stone)].filter(Boolean).join(" / ");

  if (epc.length !== 24 || !/^[0-9a-f]+$/i.test(epc)) {
    throw new Error(`Invalid EPC: must be exactly 24 lowercase hex chars, got "${epc}"`);
  }

  const width = data.widthDots ?? px(LABEL_WIDTH_MM);
  const length = data.lengthDots ?? px(LABEL_LENGTH_MM);
  const marginX = px(2);
  const marginTop = px(2);
  const marginBottom = px(1.5);
  const labelTop = px(1);
  const textW = Math.max(px(10), width - marginX * 2);
  const skuH = px(3.2);
  const titleH = px(2.15);
  const detailH = px(2.05);
  const gap = px(0.4);
  const readableH = px(2.2);

  const titleLines = showTitle ? (fits(2) ? 2 : 1) : 0;

  function textBlock(lines: number): number {
    let y = marginTop + skuH + gap;
    if (showTitle) y += titleH * lines + (lines > 1 ? px(0.15) : 0) + gap;
    if (detailText) y += detailH + gap;
    return y;
  }

  function fits(lines: number): boolean {
    return textBlock(lines) + px(4.5) + readableH + marginBottom + labelTop <= length;
  }

  const barcodeY = textBlock(titleLines);
  const barH = Math.max(px(4.5), length - labelTop - marginBottom - readableH - barcodeY);
  let moduleWidth = Math.max(1, Math.round(0.25 * dotsPerMm(dpi)));
  const modules = 11 * Math.max(barcodeValue.length, 1) + 35;
  while (moduleWidth > 1 && modules * moduleWidth > textW) moduleWidth -= 1;

  const fields = [
    field(marginX, marginTop, skuH, textW, 1, 0, sku.trim()),
  ];
  let y = marginTop + skuH + gap;
  if (showTitle) {
    const lineGap = titleLines > 1 ? px(0.15) : 0;
    fields.push(field(marginX, y, titleH, textW, titleLines, lineGap, titleText));
    y += titleH * titleLines + lineGap + gap;
  }
  if (detailText) {
    fields.push(field(marginX, y, detailH, textW, 1, 0, detailText));
  }

  return [
    `! U1 setvar "rfid.position.program" "${programPosition}"`,
    "^XA",
    "^MMT",
    `^PW${width}`,
    `^LL${length}`,
    "^LH0,0",
    `^LT${labelTop}`,
    "^LS0",
    "^CI28",
    `^RFW,H,1,6,1^FD${epc.toLowerCase()}^FS`,
    ...fields,
    `^FO${marginX},${barcodeY}^BY${moduleWidth},2,${barH}^BCN,${barH},Y,N,N^FD${escZpl(barcodeValue)}^FS`,
    "^PQ1",
    "^XZ",
  ].join("\n");
}

function field(x: number, y: number, font: number, width: number, lines: number, lineGap: number, text: string): string {
  return `^FO${x},${y}^A0N,${font},${font}^FB${width},${lines},${lineGap},L,0^FD${escZpl(text)}^FS`;
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function escZpl(s: string): string {
  return s.replace(/\^/g, "").replace(/~/g, "").replace(/[^\x20-\x7E]/g, "");
}
