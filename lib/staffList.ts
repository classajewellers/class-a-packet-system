import { STAFF_EMAIL_MAP } from "./staffEmails";
import { UserRole } from "./userTypes";

export interface StaffMember {
  name: string;
  role: UserRole;
  email: string;
  initials: string;
}

// Role assignments — names must match keys in STAFF_EMAIL_MAP (lowercase)
const ROLE_MAP: Record<string, UserRole> = {
  "brad mucklow":      "admin",
  "josh mucklow":      "admin",
  "ben mucklow":       "admin",
  "sam mucklow":       "admin",
  "bridget moore":     "manager",
  "charlotte beavis":  "manager",
  "daniel beecken":    "manager",
  "david johnson":     "manager",
  "donna cordes":      "manager",
  "jack mullan":       "manager",
  "jess d'alfonso":    "manager",
  "joseph onorato":    "manager",
  "keeley mucklow":    "manager",
  "leah newton":       "manager",
  "aisha scott":       "staff",
  "arissa michos":     "manager",
  "dior munro":        "staff",
  "ivy wood":          "staff",
  "melody abram":      "staff",
  "monica magshoodi":  "staff",
  "shahrzad givi":     "staff",
  "sinziana peters":   "staff",
  "viv valladares":    "staff",
};

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Build list sorted by role priority then name
const ROLE_ORDER: UserRole[] = ["admin", "manager", "staff"];

export const STAFF_LIST: StaffMember[] = Object.entries(ROLE_MAP)
  .sort((a, b) => {
    const ri = ROLE_ORDER.indexOf(a[1]) - ROLE_ORDER.indexOf(b[1]);
    if (ri !== 0) return ri;
    return a[0].localeCompare(b[0]);
  })
  .map(([key, role]) => {
    const name = toTitleCase(key);
    return {
      name,
      role,
      email: STAFF_EMAIL_MAP[key] ?? "customercare@classa.com.au",
      initials: getInitials(name),
    };
  });

export const ROLE_LABELS: Record<UserRole, string> = {
  admin:   "Admin",
  manager: "Manager",
  staff:   "Staff",
};
