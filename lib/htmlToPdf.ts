export type RenderedDocument =
  | { kind: "pdf"; bytes: ArrayBuffer; filename: string }
  | { kind: "html"; html: string; filename: string; message: string };

function printable(html: string, safeName: string, message: string): RenderedDocument {
  return { kind: "html", html, filename: `${safeName}.html`, message };
}

function looksLikePdf(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 5) return false;
  return new TextDecoder().decode(bytes.slice(0, 5)).startsWith("%PDF");
}

/**
 * Same PDFShift path quotes already use. A missing key, a network error, or a
 * non-PDF response never throws: the caller still gets a printable HTML file.
 */
export async function renderHtmlDocument(html: string, basename: string): Promise<RenderedDocument> {
  const safeName = basename.replace(/[^A-Za-z0-9_-]/g, "_") || "document";
  const apiKey = process.env.PDFSHIFT_API_KEY;
  if (!apiKey) {
    return printable(html, safeName, "PDF service is not set up on this Preview, so a printable page is ready instead.");
  }

  try {
    const pdfResponse = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
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
      }),
      signal: AbortSignal.timeout(20000),
    });

    const bytes = await pdfResponse.arrayBuffer();
    const contentType = pdfResponse.headers.get("content-type") ?? "";
    if (!pdfResponse.ok || !contentType.includes("application/pdf") || !looksLikePdf(bytes)) {
      console.error("[html-to-pdf] PDFShift did not return a PDF", pdfResponse.status, contentType);
      return printable(html, safeName, "The PDF service did not return a PDF, so a printable page is ready instead.");
    }
    return { kind: "pdf", bytes, filename: `${safeName}.pdf` };
  } catch (err) {
    console.error("[html-to-pdf] PDFShift request failed", err instanceof Error ? err.message : err);
    return printable(html, safeName, "The PDF service could not be reached, so a printable page is ready instead.");
  }
}
