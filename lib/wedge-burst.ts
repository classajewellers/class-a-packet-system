/**
 * Tell an InfoWedge scan burst from a person typing.
 * A wedge dumps a code as fast keystrokes and ends with Enter.
 * A person leaves gaps between keys. The trailing fast run is the code,
 * so a scan that lands after a half-typed search is still just the scan.
 */

export const WEDGE_MAX_GAP_MS = 40;
export const WEDGE_MIN_KEYS = 4;
const WEDGE_MAX_SPAN_MS = 1500;

export type WedgeKey = { at: number; key: string };

export function wedgeToken(keys: readonly WedgeKey[], enterAt: number): string | null {
  if (!keys.length) return null;
  const last = keys[keys.length - 1];
  if (enterAt < last.at || enterAt - last.at > WEDGE_MAX_GAP_MS) return null;

  let start = keys.length - 1;
  while (start > 0 && keys[start].at - keys[start - 1].at <= WEDGE_MAX_GAP_MS) start -= 1;
  const burst = keys.slice(start);
  if (burst.length < WEDGE_MIN_KEYS) return null;
  const span = enterAt - burst[0].at;
  if (span > WEDGE_MAX_SPAN_MS) return null;
  const average = span / Math.max(1, burst.length - 1);
  if (average > WEDGE_MAX_GAP_MS) return null;
  const token = burst.map((item) => item.key).join("").trim();
  return token.length >= WEDGE_MIN_KEYS ? token : null;
}
