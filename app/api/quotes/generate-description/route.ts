import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { itemType, subcategory, design, metals, mainStones, stoneOptions, meleeStones, engraving, fingerSize, stockSku } = body;

    // Build structured data strings — no gram weights, no pricing
    const metalStr = (metals ?? [])
      .filter((m: { type: string }) => m.type)
      .map((m: { type: string }) => m.type)
      .join(" and ");

    const itemLabel = subcategory || itemType || "";

    type Stone = { caratWeight: string; shape: string; colour: string; clarity: string; origin: string };
    type StoneOpt = { label: string; stones: Stone[] };

    const formatStone = (s: Stone): string =>
      `${s.caratWeight}ct${s.colour ? ` ${s.colour}` : ""}${s.clarity ? `/${s.clarity}` : ""} ${s.shape || ""} ${s.origin || ""}`.replace(/\s+/g, " ").trim();

    // When multiple stone options exist, reference each explicitly
    const mainStoneStr = Array.isArray(stoneOptions) && stoneOptions.length > 1
      ? (stoneOptions as StoneOpt[])
          .map((opt, i) => {
            const stones = (opt.stones ?? []).filter((s: Stone) => s.caratWeight);
            const desc = stones.map(formatStone).join(", ");
            return `Option ${i + 1} (${opt.label || `Option ${i + 1}`}): ${desc}`;
          })
          .join("; ")
      : (mainStones ?? [])
          .filter((s: Stone) => s.caratWeight)
          .map(formatStone)
          .join(", ");

    type Melee = { stoneType: string; shape: string; quality: string; caratWeight: string; qty: string };
    const meleeStr = (meleeStones ?? [])
      .filter((m: Melee) => m.stoneType)
      .map((m: Melee) =>
        `${m.qty && m.qty !== "1" ? `${m.qty}× ` : ""}${m.caratWeight ? `${m.caratWeight}ct ` : ""}${m.shape ? `${m.shape} ` : ""}${m.stoneType}${m.quality ? ` ${m.quality}` : ""}`.replace(/\s+/g, " ").trim()
      )
      .join(", ");

    const hasContent = metalStr || itemLabel || mainStoneStr || design;
    if (!hasContent) {
      console.log("[generate-description] No content to generate from — returning empty");
      return NextResponse.json({ description: "" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[generate-description] ANTHROPIC_API_KEY is not set");
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const systemPrompt = `You write jewellery product descriptions for quote documents.

Output format: [Metal] [Design Name] [Item Type] set with a [carat]ct [colour]/[clarity] [shape] [Lab Grown / Natural] Diamond
- If two metals: "[Metal 1] and [Metal 2]"
- If multiple main stones within one option: list each stone separated by " and "
- If multiple stone OPTIONS are provided (e.g. "Option 1 (Lab Grown): ...; Option 2 (Natural): ..."): describe the item type and metal, then write "available with [Option 1 label] [stone specs] or [Option 2 label] [stone specs]" — reference every option explicitly
- If no stone: [Metal] [Design Name] [Item Type]
- If no metal name given: omit metal
- Capitalise metal type, stone shape, and item type
- Never mention gram weights, setting costs, labour, or pricing
- Never use adjectives like stunning, exquisite, featuring, boasting, beautiful
- If finger size is provided, append ", finger size [X]" at the end of the main description (before any stock SKU)
- If stock SKU is provided, append " — Ref: [SKU]" at the very end
- Only append finger size or stock SKU if they have values — omit entirely if empty
- One sentence maximum, output the description only — no preamble, no explanation, no punctuation at the end`;

    const userPrompt = [
      metalStr        && `Metal: ${metalStr}`,
      itemLabel       && `Item: ${itemLabel}`,
      design          && `Design name or notes: ${design}`,
      mainStoneStr    && `Main stone: ${mainStoneStr}`,
      meleeStr        && `Accent stones: ${meleeStr}`,
      fingerSize      && `Finger size: ${fingerSize}`,
      stockSku        && `Stock SKU: ${stockSku}`,
    ].filter(Boolean).join("\n");

    console.log("[generate-description] Calling Anthropic, data:\n", userPrompt);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 80,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
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
