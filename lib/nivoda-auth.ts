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
  const endpoint = getNivodaEndpoint();
  const email    = process.env.NIVODA_EMAIL;
  const password = process.env.NIVODA_PASSWORD;

  if (!email || !password) {
    throw new Error(
      `Nivoda auth: missing env var(s): ${[!email && "NIVODA_EMAIL", !password && "NIVODA_PASSWORD"].filter(Boolean).join(", ")}`
    );
  }

  const query = `{ authenticate { username_and_password(username: "${email}", password: "${password}") { token } } }`;

  console.log("[nivoda/auth] Requesting token — endpoint:", endpoint, "user:", email);

  let res: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    res = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query }),
      signal:  controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Nivoda auth: request timed out after 10s");
    }
    throw new Error(`Nivoda auth: network error — ${err instanceof Error ? err.message : String(err)}`);
  }
  clearTimeout(timeout);

  const rawBody = await res.text();
  console.log("[nivoda/auth] HTTP", res.status, "body:", rawBody.slice(0, 500));

  if (!res.ok) {
    throw new Error(`Nivoda auth: HTTP ${res.status} ${res.statusText} — ${rawBody.slice(0, 200)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    throw new Error(`Nivoda auth: non-JSON response — ${rawBody.slice(0, 200)}`);
  }

  const j = json as {
    errors?: Array<{ message: string }>;
    data?:   { authenticate?: { username_and_password?: { token?: string } } };
  };

  if (j.errors?.length) {
    console.error("[nivoda/auth] GraphQL errors:", JSON.stringify(j.errors));
    throw new Error(`Nivoda auth GraphQL error: ${j.errors[0].message}`);
  }

  const token = j.data?.authenticate?.username_and_password?.token;
  if (!token) {
    console.error("[nivoda/auth] No token in response:", JSON.stringify(j));
    throw new Error(`Nivoda auth: no token returned — ${JSON.stringify(j)}`);
  }

  console.log("[nivoda/auth] Token acquired (first 20):", token.slice(0, 20) + "…");
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
