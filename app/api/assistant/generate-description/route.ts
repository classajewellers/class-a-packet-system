import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { prompt } = await req.json();

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 300,
      system: "You are a professional jewellery valuer writing descriptions for official certificates of authenticity in Australia. Write precise, formal descriptions using correct jewellery industry terminology. Be specific and factual. Do not include pricing or opinions. Write exactly 2-3 sentences.",
      messages: [
        {
          role: "user",
          content: `Write a 2-3 sentence professional jewellery description for the following item:\n${prompt}`,
        },
      ],
    });

    const description = response.content[0].type === "text" ? response.content[0].text.trim() : "";
    return NextResponse.json({ description });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
