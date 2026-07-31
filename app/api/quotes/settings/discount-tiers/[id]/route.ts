import { NextRequest, NextResponse } from 'next/server';
import { createTenantSupabaseClient } from '@/lib/supabase-server';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('discount_tiers')
    .update(body)
    .eq('id', params.id)
    .eq('tenant_id', tenantId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  // Check if any quotes reference this discount tier
  const { count: quotesCount, error: quotesError } = await supabase
    .from('quotes')
    .select('*', { count: 'exact', head: true })
    .eq('discount_tier_id', params.id)
    .eq('tenant_id', tenantId);

  if (quotesError) {
    return NextResponse.json({ error: quotesError.message }, { status: 500 });
  }

  if (quotesCount && quotesCount > 0) {
    return NextResponse.json(
      { error: 'This discount tier is assigned to existing quotes or customers and cannot be deleted.' },
      { status: 409 }
    );
  }

  // Check if any customers reference this discount tier
  const { count: customersCount, error: customersError } = await supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('discount_tier_id', params.id)
    .eq('tenant_id', tenantId);

  if (customersError) {
    return NextResponse.json({ error: customersError.message }, { status: 500 });
  }

  if (customersCount && customersCount > 0) {
    return NextResponse.json(
      { error: 'This discount tier is assigned to existing quotes or customers and cannot be deleted.' },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from('discount_tiers')
    .delete()
    .eq('id', params.id)
    .eq('tenant_id', tenantId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
