import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DIAMOND_TO_STONE: Record<string, string> = {
  diamond_type: "stone_type",
  diamond_carat: "stone_carat",
  diamond_colour: "stone_colour",
  diamond_clarity: "stone_clarity",
};

let stoneNamesProbe: Promise<boolean> | null = null;

/**
 * Production purchase-order lines store stone details as diamond_type /
 * diamond_carat / diamond_colour / diamond_clarity (migration 086). Staging
 * was created from migration 084, which named those columns stone_*.
 * PostgREST rejects an entire insert or update when any key is an unknown
 * column, so a payload that includes diamond_* never persists xero_account_*
 * either. Probe once per process and rename only when diamond_* is absent.
 */
export function poLinesUseStoneColumnNames(supabase: SupabaseClient): Promise<boolean> {
  if (stoneNamesProbe) return stoneNamesProbe;
  const probe = (async (): Promise<boolean> => {
    const { error } = await supabase
      .from("inventory_po_lines")
      .select("diamond_type")
      .limit(1);
    if (!error) return false;
    const missing = error.code === "PGRST204" && /diamond_type/i.test(error.message ?? "");
    if (!missing) {
      console.error("[po-lines] diamond_type probe failed:", error.message);
      stoneNamesProbe = null;
      return false;
    }
    return true;
  })();
  stoneNamesProbe = probe;
  return probe;
}

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
      next[to] = next[from];
      delete next[from];
    }
  }
  return next;
}

export async function preparePoLineForWrite(
  supabase: SupabaseClient,
  line: Record<string, unknown>
): Promise<{ ok: true; line: Record<string, unknown> } | { ok: false; error: string }> {
  const xero = xeroFieldsForWrite(line);
  if (!xero.ok) return xero;
  let next: Record<string, unknown> = xero.fields ? { ...line, ...xero.fields } : { ...line };
  if (await poLinesUseStoneColumnNames(supabase)) {
    next = renameDiamondColumnsToStone(next);
  }
  return { ok: true, line: next };
}
