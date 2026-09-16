/**
 * effective-role.ts — the ONE shared "view/act-as" override.
 *
 * Lets a single specific account (Josh) view and act as a lower-privileged role
 * without ever touching profiles.role in the database. The override is:
 *   • honoured ONLY for the session-verified user id below — never any other
 *     account, admin or otherwise;
 *   • downgrade-ONLY — it can never raise privilege above the real role. The
 *     rank comparison makes escalation structurally impossible, so even a
 *     forged cookie cannot help.
 *
 * This is the single source of truth. Do NOT reimplement the comparison
 * per-site — import resolveEffectiveRole everywhere the effective role matters
 * (require-auth, the two bespoke server checks, and the client UserContext).
 */

export type Role = "admin" | "manager" | "staff";

/** The only profile/auth-user id for which the override is ever honoured. */
export const VIEW_AS_ALLOWED_PROFILE_ID = "8277dfbc-6e45-4848-9bb2-23352694e440";

/** Cookie carrying the requested view-as role. Readable by the client (so the
 *  UI can reflect the downgraded view); the server independently recomputes the
 *  effective role, so the client is never authoritative. */
export const EFFECTIVE_ROLE_COOKIE = "vault_effective_role";

const RANK: Record<Role, number> = { staff: 1, manager: 2, admin: 3 };

function isRole(v: unknown): v is Role {
  return v === "admin" || v === "manager" || v === "staff";
}

/**
 * Resolve the effective role for a request/session.
 *
 * @param userId    the SESSION-VERIFIED user id (never a client-supplied value)
 * @param realRole  the true role from profiles.role
 * @param requested the requested view-as role (from the cookie), or null
 * @returns the effective role — equal to realRole for everyone except Josh, and
 *          never higher-privileged than realRole.
 */
export function resolveEffectiveRole(
  userId: string | null | undefined,
  realRole: string | null | undefined,
  requested: string | null | undefined
): Role {
  // Normalise the real role; anything unexpected collapses to the safest value.
  const real: Role = isRole(realRole) ? realRole : "staff";

  // (1) Only ever honoured for Josh's session-verified id.
  if (userId !== VIEW_AS_ALLOWED_PROFILE_ID) return real;

  // (2) No/invalid cookie → real role.
  if (!isRole(requested)) return real;

  // (3) Downgrade-only: never return a role ranked above the real role.
  if (RANK[requested] > RANK[real]) return real;

  return requested;
}

/** True when an override is actually in effect (effective differs from real). */
export function isViewingAs(
  userId: string | null | undefined,
  realRole: string | null | undefined,
  requested: string | null | undefined
): boolean {
  const real: Role = isRole(realRole) ? realRole : "staff";
  return resolveEffectiveRole(userId, realRole, requested) !== real;
}

/**
 * Cost visibility under an effective role. Viewing as staff suppresses costs
 * regardless of the real can_see_costs flag; any higher effective role keeps the
 * real flag. Used only in the client override path — the global canSeeCosts()
 * helper is intentionally left unchanged so real users are unaffected.
 */
export function canSeeCostsForEffectiveRole(effectiveRole: Role, realFlag: boolean): boolean {
  if (effectiveRole === "staff") return false;
  return realFlag === true;
}
