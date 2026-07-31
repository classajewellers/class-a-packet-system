import { NextRequest, NextResponse } from 'next/server';
import { createTenantSupabaseClient } from '@/lib/supabase-server';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  let body: {
    name?: string;
    pricing_mode?: string;
    guide_key?: string | null;
    default_price?: number | null;
    default_minutes?: number | null;
    hint?: string | null;
    active?: boolean;
    sort_order?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const allowedFields = [
    'name',
    'pricing_mode',
    'guide_key',
    'default_price',
    'default_minutes',
    'hint',
    'active',
    'sort_order',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = (body as Record<string, unknown>)[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('repair_actions')
    .update(updates)
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
