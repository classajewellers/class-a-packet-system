import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
      console.log("[generate-description] No content to generate from — returning empty");
      return NextResponse.json({ description: "" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[generate-description] ANTHROPIC_API_KEY is not set");
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    console.log("[generate-description] Calling Anthropic API, prompt preview:", prompt.slice(0, 200));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
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
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[generate-description] Anthropic API error:", response.status, errText);
      return NextResponse.json({ error: `Anthropic API error ${response.status}: ${errText}` }, { status: 500 });
    }

    const data = await response.json();
    console.log("[generate-description] Raw response content:", JSON.stringify(data.content));

    const description = data.content?.[0]?.text?.trim().replace(/\.$/, "") ?? "";
    console.log("[generate-description] Generated description:", description.slice(0, 150));

    return NextResponse.json({ description });
  } catch (err) {
    console.error("[generate-description] Caught error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
