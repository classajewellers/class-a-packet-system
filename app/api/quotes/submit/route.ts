import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateQuoteReferenceNumber } from "@/lib/referenceNumber";
import { QuoteFormData, Quote } from "@/lib/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 0. Parse body ──────────────────────────────────────────────────────────
  let body: { formData: QuoteFormData };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { formData } = body;

  // ── 1. Validate env vars ───────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("[quotes/submit] Missing Supabase env vars:", {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!serviceKey,
    });
    return NextResponse.json(
      { error: "Server configuration error: Supabase env vars not set" },
      { status: 500 }
    );
  }

  // ── 2. Generate QT- reference number (with timestamp fallback) ─────────────
  let referenceNumber: string;
  try {
    referenceNumber = await generateQuoteReferenceNumber();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[quotes/submit] Reference number generation threw:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  console.log("[quotes/submit] Generated reference number:", referenceNumber);

  const lineItems = formData.line_items ?? [];
  const supabase = createServiceClient();
  const now = new Date().toISOString();

  const insertData = {
    reference_number:    referenceNumber,
    quote_type:          formData.quote_type,
    status:              "pending",
    customer_first_name: formData.customer_first_name || null,
    customer_last_name:  formData.customer_last_name  || null,
    customer_email:      formData.customer_email      || null,
    customer_phone:      formData.customer_phone      || null,
    item_description:    formData.item_description    || null,
    line_items:          lineItems.length > 0 ? lineItems : null,
    notes:               formData.notes               || null,
    repair_description:  formData.repair_description  || null,
    design_brief:        formData.design_brief        || null,
    metal_type:          formData.metal_type          || null,
    stone_details:       formData.stone_details       || null,
    estimated_turnaround: formData.estimated_turnaround || null,
    staff_member:        formData.staff_member        || null,
    // CRM pipeline fields
    assigned_to:         formData.assigned_to         || null,
    follow_up_date:      formData.follow_up_date      || null,
    pending_at:          now,
    status_changed_at:   now,
  };

  console.log("[quotes/submit] Inserting quote:", {
    reference_number: insertData.reference_number,
    quote_type:       insertData.quote_type,
    status:           insertData.status,
    customer_email:   insertData.customer_email,
    assigned_to:      insertData.assigned_to,
    follow_up_date:   insertData.follow_up_date,
  });

  // ── 3. Insert into Supabase ────────────────────────────────────────────────
  const { data: insertedQuote, error: insertError } = await supabase
    .from("quotes")
    .insert(insertData)
    .select()
    .single();

  if (insertError || !insertedQuote) {
    console.error("[quotes/submit] Supabase insert failed:", {
      code:    insertError?.code,
      message: insertError?.message,
      details: insertError?.details,
      hint:    insertError?.hint,
    });
    return NextResponse.json(
      {
        error:   insertError?.message ?? "Insert failed",
        code:    insertError?.code    ?? null,
        details: insertError?.details ?? null,
        hint:    insertError?.hint    ?? null,
      },
      { status: 500 }
    );
  }

  console.log("[quotes/submit] Quote saved successfully:", {
    id:               insertedQuote.id,
    reference_number: insertedQuote.reference_number,
    status:           insertedQuote.status,
    assigned_to:      insertedQuote.assigned_to,
    follow_up_date:   insertedQuote.follow_up_date,
  });

  return NextResponse.json({ quote: insertedQuote as Quote });
}
