import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYSTEM_PROMPT = `You are a jewellery inventory assistant. Parse the description and return a JSON object with these fields (omit any field you cannot confidently determine):
{
  title: string,
  metal_type: string (e.g. Yellow Gold, White Gold, Rose Gold, Platinum, Silver),
  metal_karat: string (e.g. 18ct, 14ct, 9ct, 925),
  metal_colour: string (e.g. Yellow, White, Rose),
  metal_weight_grams: number,
  finger_size: string,
  chain_length: string,
  diamond_type: string (Natural or Lab Grown),
  diamond_carat: number,
  diamond_colour: string (e.g. D, E, F, G),
  diamond_clarity: string (e.g. IF, VVS1, VVS2, VS1, VS2),
  diamond_certificate: string,
  collection: string,
  notes: string
}
Return only valid JSON. No explanation, no markdown.`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const { description } = await req.json();
  if (!description || typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  let raw: string;
  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: description.trim() }],
    });
    const block = message.content[0];
    raw = block.type === "text" ? block.text : "";
  } catch (err: any) {
    console.error("[ai-parse] Anthropic error:", err?.message ?? err);
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }

  // Strip markdown code fences if present
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("[ai-parse] Failed to parse JSON:", cleaned);
    return NextResponse.json({ error: "AI returned invalid JSON", raw: cleaned }, { status: 502 });
  }

  // Only return known safe fields
  const allowed = [
    "title", "metal_type", "metal_karat", "metal_colour", "metal_weight_grams",
    "finger_size", "chain_length", "diamond_type", "diamond_carat",
    "diamond_colour", "diamond_clarity", "diamond_certificate", "collection", "notes",
  ];
  const result: Record<string, unknown> = {};
  for (const key of allowed) {
    if (parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== "") {
      result[key] = parsed[key];
    }
  }

  return NextResponse.json({ fields: result });
}
