/**
 * Handheld RFID scan parsing and batch lookup.
 * Stocktake reuses this: InfoWedge types an EPC line, then a barcode line,
 * often several codes in one burst. Nothing here writes last_seen.
 */

export const RFID_LOOKUP_CAP = 200;
export const RFID_LOOKUP_DEBOUNCE_MS = 180;

const EPC_RE = /^[0-9a-fA-F]{24}$/;
const HEX24 = /[0-9A-Fa-f]{24}/g;
/** Impinj factory EPC prefix. A tag that still starts with this was never printed by Vault. */
export const BLANK_TAG_PREFIX = "e280";

export type RfidPieceHit = {
  id: string;
  sku: string | null;
  metal: string | null;
  retail_price: number | null;
  status: string | null;
  location_name: string | null;
};

export type RfidEpcHit = {
  epc: string;
  found: boolean;
  tag_status: string | null;
  piece: RfidPieceHit | null;
};

export type RfidSkuHit = {
  sku: string;
  found: boolean;
  piece: RfidPieceHit | null;
};

export type RfidLookupResponse = {
  epcs: RfidEpcHit[];
  skus: RfidSkuHit[];
};

/** Split a wedge buffer on Enter/newline. The last piece is still being typed. */
export function splitScanBuffer(buffer: string): { complete: string[]; rest: string } {
  const parts = buffer.split(/\r\n|\n|\r/);
  const rest = parts.pop() ?? "";
  const complete = parts.map((part) => part.trim()).filter(Boolean);
  return { complete, rest };
}

export function isEpcToken(token: string): boolean {
  return EPC_RE.test(token.trim());
}

export function normaliseEpc(token: string): string {
  return token.trim().toLowerCase();
}

/**
 * A not-in-Vault EPC that still has the Impinj factory prefix.
 * Stocktake's Unknown group uses the same split: blank versus genuinely unknown.
 * Only call this after lookup has missed. An E280 that Vault printed stays a normal tag.
 */
export function missingEpcGroup(epc: string): "blank" | "unknown" {
  return epc.trim().toLowerCase().startsWith(BLANK_TAG_PREFIX) ? "blank" : "unknown";
}

export type ParsedScanLine = { epcs: string[]; sku: string | null };

/**
 * Pull every EPC out of one wedge line. A 24-hex run anchored at the end wins,
 * so a barcode glued to the front (`RING-01` + EPC) is not swallowed by a
 * left-to-right match. Any other 24-hex runs in the remainder are taken
 * non-overlapping. The text before the first EPC is a SKU candidate.
 */
export function parseScanLine(line: string): ParsedScanLine {
  const token = line.trim();
  if (!token) return { epcs: [], sku: null };

  const spans: { start: number; epc: string }[] = [];
  const end = token.match(/[0-9A-Fa-f]{24}$/);
  const head = end && end.index != null ? token.slice(0, end.index) : token;
  if (end && end.index != null) {
    spans.push({ start: end.index, epc: end[0].toLowerCase() });
  }
  if (!end) {
    HEX24.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = HEX24.exec(token))) {
      spans.push({ start: match.index, epc: match[0].toLowerCase() });
    }
  } else {
    HEX24.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = HEX24.exec(head))) {
      spans.push({ start: match.index, epc: match[0].toLowerCase() });
    }
  }

  spans.sort((a, b) => a.start - b.start);
  const epcs: string[] = [];
  const seen = new Set<string>();
  for (const span of spans) {
    if (seen.has(span.epc)) continue;
    seen.add(span.epc);
    epcs.push(span.epc);
  }
  if (!epcs.length) return { epcs: [], sku: token };
  const sku = token.slice(0, spans[0].start).trim();
  return { epcs, sku: sku || null };
}

/** Every EPC in order, including the same tag read again on a later line. */
export function epcsFromLines(lines: string[]): string[] {
  const epcs: string[] = [];
  for (const line of lines) {
    for (const epc of parseScanLine(line).epcs) epcs.push(epc);
  }
  return epcs;
}

/** Parse complete lines, lowercase EPCs, and drop duplicates. */
export function parseScanLines(lines: string[]): { epcs: string[]; skus: string[] } {
  const epcs: string[] = [];
  const skus: string[] = [];
  const seenEpcs = new Set<string>();
  const seenSkus = new Set<string>();
  for (const line of lines) {
    const parsed = parseScanLine(line);
    for (const epc of parsed.epcs) {
      if (seenEpcs.has(epc)) continue;
      seenEpcs.add(epc);
      epcs.push(epc);
    }
    if (!parsed.sku) continue;
    const key = parsed.sku.toLowerCase();
    if (seenSkus.has(key)) continue;
    seenSkus.add(key);
    skus.push(parsed.sku);
  }
  return { epcs, skus };
}

export async function lookupRfidBatch(
  epcs: string[],
  skus: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<RfidLookupResponse> {
  const res = await fetchImpl("/api/rfid/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ epcs, skus }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof json.error === "string" ? json.error : "Lookup failed";
    throw new Error(message);
  }
  return {
    epcs: Array.isArray(json.epcs) ? json.epcs : [],
    skus: Array.isArray(json.skus) ? json.skus : [],
  };
}
