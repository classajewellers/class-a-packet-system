/**
 * Location reads that survive staging before migration 171.
 * If `code` or `active` is not in the schema yet, fall back to name and
 * treat every row as active.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { tenantScoped } from "@/lib/tenantScoped";
import { compareLocations, formatLocationLabel, type LocationFields } from "@/lib/location-label";

const FULL_COLUMNS = "id, name, code, active, type, parent_id, bin_code_format, shopify_visible";
const BASE_COLUMNS = "id, name, type, parent_id, bin_code_format, shopify_visible";

export type LoadedLocation = LocationFields & {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
  type: string | null;
  parent_id: string | null;
  bin_code_format: string | null;
  shopify_visible: boolean;
};

export function missingLocationColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const message = (error.message ?? "").toLowerCase();
  const mentionsColumn = message.includes("column") || message.includes("schema cache");
  const mentionsField = message.includes("code") || message.includes("active");
  return mentionsColumn && mentionsField;
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalise(row: Record<string, unknown>, assumeActive: boolean): LoadedLocation {
  return {
    id: String(row.id),
    name: asText(row.name) ?? "",
    code: asText(row.code),
    active: assumeActive ? true : row.active !== false,
    type: asText(row.type),
    parent_id: asText(row.parent_id),
    bin_code_format: asText(row.bin_code_format),
    shopify_visible: row.shopify_visible === true,
  };
}

export async function loadLocations(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ locations: LoadedLocation[]; columnsReady: boolean }> {
  const full = await tenantScoped(supabase, tenantId).from("inventory_locations").select(FULL_COLUMNS);
  if (!full.error) {
    const locations = ((full.data ?? []) as Record<string, unknown>[]).map((row) => normalise(row, false));
    locations.sort(compareLocations);
    return { locations, columnsReady: true };
  }
  if (!missingLocationColumn(full.error)) throw new Error(full.error.message);

  const base = await tenantScoped(supabase, tenantId).from("inventory_locations").select(BASE_COLUMNS);
  if (base.error) throw new Error(base.error.message);
  const locations = ((base.data ?? []) as Record<string, unknown>[]).map((row) => normalise(row, true));
  locations.sort(compareLocations);
  return { locations, columnsReady: false };
}

export async function loadLocationLabels(
  supabase: SupabaseClient,
  tenantId: string,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, string>();
  if (!unique.length) return map;

  const full = await tenantScoped(supabase, tenantId)
    .from("inventory_locations")
    .select("id, name, code")
    .in("id", unique);
  if (!full.error) {
    for (const row of full.data ?? []) {
      map.set(String(row.id), formatLocationLabel({ name: row.name, code: row.code }));
    }
    return map;
  }
  if (!missingLocationColumn(full.error)) throw new Error(full.error.message);

  const base = await tenantScoped(supabase, tenantId)
    .from("inventory_locations")
    .select("id, name")
    .in("id", unique);
  if (base.error) throw new Error(base.error.message);
  for (const row of base.data ?? []) {
    map.set(String(row.id), formatLocationLabel({ name: row.name, code: null }));
  }
  return map;
}
