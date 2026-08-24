import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { generateQuoteReferenceNumber } from "@/lib/referenceNumber";
import { QuoteFormData, Quote } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Confirm route is being reached ─────────────────────────────────────
  console.log("Quote submit hit");

  // Env check — tells us immediately if SUPABASE_SERVICE_ROLE_KEY is missing in Vercel
  console.log("[quotes/submit] Env check:", {
    hasUrl:           !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceKey:    !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    serviceKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0,
  });

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body: { formData: QuoteFormData };
  try {
    body = await req.json();
  } catch (err) {
    console.error("[quotes/submit] Failed to parse request body:", err);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  console.log("Quote body:", JSON.stringify(body));

  const { formData } = body;
  const tenantId = req.headers.get('x-tenant-id') ?? '';

  // ── 3. Generate QT- reference number (with timestamp fallback) ─────────────
  let referenceNumber: string;
  try {
    referenceNumber = await generateQuoteReferenceNumber(tenantId);
    console.log("[quotes/submit] Generated reference:", referenceNumber);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[quotes/submit] Reference generation failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── 4. Build insert payload ────────────────────────────────────────────────
  // Filter out blank line item rows (the form defaults 3 empty rows)
  const lineItems = (formData.line_items ?? []).filter(
    (item) => item.design?.trim() || item.stone?.trim() || item.price?.trim()
  );
  const now = new Date().toISOString();

  const insertData = {
    reference_number:    referenceNumber,
    quote_type:          formData.quote_type,
    status:              "pending",
    customer_first_name: formData.customer_first_name || null,
    customer_last_name:  formData.customer_last_name  || null,
    customer_email:      formData.customer_email      || null,
    customer_phone:      formData.customer_phone      || null,
    line_items:          lineItems.length > 0 ? lineItems : null,
    notes:               formData.notes               || null,
    staff_member:        formData.staff_member        || null,
    // CRM pipeline fields
    assigned_to:         formData.assigned_to         || null,
    follow_up_date:      formData.follow_up_date      || null,
    pending_at:          now,
    status_changed_at:   now,
  };

  // @ts-expect-error tenant_id added dynamically
  insertData.tenant_id = tenantId;
  console.log("[quotes/submit] Insert payload:", JSON.stringify(insertData));

  // ── 5. Create Supabase server client (service role — bypasses RLS) ─────────
  let supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>;
  try {
    supabase = await createTenantSupabaseClient(tenantId);
    console.log("[quotes/submit] Supabase server client created (service role)");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[quotes/submit] Failed to create Supabase client:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── 6. Insert into Supabase ────────────────────────────────────────────────
  const { data, error } = await supabase
    .from("quotes")
    .insert(insertData)
    .select()
    .single();

  console.log("Supabase result:", JSON.stringify({ data, error }));

  if (error) {
    // Detect RLS / permission errors — if you see this, check that either:
    //   a) RLS is disabled on the quotes table in Supabase dashboard, OR
    //   b) SUPABASE_SERVICE_ROLE_KEY is set correctly in .env.local
    //   The service role key should bypass RLS entirely. If it's not, the key
    //   may be wrong (anon key used instead of service role key).
    const isPermissionError =
      error.code === "42501" ||
      error.message?.toLowerCase().includes("permission denied") ||
      error.message?.toLowerCase().includes("rls") ||
      error.message?.toLowerCase().includes("row-level security") ||
      error.message?.toLowerCase().includes("new row violates");

    if (isPermissionError) {
      console.error(
        "[quotes/submit] ⚠️  RLS / PERMISSIONS ERROR — " +
        "Check that RLS is disabled on the quotes table OR that SUPABASE_SERVICE_ROLE_KEY is set correctly. " +
        "The service role key bypasses RLS; if you are seeing this the wrong key is probably being used.",
        { code: error.code, message: error.message }
      );
    }

    console.error("[quotes/submit] Insert FAILED:", JSON.stringify(error));
    return NextResponse.json(
      { error: error.message, details: error },
      { status: 500 }
    );
  }

  if (!data) {
    console.error("[quotes/submit] Insert returned no data (unknown failure)");
    return NextResponse.json({ error: "Insert returned no data" }, { status: 500 });
  }

  console.log("[quotes/submit] Quote saved successfully:", data.id, data.reference_number);

  // ── Upsert customer record (fire-and-forget) ──────────────────────────────
  if (insertData.customer_email) {
    void (async () => {
      try {
        await supabase.from("customers").upsert(
          {
            email:           (insertData.customer_email as string).toLowerCase().trim(),
            phone:           insertData.customer_phone    || null,
            first_name:      insertData.customer_first_name || null,
            last_name:       insertData.customer_last_name  || null,
            last_visit_date: new Date().toISOString().split("T")[0],
            tenant_id:       tenantId,
          },
          { onConflict: "email" }
        );
      } catch { /* ignore */ }
    })();
  }

  return NextResponse.json({ quote: data as Quote });
}
