/**
 * Sapphire Export authentication utility.
 * Fetches and caches a bearer token for the Sapphire Export stock API.
 *
 * Required env vars (set in Vercel — never in code):
 *   SAPPHIRE_EMAIL
 *   SAPPHIRE_PASSWORD
 */

const AUTH_ENDPOINT = "http://api.sapphirexport.com/api/Stock/ClientLogin";

const TOKEN_TTL_MS      = 6 * 60 * 60 * 1000; // 6 hours
const REFRESH_BUFFER_MS = 10 * 60 * 1000;      // refresh 10 min before expiry

let cache: { token: string; expiresAt: number } | null = null;

export function clearSapphireTokenCache(): void {
  cache = null;
  console.log("[sapphire/auth] Token cache cleared");
}

async function fetchFreshToken(): Promise<string> {
  console.log("[sapphire/auth] fetchFreshToken start");

  const email    = process.env.SAPPHIRE_EMAIL;
  const password = process.env.SAPPHIRE_PASSWORD;

  if (!email || !password) {
    throw new Error(
      `Sapphire auth: missing env var(s): ${[!email && "SAPPHIRE_EMAIL", !password && "SAPPHIRE_PASSWORD"].filter(Boolean).join(", ")}`
    );
  }

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => {
    console.log("[sapphire/auth] ABORTING — 10s timeout hit");
    controller.abort();
  }, 10000);

  let res: Response;
  let text: string;
  try {
    console.log("[sapphire/auth] calling fetch...");
    res = await fetch(AUTH_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ Username: email, Password: password }),
      signal:  controller.signal,
    });
    console.log("[sapphire/auth] fetch resolved, status:", res.status);
    text = await res.text();
    console.log("[sapphire/auth] response text length:", text.length);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[sapphire/auth] fetch threw:", e.name, e.message);
    throw new Error(`Sapphire auth fetch failed: ${e.message}`);
  }

  clearTimeout(timeoutId);

  let json: { Data?: { User_Info?: { Token?: string } }; Message?: string; Status?: string };
  try {
    json = JSON.parse(text);
  } catch {
    console.error("[sapphire/auth] JSON parse failed, raw:", text.slice(0, 200));
    throw new Error("Sapphire auth response was not valid JSON");
  }

  const token = json?.Data?.User_Info?.Token;
  if (!token) {
    console.error("[sapphire/auth] No token in response:", text.slice(0, 300));
    throw new Error(`Sapphire auth returned no token — ${json?.Message ?? "unknown error"}`);
  }

  console.log("[sapphire/auth] Token obtained successfully");
  return token;
}

export async function getSapphireToken(skipCache = false): Promise<string> {
  const now = Date.now();

  if (!skipCache && cache && cache.expiresAt - now > REFRESH_BUFFER_MS) {
    const minsLeft = Math.round((cache.expiresAt - now) / 60_000);
    console.log(`[sapphire/auth] Using cached token (${minsLeft}m remaining)`);
    return cache.token;
  }

  const token = await fetchFreshToken();
  cache = { token, expiresAt: now + TOKEN_TTL_MS };
  console.log("[sapphire/auth] Token cached for 6h");
  return token;
}
