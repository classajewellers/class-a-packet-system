import { NextRequest, NextResponse } from 'next/server';
import { createTenantSupabaseClient } from '@/lib/supabase-server';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  const { searchParams } = new URL(req.url);

  // Metadata mode: return distinct categories and materials for filter dropdowns
  if (searchParams.get('mode') === 'meta') {
    const { data } = await supabase.from('parts_catalogue').select('category, material').eq('tenant_id', tenantId);
    const categories = Array.from(new Set((data ?? []).map((r: any) => r.category as string))).sort();
    const materials = Array.from(new Set((data ?? []).map((r: any) => r.material as string))).sort();
    return NextResponse.json({ categories, materials });
  }

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50', 10)));
  const category = searchParams.get('category');
  const material = searchParams.get('material');
  const search = searchParams.get('search');
  const activeParam = searchParams.get('active') ?? 'true';

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('parts_catalogue')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  if (activeParam !== 'all') {
    query = query.eq('active', activeParam === 'true');
  }

  if (category) {
    query = query.eq('category', category);
  }

  if (material) {
    query = query.eq('material', material);
  }

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  query = query.order('category').order('name').range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  });
}

export async function POST(req: NextRequest) {
  const tenantId = req.headers.get('x-tenant-id') ?? '';
  const supabase = await createTenantSupabaseClient(tenantId);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('parts_catalogue')
    .insert({ ...body, tenant_id: tenantId })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
