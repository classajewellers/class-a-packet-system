// GET /api/notifications?unread_only=true
//
// Returns the caller's visible notifications: their own targeted rows
// (user_id = me) plus tenant-wide broadcasts (user_id IS NULL), broadcasts
// visible only to manager/admin — a broadcast alert like "deposit paid but
// order creation failed" needs someone who can act on it, not every staff
// member. Newest first, plus an unread_count for the bell badge.
//
// Identity comes from the verified session (requireAuth), never a
// client-supplied header — this is a per-user feature, so trusting a
// header here would let any caller read anyone else's notifications by
// changing it.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CAN_SEE_BROADCASTS = new Set(["manager", "admin"]);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { userId, tenantId, role } = auth.ctx;

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread_only") === "true";
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));

  const supabase = createServerSupabaseClient();

  const seesBroadcasts = CAN_SEE_BROADCASTS.has(role);
  const visibilityFilter = seesBroadcasts
    ? `user_id.eq.${userId},user_id.is.null`
    : `user_id.eq.${userId}`;

  let query = tenantScoped(supabase, tenantId)
    .from("notifications")
    .select("*")
    .or(visibilityFilter)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq("is_read", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count: unreadCount, error: countError } = await tenantScoped(supabase, tenantId)
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .or(visibilityFilter)
    .eq("is_read", false);

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  return NextResponse.json({
    notifications: data ?? [],
    unread_count: unreadCount ?? 0,
  });
}
