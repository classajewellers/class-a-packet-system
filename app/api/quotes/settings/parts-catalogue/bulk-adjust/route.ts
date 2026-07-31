import { NextRequest, NextResponse } from 'next/server';
import { createTenantSupabaseClient } from '@/lib/supabase-server';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  let body: { ids: string[]; cost_multiplier: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ids, cost_multiplier } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
  }

  if (typeof cost_multiplier !== 'number' || cost_multiplier <= 0) {
    return NextResponse.json({ error: 'cost_multiplier must be a positive number' }, { status: 400 });
  }

  // Fetch all matching rows
  const { data: rows, error: fetchError } = await supabase
    .from('parts_catalogue')
    .select('id, cost')
    .in('id', ids)
    .eq('tenant_id', tenantId);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  // Build individual updates with multiplied costs
  const updatePromises = rows.map((row) =>
    supabase
      .from('parts_catalogue')
      .update({ cost: Number(row.cost) * cost_multiplier })
      .eq('id', row.id)
      .eq('tenant_id', tenantId)
  );

  const results = await Promise.all(updatePromises);

  const firstError = results.find((r) => r.error)?.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  return NextResponse.json({ updated: rows.length });
}
