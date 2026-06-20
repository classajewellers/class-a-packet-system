import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { generateQuoteHTML, BankDetails } from "@/lib/quoteGenerator";
import { Quote } from "@/lib/types";

export const dynamic = "force-dynamic";

async function generatePDF(
  req: NextRequest,
  params: { id: string },
  size: "a4" | "a5" = "a4"
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  const supabase = await createTenantSupabaseClient(tenantId);

  const q = supabase.from("quotes").select("*").eq("id", params.id);
  const { data, error } = await (tenantId ? q.eq("tenant_id", tenantId) : q).single();

  if (error || !data) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  const quote = data as Quote;
  const isA5 = size === "a5";

  // Fetch bank details from the tenant record
  let bankDetails: BankDetails | null = null;
  if (tenantId) {
    const { data: tenant } = await supabase.from("tenants").select("bank_name,account_name,bsb,account_number").eq("id", tenantId).single();
    if (tenant && (tenant.bank_name || tenant.bsb || tenant.account_number)) {
      bankDetails = tenant as BankDetails;
    }
  }

  const html = generateQuoteHTML(quote, {
    payment_link_url: quote.stripe_payment_link_url ?? null,
    deposit_amount: quote.deposit_amount ?? null,
    hidePayment: isA5,
    bankDetails,
  });

  const refNum = (quote.reference_number ?? "QUOTE").replace(/[^A-Za-z0-9_-]/g, "_");
  const lastName = (quote.customer_last_name ?? "").trim().replace(/\s+/g, "_") || "Customer";
  const basename = `Quote_${refNum}_${lastName}_${size.toUpperCase()}`;

  const apiKey = process.env.PDFSHIFT_API_KEY;
  console.log("[pdf/route] PDFSHIFT_API_KEY set:", !!apiKey, "size:", size);

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

  // ── Build PDFShift request body based on size ────────────────────────────────
  const pdfShiftBody: Record<string, unknown> = {
    source: html,
    landscape: false,
    use_print: false,
    sandbox: false,
    css: isA5
      ? ".pdf-bar, .pdfshift-banner, [class*='pdfshift-'], .pay-now-btn, .payment-link, [class*='pay-now'], [class*='payment'] { display: none !important; }"
      : ".pdf-bar, .pdfshift-banner, [class*='pdfshift-'] { display: none !important; }",
  };
  if (isA5) {
    pdfShiftBody.format = "A5";
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
      body: JSON.stringify(pdfShiftBody),
    });
  } catch (fetchErr) {
    console.error("[pdf/route] fetch to PDFShift failed:", fetchErr);
    return NextResponse.json({ error: "Could not reach PDFShift" }, { status: 502 });
  }

  const responseContentType = pdfResponse.headers.get("content-type") ?? "";
  console.log("[pdf/route] PDFShift status:", pdfResponse.status, "content-type:", responseContentType);

  const responseBuffer = await pdfResponse.arrayBuffer();
  const bodyPreview = new TextDecoder().decode(responseBuffer.slice(0, 200));
  console.log("[pdf/route] PDFShift body preview:", bodyPreview);

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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return generatePDF(req, params, "a4");
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  let size: "a4" | "a5" = "a4";
  try {
    const body = await req.json();
    if (body?.size === "a5") size = "a5";
  } catch { /* no body — default to a4 */ }
  return generatePDF(req, params, size);
}
