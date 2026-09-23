// Resolves an inventory_locations row's full ancestor path (e.g. "Adelaide
// Showroom > Horseshoe 1") via the parent_id self-reference added in
// migration 082. Real data as of 2026-09-23 has no hierarchy in use yet
// (every location's parent_id is null), so every path today is just the
// location's own name — this is still built correctly for when hierarchy
// data exists.

export interface LocationNode {
  id: string;
  name: string;
  parent_id?: string | null;
}

// depth guard against a self-referencing cycle (should never happen given
// the schema, but a cycle would otherwise infinite-loop here)
const MAX_DEPTH = 10;

export function buildLocationPath(
  locationId: string | null | undefined,
  locationsById: Map<string, LocationNode>
): string | null {
  if (!locationId) return null;
  const parts: string[] = [];
  let currentId: string | null | undefined = locationId;
  let depth = 0;
  while (currentId && depth < MAX_DEPTH) {
    const node = locationsById.get(currentId);
    if (!node) break;
    parts.unshift(node.name);
    currentId = node.parent_id;
    depth++;
  }
  return parts.length > 0 ? parts.join(" > ") : null;
}

export function toLocationsById(locations: LocationNode[]): Map<string, LocationNode> {
  return new Map(locations.map(l => [l.id, l]));
}
