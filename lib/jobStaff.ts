// Active workshop staff for the New Job "Staff Member" dropdown.
//
// That dropdown used to call GET /api/staff, which reads staff_pins. Class A
// has no staff_pins rows, so the select stayed on "— Select —" and Submit &
// Print could not proceed. The named roster lives on workshop_team_members
// (Ben, Viv, Joe, David, Jack). That table has RLS and, until a tenant policy
// exists, zero policies — a browser SELECT returns [] and looks like "no
// staff". Callers must load names through the service-role API, which sees
// the rows now and still sees them after tenant_isolation is added.

export interface WorkshopTeamMember {
  name?: string | null;
  active?: boolean | null;
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
