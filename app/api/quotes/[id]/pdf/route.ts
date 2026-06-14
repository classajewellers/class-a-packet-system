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
  console.log("[pdf/route] PDFSHIFT_API_KEY set:", !!apiKey);

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
  let pdfResponse: Response;
  try {
    pdfResponse = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: html,
        landscape: false,
        use_print: false,
        sandbox: false,
        disable_external_links: false,
        css: ".pdfshift-banner, [class*='pdfshift-'] { display: none !important; }",
      }),
    });
  } catch (fetchErr) {
    console.error("[pdf/route] fetch to PDFShift failed:", fetchErr);
    return NextResponse.json({ error: "Could not reach PDFShift" }, { status: 502 });
  }

  const responseContentType = pdfResponse.headers.get("content-type") ?? "";
  console.log("[pdf/route] PDFShift status:", pdfResponse.status, "content-type:", responseContentType);

  // Read the body once — inspect first 200 chars for debugging regardless of outcome
  const responseBuffer = await pdfResponse.arrayBuffer();
  const bodyPreview = new TextDecoder().decode(responseBuffer.slice(0, 200));
  console.log("[pdf/route] PDFShift body preview:", bodyPreview);

  // Treat as an error if: non-2xx status OR response is not a PDF
  if (!pdfResponse.ok || !responseContentType.includes("application/pdf")) {
    console.error(
      "[pdf/route] PDFShift returned non-PDF response.",
      "status:", pdfResponse.status,
      "content-type:", responseContentType,
      "body:", bodyPreview
    );
    return NextResponse.json(
      {
        error: `PDF generation failed (HTTP ${pdfResponse.status})`,
        detail: bodyPreview,
        contentType: responseContentType,
      },
      { status: 502 }
    );
  }

  return new NextResponse(responseBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${basename}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
