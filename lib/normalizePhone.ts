// lib/normalizePhone.ts
// Lightweight phone normalisation for lead → customer matching.
// No existing helper was found in the codebase, so this is intentionally small.

/** Strip a phone number down to digits only. Returns "" for null/blank. */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

/** A comparison key that ignores AU country-code / trunk-zero differences so
 *  "+61 412 345 678", "0412 345 678" and "412345678" all match. We compare the
 *  last 9 significant digits (AU subscriber number without the leading 0). */
export function phoneMatchKey(raw: string | null | undefined): string {
  const digits = normalizePhone(raw);
  if (digits.length <= 9) return digits;
  return digits.slice(-9);
}
