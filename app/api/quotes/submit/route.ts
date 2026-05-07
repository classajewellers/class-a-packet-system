import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { generateQuoteReferenceNumber } from "@/lib/referenceNumber";
import { QuoteFormData, Quote } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  console.log("[quotes/submit] Starting quote submission");

  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: { formData: QuoteFormData };
  try {
    body = await req.json();
  } catch {
    console.error("[quotes/submit] Failed to parse request body");
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { formData } = body;
  console.log("[quotes/submit] Quote type:", formData.quote_type, "| Customer:", formData.customer_email || formData.customer_last_name, "| Assigned:", formData.assigned_to);

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
  const now       = new Date().toISOString();

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

  console.log("[quotes/submit] Inserting into quotes table:", {
    reference_number:  insertData.reference_number,
    status:            insertData.status,
    assigned_to:       insertData.assigned_to,
    follow_up_date:    insertData.follow_up_date,
  });

  // ── 4. Insert into Supabase ────────────────────────────────────────────────
  const supabase = createServerClient();

  const { data: insertedQuote, error: insertError } = await supabase
    .from("quotes")
    .insert(insertData)
    .select()
    .single();

  if (insertError || !insertedQuote) {
    console.error("[quotes/submit] Supabase insert FAILED:", JSON.stringify({
      code:    insertError?.code,
      message: insertError?.message,
      details: insertError?.details,
      hint:    insertError?.hint,
    }));
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
