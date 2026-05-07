/**
 * supabase-server.ts
 * Server-side only Supabase client using the service role key.
 * NEVER import this in client components — it exposes the service role key
 * to the server only, where it belongs.
 *
 * The service role key bypasses Row Level Security entirely.
 * All API routes (/app/api/**) must use this, never the anon client.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function decodeJwtRole(token: string): string {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString("utf8")
    );
    return payload.role ?? "unknown";
  } catch {
    return "decode-error";
  }
}

export function createServerClient(): SupabaseClient {
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    console.error("[supabase-server] NEXT_PUBLIC_SUPABASE_URL is not set");
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  }
  if (!serviceKey) {
    console.error("[supabase-server] SUPABASE_SERVICE_ROLE_KEY is not set");
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  // Sanity-check: confirm the key is actually the service role key, not the anon key
  const role = decodeJwtRole(serviceKey);
  if (role !== "service_role") {
    console.error(
      `[supabase-server] Key has role="${role}" — expected "service_role". ` +
      `Check that SUPABASE_SERVICE_ROLE_KEY is set correctly in your env.`
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Alias used by API routes — same client, clearer name
export const createServerSupabaseClient = createServerClient;
