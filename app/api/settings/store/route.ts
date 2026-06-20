import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const { data, error } = await supabase
      .from("tenants")
      .select("bank_name, account_name, bsb, account_number")
      .eq("id", tenantId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      settings: {
        bank_name: data?.bank_name ?? null,
        account_name: data?.account_name ?? null,
        bsb: data?.bsb ?? null,
        account_number: data?.account_number ?? null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const allowedFields = ["bank_name", "account_name", "bsb", "account_number"] as const;
    const updateFields: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) updateFields[field] = body[field];
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
    }

    const { error } = await supabase
      .from("tenants")
      .update(updateFields)
      .eq("id", tenantId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Return the updated settings
    const { data, error: fetchError } = await supabase
      .from("tenants")
      .select("bank_name, account_name, bsb, account_number")
      .eq("id", tenantId)
      .maybeSingle();

    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

    return NextResponse.json({
      settings: {
        bank_name: data?.bank_name ?? null,
        account_name: data?.account_name ?? null,
        bsb: data?.bsb ?? null,
        account_number: data?.account_number ?? null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
