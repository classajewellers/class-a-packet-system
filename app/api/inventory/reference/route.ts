import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";

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

  // inventory_suppliers has no is_active column. Filtering on it makes
  // PostgREST reject the query; this handler used to ignore that error and
  // return suppliers: [], so purchase-order dropdowns only showed
  // "No supplier". The Suppliers page lists the same table by tenant_id.
  // Match that. If a later schema adds is_active, hide rows that are
  // explicitly false without requiring the column in the query.
  const suppliersQuery = tenantId
    ? tenantScoped(supabase, tenantId).from("inventory_suppliers").select("*").order("name")
    : Promise.resolve({ data: [], error: null });

  const [statuses, locations, categories, suppliers] = await Promise.all([
    supabase.from("inventory_statuses").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("inventory_locations").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("inventory_categories").select("*").eq("tenant_id", tenantId).eq("is_active", true).order("sort_order"),
    suppliersQuery,
  ]);

  if (suppliers.error) {
    console.error("[inventory/reference] supplier list failed:", suppliers.error.message);
  }

  const supplierRows = ((suppliers.data ?? []) as { is_active?: boolean | null }[])
    .filter((row) => row.is_active !== false);

  return NextResponse.json({
    statuses:   statuses.data  ?? [],
    locations:  locations.data ?? [],
    categories: categories.data ?? [],
    suppliers:  supplierRows,
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
