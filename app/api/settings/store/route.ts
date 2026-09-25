import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { poPdfSchemaError } from "@/lib/poPdfSchema";

export const dynamic = "force-dynamic";

const STORE_COLUMNS = "name, phone, email, address, abn, gst_registered, bank_name, account_name, bsb, account_number, deposit_percentage, terms_and_conditions, brand_logo_url, brand_primary_colour";
const STORE_COLUMNS_WITHOUT_ABN = "name, phone, email, address, gst_registered, bank_name, account_name, bsb, account_number, deposit_percentage, terms_and_conditions, brand_logo_url, brand_primary_colour";

function blank(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

async function logoPreviewUrl(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  brandLogoUrl: string | null,
): Promise<string | null> {
  if (!brandLogoUrl) return null;
  if (/^https?:\/\//i.test(brandLogoUrl)) return brandLogoUrl;
  if (!brandLogoUrl.startsWith("storage:attachments/")) return null;
  const path = brandLogoUrl.slice("storage:attachments/".length);
  const signed = await supabase.storage.from("attachments").createSignedUrl(path, 60 * 60);
  return signed.data?.signedUrl ?? null;
}

function settingsPayload(data: Record<string, unknown> | null, logoPreview: string | null) {
  return {
    name: data?.name ?? null,
    phone: data?.phone ?? null,
    email: data?.email ?? null,
    address: data?.address ?? null,
    abn: data?.abn ?? null,
    gst_registered: data?.gst_registered !== false,
    bank_name: data?.bank_name ?? null,
    account_name: data?.account_name ?? null,
    bsb: data?.bsb ?? null,
    account_number: data?.account_number ?? null,
    deposit_percentage: data?.deposit_percentage ?? 30,
    terms_and_conditions: data?.terms_and_conditions ?? null,
    brand_logo_url: data?.brand_logo_url ?? null,
    brand_primary_colour: data?.brand_primary_colour ?? null,
    logo_preview_url: logoPreview,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    let { data, error } = await supabase.from("tenants").select(STORE_COLUMNS).eq("id", tenantId).maybeSingle();
    if (error && /abn/.test(error.message ?? "")) {
      ({ data, error } = await supabase.from("tenants").select(STORE_COLUMNS_WITHOUT_ABN).eq("id", tenantId).maybeSingle());
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const row = (data ?? null) as Record<string, unknown> | null;
    const logoPreview = await logoPreviewUrl(supabase, typeof row?.brand_logo_url === "string" ? row.brand_logo_url : null);
    return NextResponse.json({ settings: settingsPayload(row, logoPreview) });
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

    const textFields = ["name", "phone", "email", "address", "abn", "bank_name", "account_name", "bsb", "account_number", "terms_and_conditions", "brand_logo_url", "brand_primary_colour"] as const;
    const updateFields: Record<string, unknown> = {};
    for (const field of textFields) {
      if (field in body) updateFields[field] = blank(body[field]);
    }
    if ("gst_registered" in body) updateFields.gst_registered = Boolean(body.gst_registered);
    if ("name" in updateFields && !updateFields.name) {
      return NextResponse.json({ error: "Enter a legal business name." }, { status: 400 });
    }
    if (updateFields.abn == null) delete updateFields.abn;

    if ("deposit_percentage" in body) {
      const pct = Number(body.deposit_percentage);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return NextResponse.json({ error: "deposit_percentage must be a number between 0 and 100" }, { status: 400 });
      }
      updateFields.deposit_percentage = pct;
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
    }

    const { error } = await supabase
      .from("tenants")
      .update(updateFields)
      .eq("id", tenantId);

    if (error) {
      const hint = poPdfSchemaError(error);
      return NextResponse.json({ error: hint ?? error.message }, { status: hint ? 503 : 500 });
    }

    let { data, error: fetchError } = await supabase.from("tenants").select(STORE_COLUMNS).eq("id", tenantId).maybeSingle();
    if (fetchError && /abn/.test(fetchError.message ?? "")) {
      ({ data, error: fetchError } = await supabase.from("tenants").select(STORE_COLUMNS_WITHOUT_ABN).eq("id", tenantId).maybeSingle());
    }
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

    const row = (data ?? null) as Record<string, unknown> | null;
    const logoPreview = await logoPreviewUrl(supabase, typeof row?.brand_logo_url === "string" ? row.brand_logo_url : null);
    return NextResponse.json({ settings: settingsPayload(row, logoPreview) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
