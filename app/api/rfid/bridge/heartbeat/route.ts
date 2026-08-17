import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateBridgeAuth } from "@/lib/rfid-bridge-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST /api/rfid/bridge/heartbeat
// Bridge sends this periodically to confirm it is alive.
// Body: { version?: string }
export async function POST(req: NextRequest): Promise<NextResponse> {
  const identity = await validateBridgeAuth(req.headers.get("authorization"));
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const updates: Record<string, unknown> = { last_heartbeat_at: new Date().toISOString() };
  if (body.version) updates.bridge_version = body.version;

  await supabase
    .from("rfid_bridge_installations")
    .update(updates)
    .eq("id", identity.installationId);

  if (identity.printerId) {
    await supabase
      .from("rfid_printers")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", identity.printerId);
  }

  return NextResponse.json({ ok: true });
}
