/**
 * Shared Nivoda authentication utility.
 * Handles token fetching and in-memory caching.
 * Import getNivodaToken() from here — never fetch /api/nivoda/auth over HTTP.
 */

export const NIVODA_ENDPOINT = "https://integrations.nivoda.net/api/diamonds";

const TEN_MINUTES = 10 * 60 * 1000;
const SIX_HOURS   =  6 * 60 * 60 * 1000;

// In-memory cache — survives across requests within the same serverless instance.
let cache: { token: string; expiresAt: number } | null = null;

async function fetchFreshToken(): Promise<string> {
  const email    = process.env.NIVODA_EMAIL;
  const password = process.env.NIVODA_PASSWORD;

  if (!email || !password) {
    throw new Error("NIVODA_EMAIL or NIVODA_PASSWORD environment variable not set");
  }

  console.log("[nivoda/auth] Endpoint :", NIVODA_ENDPOINT);
  console.log("[nivoda/auth] Username :", email);

  const query = `{
    authenticate {
      username_and_password(
        username: "${email}",
        password: "${password}"
      ) {
        token
      }
    }
  }`;

  const res = await fetch(NIVODA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const rawBody = await res.text();

  console.log("[nivoda/auth] Response status :", res.status, res.statusText);
  console.log("[nivoda/auth] Response body   :", rawBody);

  if (!res.ok) {
    console.error("[nivoda/auth] Non-2xx from Nivoda — full body above");
    throw new Error(`Nivoda auth HTTP ${res.status} ${res.statusText}: ${rawBody}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    console.error("[nivoda/auth] Response is not valid JSON");
    throw new Error(`Nivoda auth: non-JSON response (HTTP ${res.status}): ${rawBody.slice(0, 500)}`);
  }

  const j = json as {
    errors?: Array<{ message: string; [k: string]: unknown }>;
    data?: {
      authenticate?: {
        username_and_password?: { token?: string };
      };
    };
  };

  if (j.errors?.length) {
    console.error("[nivoda/auth] GraphQL errors:", JSON.stringify(j.errors, null, 2));
    throw new Error(`Nivoda auth GraphQL error: ${j.errors[0].message}`);
  }

  const token: string | undefined = j.data?.authenticate?.username_and_password?.token;

  if (!token) {
    console.error("[nivoda/auth] No token in response — full JSON:", JSON.stringify(j, null, 2));
    throw new Error(`Nivoda auth: no token in response — ${JSON.stringify(j)}`);
  }

  return token;
}

/**
 * Returns a valid Nivoda token, using the in-memory cache when possible.
 * @param skipCache - Force a fresh token even if the cache is valid (e.g. for debug endpoints).
 */
export async function getNivodaToken(skipCache = false): Promise<string> {
  const now = Date.now();

  if (!skipCache && cache && cache.expiresAt - now > TEN_MINUTES) {
    const remainingMin = Math.round((cache.expiresAt - now) / 60_000);
    console.log(`[nivoda/auth] Returning cached token (${remainingMin}m remaining)`);
    return cache.token;
  }

  console.log("[nivoda/auth] Fetching new token from Nivoda…");
  const token = await fetchFreshToken();
  cache = { token, expiresAt: now + SIX_HOURS };
  console.log("[nivoda/auth] Token cached for 6h");
  return token;
}
