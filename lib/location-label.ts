/**
 * Location display shared by stocktake, stock movement, the piece page,
 * the stock list, and the locations admin.
 * "HA1 · Horseshoe A1", or just the name when code is null.
 */

export type LocationFields = {
  name?: string | null;
  code?: string | null;
  active?: boolean | null;
};

export function formatLocationLabel(location: LocationFields | null | undefined): string {
  if (!location) return "";
  const name = typeof location.name === "string" ? location.name.trim() : "";
  const code = typeof location.code === "string" ? location.code.trim() : "";
  if (code && name) return `${code} · ${name}`;
  return name || code;
}

/**
 * Coded locations first. Natural code order puts A1 before AD1, HA2 before HA10,
 * and word codes (Cust Hold, WS, …) in alphabetical order among them. Then name.
 */
export function compareLocations(a: LocationFields, b: LocationFields): number {
  const codeA = typeof a.code === "string" ? a.code.trim() : "";
  const codeB = typeof b.code === "string" ? b.code.trim() : "";
  if (codeA && codeB) {
    const byCode = codeA.localeCompare(codeB, "en", { numeric: true, sensitivity: "base" });
    if (byCode !== 0) return byCode;
  } else if (codeA !== codeB) {
    return codeA ? -1 : 1;
  }
  const nameA = typeof a.name === "string" ? a.name : "";
  const nameB = typeof b.name === "string" ? b.name : "";
  return nameA.localeCompare(nameB, "en", { numeric: true, sensitivity: "base" });
}

/** Missing `active` means the column is not deployed yet: treat the row as active. */
export function isActiveLocation(location: LocationFields | null | undefined): boolean {
  return location?.active !== false;
}

export function locationsForPicker<T extends LocationFields & { id?: string }>(
  rows: T[],
  currentId?: string | null,
): T[] {
  return rows
    .filter((row) => isActiveLocation(row) || (!!currentId && row.id === currentId))
    .sort(compareLocations);
}
