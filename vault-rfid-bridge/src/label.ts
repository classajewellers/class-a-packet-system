/**
 * jewellery_v1 ZPL for a fold-over rat-tail RFID tag.
 *
 * The stock is an 80 mm liner with a 71 × 36 mm label face. The printer
 * senses about 462 dots of pitch; ^LL is the 36 mm face so the back flag
 * is not clipped. The rat-tail head is 26 × 26 mm inside that face. The
 * tail to the right of the head is not printed. ^PW stays the 68 mm print
 * width under the left of the 4 inch head.
 *
 * The encode block is fixed: ^MUD ^MMT ^PW ^LL ^LH0,0 ^LT0 ^LS0 ^CI28, then
 * ^RFW,H,2,12,1 before any ^FO. Nothing here changes the printer's program
 * position. The only header field that follows the face length is ^LL.
 *
 * ^FO is the upper-left of a field regardless of rotation. ^A0I and ^BCI
 * rotate the artwork 180 degrees inside that box, so on the back flag the
 * SKU line is placed above the barcode. After the tag is folded and turned
 * over, the barcode is on top and the SKU reads upright underneath it.
 */

import { placeBack, placeFrontLines, type TagCopy } from "./tag-layout";

export const LABEL_WIDTH_MM = 68;
/** Label face height. At 300 dpi this is ^LL425. */
export const LABEL_LENGTH_MM = 36;
export const DEFAULT_DPI = 203;

/**
 * Head of the rat-tail tag, in millimetres, measured on the printed face.
 * headLeftMm and headTopMm are from the top-left of the label. The fold is
 * foldMm below the head top. Shift a printed job with printer.tagOffsetXMm /
 * tagOffsetYMm. Override the origin with printer.tagHeadLeftMm,
 * printer.tagHeadTopMm, and the face length with printer.labelLengthDots
 * (or printer.labelLengthMm) when the die-cut itself is different.
 */
export const TAG_HEAD_MM = {
  headLeftMm: 0.5,
  headTopMm: 8.7,
  headWidthMm: 25,
  headHeightMm: 26,
  foldMm: 13,
  marginMm: 1.5,
};

export type LabelData = {
  epc: string;              // 24-char hex
  sku: string;
  title?: string | null;
  metal?: string | null;
  /** Main-stone carat. The layout module formats this as "0.50ct". */
  carat?: number | string | null;
  /** Main-stone shape, already resolved from the piece, variant, or other_specs. */
  shape?: string | null;
  diamondType?: string | null;
  fingerSize?: string | null;
  barcode?: string | null;
  dpi?: number;
  widthDots?: number;       // optional ^PW override
  lengthDots?: number;      // optional ^LL override; wins over labelLengthMm
  labelLengthMm?: number;   // optional face height; default LABEL_LENGTH_MM
  headLeftMm?: number;      // optional; default TAG_HEAD_MM.headLeftMm
  headTopMm?: number;       // optional; default TAG_HEAD_MM.headTopMm
  offsetXMm?: number;
  offsetYMm?: number;
  programPosition?: string; // ignored; the printer's calibrated position is left alone
  onWarn?: (message: string) => void;
};

export type OutlineOptions = {
  dpi?: number;
  widthDots?: number;
  lengthDots?: number;
  labelLengthMm?: number;
  headLeftMm?: number;
  headTopMm?: number;
  offsetXMm?: number;
  offsetYMm?: number;
};

type Rect = { x: number; y: number; w: number; h: number };

