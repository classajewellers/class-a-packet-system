import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { tenantScoped } from "@/lib/tenantScoped";
import { cashVariance, expectedDrawerCash, roundMoney } from "@/lib/posMoney";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/pos/sessions/close
// Body: { session_id, actual_cash_count, notes? }
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: { session_id?: string; actual_cash_count?: number; notes?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.session_id) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }
  const actual = Number(body.actual_cash_count);
  if (body.actual_cash_count == null || Number.isNaN(actual) || actual < 0) {
    return NextResponse.json({ error: "Actual cash count is required and cannot be negative" }, { status: 400 });
  }

  const supabase = await createTenantSupabaseClient(auth.ctx.tenantId);
  const db = tenantScoped(supabase, auth.ctx.tenantId);

  const { data: session, error: sessionErr } = await db
    .from("pos_sessions")
    .select("*")
    .eq("id", body.session_id)
    .maybeSingle();

  if (sessionErr) return NextResponse.json({ error: sessionErr.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.closed_at) return NextResponse.json({ error: "This session is already closed" }, { status: 409 });

  const { data: txns, error: txnErr } = await db
    .from("pos_transactions")
    .select("total, payment_method, payment_status")
    .eq("pos_session_id", session.id);

  if (txnErr) return NextResponse.json({ error: txnErr.message }, { status: 500 });

  let cashSales = 0;
  for (const txn of txns ?? []) {
    if (txn.payment_method === "cash" && txn.payment_status === "paid") {
      cashSales = roundMoney(cashSales + Number(txn.total));
    }
  }

  const floatAmount = Number(session.expected_cash_float);
  const variance = cashVariance(actual, floatAmount, cashSales);
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  const { data: closed, error: closeErr } = await db
    .from("pos_sessions")
    .update({
      closed_at: new Date().toISOString(),
      actual_cash_count: roundMoney(actual),
      variance,
      notes,
    })
    .eq("id", session.id)
    .is("closed_at", null)
    .select("*")
    .maybeSingle();

  if (closeErr) return NextResponse.json({ error: closeErr.message }, { status: 500 });
  if (!closed) return NextResponse.json({ error: "This session is already closed" }, { status: 409 });

  return NextResponse.json({
    session: {
      ...closed,
      cash_sales_total: cashSales,
      expected_cash: expectedDrawerCash(floatAmount, cashSales),
    },
  });
}
