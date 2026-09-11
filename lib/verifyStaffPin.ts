// lib/verifyStaffPin.ts
// Server-side staff-PIN verification for action gating + attribution.
//
// The existing PIN check lives inline in app/api/auth/verify-pin/route.ts and
// only returns { name, role } — no id. Action routes that need to STAMP the
// acting staff member (created_by_staff_id) re-verify here and get the
// staff_pins.id back. Same table, same bcrypt scheme, same Supabase-backed
// rate limiter, so the gate is genuinely enforced server-side even if a client
// calls the endpoint directly.

import type { SupabaseClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_ATTEMPTS = 3;
const WINDOW_SECONDS = 5 * 60;

export interface VerifiedStaff {
  id: string;
  name: string;
  role: string;
}

export type StaffPinResult =
  | { ok: true; staff: VerifiedStaff }
  | { ok: false; status: number; error: string };

/** Verify a staff name + PIN against staff_pins. On success returns the staff
 *  id/name/role. On failure returns a ready-to-send status + message
 *  (401 wrong PIN, 429 locked out, 400 missing input, 500 service error). */
export async function verifyStaffPin(
  // service-role client (bypasses RLS) — pass createServerSupabaseClient()
  supabase: SupabaseClient,
  name: string | undefined | null,
  pin: string | undefined | null
): Promise<StaffPinResult> {
  if (!name || !pin) {
    return { ok: false, status: 400, error: "Staff PIN required" };
  }

  const { data: staff, error } = await supabase
    .from("staff_pins")
    .select("id, name, role, pin_hash")
    .eq("name", name)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error("[verifyStaffPin] DB error:", error.message);
    return { ok: false, status: 500, error: "Service error" };
  }

  const pinCorrect = !!staff && (await bcrypt.compare(pin.trim(), staff.pin_hash));

  if (!pinCorrect) {
    const rl = await checkRateLimit(supabase, `pin:${name}`, MAX_ATTEMPTS, WINDOW_SECONDS);
    if (!rl.allowed || rl.remaining === 0) {
      const minutesLeft = Math.ceil((rl.resetAt.getTime() - Date.now()) / 60000);
      return {
        ok: false,
        status: 429,
        error: `Too many attempts. Please see a manager. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`,
      };
    }
    return {
      ok: false,
      status: 401,
      error: `Incorrect PIN. ${rl.remaining} attempt${rl.remaining !== 1 ? "s" : ""} remaining.`,
    };
  }

  return {
    ok: true,
    staff: { id: String(staff.id), name: String(staff.name), role: String(staff.role) },
  };
}
