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
  // Managers — full access (create, edit, delete, revenue)
  "arissa michos":     "manager",
  "ben mucklow":       "manager",
  "brad mucklow":      "manager",
  "josh mucklow":      "manager",
  "sam mucklow":       "manager",
  // Staff — create orders/quotes, view admin, no delete, no revenue
  "aisha scott":       "staff",
  "bridget moore":     "staff",
  "charlotte beavis":  "staff",
  "daniel beecken":    "staff",
  "david johnson":     "staff",
  "dior munro":        "staff",
  "donna cordes":      "staff",
  "ivy wood":          "staff",
  "jack mullan":       "staff",
  "jess d'alfonso":    "staff",
  "joseph onorato":    "staff",
  "keeley mucklow":    "staff",
  "leah newton":       "staff",
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

// Build list: managers first, then staff, each group alphabetical
const ROLE_ORDER: UserRole[] = ["manager", "staff"];

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
  manager: "Manager",
  staff:   "Staff",
};