export type TagGeometry = {
  dpi: number;
  labelWidth: number;
  labelLength: number;
  headLeft: number;
  headRight: number;
  headTop: number;
  fold: number;
  headBottom: number;
  margin: number;
  top: Rect;
  bottom: Rect;
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

function dots(mm: number, dpi: number): number {
  return Math.round(mm * dotsPerMm(dpi));
}

export function normalizeDpi(dpi: number | undefined): number {
  if (dpi == null || !Number.isFinite(dpi)) return DEFAULT_DPI;
  const rounded = Math.round(dpi);
  if (rounded < 150 || rounded > 600) return DEFAULT_DPI;
  return rounded;
}

export function tagGeometry(
  dpiInput: number | undefined,
  offsetXMm = 0,
  offsetYMm = 0,
  widthDots?: number,
  lengthDots?: number,
  layout: { headLeftMm?: number; headTopMm?: number; labelLengthMm?: number } = {},
): TagGeometry {
  const dpi = normalizeDpi(dpiInput);
  const headLeftMm = layout.headLeftMm ?? TAG_HEAD_MM.headLeftMm;
  const headTopMm = layout.headTopMm ?? TAG_HEAD_MM.headTopMm;
  const labelLengthMm = layout.labelLengthMm ?? LABEL_LENGTH_MM;
  const labelWidth = widthDots ?? dots(LABEL_WIDTH_MM, dpi);
  // Round from the label origin (head top + fold, head top + height) so the
  // fold stays on the measured notch. Rounding the head top and the fold
  // gap separately walks the notch a dot off.
  const labelLength = lengthDots ?? dots(labelLengthMm, dpi);
  const headLeft = dots(headLeftMm + offsetXMm, dpi);
  const headRight = dots(headLeftMm + TAG_HEAD_MM.headWidthMm + offsetXMm, dpi);
  const headTop = dots(headTopMm + offsetYMm, dpi);
  const fold = dots(headTopMm + TAG_HEAD_MM.foldMm + offsetYMm, dpi);
  const headBottom = dots(headTopMm + TAG_HEAD_MM.headHeightMm + offsetYMm, dpi);
  const margin = dots(TAG_HEAD_MM.marginMm, dpi);
  const innerW = Math.max(1, headRight - headLeft - margin * 2);
  return {
    dpi,
    labelWidth,
    labelLength,
    headLeft,
    headRight,
    headTop,
    fold,
    headBottom,
    margin,
    top: {
      x: headLeft + margin,
      y: headTop + margin,
      w: innerW,
      h: Math.max(1, fold - headTop - margin * 2),
    },
    bottom: {
      x: headLeft + margin,
      y: fold + margin,
      w: innerW,
      h: Math.max(1, headBottom - fold - margin * 2),
    },
  };
}

/**
 * Generate ZPL II for one rat-tail jewellery tag.
 * An EPC that is not 24 hex characters throws, and the bridge fails the job
 * instead of sending ZPL.
 */
export function generateJewelleryZpl(data: LabelData): string {
  const { epc, sku } = data;
  const epcHex = epc.trim().toLowerCase();
  if (epcHex.length !== 24 || !/^[0-9a-f]{24}$/.test(epcHex)) {
    throw new Error(`Invalid EPC: must be exactly 24 hex characters, got "${epc}"`);
  }

  const geo = tagGeometry(data.dpi, data.offsetXMm ?? 0, data.offsetYMm ?? 0, data.widthDots, data.lengthDots, {
    headLeftMm: data.headLeftMm,
    headTopMm: data.headTopMm,
    labelLengthMm: data.labelLengthMm,
  });
  const skuText = cleanText(sku);
  const copy: TagCopy = {
    sku: skuText,
    metal: data.metal,
    carat: data.carat,
    shape: data.shape,
    diamondType: data.diamondType,
    fingerSize: data.fingerSize,
  };

  const fields = [
    ...frontZpl(geo, copy),
    ...backFields(geo, skuText, data.onWarn),
  ];

  return [
    "^XA",
    "^MUD",
    "^MMT",
    `^PW${geo.labelWidth}`,
    `^LL${geo.labelLength}`,
    "^LH0,0",
    "^LT0",
    "^LS0",
    "^CI28",
    `^RFW,H,2,12,1^FD${epcHex}^FS`,
    ...fields,
    "^PQ1",
    "^XZ",
  ].join("\n");
}

/** Alignment label. No RFID write. Boxes are the printable area of each flag. */
export function generateOutlineZpl(options: OutlineOptions = {}): string {
  const geo = tagGeometry(options.dpi, options.offsetXMm ?? 0, options.offsetYMm ?? 0, options.widthDots, options.lengthDots, {
    headLeftMm: options.headLeftMm,
    headTopMm: options.headTopMm,
    labelLengthMm: options.labelLengthMm,
  });
  const thickness = 2;
  const topFont = fitFont("TOP", geo.top.w - 8, Math.min(dots(3.2, geo.dpi), geo.top.h - 8), dots(1.6, geo.dpi));
  const backFont = fitFont("BACK", geo.bottom.w - 8, Math.min(dots(3.2, geo.dpi), geo.bottom.h - 8), dots(1.6, geo.dpi));
  const headW = Math.max(1, geo.headRight - geo.headLeft);
  return [
    "^XA",
    "^MUD",
    "^MMT",
    `^PW${geo.labelWidth}`,
    `^LL${geo.labelLength}`,
    "^LH0,0",
    "^LT0",
    "^LS0",
    "^CI28",
    `^FO${geo.top.x},${geo.top.y}^GB${geo.top.w},${geo.top.h},${thickness}^FS`,
    `^FO${geo.bottom.x},${geo.bottom.y}^GB${geo.bottom.w},${geo.bottom.h},${thickness}^FS`,
    `^FO${geo.headLeft},${geo.fold}^GB${headW},${thickness},${thickness}^FS`,
    `^FO${geo.top.x + 4},${geo.top.y + 4}^A0N,${topFont},${topFont}^FDTOP^FS`,
    `^FO${geo.bottom.x + 4},${geo.bottom.y + 4}^A0N,${backFont},${backFont}^FDBACK^FS`,
    "^PQ1",
    "^XZ",
  ].join("\n");
}

function frontZpl(geo: TagGeometry, copy: TagCopy): string[] {
  return placeFrontLines(geo.top, geo.dpi, copy).flatMap((line) => {
    const field = `^FO${line.x},${line.y}^A0N,${line.font},${line.font}^FB${line.width},1,0,C,0^FD${escZpl(line.text)}^FS`;
    if (!line.bold) return [field];
    // A second pass one dot to the right is the reliable bold for font 0.
    // The first command stays on the flag origin.
    return [
      field,
      `^FO${line.x + 1},${line.y}^A0N,${line.font},${line.font}^FB${line.width},1,0,C,0^FD${escZpl(line.text)}^FS`,
    ];
  });
}

function backFields(geo: TagGeometry, sku: string, onWarn?: (message: string) => void): string[] {
  const placed = placeBack(geo.bottom, geo.dpi, sku);
  if (placed.warning) onWarn?.(placed.warning);
  // Printer y grows down. The inverted SKU sits nearer the fold than the
  // barcode, so a 180 degree turn puts the SKU under the barcode.
  const fields = [
    `^FO${placed.text.x},${placed.text.y}^A0I,${placed.text.font},${placed.text.font}^FD${escZpl(placed.text.text)}^FS`,
  ];
  if (!placed.barcode) return fields;
  const bar = placed.barcode;
  fields.push(`^FO${bar.x},${bar.y}^BY${bar.module},2,${bar.height}^BCI,${bar.height},N,N,N^FD${escZpl(bar.data)}^FS`);
  return fields;
}

function fitFont(text: string, maxWidth: number, maxHeight: number, minHeight: number): number {
  const len = Math.max(text.length, 1);
  const fitted = Math.floor(maxWidth / (len * 0.62));
  return Math.max(1, Math.min(maxHeight, Math.max(minHeight, fitted)));
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function escZpl(s: string): string {
  return s.replace(/\^/g, "").replace(/~/g, "").replace(/[^\x20-\x7E]/g, "");
}
