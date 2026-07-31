import { NextRequest, NextResponse } from 'next/server';
import { createTenantSupabaseClient } from '@/lib/supabase-server';
import { generateQuoteReferenceNumber } from '@/lib/referenceNumber';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  try {
    const body = await req.json();
    const { customer, items, vipTierId, discountAmount, tierOverride } = body;

    const referenceNumber = await generateQuoteReferenceNumber();

    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert({
        reference_number: referenceNumber,
        quote_type: 'repair',
        status: 'pending',
        customer_first_name: customer?.firstName || null,
        customer_last_name: customer?.lastName || null,
        customer_email: customer?.email || null,
        customer_phone: customer?.phone || null,
        vip_tier_id: vipTierId || null,
        discount_amount: discountAmount || null,
        tenant_id: tenantId,
      })
      .select()
      .single();

    if (quoteError || !quote) {
      return NextResponse.json({ error: quoteError?.message ?? 'Failed to create quote' }, { status: 500 });
    }

    if (customer?.email) {
      void supabase.from('customers').upsert(
        {
          email: customer.email.toLowerCase().trim(),
          first_name: customer.firstName || null,
          last_name: customer.lastName || null,
          phone: customer.phone || null,
        },
        { onConflict: 'email' }
      );
    }

    // Apply manager-approved tier override to the customer record
    if (tierOverride?.customerId && tierOverride?.tierId) {
      void supabase
        .from('customers')
        .update({
          tier_override_id: tierOverride.tierId,
          tier_override_approved_by: tierOverride.approvedBy || null,
          tier_override_approved_at: new Date().toISOString(),
          tier_override_note: tierOverride.note || null,
        })
        .eq('id', tierOverride.customerId)
        .eq('tenant_id', tenantId);
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { data: quoteItem, error: itemError } = await supabase
        .from('quote_items')
        .insert({
          tenant_id: tenantId,
          quote_id: quote.id,
          sort_order: i,
          description: item.description,
          ownership_status: item.ownership_status,
          condition_notes: item.condition_notes || null,
        })
        .select()
        .single();

      if (itemError || !quoteItem) continue;

      if (item.lines && item.lines.length > 0) {
        await supabase.from('quote_lines').insert(
          item.lines.map((line: any, j: number) => ({
            tenant_id: tenantId,
            quote_item_id: quoteItem.id,
            line_type: line.line_type,
            catalogue_ref_id: line.catalogue_ref_id || null,
            description: line.description,
            quantity: line.quantity,
            cost: line.cost ?? null,
            retail_price: line.retail_price,
            sort_order: j,
          }))
        );
      }
    }

    return NextResponse.json({ quote });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
