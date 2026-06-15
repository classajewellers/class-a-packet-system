import { NextRequest, NextResponse } from "next/server";
import { getNivodaToken, clearNivodaTokenCache, NIVODA_ENDPOINT } from "@/lib/nivoda-auth";

export const dynamic = "force-dynamic";

const COLORS    = ["D", "E", "F", "G", "H", "I", "J", "K"] as const;
const CLARITIES = ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2"] as const;

function expandRange(arr: readonly string[], from: string, to: string): string[] {
  const a = arr.indexOf(from);
  const b = arr.indexOf(to);
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

export interface SearchResponse {
  results: NivodaResult[];
  total_count: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
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

    const colors    = expandRange(COLORS,    colorFrom,    colorTo);
    const clarities = expandRange(CLARITIES, clarityFrom,  clarityTo);

    const colorList   = colors.map(c => `"${c}"`).join(", ");
    const clarityList = clarities.map(c => `"${c}"`).join(", ");
    const shapeStr    = (shape as string).toUpperCase();

    let token: string;
    try {
      token = await getNivodaToken();
      console.log("[nivoda/search] Got token (first 20 chars):", token.slice(0, 20) + "…");
    } catch (e) {
      console.error("[nivoda/search] Failed to get token:", e);
      clearNivodaTokenCache();
      return NextResponse.json(
        { error: "Authentication failed", detail: e instanceof Error ? e.message : String(e) },
        { status: 502 }
      );
    }

    const budgetFilter = budget ? `\n        max_price: { amount: ${Number(budget)}, currency: AUD }` : "";

    const query = `{
  as(token: "${token}") {
    diamonds_by_query(
      query: {
        labgrown: ${labgrown ? "true" : "false"},
        shapes: [${shapeStr}],
        sizes: { from: ${caratFrom}, to: ${caratTo} },
        color: [${colorList}],
        clarity: [${clarityList}],
        availability: AVAILABLE,
        preferredCurrency: AUD${budgetFilter}
      }
      limit: ${Math.min(Number(limit), 50)}
      offset: ${Number(offset)}
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
}`;

    console.log("[nivoda/search] Endpoint:", NIVODA_ENDPOINT);
    console.log("[nivoda/search] Params:", { shape: shapeStr, caratFrom, caratTo, labgrown, limit, offset, colors, clarities });
    console.log("[nivoda/search] Full GraphQL query:\n" + query);

    const res = await fetch(NIVODA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    // Read body as text first so we can always log the full raw response.
    const rawBody = await res.text();

    console.log("[nivoda/search] Response status:", res.status, res.statusText);
    console.log("[nivoda/search] Raw response body:", rawBody);

    if (!res.ok) {
      console.error("[nivoda/search] Non-2xx from Nivoda — full body above");
      return NextResponse.json(
        { error: `Nivoda API error ${res.status} ${res.statusText}`, nivoda_response: rawBody },
        { status: 502 }
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      console.error("[nivoda/search] Response is not valid JSON");
      return NextResponse.json(
        { error: "Nivoda returned non-JSON response", nivoda_response: rawBody },
        { status: 502 }
      );
    }

    const j = json as {
      errors?: Array<{ message: string; [k: string]: unknown }>;
      data?: { as?: { diamonds_by_query?: unknown } };
    };

    if (j.errors?.length) {
      console.error("[nivoda/search] GraphQL errors:", JSON.stringify(j.errors, null, 2));
      // Clear cache on auth errors so the next request fetches a fresh token.
      const isAuthError = j.errors.some(e =>
        /auth|token|unauthori[sz]ed|forbidden/i.test(e.message)
      );
      if (isAuthError) {
        console.warn("[nivoda/search] Auth-related GraphQL error — clearing token cache");
        clearNivodaTokenCache();
      }
      return NextResponse.json(
        { error: j.errors[0].message, graphql_errors: j.errors },
        { status: 502 }
      );
    }

    const raw = (j.data?.as as { diamonds_by_query?: { total_count?: number; items?: unknown[] } } | undefined)?.diamonds_by_query;
    if (!raw) {
      console.error("[nivoda/search] Unexpected response shape — full JSON:", JSON.stringify(j, null, 2));
      return NextResponse.json(
        { error: "Unexpected response shape from Nivoda", nivoda_response: j },
        { status: 502 }
      );
    }

    type RawItem = {
      id: string;
      price: number;
      diamond: {
        image?: string;
        video?: string;
        certificate: {
          lab?: string;
          certNumber?: string;
          shape?: string;
          carats?: number;
          clarity?: string;
          color?: string;
          cut?: string;
          polish?: string;
          symmetry?: string;
        };
      };
    };
    const results: NivodaResult[] = ((raw.items ?? []) as RawItem[]).map((item) => ({
      id:         item.id,
      price:      item.price,
      carats:     item.diamond?.certificate?.carats ?? 0,
      shape:      item.diamond?.certificate?.shape  ?? shapeStr,
      color:      item.diamond?.certificate?.color  ?? "",
      clarity:    item.diamond?.certificate?.clarity ?? "",
      cut:        item.diamond?.certificate?.cut    ?? null,
      polish:     item.diamond?.certificate?.polish ?? null,
      symmetry:   item.diamond?.certificate?.symmetry ?? null,
      lab:        item.diamond?.certificate?.lab    ?? null,
      certNumber: item.diamond?.certificate?.certNumber ?? null,
      image:      item.diamond?.image ?? null,
      video:      item.diamond?.video ?? null,
    }));

    console.log(`[nivoda/search] Returning ${results.length} of ${raw.total_count} total`);
    return NextResponse.json({ results, total_count: raw.total_count ?? 0 });
  } catch (err) {
    console.error("[nivoda/search] Caught error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
