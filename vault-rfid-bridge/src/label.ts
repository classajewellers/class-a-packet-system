/**
 * jewellery_v1 ZPL for a 68 mm × 26 mm RFID label on a Zebra ZD621R.
 *
 * The encode block is the one that wrote the chip on 25 Sep 2026 (bridge
 * 70cbb44): SGD rfid.position.program "F4" before ^XA, then ^RFW,H,1,6,1
 * immediately before the visual fields. No ^RS. A non-zero ^LT shifts the
 * format relative to that program position and the printer voids the label.
 * ^LT0 is the proven default and clears the label-top the failed layout stored.
 *
 * Positions are millimetres converted at the printer DPI. 203 dpi is 8 dots/mm
 * (544 × 208). 300 dpi is 300/25.4 dots/mm (803 × 307). ^PW sets the canvas.
 * It does not scale the fields, so the type itself has to be large.
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

type TextBlock = { text: string; font: number; lines: number; lineGap: number };

/**
 * Generate ZPL II for a jewellery RFID label that fills 68 mm × 26 mm.
 * Visual fields change. The RFID commands, their order, and their place
 * before those fields do not.
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
  const marginX = px(1.5);
  const textW = Math.max(px(10), width - marginX * 2);
  const gap = px(0.7);
  const marginTop = px(0.8);
  const skuH = px(4.8);
  const titleH = px(3.0);
  const detailH = px(2.8);
  const readableH = px(3.8);
  const marginBottom = px(1.0);

  const blocks: TextBlock[] = [{ text: sku.trim(), font: skuH, lines: 1, lineGap: 0 }];
  if (showTitle) {
    const perLine = charsPerLine(textW, titleH);
    const lines = titleText.length > perLine ? 2 : 1;
    blocks.push({
      text: clip(titleText, perLine * lines),
      font: titleH,
      lines,
      lineGap: lines > 1 ? px(0.15) : 0,
    });
  }
  if (detailText) {
    blocks.push({
      text: clip(detailText, charsPerLine(textW, detailH)),
      font: detailH,
      lines: 1,
      lineGap: 0,
    });
  }

  let placed = placeBlocks(blocks, marginTop, gap);
  let barH = length - placed.barcodeY - readableH - marginBottom;
  if (barH < px(4)) {
    const title = blocks.find((block, index) => index > 0 && block.lines > 1);
    if (title) {
      title.lines = 1;
      title.lineGap = 0;
      title.text = clip(title.text, charsPerLine(textW, title.font));
      placed = placeBlocks(blocks, marginTop, gap);
      barH = length - placed.barcodeY - readableH - marginBottom;
    }
  }
  if (barH < 1) barH = 1;
  if (placed.barcodeY + barH + readableH > length) {
    barH = Math.max(1, length - placed.barcodeY - marginBottom);
  }

  let moduleWidth = Math.min(6, Math.max(2, Math.round(0.5 * dotsPerMm(dpi))));
  const modules = 11 * Math.max(barcodeValue.length, 1) + 35;
  while (moduleWidth > 2 && modules * moduleWidth > textW) moduleWidth -= 1;

  const fields = placed.blocks.map((block) =>
    `^FO${marginX},${block.y}^A0N,${block.font},${block.font}^FB${textW},${block.lines},${block.lineGap},L,0^FD${escZpl(block.text)}^FS`
  );

  return [
    `! U1 setvar "rfid.position.program" "${programPosition}"`,
    "^XA",
    "^MUD",
    "^MMT",
    `^PW${width}`,
    `^LL${length}`,
    "^LH0,0",
    "^LT0",
    "^LS0",
    "^CI28",
    `^RFW,H,1,6,1^FD${epc.toLowerCase()}^FS`,
    ...fields,
    `^FO${marginX},${placed.barcodeY}^BY${moduleWidth},2,${barH}^BCN,${barH},Y,N,N^FD${escZpl(barcodeValue)}^FS`,
    "^PQ1",
    "^XZ",
  ].join("\n");
}

function charsPerLine(textW: number, font: number): number {
  return Math.max(4, Math.floor(textW / Math.max(1, font * 0.55)));
}

function blockHeight(block: TextBlock): number {
  return block.font * block.lines + block.lineGap * Math.max(0, block.lines - 1);
}

function placeBlocks(blocks: TextBlock[], marginTop: number, gap: number): {
  blocks: Array<TextBlock & { y: number }>;
  barcodeY: number;
} {
  let y = marginTop;
  const placed = blocks.map((block, index) => {
    const at = y;
    y += blockHeight(block);
    if (index < blocks.length - 1) y += gap;
    return { ...block, y: at };
  });
  return { blocks: placed, barcodeY: y + gap };
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 3) return text.slice(0, Math.max(0, max));
  return text.slice(0, max - 3) + "...";
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function escZpl(s: string): string {
  return s.replace(/\^/g, "").replace(/~/g, "").replace(/[^\x20-\x7E]/g, "");
}
