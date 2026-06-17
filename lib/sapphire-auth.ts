/**
 * Sapphire Export authentication utility.
 * Fetches and caches a bearer token for the Sapphire Export stock API.
 *
 * Username is hardcoded ("assalc") — it never changes.
 * SAPPHIRE_PASSWORD must be set as a Vercel env var — never hardcode it.
 */

const AUTH_ENDPOINT   = "http://api.sapphirexport.com/api/Stock/ClientLogin";
const SAPPHIRE_USERNAME = "assalc";

const TOKEN_TTL_MS      = 6 * 60 * 60 * 1000; // 6 hours
const REFRESH_BUFFER_MS = 10 * 60 * 1000;      // refresh 10 min before expiry

interface SapphireCredentials {
  token:  string;
  userId: string;
}

let cache: (SapphireCredentials & { expiresAt: number }) | null = null;

export function clearSapphireTokenCache(): void {
  cache = null;
  console.log("[sapphire/auth] Token cache cleared");
}

async function fetchFreshCredentials(): Promise<SapphireCredentials> {
  console.log("[sapphire/auth] fetchFreshCredentials start");

  const password = process.env.SAPPHIRE_PASSWORD;
  if (!password) {
    throw new Error("Sapphire auth: SAPPHIRE_PASSWORD env var is not set");
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
      body:    JSON.stringify({ Username: SAPPHIRE_USERNAME, Password: password }),
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

  let json: { Data?: { User_Info?: { Token?: string; UserId?: string; UserID?: string } }; Message?: string };
  try {
    json = JSON.parse(text);
  } catch {
    console.error("[sapphire/auth] JSON parse failed, raw:", text.slice(0, 200));
    throw new Error("Sapphire auth response was not valid JSON");
  }

  const token  = json?.Data?.User_Info?.Token;
  const userId = json?.Data?.User_Info?.UserId ?? json?.Data?.User_Info?.UserID ?? "";

  if (!token) {
    console.error("[sapphire/auth] No token in response:", text.slice(0, 300));
    throw new Error(`Sapphire auth returned no token — ${json?.Message ?? "unknown error"}`);
  }

  console.log("[sapphire/auth] Credentials obtained successfully");
  return { token, userId };
}

export async function getSapphireCredentials(skipCache = false): Promise<SapphireCredentials> {
  const now = Date.now();

  if (!skipCache && cache && cache.expiresAt - now > REFRESH_BUFFER_MS) {
    const minsLeft = Math.round((cache.expiresAt - now) / 60_000);
    console.log(`[sapphire/auth] Using cached credentials (${minsLeft}m remaining)`);
    return { token: cache.token, userId: cache.userId };
  }

  const creds = await fetchFreshCredentials();
  cache = { ...creds, expiresAt: now + TOKEN_TTL_MS };
  console.log("[sapphire/auth] Credentials cached for 6h");
  return creds;
}
