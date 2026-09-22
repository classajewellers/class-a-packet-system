// PATCH /api/notifications/[id]
// Body: { read: true }
//
// Marks one notification as read. Scoped to rows the caller may actually
// act on: their own targeted notification, or a tenant-wide broadcast IF
// they're a manager/admin (matches the GET route's visibility rule —
// staff can't "read" a broadcast they were never shown).

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

const CAN_SEE_BROADCASTS = new Set(["manager", "admin"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const { userId, tenantId, role } = auth.ctx;

  let body: { read?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (body.read !== true) {
    return NextResponse.json({ error: "Only { read: true } is supported" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const seesBroadcasts = CAN_SEE_BROADCASTS.has(role);
  const visibilityFilter = seesBroadcasts
    ? `user_id.eq.${userId},user_id.is.null`
    : `user_id.eq.${userId}`;

  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", params.id)
    .or(visibilityFilter)
    .select()
    .single();

  if (error?.code === "PGRST116") return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notification: data });
}
