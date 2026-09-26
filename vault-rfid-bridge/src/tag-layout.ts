/**
 * Single source of truth for the jewellery RFID tag's printed lines.
 *
 * Change the front of the flag by editing FRONT_FIELDS. The ZPL generator
 * and the on-screen preview both place those lines with this module, at the
 * same dot positions. The encode command, label length, and head geometry
 * are not decided here: callers pass the flag boxes from tagGeometry.
 *
 * To change what prints on the front, edit FRONT_FIELDS below.
 * sku is the bold first line. metal is the second. detail is the stone
 * ("0.50ct Oval Lab") or, when there is no stone, "Size N". A blank detail
 * line is left off the flag.
 */

export type TagCopy = {
  sku: string;
  metal?: string | null;
  carat?: number | string | null;
  shape?: string | null;
  diamondType?: string | null;
  fingerSize?: string | null;
};

export type FrontField = {
  key: "sku" | "metal" | "detail";
  bold: boolean;
  /** Preferred font height in millimetres. */
  prefMm: number;
  minMm: number;
  format: (copy: TagCopy) => string;
};

export type PlacedLine = {
  key: string;
  text: string;
  x: number;
  y: number;
  font: number;
  bold: boolean;
  width: number;
};

export type FlagBox = { x: number; y: number; w: number; h: number };

