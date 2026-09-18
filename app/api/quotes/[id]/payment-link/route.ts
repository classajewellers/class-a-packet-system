// Required Vercel environment variables:
//   STRIPE_SECRET_KEY          — Stripe dashboard → Developers → API Keys → Secret key
//   STRIPE_WEBHOOK_SECRET      — Stripe dashboard → Webhooks → signing secret
//   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — Stripe publishable key

import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { Quote } from "@/lib/types";
import { generatePaymentLink } from "@/lib/generatePaymentLink";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  // Fetch the quote
  const q = supabase.from("quotes").select("*").eq("id", params.id);
  const { data, error } = await (tenantId ? q.eq("tenant_id", tenantId) : q).single();

  if (error || !data) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const quote = data as Quote;

  // Parse optional amount override from body
  let body: { amount?: number } = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

  const result = await generatePaymentLink(supabase, quote, tenantId, body.amount);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }
  if (result.suppressed) {
    return NextResponse.json({ url: null, suppressed: true });
  }

  return NextResponse.json({
    payment_link_url: result.payment_link_url,
    deposit_amount: result.deposit_amount,
  });
}
