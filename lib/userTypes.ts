// Shared user/session types — no "use client" so importable anywhere.

export type UserRole = "manager" | "staff";

export interface LoggedInUser {
  name: string;
  role: UserRole;
  email: string;
  initials: string;
  loggedInAt: string;
}
