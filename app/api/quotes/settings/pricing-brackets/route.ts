import { NextRequest, NextResponse } from 'next/server';
import { createTenantSupabaseClient } from '@/lib/supabase-server';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data, error } = await supabase
    .from('pricing_brackets')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('bracket_type')
    .order('cost_lower_bound');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  let body: {
    bracket_type: string;
    cost_lower_bound: number;
    multiplier: number;
    sort_order: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { bracket_type, cost_lower_bound, multiplier, sort_order } = body;

  const { data, error } = await supabase
    .from('pricing_brackets')
    .insert({ bracket_type, cost_lower_bound, multiplier, sort_order, tenant_id: tenantId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
