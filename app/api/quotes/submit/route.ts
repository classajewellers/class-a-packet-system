import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateQuoteReferenceNumber } from "@/lib/referenceNumber";
import { QuoteFormData, Quote } from "@/lib/types";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { formData: QuoteFormData };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { formData } = body;

  // Generate QT- reference number
  let referenceNumber: string;
  try {
    referenceNumber = await generateQuoteReferenceNumber();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Calculate total from line_items
  const lineItems = formData.line_items ?? [];
  const total = lineItems.reduce((sum, li) => sum + (li.price || 0), 0);

  const supabase = createServiceClient();

  const insertData = {
    reference_number: referenceNumber,
    quote_type: formData.quote_type,
    status: "pending",
    customer_first_name: formData.customer_first_name || null,
    customer_last_name: formData.customer_last_name || null,
    customer_email: formData.customer_email || null,
    customer_phone: formData.customer_phone || null,
    item_description: formData.item_description || null,
    line_items: lineItems.length > 0 ? lineItems : null,
    total: total || null,
    notes: formData.notes || null,
    repair_description: formData.repair_description || null,
    design_brief: formData.design_brief || null,
    metal_type: formData.metal_type || null,
    stone_details: formData.stone_details || null,
    estimated_turnaround: formData.estimated_turnaround || null,
    staff_member: formData.staff_member || null,
  };

  const { data: insertedQuote, error: insertError } = await supabase
    .from("quotes")
    .insert(insertData)
    .select()
    .single();

  if (insertError || !insertedQuote) {
    return NextResponse.json(
      { error: insertError?.message ?? "Insert failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ quote: insertedQuote as Quote });
}
