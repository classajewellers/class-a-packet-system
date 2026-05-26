import { createBrowserClient } from "@supabase/ssr";

// ── Singleton browser client ──────────────────────────────────────────────────
// A single Supabase client instance is shared across the entire browser session.
// This is critical: the login form and UserContext MUST use the same instance
// so that auth events (SIGNED_IN, SIGNED_OUT) fired by signInWithPassword()
// are received by the onAuthStateChange listener in UserContext.
//
// On the server (SSR), a fresh non-cached instance is returned each time
// so the singleton is never stored across server requests.

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function createBrowserSupabaseClient() {
  if (typeof window === "undefined") {
    // Server-side: return a fresh instance, never cache it
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  // Client-side: return the singleton
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}
