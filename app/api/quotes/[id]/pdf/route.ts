import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { generateQuoteHTML } from "@/lib/quoteGenerator";
import { Quote } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

async function getExecutablePath(): Promise<string> {
  // Vercel / Lambda serverless environment
  if (process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = await import("@sparticuz/chromium");
    return chromium.default.executablePath();
  }
  // Local development: use system Chrome
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  if (process.platform === "win32") {
    return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  }
  return "/usr/bin/google-chrome";
}

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

  const executablePath = await getExecutablePath();

  // Import dynamically — keeps these out of the client bundle
  const chromium = await import("@sparticuz/chromium");
  const puppeteer = await import("puppeteer-core");

  // Disable graphics rendering for serverless (no GPU)
  chromium.default.setGraphicsMode = false;

  const browser = await puppeteer.default.launch({
    args: chromium.default.args,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    // Use print media so the pdf-bar is hidden and print CSS applies
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "load" });

    const pdfBuffer = await page.pdf({
      // The quoteGenerator CSS sets @page { size: 148mm 210mm } (A5)
      printBackground: true,
      preferCSSPageSize: true,
    });

    const refNum = (quote.reference_number ?? "QUOTE").replace(/[^A-Za-z0-9_-]/g, "_");
    const lastName = (quote.customer_last_name ?? "").trim().replace(/\s+/g, "_") || "Customer";
    const filename = `Quote_${refNum}_${lastName}.pdf`;

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } finally {
    await browser.close();
  }
}
