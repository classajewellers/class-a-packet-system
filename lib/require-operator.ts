import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * require-operator.ts
 * In-route (defence-in-depth) gate for the system-operator area (/vault-admin).
 *
 * The middleware already blocks /api/vault-admin/* for non-operators, but every
 * operator route ALSO calls this so it never depends on an upstream check.
 *
 * Operator = a verified Supabase session whose profile has is_operator = true.
 * There is no shared PIN and no client-settable cookie — the Supabase session
 * cookie is httpOnly and server-verified, and is_operator is only settable in
 * the database. Setting a fake cookie can never satisfy this.
 */
export type OperatorResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function requireOperator(req: NextRequest): Promise<OperatorResult> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, response: NextResponse.json({ error: "Auth is not configured" }, { status: 503 }) };
  }

  const sessionClient = createServerClient(url, anon, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll() { /* route handlers cannot set cookies */ },
    },
  });

  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // Service-role lookup of the operator flag (bypasses RLS).
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("is_operator")
    .eq("id", user.id)
    .single();

  if (error || !data?.is_operator) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden — operator only" }, { status: 403 }) };
  }

  return { ok: true, userId: user.id };
}
