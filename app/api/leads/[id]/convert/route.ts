import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { verifyStaffPin } from "@/lib/verifyStaffPin";
import { generateQuoteReferenceNumber } from "@/lib/referenceNumber";
import { Lead } from "@/lib/leads";

export const dynamic = "force-dynamic";

// ── POST /api/leads/[id]/convert — turn a lead into a quote (PIN-gated) ───────
// Creates a pending quote carrying over the lead's name/phone/email, sets the
// lead status to 'quoted' + converted_quote_id, and KEEPS the lead row for
// conversion-rate reporting by source later.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  let body: { pinName?: string; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  // ── PIN gate ───────────────────────────────────────────────────────────────
  const pinResult = await verifyStaffPin(supabase, tenantId, body.pinName, body.pin);
  if (!pinResult.ok) {
    return NextResponse.json({ error: pinResult.error }, { status: pinResult.status });
  }

  // ── Load the lead (tenant-scoped) ──────────────────────────────────────────
  const leadQ = supabase.from("leads").select("*").eq("id", params.id);
  const { data: leadRow, error: leadErr } = await (
    tenantId ? leadQ.eq("tenant_id", tenantId) : leadQ
  ).single();

  if (leadErr || !leadRow) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }
  const lead = leadRow as Lead;
  if (lead.converted_quote_id) {
    return NextResponse.json(
      { error: "This lead has already been converted to a quote" },
      { status: 409 }
    );
  }

  // ── Build the quote from the lead ──────────────────────────────────────────
  // Leads carry a single name; quotes use first/last. Split on first space.
  const trimmed = lead.name.trim();
  const spaceIdx = trimmed.indexOf(" ");
  const firstName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const lastName = spaceIdx === -1 ? null : trimmed.slice(spaceIdx + 1).trim() || null;

  let referenceNumber: string;
  try {
    referenceNumber = await generateQuoteReferenceNumber(tenantId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to generate quote reference: ${msg}` }, { status: 500 });
  }

  const now = new Date().toISOString();
  const quoteInsert: Record<string, unknown> = {
    reference_number: referenceNumber,
    quote_type: "custom_order",
    status: "pending",
    customer_first_name: firstName,
    customer_last_name: lastName,
    customer_email: lead.email,
    customer_phone: lead.phone,
    notes: `Converted from enquiry — interested in: ${lead.interested_in}`,
    pending_at: now,
    status_changed_at: now,
    tenant_id: tenantId,
  };

  const { data: quote, error: quoteErr } = await supabase
    .from("quotes")
    .insert(quoteInsert)
    .select()
    .single();

  if (quoteErr || !quote) {
    console.error("[leads/convert] quote insert failed:", quoteErr?.message);
    return NextResponse.json({ error: quoteErr?.message ?? "Failed to create quote" }, { status: 500 });
  }

  // ── Mark the lead converted (keep the row) ─────────────────────────────────
  const { data: updatedLead, error: updateErr } = await supabase
    .from("leads")
    .update({ status: "quoted", converted_quote_id: quote.id, updated_at: now })
    .eq("id", lead.id)
    .select()
    .single();

  if (updateErr) {
    // Quote was created but the lead flip failed — surface it; the quote exists.
    console.error("[leads/convert] lead update failed:", updateErr.message);
    return NextResponse.json(
      { error: `Quote ${referenceNumber} created, but updating the lead failed: ${updateErr.message}`, quote },
      { status: 500 }
    );
  }

  return NextResponse.json({ lead: updatedLead as Lead, quote });
}
