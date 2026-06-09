// Shared user/session types — no "use client" so importable anywhere.

// null = profile not yet loaded (loading state — never render gated content)
export type UserRole = "admin" | "manager" | "staff" | null;

export interface LoggedInUser {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  initials: string;
  loggedInAt: string;
  tenantId: string | null;
  tenantSlug: string | null;
}

/** Returns true for roles that can access manager-level features.
 *  Explicitly returns false for null (role not yet loaded) and undefined. */
export function canManage(role: UserRole | undefined): boolean {
  return role === "admin" || role === "manager";
}
