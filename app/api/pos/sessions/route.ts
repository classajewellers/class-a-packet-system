import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { tenantScoped } from "@/lib/tenantScoped";
import { cashVariance, expectedDrawerCash, roundMoney } from "@/lib/posMoney";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TxnRow = { total: number | string; payment_method: string; payment_status: string };

function summarise(floatAmount: number, txns: TxnRow[]) {
  const byMethod = new Map<string, { method: string; count: number; total: number }>();
  let cashSales = 0;
  for (const txn of txns) {
    if (txn.payment_status !== "paid") continue;
    const total = Number(txn.total) || 0;
    const bucket = byMethod.get(txn.payment_method) ?? { method: txn.payment_method, count: 0, total: 0 };
    bucket.count += 1;
    bucket.total = roundMoney(bucket.total + total);
    byMethod.set(txn.payment_method, bucket);
    if (txn.payment_method === "cash") cashSales = roundMoney(cashSales + total);
  }
  const expected = expectedDrawerCash(floatAmount, cashSales);
  return {
    cash_sales_total: cashSales,
    sales_count: txns.filter(t => t.payment_status === "paid").length,
    sales_by_method: Array.from(byMethod.values()),
    expected_cash: expected,
  };
}

async function loadOpenSession(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  tenantId: string,
  staffId: string
) {
  const db = tenantScoped(supabase, tenantId);
  const { data: session, error } = await db
    .from("pos_sessions")
    .select("*")
    .eq("staff_id", staffId)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: error.message, session: null };
  if (!session) return { error: null, session: null };

  const { data: txns, error: txnErr } = await db
    .from("pos_transactions")
    .select("total, payment_method, payment_status")
    .eq("pos_session_id", session.id);

  if (txnErr) return { error: txnErr.message, session: null };

  const summary = summarise(Number(session.expected_cash_float), (txns ?? []) as TxnRow[]);
  return { error: null, session: { ...session, ...summary } };
}

// GET /api/pos/sessions — the caller's open session, if any.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const loaded = await loadOpenSession(supabase, auth.ctx.tenantId, auth.ctx.userId);
  if (loaded.error) return NextResponse.json({ error: loaded.error }, { status: 500 });
  return NextResponse.json({ session: loaded.session });
}

// POST /api/pos/sessions — open a session with the cash float.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { expected_cash_float?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const floatAmount = Number(body.expected_cash_float);
  if (body.expected_cash_float == null || Number.isNaN(floatAmount) || floatAmount < 0) {
    return NextResponse.json({ error: "Opening cash float is required and cannot be negative" }, { status: 400 });
  }

  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const existing = await loadOpenSession(supabase, auth.ctx.tenantId, auth.ctx.userId);
  if (existing.error) return NextResponse.json({ error: existing.error }, { status: 500 });
  if (existing.session) {
    return NextResponse.json(
      { error: "You already have an open POS session", session: existing.session },
      { status: 409 }
    );
  }

  const { data, error } = await tenantScoped(supabase, auth.ctx.tenantId)
    .from("pos_sessions")
    .insert({
      staff_id: auth.ctx.userId,
      expected_cash_float: roundMoney(floatAmount),
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not open session" }, { status: 500 });
  }

  return NextResponse.json({
    session: {
      ...data,
      cash_sales_total: 0,
      sales_count: 0,
      sales_by_method: [],
      expected_cash: roundMoney(floatAmount),
      variance_preview: cashVariance(floatAmount, floatAmount, 0),
    },
  });
}
