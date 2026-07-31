import { NextRequest, NextResponse } from 'next/server';
import { createTenantSupabaseClient } from '@/lib/supabase-server';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data, error } = await supabase
    .from('discount_tiers')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('sort_order');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  let body: {
    name: string;
    discount_percent: number;
    eligible_ownership_only: boolean;
    sort_order: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, discount_percent, eligible_ownership_only, sort_order } = body;

  const { data, error } = await supabase
    .from('discount_tiers')
    .insert({ name, discount_percent, eligible_ownership_only, sort_order, tenant_id: tenantId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
