import { UserRole } from "./userTypes";

// Staff rosters are now tenant-scoped and served from /api/staff via the
// useStaff() hook (lib/useStaff.ts). The old hardcoded STAFF_LIST / STAFF_NAMES
// were Class A-only and leaked across tenants — removed in the staff_pins
// tenant-isolation fix. This file now holds only tenant-agnostic helpers.

export interface StaffMember {
  name: string;
  role: UserRole;
  email: string;
  initials: string;
}

export const ROLE_LABELS: Record<NonNullable<UserRole>, string> = {
  admin:   "Admin",
  manager: "Manager",
  staff:   "Staff",
};
