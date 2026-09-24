export type RenderedDocument =
  | { kind: "pdf"; bytes: ArrayBuffer; filename: string }
  | { kind: "html"; html: string; filename: string; message: string };

/** Same PDFShift path quotes already use. Without a key, return printable HTML. */
export async function renderHtmlDocument(html: string, basename: string): Promise<RenderedDocument> {
  const safeName = basename.replace(/[^A-Za-z0-9_-]/g, "_") || "document";
  const apiKey = process.env.PDFSHIFT_API_KEY;
  if (!apiKey) {
    return {
      kind: "html",
      html,
      filename: `${safeName}.html`,
      message: "PDF service is not set up on this Preview. A printable page was downloaded instead.",
    };
  }

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
  });

  const contentType = pdfResponse.headers.get("content-type") ?? "";
  const bytes = await pdfResponse.arrayBuffer();
  if (!pdfResponse.ok || !contentType.includes("application/pdf")) {
    const preview = new TextDecoder().decode(bytes.slice(0, 180));
    throw new Error(`PDF generation failed (${pdfResponse.status}). ${preview}`);
  }

  return { kind: "pdf", bytes, filename: `${safeName}.pdf` };
}
