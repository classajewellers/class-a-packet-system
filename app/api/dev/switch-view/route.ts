// POST /api/dev/switch-view — set or clear the view-as override cookie.
//
// Honoured ONLY for Josh's session-verified id (checked here at write time AND
// again wherever the effective role is computed). Body: { role: "admin" |
// "manager" | "staff" | null }. A null / real-role / invalid value clears the
// cookie (returns to real role). The cookie is downgrade-only and identity-
// scoped by resolveEffectiveRole, so it can never escalate — this route just
// controls whether the cookie exists.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  VIEW_AS_ALLOWED_PROFILE_ID,
  EFFECTIVE_ROLE_COOKIE,
} from "@/lib/effective-role";

export const dynamic = "force-dynamic";

const VALID = new Set(["admin", "manager", "staff"]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Auth is not configured" }, { status: 503 });
  }

  // Verify the session from cookies (read-only).
  const sessionClient = createServerClient(url, anon, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll() { /* set on the response below */ },
    },
  });
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only Josh may ever set this cookie. Everyone else is rejected at write time
  // too (defence in depth — the read path already ignores their cookie).
  if (user.id !== VIEW_AS_ALLOWED_PROFILE_ID) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let requested: unknown = null;
  try {
    requested = (await req.json())?.role ?? null;
  } catch {
    /* empty body → treated as clear */
  }

  const secure = process.env.NODE_ENV === "production";

  // Clear when the value is not a valid role (e.g. null / "reset").
  if (typeof requested !== "string" || !VALID.has(requested)) {
    const res = NextResponse.json({ ok: true, effectiveRole: null, cleared: true });
    res.cookies.set(EFFECTIVE_ROLE_COOKIE, "", {
      path: "/", maxAge: 0, sameSite: "lax", secure, httpOnly: false,
    });
    return res;
  }

  // Set the requested view-as role. Not httpOnly: the client reads it to reflect
  // the downgraded view. The SERVER never trusts it as-is — resolveEffectiveRole
  // re-derives the effective role (identity + downgrade-only) on every request.
  const res = NextResponse.json({ ok: true, requestedRole: requested });
  res.cookies.set(EFFECTIVE_ROLE_COOKIE, requested, {
    path: "/",
    maxAge: 60 * 60 * 12, // 12h — a working session; expires on its own
    sameSite: "lax",
    secure,
    httpOnly: false,
  });
  return res;
}
