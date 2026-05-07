import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy singleton for the anon (public) client — safe to call from client or server
let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase env vars not set");
    _client = createClient(url, key);
  }
  return _client;
}

// Alias used by client components (re-evaluated each call but same singleton)
export const supabase = {
  get client() {
    return getSupabaseClient();
  },
};

// Server-side client with service role key — call only in API routes / server components
export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    throw new Error("Supabase service role env vars not set");
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
