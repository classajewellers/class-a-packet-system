import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { itemType, subcategory, design, metals, mainStones, meleeStones, engraving } = body;

    const parts: string[] = [];
    if (itemType) parts.push(`Item type: ${subcategory || itemType}`);
    if (design) parts.push(`Design description: ${design}`);
    if (metals?.length) {
      const metalStr = metals
        .filter((m: { type: string; weight: string }) => m.type)
        .map((m: { type: string; weight: string }) => `${m.weight || "?"}g ${m.type}`)
        .join(" + ");
      if (metalStr) parts.push(`Metal: ${metalStr}`);
    }
    if (mainStones?.length) {
      const stoneStr = mainStones
        .filter((s: { caratWeight: string; shape: string; colour: string; clarity: string; origin: string }) => s.caratWeight)
        .map((s: { caratWeight: string; shape: string; colour: string; clarity: string; origin: string }) =>
          `${s.caratWeight}ct ${s.colour || ""} ${s.clarity || ""} ${s.origin || ""} ${s.shape || ""}`.replace(/\s+/g, " ").trim()
        )
        .join(", ");
      if (stoneStr) parts.push(`Main stone(s): ${stoneStr}`);
    }
    if (meleeStones?.length) {
      const meleeStr = meleeStones
        .filter((m: { stoneType: string; qty: string }) => m.stoneType && m.qty)
        .map((m: { stoneType: string; shape: string; quality: string; caratWeight: string; qty: string }) =>
          `${m.qty}× ${m.caratWeight || ""}ct ${m.shape || ""} ${m.stoneType} ${m.quality || ""}`.replace(/\s+/g, " ").trim()
        )
        .join(", ");
      if (meleeStr) parts.push(`Melee stones: ${meleeStr}`);
    }
    if (engraving?.hand) parts.push("Hand engraving");
    if (engraving?.laser) parts.push("Laser engraving");

    const prompt = parts.join(". ");
    if (!prompt.trim()) {
      return NextResponse.json({ description: "" });
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      system:
        "You are a jewellery sales consultant writing descriptions for custom jewellery quotes. Write a single polished sentence in the style of a high-end jewellery description. Use correct jewellery terminology. Be specific and evocative but concise. Output one sentence only — no full stops at the end.",
      messages: [
        {
          role: "user",
          content: `Write a single polished jewellery description sentence for this quote:\n${prompt}`,
        },
      ],
    });

    const description =
      response.content[0].type === "text" ? response.content[0].text.trim().replace(/\.$/, "") : "";
    return NextResponse.json({ description });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
