import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { generateQuoteReferenceNumber } from "@/lib/referenceNumber";
import { QuoteFormData, Quote } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  console.log("Quote submit route hit");

  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: { formData: QuoteFormData };
  try {
    body = await req.json();
  } catch (err) {
    console.error("[quotes/submit] Failed to parse request body:", err);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  console.log("Form data received:", JSON.stringify(body));

  const { formData } = body;

  // ── 2. Generate QT- reference number (with timestamp fallback) ─────────────
  let referenceNumber: string;
  try {
    referenceNumber = await generateQuoteReferenceNumber();
    console.log("[quotes/submit] Generated reference:", referenceNumber);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[quotes/submit] Reference generation threw:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── 3. Build insert payload ────────────────────────────────────────────────
  const lineItems = formData.line_items ?? [];
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

  console.log("[quotes/submit] Insert payload:", JSON.stringify(insertData));

  // ── 4. Insert into Supabase ────────────────────────────────────────────────
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from("quotes")
    .insert(insertData)
    .select()
    .single();

  console.log("Supabase response:", JSON.stringify({ data, error }));

  if (error || !data) {
    console.error("[quotes/submit] Insert FAILED:", JSON.stringify(error));
    return NextResponse.json(
      { error: error?.message ?? "Insert failed", details: error },
      { status: 500 }
    );
  }

  console.log("[quotes/submit] Quote saved successfully:", data.id, data.reference_number);

  return NextResponse.json({ quote: data as Quote });
}
