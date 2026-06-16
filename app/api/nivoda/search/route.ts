import { NextRequest, NextResponse } from "next/server";
import { getNivodaToken, clearNivodaTokenCache, getNivodaEndpoint } from "@/lib/nivoda-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLORS    = ["D","E","F","G","H","I","J","K","L","M"] as const;
const CLARITIES = ["FL","IF","VVS1","VVS2","VS1","VS2","SI1","SI2","SI3","I1","I2","I3"] as const;

function expandRange(arr: readonly string[], from: string, to: string): string[] {
  const a = arr.indexOf(from), b = arr.indexOf(to);
  if (a === -1 && b === -1) return [from];
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

  // Accept array (multi-select UI) or single shape
  const shapesArr: string[] = Array.isArray(body.shapes)
    ? (body.shapes as string[]).map(s => String(s).toUpperCase())
    : [String(shape).toUpperCase()];

  // Accept explicit grade arrays from toggle UI, fall back to range expansion
  const colors: string[] = Array.isArray(body.colorGrades)
    ? (body.colorGrades as string[])
    : typeof body.colorGrades === "string"
      ? (body.colorGrades as string).split(",").map(s => s.trim()).filter(Boolean)
      : expandRange(COLORS, String(colorFrom), String(colorTo));

  const clarities: string[] = Array.isArray(body.clarityGrades)
    ? (body.clarityGrades as string[])
    : typeof body.clarityGrades === "string"
      ? (body.clarityGrades as string).split(",").map(s => s.trim()).filter(Boolean)
      : expandRange(CLARITIES, String(clarityFrom), String(clarityTo));
  const limitNum  = Math.min(Number(limit), 50);
  const offsetNum = Number(offset);

  // Quality filter defaults — UI can override by passing the key in the request body
  const cuts          = (body.cut as string[])             ?? ["EX", "ID", "EIGHTX"];
  const polishes      = (body.polish as string[])          ?? ["EX"];
  const symmetries    = (body.symmetry as string[])        ?? ["EX"];
  const fluorescences = (body.flouresence as string[])     ?? ["NON"];
  const eyeClean      = (body.eyeClean  as string)         ?? "Yes";
  const noBGM         = body.noBGM !== undefined ? Number(body.noBGM) : 1;
  const certLabs      = (body.certificate_lab as string[]) ?? ["GIA", "IGI"];
  const hasImage      = body.has_image !== undefined ? Boolean(body.has_image) : true;

  const budgetClause = budget
    ? `, max_price: { amount: ${Number(budget)}, currency: AUD }`
    : "";

  const query = `
    query NivodaSearch($token: String!) {
      as(token: $token) {
        diamonds_by_query(
          query: {
            labgrown: ${labgrown ? "true" : "false"}
            shapes: [${shapesArr.map(s => `"${s}"`).join(", ")}]
            sizes: { from: ${Number(caratFrom)}, to: ${Number(caratTo)} }
            color: [${colors.join(", ")}]
            clarity: [${clarities.join(", ")}]
            cut: [${cuts.join(", ")}]
            polish: [${polishes.join(", ")}]
            symmetry: [${symmetries.join(", ")}]
            flouresence: [${fluorescences.join(", ")}]
            eyeClean: ${eyeClean}
            noBGM: ${noBGM}
            certificate_lab: [${certLabs.join(", ")}]
            has_image: ${hasImage}
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
  console.log("[nivoda/search] Params:", { shapesArr, caratFrom, caratTo, labgrown, colors, clarities, limitNum, offsetNum });

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query, variables: { token } }),
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
      throw Object.assign(new Error(j.errors[0].message), { isAuthError: true });
    }
    return NextResponse.json(
      { error: j.errors[0].message, graphql_errors: j.errors },
      { status: 502 }
    );
  }

  const raw = j.data?.as?.diamonds_by_query;
  if (!raw) {
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
    shape:      item.diamond?.certificate?.shape     ?? shapesArr[0],
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

// GET handler — accepts the same filters as query params for browser testing
// e.g. /api/nivoda/search?shape=ROUND&caratFrom=0.5&caratTo=1&colorFrom=D&colorTo=H
export async function GET(req: NextRequest): Promise<NextResponse> {
  const p = new URL(req.url).searchParams;
  const body: Record<string, unknown> = {
    shape:       p.get("shape")       ?? "ROUND",
    caratFrom:   parseFloat(p.get("caratFrom") ?? "0.3"),
    caratTo:     parseFloat(p.get("caratTo")   ?? "5"),
    colorFrom:   p.get("colorFrom")   ?? "D",
    colorTo:     p.get("colorTo")     ?? "H",
    clarityFrom: p.get("clarityFrom") ?? "VVS1",
    clarityTo:   p.get("clarityTo")   ?? "SI1",
    labgrown:    p.get("labgrown") !== "false",
    limit:       parseInt(p.get("limit")  ?? "20"),
    offset:      parseInt(p.get("offset") ?? "0"),
  };
  if (p.has("budget")) body.budget = parseFloat(p.get("budget")!);

  try {
    const token = await getNivodaToken();
    try {
      return await runSearch(token, body);
    } catch (err) {
      if ((err as { isAuthError?: boolean }).isAuthError) {
        clearNivodaTokenCache();
        const freshToken = await getNivodaToken(true);
        return await runSearch(freshToken, body);
      }
      throw err;
    }
  } catch (err) {
    console.error("[nivoda/search] GET error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
