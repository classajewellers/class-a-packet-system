import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NIVODA_ENDPOINT = "https://intg-customer-staging.nivodaapi.net/api/diamonds";

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

async function getNivodaToken(): Promise<string> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/nivoda/auth`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Auth route returned ${res.status}`);
  const json = await res.json();
  if (!json.token) throw new Error(json.error ?? "No token returned from auth route");
  return json.token;
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
    } catch (e) {
      console.error("[nivoda/search] Failed to get token:", e);
      return NextResponse.json({ error: "Authentication failed" }, { status: 502 });
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

    console.log("[nivoda/search] Querying Nivoda:", { shape: shapeStr, caratFrom, caratTo, labgrown, limit, offset });

    const res = await fetch(NIVODA_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[nivoda/search] HTTP error:", res.status, text.slice(0, 300));
      return NextResponse.json({ error: `Nivoda API error ${res.status}` }, { status: 502 });
    }

    const json = await res.json();

    if (json.errors?.length) {
      console.error("[nivoda/search] GraphQL errors:", json.errors);
      return NextResponse.json({ error: json.errors[0].message }, { status: 502 });
    }

    const raw = json.data?.as?.diamonds_by_query;
    if (!raw) {
      console.error("[nivoda/search] Unexpected response shape:", JSON.stringify(json).slice(0, 300));
      return NextResponse.json({ results: [], total_count: 0 });
    }

    const results: NivodaResult[] = (raw.items ?? []).map((item: {
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
    }) => ({
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
