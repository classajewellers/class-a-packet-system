import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── Staff PIN registry (server-side only — never exposed to client) ──
const STAFF_PINS: Record<string, { pin: string; role: "manager" | "staff"; email: string; initials: string }> = {
  "Aisha Scott":       { pin: "7875", role: "staff",   email: "aisha@classa.com.au",         initials: "AS" },
  "Arissa Michos":     { pin: "6916", role: "manager", email: "arissa@classa.com.au",        initials: "AM" },
  "Benjamin Mucklow":  { pin: "5320", role: "manager", email: "ben@classa.com.au",           initials: "BM" },
  "Bradley Mucklow":   { pin: "5378", role: "manager", email: "brad@classa.com.au",          initials: "BM" },
  "Bridget Moore":     { pin: "8484", role: "staff",   email: "bridget@classa.com.au",       initials: "BM" },
  "Charlotte Beavis":  { pin: "2780", role: "staff",   email: "charlotte@classa.com.au",     initials: "CB" },
  "Daniel Beecken":    { pin: "1171", role: "staff",   email: "daniel@classa.com.au",        initials: "DB" },
  "David Johnson":     { pin: "1103", role: "staff",   email: "david@classa.com.au",         initials: "DJ" },
  "Dior Munro":        { pin: "9863", role: "staff",   email: "dior@classa.com.au",          initials: "DM" },
  "Donna Cordes":      { pin: "0204", role: "staff",   email: "donna@classa.com.au",         initials: "DC" },
  "Ivy Wood":          { pin: "4873", role: "staff",   email: "ivy@classa.com.au",           initials: "IW" },
  "Jack Mullan":       { pin: "4214", role: "staff",   email: "jack@classa.com.au",          initials: "JM" },
  "Jessica D'Alfonso": { pin: "5333", role: "staff",   email: "jess@classa.com.au",          initials: "JD" },
  "Joseph Onorato":    { pin: "1623", role: "staff",   email: "joseph@classa.com.au",        initials: "JO" },
  "Joshua Mucklow":    { pin: "2204", role: "manager", email: "josh@classa.com.au",          initials: "JM" },
  "Keeley Mucklow":    { pin: "0034", role: "staff",   email: "keeley@classa.com.au",        initials: "KM" },
  "Leah Newton":       { pin: "0906", role: "staff",   email: "leah@classa.com.au",          initials: "LN" },
  "Melody Abram":      { pin: "1065", role: "staff",   email: "melody@classa.com.au",        initials: "MA" },
  "Monica Maghsoodi":  { pin: "6306", role: "staff",   email: "monica@classa.com.au",        initials: "MM" },
  "Paull Scudds":      { pin: "2367", role: "staff",   email: "customercare@classa.com.au",  initials: "PS" },
  "Sam Mucklow":       { pin: "0994", role: "manager", email: "sam@classa.com.au",           initials: "SM" },
  "Shahrzad Givi":     { pin: "3434", role: "staff",   email: "shahrzad@classa.com.au",      initials: "SG" },
  "Sinziana Peters":   { pin: "9344", role: "staff",   email: "sinziana@classa.com.au",      initials: "SP" },
  "Vivian Valladares": { pin: "0409", role: "staff",   email: "viv@classa.com.au",           initials: "VV" },
  "Zac Mucklow":       { pin: "9006", role: "staff",   email: "customercare@classa.com.au",  initials: "ZM" },
};

// ── In-memory rate limiting (resets on server restart) ──
// Map<staffName, { attempts: number; lockedUntil: number | null }>
const attemptTracker = new Map<string, { attempts: number; lockedUntil: number | null }>();

const MAX_ATTEMPTS = 3;
const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

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

  // Check lock
  const tracker = attemptTracker.get(name) ?? { attempts: 0, lockedUntil: null };
  if (tracker.lockedUntil && Date.now() < tracker.lockedUntil) {
    const remaining = Math.ceil((tracker.lockedUntil - Date.now()) / 60000);
    return NextResponse.json({
      success: false,
      locked: true,
      error: `Too many attempts. Please see a manager. Try again in ${remaining} minute${remaining !== 1 ? "s" : ""}.`,
    }, { status: 429 });
  }

  const staff = STAFF_PINS[name];
  if (!staff || staff.pin !== pin.trim()) {
    // Increment attempts
    const newAttempts = (tracker.attempts || 0) + 1;
    const locked = newAttempts >= MAX_ATTEMPTS;
    attemptTracker.set(name, {
      attempts: locked ? 0 : newAttempts,
      lockedUntil: locked ? Date.now() + LOCK_DURATION_MS : null,
    });
    return NextResponse.json({
      success: false,
      locked,
      attemptsLeft: locked ? 0 : MAX_ATTEMPTS - newAttempts,
      error: locked
        ? "Too many attempts. Please see a manager."
        : `Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? "s" : ""} remaining.`,
    }, { status: 401 });
  }

  // Success — clear tracker
  attemptTracker.delete(name);
  return NextResponse.json({
    success: true,
    staff: {
      name,
      role: staff.role,
      email: staff.email,
      initials: staff.initials,
    },
  });
}
