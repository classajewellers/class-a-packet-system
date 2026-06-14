import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { generateQuoteHTML } from "@/lib/quoteGenerator";
import { Quote } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const quote = data as Quote;
  const html = generateQuoteHTML(quote);

  const refNum = (quote.reference_number ?? "QUOTE").replace(/[^A-Za-z0-9_-]/g, "_");
  const lastName = (quote.customer_last_name ?? "").trim().replace(/\s+/g, "_") || "Customer";
  const basename = `Quote_${refNum}_${lastName}`;

  const apiKey = process.env.PDFSHIFT_API_KEY;

  // ── Fallback: no API key — return the HTML file directly ────────────────────
  if (!apiKey) {
    const fallbackHtml = `<!-- PDFShift API key not configured. Set PDFSHIFT_API_KEY in environment variables. -->\n${html}`;
    return new NextResponse(fallbackHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${basename}.html"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // ── PDFShift: convert HTML to PDF ────────────────────────────────────────────
  const credentials = Buffer.from(`${apiKey}:`).toString("base64");

  const pdfResponse = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: html,
      landscape: false,
      use_print: false,
    }),
  });

  if (!pdfResponse.ok) {
    const errText = await pdfResponse.text().catch(() => pdfResponse.statusText);
    console.error("[pdf/route] PDFShift error:", pdfResponse.status, errText);
    return NextResponse.json(
      { error: `PDF generation failed (${pdfResponse.status})` },
      { status: 502 }
    );
  }

  const pdfBuffer = await pdfResponse.arrayBuffer();

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${basename}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
