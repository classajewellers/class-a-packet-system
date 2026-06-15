import { NextRequest, NextResponse } from "next/server";
import { getNivodaToken, clearNivodaTokenCache, getNivodaEndpoint } from "@/lib/nivoda-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLORS    = ["D","E","F","G","H","I","J","K"] as const;
const CLARITIES = ["FL","IF","VVS1","VVS2","VS1","VS2","SI1","SI2"] as const;

function expandRange(arr: readonly string[], from: string, to: string): string[] {
  const a = arr.indexOf(from), b = arr.indexOf(to);
  if (a === -1 && b === -1) return [];
  if (a === -1) return [to];
  if (b === -1) return [from];
  return [...arr.slice(Math.min(a, b), Math.max(a, b) + 1)];
}

export interface NivodaResult {
  id: string;
  price: number;
  carats: number;
  shape: string;
  color: string;
  clarity: string;
  cut: string | null;
  polish: string | null;
  symmetry: string | null;
  lab: string | null;
  certNumber: string | null;
  image: string | null;
  video: string | null;
}

async function runSearch(token: string, body: Record<string, unknown>): Promise<NextResponse> {
  const {
    shape       = "ROUND",
    caratFrom   = 0.3,
    caratTo     = 5,
    colorFrom   = "D",
    colorTo     = "H",
    clarityFrom = "VVS1",
    clarityTo   = "SI1",
    labgrown    = true,
    budget,
    limit       = 20,
    offset      = 0,
  } = body;

  const colors    = expandRange(COLORS,    String(colorFrom),    String(colorTo));
  const clarities = expandRange(CLARITIES, String(clarityFrom),  String(clarityTo));
  const shapeStr  = (String(shape)).toUpperCase();
  const limitNum  = Math.min(Number(limit), 50);
  const offsetNum = Number(offset);

  // Build query — enum values (shapes, color, clarity) must be inlined, not passed as string vars.
  // Token is passed as a variable so it doesn't need escaping.
  const budgetClause = budget
    ? `, max_price: { amount: ${Number(budget)}, currency: AUD }`
    : "";

  const query = `
    query NivodaSearch($token: String!) {
      as(token: $token) {
        diamonds_by_query(
          query: {
            labgrown: ${labgrown ? "true" : "false"}
            shapes: [${shapeStr}]
            sizes: { from: ${Number(caratFrom)}, to: ${Number(caratTo)} }
            color: [${colors.join(", ")}]
            clarity: [${clarities.join(", ")}]
            availability: AVAILABLE${budgetClause}
          }
          limit: ${limitNum}
          offset: ${offsetNum}
          order: { type: price, direction: ASC }
        ) {
          total_count
          items {
            id
            price
            diamond {
              availability
              image
              video
              certificate {
                lab
                certNumber
                shape
                carats
                clarity
                color
                cut
                polish
                symmetry
              }
            }
          }
        }
      }
    }
  `;

  const endpoint = getNivodaEndpoint();
  console.log("[nivoda/search] Endpoint:", endpoint);
  console.log("[nivoda/search] Params:", { shapeStr, caratFrom, caratTo, labgrown, colors, clarities, limitNum, offsetNum });

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query, variables: { token } }),
      signal:  AbortSignal.timeout?.(30_000),
    });
  } catch (err) {
    throw new Error(`Nivoda search: network error — ${err instanceof Error ? err.message : String(err)}`);
  }

  const rawBody = await res.text();
  console.log("[nivoda/search] HTTP", res.status, "body:", rawBody.slice(0, 1000));

  if (!res.ok) {
    return NextResponse.json(
      { error: `Nivoda API error ${res.status} ${res.statusText}`, detail: rawBody.slice(0, 500) },
      { status: 502 }
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Nivoda returned non-JSON response" }, { status: 502 });
  }

  const j = json as {
    errors?: Array<{ message: string; extensions?: { code?: string } }>;
    data?:   { as?: { diamonds_by_query?: { total_count?: number; items?: unknown[] } } };
  };

  if (j.errors?.length) {
    console.error("[nivoda/search] GraphQL errors:", JSON.stringify(j.errors, null, 2));
    const isAuthError = j.errors.some(e =>
      /auth|token|unauthori[sz]ed|forbidden/i.test(e.message) ||
      e.extensions?.code === "UNAUTHENTICATED"
    );
    if (isAuthError) {
      // Signal to the caller that it should retry with a fresh token
      throw Object.assign(new Error(j.errors[0].message), { isAuthError: true });
    }
    return NextResponse.json(
      { error: j.errors[0].message, graphql_errors: j.errors },
      { status: 502 }
    );
  }

  const raw = j.data?.as?.diamonds_by_query;
  if (!raw) {
    // Empty / unexpected shape — return gracefully
    console.warn("[nivoda/search] No diamonds_by_query in response:", JSON.stringify(j).slice(0, 500));
    return NextResponse.json({ results: [], total_count: 0 });
  }

  type RawItem = {
    id: string; price: number;
    diamond: {
      image?: string; video?: string;
      certificate: { lab?: string; certNumber?: string; shape?: string; carats?: number; clarity?: string; color?: string; cut?: string; polish?: string; symmetry?: string };
    };
  };

  const results: NivodaResult[] = ((raw.items ?? []) as RawItem[]).map(item => ({
    id:         item.id,
    price:      item.price,
    carats:     item.diamond?.certificate?.carats    ?? 0,
    shape:      item.diamond?.certificate?.shape     ?? shapeStr,
    color:      item.diamond?.certificate?.color     ?? "",
    clarity:    item.diamond?.certificate?.clarity   ?? "",
    cut:        item.diamond?.certificate?.cut       ?? null,
    polish:     item.diamond?.certificate?.polish    ?? null,
    symmetry:   item.diamond?.certificate?.symmetry  ?? null,
    lab:        item.diamond?.certificate?.lab       ?? null,
    certNumber: item.diamond?.certificate?.certNumber ?? null,
    image:      item.diamond?.image                  ?? null,
    video:      item.diamond?.video                  ?? null,
  }));

  console.log(`[nivoda/search] Returning ${results.length} of ${raw.total_count ?? 0} total`);
  return NextResponse.json({ results, total_count: raw.total_count ?? 0 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    // Attempt 1 — use cached token
    let token: string;
    try {
      token = await getNivodaToken();
    } catch (authErr) {
      console.error("[nivoda/search] Auth failed:", authErr);
      return NextResponse.json(
        { error: "Nivoda authentication failed. Please try again." },
        { status: 502 }
      );
    }

    try {
      return await runSearch(token, body);
    } catch (err) {
      // If search returned an auth error, clear cache and retry once with fresh token
      if ((err as { isAuthError?: boolean }).isAuthError) {
        console.warn("[nivoda/search] Auth error on search — clearing cache and retrying");
        clearNivodaTokenCache();
        const freshToken = await getNivodaToken(true);
        return await runSearch(freshToken, body);
      }
      throw err;
    }
  } catch (err) {
    console.error("[nivoda/search] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
