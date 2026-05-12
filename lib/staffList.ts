import { UserRole } from "./userTypes";

export interface StaffMember {
  name: string;
  role: UserRole;
  email: string;
  initials: string;
}

// Canonical staff list — managers first, then staff, each group alphabetical
// PINs are NOT stored here — they live in /app/api/auth/verify-pin/route.ts (server-side only)
export const STAFF_LIST: StaffMember[] = [
  // Managers
  { name: "Arissa Michos",     role: "manager", email: "arissa@classa.com.au",        initials: "AM" },
  { name: "Benjamin Mucklow",  role: "manager", email: "ben@classa.com.au",           initials: "BM" },
  { name: "Bradley Mucklow",   role: "manager", email: "brad@classa.com.au",          initials: "BM" },
  { name: "Joshua Mucklow",    role: "manager", email: "josh@classa.com.au",          initials: "JM" },
  { name: "Sam Mucklow",       role: "manager", email: "sam@classa.com.au",           initials: "SM" },
  // Staff
  { name: "Aisha Scott",       role: "staff",   email: "aisha@classa.com.au",         initials: "AS" },
  { name: "Bridget Moore",     role: "staff",   email: "bridget@classa.com.au",       initials: "BM" },
  { name: "Charlotte Beavis",  role: "staff",   email: "charlotte@classa.com.au",     initials: "CB" },
  { name: "Daniel Beecken",    role: "staff",   email: "daniel@classa.com.au",        initials: "DB" },
  { name: "David Johnson",     role: "staff",   email: "david@classa.com.au",         initials: "DJ" },
  { name: "Dior Munro",        role: "staff",   email: "dior@classa.com.au",          initials: "DM" },
  { name: "Donna Cordes",      role: "staff",   email: "donna@classa.com.au",         initials: "DC" },
  { name: "Ivy Wood",          role: "staff",   email: "ivy@classa.com.au",           initials: "IW" },
  { name: "Jack Mullan",       role: "staff",   email: "jack@classa.com.au",          initials: "JM" },
  { name: "Jessica D'Alfonso", role: "staff",   email: "jess@classa.com.au",          initials: "JD" },
  { name: "Joseph Onorato",    role: "staff",   email: "joseph@classa.com.au",        initials: "JO" },
  { name: "Keeley Mucklow",    role: "staff",   email: "keeley@classa.com.au",        initials: "KM" },
  { name: "Leah Newton",       role: "staff",   email: "leah@classa.com.au",          initials: "LN" },
  { name: "Melody Abram",      role: "staff",   email: "melody@classa.com.au",        initials: "MA" },
  { name: "Monica Maghsoodi",  role: "staff",   email: "monica@classa.com.au",        initials: "MM" },
  { name: "Paull Scudds",      role: "staff",   email: "customercare@classa.com.au",  initials: "PS" },
  { name: "Shahrzad Givi",     role: "staff",   email: "shahrzad@classa.com.au",      initials: "SG" },
  { name: "Sinziana Peters",   role: "staff",   email: "sinziana@classa.com.au",      initials: "SP" },
  { name: "Vivian Valladares", role: "staff",   email: "viv@classa.com.au",           initials: "VV" },
  { name: "Zac Mucklow",       role: "staff",   email: "customercare@classa.com.au",  initials: "ZM" },
];

export const STAFF_NAMES: string[] = STAFF_LIST.map((m) => m.name);

export const ROLE_LABELS: Record<UserRole, string> = {
  manager: "Manager",
  staff:   "Staff",
};
