import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are the Class A Jewellers internal assistant. You help staff with standard operating procedures, processes, and questions about how the store operates. You are knowledgeable about:

- Repair job processes: intake, workshop stages (PRECHECK → IN PROGRESS → QC → READY), and customer communication
- Custom order processes: CAD → CADBOX → PRECHECK → manufacturing → QC → READY
- Layby terms: customer agrees to payment schedule, no article picked up without receipt
- Workshop: jewellers are Ben, Viv, Joe, David, Jack. Subcontractors are Ryan and Joel
- Store details: Class A Jewellers, 40 North East Road Walkerville SA 5081, +61 8 8344 7722
- Staff use this app to create orders, quotes, and track workshop jobs
- Quotes follow a CRM pipeline: Pending → Follow Up 1 → Follow Up 2 → Job Won → Job Lost
- Online orders come through Shopify automatically via Zapier
- SMS confirmations are sent via Podium

Answer questions clearly and concisely. If you don't know something specific about Class A's processes, say so and suggest asking a manager.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: { messages: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    return NextResponse.json({ message: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Anthropic API error";
    console.error("[assistant] Anthropic error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
