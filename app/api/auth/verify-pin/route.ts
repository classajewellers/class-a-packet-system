import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// 3 wrong PINs per staff name per 5-minute window.
// Supabase-backed — survives serverless cold starts, consistent across instances.
const MAX_ATTEMPTS   = 3;
const WINDOW_SECONDS = 5 * 60;

function getInitials(name: string): string {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase();
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { name: string; pin: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const { name, pin } = body;
  if (!name || !pin) {
    return NextResponse.json({ success: false, error: "Missing name or pin" }, { status: 400 });
  }

  // Trusted tenant, injected by the middleware auth guard (this route is no
  // longer in API_PUBLIC_ROUTES). Never a client-supplied value.
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) {
    return NextResponse.json({ success: false, error: "No tenant associated with this account" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();

  // Look up the staff member by name, scoped to the caller's tenant
  const { data: staff, error: dbError } = await supabase
    .from("staff_pins")
    .select("name, email, pin_hash, role")
    .eq("tenant_id", tenantId)
    .eq("name", name)
    .eq("active", true)
    .maybeSingle();

  if (dbError) {
    console.error("[verify-pin] DB error:", dbError.message);
    return NextResponse.json({ success: false, error: "Service error" }, { status: 500 });
  }

  // Compare PIN — only increment rate limit counter on failure
  const pinCorrect = !!staff && await bcrypt.compare(pin.trim(), staff.pin_hash);

  if (!pinCorrect) {
    const rl = await checkRateLimit(supabase, `pin:${tenantId}:${name}`, MAX_ATTEMPTS, WINDOW_SECONDS);

    // remaining === 0 means this was the last allowed attempt — treat as locked
    if (!rl.allowed || rl.remaining === 0) {
      const minutesLeft = Math.ceil((rl.resetAt.getTime() - Date.now()) / 60000);
      return NextResponse.json(
        {
          success: false,
          locked: true,
          error: `Too many attempts. Please see a manager. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`,
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        locked: false,
        attemptsLeft: rl.remaining,
        error: `Incorrect PIN. ${rl.remaining} attempt${rl.remaining !== 1 ? "s" : ""} remaining.`,
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    staff: {
      name:     staff.name,
      role:     staff.role,
      email:    staff.email,
      initials: getInitials(staff.name),
    },
  });
}
