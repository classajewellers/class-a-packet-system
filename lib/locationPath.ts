import { formatLocationLabel } from "@/lib/location-label";

// Resolves an inventory_locations row's full ancestor path. Each step is
// "CODE · Name" when the location has a code.

export interface LocationNode {
  id: string;
  name: string;
  code?: string | null;
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
    parts.unshift(formatLocationLabel(node) || node.name);
    currentId = node.parent_id;
    depth++;
  }
  return parts.length > 0 ? parts.join(" > ") : null;
}

export function toLocationsById(locations: LocationNode[]): Map<string, LocationNode> {
  return new Map(locations.map(l => [l.id, l]));
}
