// Shared staff email mapping — single source of truth.
// Import `staffEmail()` wherever a staff member's email is needed.

export const STAFF_EMAIL_MAP: Record<string, string> = {
  "aisha scott":       "aisha@classa.com.au",
  "arissa michos":     "arissa@classa.com.au",
  "ben mucklow":       "ben@classa.com.au",
  "brad mucklow":      "brad@classa.com.au",
  "bridget moore":     "bridget@classa.com.au",
  "charlotte beavis":  "charlotte@classa.com.au",
  "daniel beecken":    "daniel@classa.com.au",
  "david johnson":     "david@classa.com.au",
  "dior munro":        "dior@classa.com.au",
  "donna cordes":      "donna@classa.com.au",
  "ivy wood":          "ivy@classa.com.au",
  "jack mullan":       "jack@classa.com.au",
  "jess d'alfonso":    "jess@classa.com.au",
  "joseph onorato":    "joseph@classa.com.au",
  "josh mucklow":      "josh@classa.com.au",
  "keeley mucklow":    "keeley@classa.com.au",
  "leah newton":       "leah@classa.com.au",
  "melody abram":      "melody@classa.com.au",
  "monica magshoodi":  "monica@classa.com.au",
  "sam mucklow":       "sam@classa.com.au",
  "shahrzad givi":     "shahrzad@classa.com.au",
  "sinziana peters":   "sinziana@classa.com.au",
  "viv valladares":    "viv@classa.com.au",
};

export const DEFAULT_STORE_EMAIL = "customercare@classa.com.au";

export function staffEmail(staffMember: string | null | undefined): string {
  if (!staffMember) return DEFAULT_STORE_EMAIL;
  const lower = staffMember.toLowerCase().trim();
  return STAFF_EMAIL_MAP[lower] ?? DEFAULT_STORE_EMAIL;
}
