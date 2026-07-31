import { NextRequest, NextResponse } from 'next/server';
import { createTenantSupabaseClient } from '@/lib/supabase-server';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data, error } = await supabase
    .from('claw_rates')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('metal_name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  let body: { metal_name: string; price_per_claw: number; is_confirmed: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { metal_name, price_per_claw, is_confirmed } = body;

  const { data, error } = await supabase
    .from('claw_rates')
    .insert({ metal_name, price_per_claw, is_confirmed, tenant_id: tenantId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
