/**
 * Nivoda authentication utility.
 * Fetches and caches a bearer token for the Nivoda diamond API.
 *
 * STAGING (active):
 *   NIVODA_ENDPOINT=https://intg-customer-staging.nivodaapi.net/api/diamonds
 *   NIVODA_EMAIL=testaccount@sample.com
 *   NIVODA_PASSWORD=staging-nivoda-22
 *
 * PRODUCTION (enable once Nivoda activates prod access):
 *   NIVODA_ENDPOINT=https://integrations.nivoda.net/api/diamonds
 *   NIVODA_EMAIL=josh@classa.com.au
 *   NIVODA_PASSWORD=<prod password>
 */

// Endpoint is read per-request so Vercel env changes take effect without redeploy.
export function getNivodaEndpoint(): string {
  return process.env.NIVODA_ENDPOINT ?? "https://intg-customer-staging.nivodaapi.net/api/diamonds";
}

const TOKEN_TTL_MS       = 6 * 60 * 60 * 1000; // 6 hours
const REFRESH_BUFFER_MS  = 10 * 60 * 1000;      // refresh 10 min before expiry

// Module-level cache — survives across requests within the same serverless instance.
let cache: { token: string; expiresAt: number } | null = null;

export function clearNivodaTokenCache(): void {
  cache = null;
  console.log("[nivoda/auth] Token cache cleared");
}

async function fetchFreshToken(): Promise<string> {
  console.log('[nivoda/auth] fetchFreshToken start');

  const email    = process.env.NIVODA_EMAIL;
  const password = process.env.NIVODA_PASSWORD;
  const endpoint = getNivodaEndpoint();

  if (!email || !password) {
    throw new Error(
      `Nivoda auth: missing env var(s): ${[!email && "NIVODA_EMAIL", !password && "NIVODA_PASSWORD"].filter(Boolean).join(", ")}`
    );
  }

  const authQuery = `{ authenticate { username_and_password(username: "${email}", password: "${password}") { token } } }`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('[nivoda/auth] ABORTING — 10s timeout hit');
    controller.abort();
  }, 10000);

  let res: Response;
  let text: string;
  try {
    console.log('[nivoda/auth] calling fetch...');
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: authQuery }),
      signal: controller.signal,
    });
    console.log('[nivoda/auth] fetch resolved, status:', res.status);
    text = await res.text();
    console.log('[nivoda/auth] response text length:', text.length);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const e = err instanceof Error ? err : new Error(String(err));
    console.error('[nivoda/auth] fetch threw:', e.name, e.message);
    throw new Error(`Nivoda auth fetch failed: ${e.message}`);
  }

  clearTimeout(timeoutId);

  let json: { data?: { authenticate?: { username_and_password?: { token?: string } } }; errors?: Array<{ message: string }> };
  try {
    json = JSON.parse(text);
  } catch {
    console.error('[nivoda/auth] JSON parse failed, raw:', text.slice(0, 200));
    throw new Error('Nivoda auth response was not valid JSON');
  }

  if (json.errors?.length) {
    console.error('[nivoda/auth] GraphQL errors:', JSON.stringify(json.errors));
    throw new Error(`Nivoda auth GraphQL error: ${json.errors[0].message}`);
  }

  const token = json?.data?.authenticate?.username_and_password?.token;
  if (!token) {
    console.error('[nivoda/auth] No token in response:', text.slice(0, 300));
    throw new Error('Nivoda auth returned no token');
  }

  console.log('[nivoda/auth] Token obtained successfully');
  return token;
}

/**
 * Returns a valid Nivoda token, using the in-memory cache when possible.
 * Pass skipCache=true to force a fresh fetch (e.g. after an auth error).
 */
export async function getNivodaToken(skipCache = false): Promise<string> {
  const now = Date.now();

  if (!skipCache && cache && cache.expiresAt - now > REFRESH_BUFFER_MS) {
    const minsLeft = Math.round((cache.expiresAt - now) / 60_000);
    console.log(`[nivoda/auth] Using cached token (${minsLeft}m remaining)`);
    return cache.token;
  }

  const token = await fetchFreshToken();
  cache = { token, expiresAt: now + TOKEN_TTL_MS };
  console.log("[nivoda/auth] Token cached for 6 h");
  return token;
}
