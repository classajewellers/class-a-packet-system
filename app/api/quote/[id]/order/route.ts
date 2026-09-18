import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { Quote } from "@/lib/types";
import { generatePaymentLink } from "@/lib/generatePaymentLink";

export const dynamic = "force-dynamic";

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

function stoneSpecs(stones: Array<Record<string, unknown>>): string {
  return stones
    .map(s =>
      [
        s.carat_weight != null ? `${s.carat_weight}ct` : null,
        s.colour ?? s.color,
        s.clarity,
        s.origin,
        s.shape,
      ]
        .filter(Boolean)
        .join(" ")
    )
    .filter(Boolean)
    .join("; ");
}

interface StoneLink {
  video: string | null;
  image: string | null;
}

// Only stones actually sourced via Browse Stones (Nivoda) carry a link — a
// manually-typed stone has neither field at all and is simply omitted, no
// placeholder. Per-stone, not per-option, since an option can hold several
// stones (main + accents).
function stoneLinks(stones: Array<Record<string, unknown>>): StoneLink[] {
  return stones
    .map(s => ({
      video: typeof s.nivoda_video === "string" ? s.nivoda_video : null,
      image: typeof s.nivoda_image === "string" ? s.nivoda_image : null,
    }))
    .filter(l => l.video || l.image);
}

// Public, unauthenticated by design — same "possession of the link is the
// credential" model already used by app/api/quotes/[id]/pdf/route.ts. No
// x-tenant-id header is sent by a customer's browser; the quote's own UUID
// is the only lookup key, matching the existing PDF route's fallback path.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const supabase = await createTenantSupabaseClient(null);

  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const quote = data as Quote;

  const qbd = quote.quote_builder_data as { builder_items?: Array<Record<string, unknown>> } | null | undefined;
  const builderItems = qbd && Array.isArray(qbd.builder_items) ? qbd.builder_items : null;
  const item = builderItems && builderItems.length > 0 ? builderItems[0] : null;
  const stoneOpts = item && Array.isArray(item.stone_options) ? (item.stone_options as Array<Record<string, unknown>>) : [];

  const options = stoneOpts.map((opt, i) => ({
    index: i,
    label: typeof opt.label === "string" ? opt.label : `Option ${i + 1}`,
    specs: Array.isArray(opt.stones) ? stoneSpecs(opt.stones as Array<Record<string, unknown>>) : "",
    stone_links: Array.isArray(opt.stones) ? stoneLinks(opt.stones as Array<Record<string, unknown>>) : [],
    quoted_price: typeof opt.quoted_price === "number" ? opt.quoted_price : (quote.quoted_price ?? quote.total ?? null),
  }));

  // Fallback for legacy/simple quotes with no stone_options array at all —
  // present as a single implicit "option" so the page can render the same
  // uniform confirm-summary UI regardless of shape.
  if (options.length === 0) {
    options.push({
      index: 0,
      label: "Your Order",
      specs: typeof item?.design === "string" ? item.design : "",
      stone_links: [],
      quoted_price: quote.quoted_price ?? quote.total ?? null,
    });
  }

  let termsAndConditions: string | null = null;
  let brandPrimaryColour: string | null = null;
  if (quote.tenant_id) {
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("terms_and_conditions, brand_primary_colour")
      .eq("id", quote.tenant_id)
      .maybeSingle();
    termsAndConditions = tenantRow?.terms_and_conditions ?? null;
    brandPrimaryColour = tenantRow?.brand_primary_colour ?? null;
  }

  return NextResponse.json({
    reference_number: quote.reference_number,
    design: typeof item?.design === "string" ? item.design : null,
    options,
    already_confirmed: quote.accepted_option != null,
    payment_link_url: quote.stripe_payment_link_url ?? null,
    terms_and_conditions: termsAndConditions,
    brand_primary_colour: brandPrimaryColour,
  });
}

interface OrderRequestBody {
  accepted_option?: number;
  address?: {
    street?: string;
    suburb?: string;
    state?: string;
    postcode?: string;
  };
  terms_accepted?: boolean;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const supabase = await createTenantSupabaseClient(null);

  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const quote = data as Quote;

  // Lock after first confirmation — no self-service changing your mind once
  // an option has been accepted. A genuine change needs a staff-assisted
  // fix, same as any other order correction.
  if (quote.accepted_option != null) {
    return NextResponse.json({ error: "This order has already been confirmed" }, { status: 409 });
  }

  let body: OrderRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.terms_accepted !== true) {
    // Only enforced when the tenant actually has terms configured — see the
    // GET handler / order page: no terms configured means no checkbox is
    // shown, and this field will legitimately be absent.
    const { data: tenantRow } = quote.tenant_id
      ? await supabase.from("tenants").select("terms_and_conditions").eq("id", quote.tenant_id).maybeSingle()
      : { data: null };
    if (tenantRow?.terms_and_conditions) {
      return NextResponse.json({ error: "You must agree to the Terms & Conditions to continue" }, { status: 400 });
    }
  }

  // Re-validate the option index server-side against the quote's real data —
  // never trust the index the client sent on its own.
  const qbd = quote.quote_builder_data as { builder_items?: Array<Record<string, unknown>> } | null | undefined;
  const builderItems = qbd && Array.isArray(qbd.builder_items) ? qbd.builder_items : null;
  const item = builderItems && builderItems.length > 0 ? builderItems[0] : null;
  const stoneOpts = item && Array.isArray(item.stone_options) ? (item.stone_options as Array<Record<string, unknown>>) : [];
  const optionCount = Math.max(stoneOpts.length, 1); // legacy single-option quotes present as one implicit option

  const acceptedOption = body.accepted_option;
  if (typeof acceptedOption !== "number" || acceptedOption < 0 || acceptedOption >= optionCount) {
    return NextResponse.json({ error: "Invalid option selected" }, { status: 400 });
  }

  const address = body.address ?? {};
  const street = (address.street ?? "").trim();
  const suburb = (address.suburb ?? "").trim();
  const state = (address.state ?? "").trim().toUpperCase();
  const postcode = (address.postcode ?? "").trim();

  if (!street || !suburb || !state || !postcode) {
    return NextResponse.json({ error: "Please provide a complete delivery address" }, { status: 400 });
  }
  if (!AU_STATES.includes(state)) {
    return NextResponse.json({ error: `State must be one of: ${AU_STATES.join(", ")}` }, { status: 400 });
  }
  if (!/^\d{4}$/.test(postcode)) {
    return NextResponse.json({ error: "Postcode must be 4 digits" }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from("quotes")
    .update({
      accepted_option: acceptedOption,
      customer_street: street,
      customer_suburb: suburb,
      customer_state: state,
      customer_postcode: postcode,
      status_changed_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (updateErr) {
    return NextResponse.json({ error: "Failed to save your order" }, { status: 500 });
  }

  // Re-fetch with the update applied so generatePaymentLink resolves the
  // just-accepted option's price, not the stale pre-update row.
  const { data: updatedData, error: refetchErr } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", params.id)
    .single();

  if (refetchErr || !updatedData) {
    return NextResponse.json({ error: "Order saved, but failed to generate payment link — please contact us" }, { status: 500 });
  }

  const updatedQuote = updatedData as Quote;
  const result = await generatePaymentLink(supabase, updatedQuote, updatedQuote.tenant_id ?? "");

  if (result.error) {
    return NextResponse.json(
      { error: `Order saved, but payment link generation failed: ${result.error}` },
      { status: result.status ?? 500 }
    );
  }

  return NextResponse.json({
    payment_link_url: result.payment_link_url,
    deposit_amount: result.deposit_amount,
  });
}
