import { NextRequest, NextResponse } from 'next/server';
import { createTenantSupabaseClient } from '@/lib/supabase-server';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data, error } = await supabase
    .from('service_actions')
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
    pricing_mode: string;
    default_price: number | null;
    default_minutes: number | null;
    hint: string | null;
    sort_order: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, pricing_mode, default_price, default_minutes, hint, sort_order } = body;

  const { data, error } = await supabase
    .from('service_actions')
    .insert({
      name,
      pricing_mode,
      default_price,
      default_minutes,
      hint,
      sort_order,
      tenant_id: tenantId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
