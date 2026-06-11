import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");

  if (!path) return NextResponse.json({ error: "path is required" }, { status: 400 });

  const supabase = await createTenantSupabaseClient(tenantId);
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(path, 3600);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ signedUrl: data?.signedUrl ?? null });
}
