const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Staging inventory_po_lines (verified): stone_* columns, no diamond_*.
// PostgREST rejects the entire insert if any key is an unknown column, even
// when the value is null — so diamond_carat: null is enough to drop
// xero_account_* as well. These are the only line columns this write path
// may send. id is kept only so the route can tell an update from an insert;
// the route strips it before the query.
const STAGING_LINE_COLUMNS = [
  "title",
  "category_id",
  "metal_type",
  "metal_karat",
  "metal_colour",
  "stone_type",
  "stone_carat",
  "stone_colour",
  "stone_clarity",
  "finger_size",
  "quantity",
  "unit_cost",
  "notes",
  "received",
  "piece_id",
  "estimated_cost",
  "actual_cost",
  "supplier_design_no",
  "sku",
  "packet_id",
  "received_quantity",
  "xero_account_id",
  "xero_account_code",
  "xero_account_name",
] as const;

const DIAMOND_TO_STONE: Record<string, string> = {
  diamond_type: "stone_type",
  diamond_carat: "stone_carat",
  diamond_colour: "stone_colour",
  diamond_clarity: "stone_clarity",
};

const UUID_COLUMNS = new Set(["category_id", "packet_id", "piece_id", "xero_account_id"]);

export function exposePoLineToClient<T extends Record<string, unknown>>(line: T): T {
  return {
    ...line,
    diamond_type: line.diamond_type ?? line.stone_type ?? null,
    diamond_carat: line.diamond_carat ?? line.stone_carat ?? null,
    diamond_colour: line.diamond_colour ?? line.stone_colour ?? null,
    diamond_clarity: line.diamond_clarity ?? line.stone_clarity ?? null,
  };
}

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export function xeroFieldsForWrite(
  line: Record<string, unknown>
): { ok: true; fields: Record<string, string | null> | null } | { ok: false; error: string } {
  const present =
    "xero_account_id" in line ||
    "xero_account_code" in line ||
    "xero_account_name" in line;
  if (!present) return { ok: true, fields: null };

  const id = blankToNull(line.xero_account_id);
  const code = blankToNull(line.xero_account_code);
  const name = blankToNull(line.xero_account_name);

  if (id && !UUID_RE.test(id)) {
    return { ok: false, error: "That Xero account id is not valid. Pick the account again, then save." };
  }
  if ((code || name) && !id) {
    return {
      ok: false,
      error: "The Xero account was only partly sent (missing account id). Pick the account again, then save.",
    };
  }
  if (id && !name) {
    return {
      ok: false,
      error: "The Xero account name was missing. Pick the account again, then save.",
    };
  }

  return {
    ok: true,
    fields: {
      xero_account_id: id,
      xero_account_code: code,
      xero_account_name: name,
    },
  };
}

export function renameDiamondColumnsToStone(line: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...line };
  for (const [from, to] of Object.entries(DIAMOND_TO_STONE)) {
    if (from in next) {
      // A form key wins over a stone_* key already on the object.
      if (!(to in next) || next[from] !== undefined) next[to] = next[from];
      delete next[from];
    }
  }
  for (const key of Object.keys(next)) {
    if (key.startsWith("diamond_")) delete next[key];
  }
  return next;
}

function coerceColumn(key: string, value: unknown): unknown {
  if (UUID_COLUMNS.has(key)) return blankToNull(value);
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

/**
 * Always map diamond_* → stone_* and then keep only columns that exist on
 * staging. There is no probe: a previous probe failed closed (any error
 * other than an exact PGRST204 was treated as "diamond_* columns exist"),
 * so diamond_carat stayed on the insert and PostgREST rejected the line.
 */
export function preparePoLineForWrite(
  line: Record<string, unknown>
): { ok: true; line: Record<string, unknown> } | { ok: false; error: string } {
  const xero = xeroFieldsForWrite(line);
  if (!xero.ok) return xero;

  const renamed = renameDiamondColumnsToStone(xero.fields ? { ...line, ...xero.fields } : { ...line });
  const next: Record<string, unknown> = {};
  const id = blankToNull(line.id);
  if (id) next.id = id;

  for (const key of STAGING_LINE_COLUMNS) {
    if (key in renamed) next[key] = coerceColumn(key, renamed[key]);
  }

  for (const key of Object.keys(next)) {
    if (key.startsWith("diamond_")) {
      return { ok: false, error: "Purchase order line still included a diamond_* column. Save was stopped before it reached the database." };
    }
  }
  // A blank SKU is omitted so a purchase order can still save before the
  // SKU column exists. A typed SKU is sent and fails clearly if it is missing.
  if (next.sku == null) delete next.sku;

  return { ok: true, line: next };
}
