export interface AssigneeJob {
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  workshop_subcontractor_name?: string | null;
}

export interface AssigneeDirectory {
  profiles?: { id: string; full_name?: string | null }[];
  teamMembers?: { name: string; profile_id?: string | null }[];
}

function clean(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

// Same order as the job header: the staff member on assigned_to (stored name,
// then profile, then the Team list), otherwise the subcontractor name.
export function resolveAssigneeName(job: AssigneeJob, directory?: AssigneeDirectory): string | null {
  if (job.assigned_to) {
    const stored = clean(job.assigned_to_name);
    if (stored && stored !== "Unknown") return stored;
    const profile = clean(directory?.profiles?.find((person) => person.id === job.assigned_to)?.full_name);
    if (profile) return profile;
    const member = clean(directory?.teamMembers?.find((person) => person.profile_id === job.assigned_to)?.name);
    if (member) return member;
    if (stored) return stored;
  }
  const subcontractor = clean(job.workshop_subcontractor_name);
  if (subcontractor) return subcontractor;
  return clean(job.assigned_to_name);
}

// Board cards: a person's first name, or the subcontractor / free-text name
// itself. The card truncates that with an ellipsis; the tooltip is the full name.
export function assigneeBoardLabel(fullName: string, job: AssigneeJob, directory?: AssigneeDirectory): string {
  const text = fullName.trim();
  const first = text.split(/\s+/).filter(Boolean)[0] ?? text;
  const teamPerson = directory?.teamMembers?.some((member) => member.name.trim() === text) ?? false;
  if (job.assigned_to || teamPerson) return first;
  return text;
}

export function assigneeInitials(name: string): string {
  return name.split(" ").filter(Boolean).map((part) => part[0]).join("").toUpperCase().slice(0, 2);
}