const SHAPE_WORDS = [
  "round", "oval", "princess", "cushion", "emerald", "pear", "marquise",
  "radiant", "asscher", "heart",
];

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function formatCarat(value: number | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n.toFixed(2)}ct`;
}

/** "Lab Grown" and "lab" become Lab. "Natural" stays Natural. None is dropped. */
export function formatDiamondOrigin(value: string | null | undefined): string | null {
  const s = clean(value).toLowerCase();
  if (!s || s === "none" || s === "n/a") return null;
  if (s.startsWith("lab")) return "Lab";
  if (s.startsWith("natural")) return "Natural";
  return null;
}

export function formatShape(value: string | null | undefined): string | null {
  const s = clean(value);
  if (!s) return null;
  return s.replace(/[A-Za-z]+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

export function formatFingerSize(value: string | null | undefined): string {
  const s = clean(value);
  if (!s) return "";
  if (/^size\b/i.test(s)) return s.replace(/^size\b/i, "Size");
  return `Size ${s}`;
}

/**
 * Main-stone shape, in the order the piece actually stores it.
 * stone_shape is the piece field (not on every database). A variant's
 * stone_shape is next. other_specs is free text, so only a known shape
 * word in it counts. available_stone_shapes on a product is a menu, not
 * this piece's stone.
 */
export function resolveStoneShape(sources: {
  stoneShape?: string | null;
  variantShape?: string | null;
  otherSpecs?: string | null;
}): string | null {
  const direct = clean(sources.stoneShape);
  if (direct) return direct;
  const variant = clean(sources.variantShape);
  if (variant) return variant;
  const specs = clean(sources.otherSpecs).toLowerCase();
  if (!specs) return null;
  const words = specs.split(/[^a-z]+/);
  const hit = SHAPE_WORDS.find((shape) => words.includes(shape));
  return hit ?? null;
}

/** Stone line, or ring size, or blank. */
export function formatDetail(copy: TagCopy): string {
  const carat = formatCarat(copy.carat);
  const shape = formatShape(copy.shape);
  if (carat || shape) {
    return [carat, shape, formatDiamondOrigin(copy.diamondType)].filter(Boolean).join(" ");
  }
  return formatFingerSize(copy.fingerSize);
}

export function formatMetal(value: string | null | undefined): string {
  return clean(value);
}

export const FRONT_FIELDS: FrontField[] = [
  { key: "sku", bold: true, prefMm: 4.2, minMm: 1.1, format: (copy) => clean(copy.sku) },
  { key: "metal", bold: false, prefMm: 2.3, minMm: 1.1, format: (copy) => formatMetal(copy.metal) },
  { key: "detail", bold: false, prefMm: 2.3, minMm: 1.1, format: formatDetail },
];

/** Untruncated front copy, including a blank detail line when there is nothing to print. */
export function frontCopyLines(copy: TagCopy): Array<{ key: string; text: string; bold: boolean }> {
  return FRONT_FIELDS.map((field) => ({
    key: field.key,
    text: field.format(copy),
    bold: field.bold,
  }));
}

/** Font 0 advance is a bit over half the cell height for digits and capitals. */
export function estimateWidth(text: string, font: number): number {
  return Math.ceil(Math.max(text.length, 1) * font * 0.62);
}

/**
 * Hard-cut with an ASCII ellipsis. ZPL font 0 draws this reliably; a Unicode
 * ellipsis and a wrapping ^FB do not.
 */
export function truncateToWidth(text: string, font: number, maxWidth: number): string {
  if (estimateWidth(text, font) <= maxWidth) return text;
  const ellipsis = "...";
  if (estimateWidth(ellipsis, font) > maxWidth) {
    let value = text;
    while (value.length > 1 && estimateWidth(value, font) > maxWidth) {
      value = value.slice(0, -1);
    }
    return value;
  }
  let prefix = text;
  while (prefix.length > 0 && estimateWidth(`${prefix}${ellipsis}`, font) > maxWidth) {
    prefix = prefix.slice(0, -1);
  }
  return `${prefix}${ellipsis}`;
}

function dots(mm: number, dpi: number): number {
  const perMm = dpi === 203 ? 8 : dpi === 600 ? 24 : dpi / 25.4;
  return Math.round(mm * perMm);
}

function fitFont(text: string, maxWidth: number, maxHeight: number, minHeight: number): number {
  const len = Math.max(text.length, 1);
  const fitted = Math.floor(maxWidth / (len * 0.62));
  return Math.max(1, Math.min(maxHeight, Math.max(minHeight, fitted)));
}

/**
 * Place the front lines inside the top flag. The first line starts at the
 * flag's top-left. Empty lines are omitted so they do not consume a row.
 */
export function placeFrontLines(box: FlagBox, dpi: number, copy: TagCopy): PlacedLine[] {
  const gap = Math.max(2, dots(0.35, dpi));
  const lines = FRONT_FIELDS
    .map((field) => ({ field, text: field.format(copy) }))
    .filter((line) => line.text);
  if (!lines.length) return [];

  const gaps = gap * Math.max(0, lines.length - 1);
  let fonts = lines.map((line) => fitFont(
    line.text,
    box.w,
    dots(line.field.prefMm, dpi),
    dots(line.field.minMm, dpi),
  ));
  let used = fonts.reduce((sum, font) => sum + font, 0) + gaps;
  if (used > box.h) {
    const scale = (box.h - gaps) / Math.max(1, used - gaps);
    fonts = fonts.map((font, i) => Math.max(dots(lines[i].field.minMm, dpi), Math.floor(font * scale)));
    used = fonts.reduce((sum, font) => sum + font, 0) + gaps;
    if (used > box.h) fonts = fonts.map((font) => Math.max(1, font - 1));
  }

  const placed: PlacedLine[] = [];
  let y = box.y;
  lines.forEach((line, i) => {
    const font = fonts[i];
    placed.push({
      key: line.field.key,
      text: truncateToWidth(line.text, font, box.w),
      x: box.x,
      y,
      font,
      bold: line.field.bold,
      width: box.w,
    });
    y += font + gap;
  });
  return placed;
}

export type BackPlacement = {
  text: PlacedLine;
  barcode: { x: number; y: number; module: number; height: number; data: string } | null;
  warning: string | null;
};

/** Code 128 symbol width in modules, including start, check, and stop. */
function code128Modules(length: number): number {
  return 11 * Math.max(length, 1) + 35;
}

/**
 * Upside-down barcode plus SKU on the back flag. Coordinates match the
 * generator that is already printing: the text sits on the flag's top edge
 * and the barcode is below it, both rotated 180 degrees by the ZPL.
 */
export function placeBack(box: FlagBox, dpi: number, sku: string): BackPlacement {
  const gap = Math.max(2, dots(0.3, dpi));
  const preferredModule = dpi >= 250 ? 2 : 1;
  const modules = code128Modules(sku.length);
  let moduleWidth = preferredModule;
  if (modules * moduleWidth > box.w) moduleWidth = 1;
  const barcodeFits = modules * moduleWidth <= box.w;

  let textMax = barcodeFits ? Math.min(dots(2.4, dpi), Math.floor(box.h * 0.34)) : Math.floor(box.h * 0.7);
  textMax = Math.max(dots(1.4, dpi), textMax);
  let textFont = fitFont(sku, box.w, textMax, dots(1.2, dpi));
  let barH = box.h - textFont - gap;
  if (barcodeFits && barH < dots(2, dpi)) {
    textFont = Math.max(dots(1.2, dpi), box.h - dots(2, dpi) - gap);
    barH = box.h - textFont - gap;
  }
  const text = truncateToWidth(sku, textFont, box.w);
  const textW = estimateWidth(text, textFont);
  const textX = box.x + Math.max(0, Math.floor((box.w - textW) / 2));
  const placed: PlacedLine = {
    key: "back-sku",
    text,
    x: textX,
    y: box.y,
    font: textFont,
    bold: false,
    width: textW,
  };
  if (!barcodeFits || barH < 8) {
    return {
      text: placed,
      barcode: null,
      warning: "SKU barcode does not fit the tag head at module width 1; printing the inverted SKU text only",
    };
  }
  const barW = modules * moduleWidth;
  const barX = box.x + Math.max(0, Math.floor((box.w - barW) / 2));
  return {
    text: placed,
    barcode: {
      x: barX,
      y: box.y + textFont + gap,
      module: moduleWidth,
      height: barH,
      data: sku,
    },
    warning: null,
  };
}
