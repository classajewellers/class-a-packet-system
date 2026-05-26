// Shared user/session types — no "use client" so importable anywhere.

export type UserRole = "admin" | "manager" | "staff";

export interface LoggedInUser {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  initials: string;
  loggedInAt: string;
}

/** Returns true for roles that can access manager-level features. */
export function canManage(role: UserRole | undefined): boolean {
  return role === "admin" || role === "manager";
}
