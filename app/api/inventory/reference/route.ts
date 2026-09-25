import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import { loadLocations } from "@/lib/load-locations";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TABLE_MAP: Record<string, string> = {
  statuses:   "inventory_statuses",
  locations:  "inventory_locations",
  categories: "inventory_categories",
  suppliers:  "inventory_suppliers",
};

// GET — returns all reference data in one call
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  // inventory_suppliers has no is_active, status, or deleted_at column.
  // A filter on any of those makes PostgREST reject the query, and this
  // handler used to ignore that error and return suppliers: []. The
  // Suppliers page lists every row for the tenant. Do the same.
  const suppliersQuery = tenantId
    ? tenantScoped(supabase, tenantId).from("inventory_suppliers").select("*").order("name")
    : Promise.resolve({ data: [], error: null });

  const locationsPromise = tenantId
    ? loadLocations(supabase, tenantId).then(
        (loaded) => ({ data: loaded.locations, error: null as { message: string } | null }),
        (err: unknown) => ({ data: null, error: { message: err instanceof Error ? err.message : "locations failed" } }),
      )
    : Promise.resolve({ data: [] as unknown[], error: null as { message: string } | null });

  const [statuses, locations, categories, suppliers] = await Promise.all([
    supabase.from("inventory_statuses").select("*").eq("is_active", true).order("sort_order"),
    locationsPromise,
    supabase.from("inventory_categories").select("*").eq("tenant_id", tenantId).eq("is_active", true).order("sort_order"),
    suppliersQuery,
  ]);

  if (suppliers.error) {
    console.error("[inventory/reference] supplier list failed:", suppliers.error.message);
  }
  if (locations.error) {
    console.error("[inventory/reference] location list failed:", locations.error.message);
  }

  return NextResponse.json({
    statuses:   statuses.data  ?? [],
    locations:  locations.data ?? [],
    categories: categories.data ?? [],
    suppliers:  suppliers.data ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
}

// POST — create a reference item  (?type=statuses|locations|categories|suppliers)
export async function POST(req: NextRequest): Promise<NextResponse> {
  const type = new URL(req.url).searchParams.get("type") ?? "";
  const table = TABLE_MAP[type];
  if (!table) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);
  const body = await req.json();

  const { data, error } = await supabase.from(table).insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// PATCH — update a reference item  (?type=…&id=…)
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "";
  const id   = searchParams.get("id")   ?? "";
  const table = TABLE_MAP[type];
  if (!table || !id) return NextResponse.json({ error: "Invalid type or id" }, { status: 400 });

  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);
  const body = await req.json();

  const { data, error } = await supabase.from(table).update(body).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// DELETE — soft-delete (is_active = false)  (?type=…&id=…)
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "";
  const id   = searchParams.get("id")   ?? "";
  const table = TABLE_MAP[type];
  if (!table || !id) return NextResponse.json({ error: "Invalid type or id" }, { status: 400 });

  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { error } = await supabase.from(table).update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
