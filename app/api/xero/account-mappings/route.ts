import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { XERO_MAPPING_CATEGORIES } from "@/lib/xero";

export const dynamic = "force-dynamic";

const VALID_KEYS = new Set(XERO_MAPPING_CATEGORIES.map(c => c.key));

// GET /api/xero/account-mappings — current mapping, keyed by category_key.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  const supabase = await createTenantSupabaseClient(tenantId);
  const { data, error } = await supabase
    .from("tenant_xero_account_mappings")
    .select("category_key, xero_account_id, xero_account_code, xero_account_name")
    .eq("tenant_id", tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mappings: Record<string, { xero_account_id: string; xero_account_code: string; xero_account_name: string }> = {};
  for (const row of data ?? []) mappings[row.category_key] = row;

  return NextResponse.json({ mappings });
}

// PUT /api/xero/account-mappings
// Body: { mappings: { [category_key]: { xero_account_id, xero_account_code, xero_account_name } } }
// Saves whichever categories are included — a partial save (not every
// category filled in yet) is fine, each row is upserted independently.
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  let body: { mappings?: Record<string, { xero_account_id: string; xero_account_code: string; xero_account_name: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const entries = Object.entries(body.mappings ?? {});
  const invalidKey = entries.find(([key]) => !VALID_KEYS.has(key as typeof XERO_MAPPING_CATEGORIES[number]["key"]));
  if (invalidKey) {
    return NextResponse.json({ error: `Unknown category_key: ${invalidKey[0]}` }, { status: 400 });
  }
  if (entries.length === 0) {
    return NextResponse.json({ error: "No mappings supplied" }, { status: 400 });
  }

  const rows = entries.map(([category_key, v]) => ({
    tenant_id:         tenantId,
    category_key,
    xero_account_id:   v.xero_account_id,
    xero_account_code: v.xero_account_code,
    xero_account_name: v.xero_account_name,
    updated_at:        new Date().toISOString(),
  }));

  const supabase = await createTenantSupabaseClient(tenantId);
  const { error } = await supabase
    .from("tenant_xero_account_mappings")
    .upsert(rows, { onConflict: "tenant_id,category_key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ saved: true });
}
