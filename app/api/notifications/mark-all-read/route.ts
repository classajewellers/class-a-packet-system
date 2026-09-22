// PATCH /api/notifications/mark-all-read
//
// Marks every notification currently visible to the caller as read — same
// visibility rule as GET /api/notifications (own targeted rows, plus
// broadcasts if manager/admin).

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

const CAN_SEE_BROADCASTS = new Set(["manager", "admin"]);

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { userId, tenantId, role } = auth.ctx;

  const supabase = createServerSupabaseClient();
  const seesBroadcasts = CAN_SEE_BROADCASTS.has(role);
  const visibilityFilter = seesBroadcasts
    ? `user_id.eq.${userId},user_id.is.null`
    : `user_id.eq.${userId}`;

  const { error } = await tenantScoped(supabase, tenantId)
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .or(visibilityFilter)
    .eq("is_read", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
