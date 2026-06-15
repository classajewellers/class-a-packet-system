/**
 * Shared Nivoda authentication utility.
 * Handles token fetching and in-memory caching.
 * Import getNivodaToken() from here — never fetch /api/nivoda/auth over HTTP.
 */

export const NIVODA_ENDPOINT = "https://integrations.nivoda.net/api/diamonds";

const TEN_MINUTES  = 10 * 60 * 1000;
const SIX_HOURS    =  6 * 60 * 60 * 1000;
const FETCH_TIMEOUT = 30_000; // 30 s — Nivoda can be slow to respond
const NIVODA_FALLBACK = "https://integrations.nivoda.net/graphql";

// In-memory cache — survives across requests within the same serverless instance.
let cache: { token: string; expiresAt: number } | null = null;

async function fetchFreshToken(): Promise<string> {
  const email    = process.env.NIVODA_EMAIL;
  const password = process.env.NIVODA_PASSWORD;

  if (!email || !password) {
    const missing = [!email && "NIVODA_EMAIL", !password && "NIVODA_PASSWORD"].filter(Boolean).join(", ");
    throw new Error(`Nivoda auth: missing environment variable(s): ${missing}`);
  }

  console.log("[nivoda/auth] Endpoint   :", NIVODA_ENDPOINT);
  console.log("[nivoda/auth] Username   :", email);
  console.log("[nivoda/auth] Timeout    :", FETCH_TIMEOUT, "ms");

  const query = `mutation {
    request_auth(username: "${email}", password: "${password}") {
      token
    }
  }`;

  const requestBody = JSON.stringify({ query });
  console.log("[nivoda/auth] Request body:", requestBody);

  async function attemptFetch(endpoint: string): Promise<Response> {
    const controller = new AbortController();
    const timeout    = setTimeout(() => {
      controller.abort();
      console.error(`[nivoda/auth] Fetch aborted — no response within ${FETCH_TIMEOUT}ms (${endpoint})`);
    }, FETCH_TIMEOUT);

    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":   "VaultJewellery/1.0",
        },
        body:   requestBody,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return r;
    } catch (err) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === "AbortError";
      console.error(`[nivoda/auth] Network error (${endpoint}):`, err);
      throw new Error(
        isAbort
          ? `Nivoda auth: request timed out after ${FETCH_TIMEOUT}ms (no response from ${endpoint})`
          : `Nivoda auth: network error — ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  console.log("[nivoda/auth] Trying primary endpoint:", NIVODA_ENDPOINT);
  let res: Response;
  try {
    res = await attemptFetch(NIVODA_ENDPOINT);
  } catch (primaryErr) {
    console.warn("[nivoda/auth] Primary endpoint failed, trying fallback:", NIVODA_FALLBACK);
    try {
      res = await attemptFetch(NIVODA_FALLBACK);
      console.log("[nivoda/auth] Fallback endpoint responded");
    } catch (fallbackErr) {
      // Throw the primary error — it's the canonical endpoint
      throw primaryErr;
    }
  }

  // Read body as text first so every failure path can log the full response.
  let rawBody: string;
  try {
    rawBody = await res.text();
  } catch (err) {
    console.error("[nivoda/auth] Failed to read response body:", err);
    throw new Error(`Nivoda auth: could not read response body (HTTP ${res.status})`);
  }

  console.log("[nivoda/auth] Response status :", res.status, res.statusText);
  console.log("[nivoda/auth] Response body   :", rawBody);

  if (!res.ok) {
    console.error("[nivoda/auth] Non-2xx from Nivoda");
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
      request_auth?: { token?: string };
    };
  };

  if (j.errors?.length) {
    console.error("[nivoda/auth] GraphQL errors:", JSON.stringify(j.errors, null, 2));
    throw new Error(`Nivoda auth GraphQL error: ${j.errors[0].message}`);
  }

  const token: string | undefined = j.data?.request_auth?.token;

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
