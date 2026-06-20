import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const { customerName, itemDescription, quotedPrice, followUpNotes, staffName } = body;

    if (!followUpNotes && !itemDescription) {
      return NextResponse.json({ error: "No content to generate from" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const systemPrompt = `You write polished follow-up emails for a fine jewellery boutique called Class A Jewellers / Vault.

Guidelines:
- Warm, professional tone — personal but not overly casual
- Reference the specific jewellery item and any customer notes provided
- Gently remind the customer that the quote is available and invite them to proceed or ask questions
- Keep the email concise — 3-4 short paragraphs
- Sign off with the staff member's name if provided, otherwise "The Vault Team"
- Do not mention pricing unless it was discussed in the notes
- Do not use phrases like "I hope this email finds you well" or "reach out" — be natural and direct
- Output only the email body (no subject line, no metadata)`;

    const priceNote = quotedPrice ? ` with a quoted price of $${Number(quotedPrice).toLocaleString("en-AU")}` : "";
    const userPrompt = [
      customerName         && `Customer: ${customerName}`,
      itemDescription      && `Item: ${itemDescription}${priceNote}`,
      followUpNotes        && `What was discussed / customer's wants: ${followUpNotes}`,
      staffName            && `Staff member sending the email: ${staffName}`,
    ].filter(Boolean).join("\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `Anthropic API error ${response.status}: ${errText}` }, { status: 500 });
    }

    const data = await response.json();
    const email = data.content?.[0]?.text?.trim() ?? "";

    return NextResponse.json({ email });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
