import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// The key->tenant lookup goes through supabase-js (Next's patched fetch); never
// serve it (or the rate-limit reads) from the Data Cache.
export const fetchCache = "force-no-store";

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC, UNAUTHENTICATED website lead capture.
//   POST /api/public/leads/<public_lead_key>
// Creates a Lead (source forced to 'website') for the tenant that owns the key.
// Abuse protection: per-IP then per-key rate limiting, honeypot, length caps.
// No session, no PIN, no customer matching, no staff attribution.
// ─────────────────────────────────────────────────────────────────────────────

const IP_LIMIT = 5;          // requests per window per IP
const KEY_LIMIT = 20;        // requests per window per tenant key
const WINDOW_SECONDS = 60;

const MAX = { name: 120, email: 200, phone: 40, interested_in: 2000 };
const MAX_BODY_BYTES = 10_000;

// Hidden field real users never fill; bots often do. If set → silent no-op.
const HONEYPOT_FIELDS = ["company", "_hp"];

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...CORS_HEADERS, ...extra },
  });
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function cap(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// CORS preflight for JS/fetch-based forms
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { public_lead_key: string } }
): Promise<NextResponse> {
  const supabase = createServerSupabaseClient();
  const ip = clientIp(req);

  // 1. Per-IP rate limit FIRST — throttles bots probing keys, before any lookup.
  const ipRl = await checkRateLimit(supabase, `publiclead:ip:${ip}`, IP_LIMIT, WINDOW_SECONDS);
  if (!ipRl.allowed) {
    const retry = Math.max(1, Math.ceil((ipRl.resetAt.getTime() - Date.now()) / 1000));
    return json({ error: "Too many requests" }, 429, { "Retry-After": String(retry) });
  }

  // 2. Body size guard
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "Payload too large" }, 413);
  }

  // 3. Parse body — support both JSON (fetch) and form-encoded (plain <form>)
  let body: Record<string, unknown> = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      body = (await req.json()) as Record<string, unknown>;
    } else {
      const form = await req.formData();
      form.forEach((v, k) => { body[k] = typeof v === "string" ? v : ""; });
    }
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "Invalid request" }, 400);

  // 4. Honeypot — if any hidden field is filled, silently accept + no-op.
  //    Identical {ok:true} response so bots can't distinguish accepted vs dropped.
  for (const hp of HONEYPOT_FIELDS) {
    if (cap(body[hp], 200).length > 0) return json({ ok: true }, 200);
  }

  // 5. Resolve the tenant from the key. Generic error on miss (no enumeration).
  const key = (params.public_lead_key ?? "").trim();
  if (!key) return json({ error: "Invalid request" }, 401);

  const { data: tenant, error: tErr } = await supabase
    .from("tenants")
    .select("id")
    .eq("public_lead_key", key)
    .maybeSingle();

  if (tErr) {
    console.error("[public/leads] tenant lookup error:", tErr.message);
    return json({ error: "Could not submit" }, 500);
  }
  if (!tenant) return json({ error: "Invalid request" }, 401);
  const tenantId = String(tenant.id);

  // 6. Per-key (per-tenant) rate limit
  const keyRl = await checkRateLimit(supabase, `publiclead:tenant:${tenantId}`, KEY_LIMIT, WINDOW_SECONDS);
  if (!keyRl.allowed) {
    const retry = Math.max(1, Math.ceil((keyRl.resetAt.getTime() - Date.now()) / 1000));
    return json({ error: "Too many requests" }, 429, { "Retry-After": String(retry) });
  }

  // 7. Validate + normalise (capped)
  const name = cap(body.name, MAX.name);
  const phone = cap(body.phone, MAX.phone) || null;
  const email = (cap(body.email, MAX.email) || "").toLowerCase() || null;
  const interested_in =
    cap(body.interested_in, MAX.interested_in) ||
    cap(body.message, MAX.interested_in) ||
    "Website enquiry";

  if (!name) return json({ error: "Name is required" }, 400);
  if (!phone && !email) {
    return json({ error: "A phone number or email is required" }, 400);
  }

  // next_action_date: accept a valid YYYY-MM-DD if provided, else default tomorrow
  const provided = cap(body.next_action_date, 10);
  let next_action_date: string;
  if (/^\d{4}-\d{2}-\d{2}$/.test(provided)) {
    next_action_date = provided;
  } else {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    next_action_date = d.toISOString().split("T")[0];
  }

  // 8. Insert — source FORCED to 'website'; no staff/customer attribution.
  const { error: insErr } = await supabase.from("leads").insert({
    tenant_id: tenantId,
    name,
    phone,
    email,
    interested_in,
    source: "website",
    next_action_date,
    status: "new",
    linked_customer_id: null,
    created_by_staff_id: null,
  });

  if (insErr) {
    console.error("[public/leads] insert failed:", insErr.message);
    return json({ error: "Could not submit" }, 500);
  }

  return json({ ok: true }, 200);
}
