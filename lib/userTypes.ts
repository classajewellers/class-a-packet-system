// Shared user/session types — no "use client" so importable anywhere.

// null = profile not yet loaded (loading state — never render gated content)
export type UserRole = "admin" | "manager" | "staff" | null;

export interface UserPermissions {
  orders:      boolean;
  workshop:    boolean;
  quotes:      boolean;
  customers:   boolean;
  online:      boolean;
  inventory:   boolean;
  reporting:   boolean;
  pricing:     boolean;
  settings:    boolean;
  vault_brain: boolean;
}

export const DEFAULT_STAFF_PERMISSIONS: UserPermissions = {
  orders:      true,
  workshop:    true,
  quotes:      true,
  customers:   true,
  online:      true,
  inventory:   true,
  reporting:   true,
  pricing:     false,
  settings:    false,
  vault_brain: false,
};

export const ALL_MODULES: (keyof UserPermissions)[] = [
  "orders", "workshop", "quotes", "customers", "online",
  "inventory", "reporting", "pricing", "settings", "vault_brain",
];

export const MODULE_LABELS: Record<keyof UserPermissions, string> = {
  orders:      "Orders",
  workshop:    "Workshop",
  quotes:      "Quotes",
  customers:   "Customers",
  online:      "Online",
  inventory:   "Inventory",
  reporting:   "Reporting",
  pricing:     "Pricing",
  settings:    "Settings",
  vault_brain: "Vault Brain",
};

export interface LoggedInUser {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  initials: string;
  loggedInAt: string;
  tenantId: string | null;
  tenantSlug: string | null;
  permissions: UserPermissions | null;
  can_see_costs: boolean;
}

/** Returns true for roles that can access manager-level features.
 *  Explicitly returns false for null (role not yet loaded) and undefined. */
export function canManage(role: UserRole | undefined): boolean {
  return role === "admin" || role === "manager";
}

/** Returns true only when the user has been explicitly granted finance/cost visibility.
 *  No role bypass — requires an admin to opt-in each user individually. */
export function canSeeCosts(user: LoggedInUser | null): boolean {
  return user?.can_see_costs === true;
}

/** Returns true if the user has access to the given module.
 *  Managers always have full access. Staff fall back to stored permissions
 *  or DEFAULT_STAFF_PERMISSIONS if the column hasn't been set. */
export function hasPermission(
  user: LoggedInUser | null,
  module: keyof UserPermissions
): boolean {
  if (!user) return false;
  if (canManage(user.role)) return true;
  if (user.permissions) return user.permissions[module] ?? DEFAULT_STAFF_PERMISSIONS[module] ?? false;
  return DEFAULT_STAFF_PERMISSIONS[module] ?? false;
}
