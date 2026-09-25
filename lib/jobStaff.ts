// Names for the New Job "Staff Member" dropdown.
//
// The old picker called GET /api/staff (staff_pins: name, role, active). It
// did not check profiles.auth_user_id or require a non-empty full_name.
// Class A has no staff_pins rows, so the select stayed on "— Select —".
// staff_member on a job is plain text, not a login id, so a profile does
// not need auth_user_id to be selectable.
//
// Two real sources, both read through service-role APIs (workshop_team_members
// has RLS and no policy, so a browser select returns []):
//   - active workshop_team_members (Ben, Viv, Joe, David, Jack)
//   - profiles, labelled full_name → email → role → "Staff"
//     (Staff Test, and the nameless manager as "Manager")

export interface WorkshopTeamMember {
  name?: string | null;
  active?: boolean | null;
}

export interface StaffProfileRow {
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
}

export function activeWorkshopStaffNames(members: WorkshopTeamMember[]): string[] {
  const names: string[] = [];
  for (const member of members) {
    if (member.active === false) continue;
    const name = (member.name ?? "").trim();
    if (!name || names.includes(name)) continue;
    names.push(name);
  }
  return names;
}

export function profileStaffLabel(profile: StaffProfileRow): string {
  const name = (profile.full_name ?? "").trim();
  if (name) return name;
  const email = (profile.email ?? "").trim();
  if (email) return email;
  const role = (profile.role ?? "").trim();
  if (role) return role.charAt(0).toUpperCase() + role.slice(1);
  return "Staff";
}

export function jobStaffNames(members: WorkshopTeamMember[], profiles: StaffProfileRow[]): string[] {
  const names = activeWorkshopStaffNames(members);
  const seen = new Set(names.map((name) => name.toLowerCase()));
  for (const profile of profiles) {
    const label = profileStaffLabel(profile);
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(label);
  }
  return names;
}
