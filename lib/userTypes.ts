// Shared user/session types — no "use client" so importable anywhere.

export type UserRole = "admin" | "manager" | "staff";

export interface LoggedInUser {
  name: string;
  role: UserRole;
  email: string;
  initials: string;
  loggedInAt: string;
}
