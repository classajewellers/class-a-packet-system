import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "extract_melee_price_rows",
  description:
    "Extract structured melee/small-stone price rows from a supplier price list document.",
  input_schema: {
    type: "object" as const,
    required: [
      "rows",
      "suggested_supplier_name",
      "supplier_confidence",
      "suggested_origin",
      "origin_confidence",
    ],
    properties: {
      suggested_supplier_name: {
        type: "string",
        description:
          "Supplier name as found in the document header, letterhead, or footer. " +
          "If the name matches one of the known suppliers exactly, use that exact known name. " +
          "If a supplier name is visible but doesn't match any known supplier, report it anyway. " +
          "If no supplier name is visible anywhere in the document, return empty string.",
      },
      supplier_confidence: {
        type: "string",
        enum: ["certain", "ambiguous"],
        description:
          "'certain' = clear supplier name found in the document. " +
          "'ambiguous' = no supplier name visible, or the name is unclear.",
      },
      suggested_origin: {
        type: "string",
        enum: ["natural", "lab"],
        description:
          "Origin inferred from the document itself (text, header, branding, or detected supplier name). " +
          "Use the supplier's apparent origin when the document has no explicit signal " +
          "(e.g. 'Grown Diamonds' or 'lab' in the name → lab, 'Sapphire Export' or 'Natural' → natural).",
      },
      origin_confidence: {
        type: "string",
        enum: ["certain", "inferred_from_supplier", "ambiguous"],
        description:
          "'certain' = document explicitly states natural/lab. " +
          "'inferred_from_supplier' = no document signal, inferred from supplier name/branding. " +
          "'ambiguous' = document contains conflicting signals.",
      },
      origin_conflict_note: {
        type: "string",
        description:
          "If origin_confidence is 'ambiguous', describe the conflicting signals found.",
      },
      rows: {
        type: "array",
        items: {
          type: "object",
          required: [
            "shape",
            "size_type",
            "size_label",
            "size_from",
            "size_to",
            "quality",
            "price_per_carat",
            "flagged",
          ],
          properties: {
            shape: {
              type: "string",
              description:
                "Diamond shape exactly as listed (round, oval, cushion, princess, pear, " +
                "emerald, marquise, radiant, baguette, tapered baguette, hexagon, cadillac, " +
                "half moon, kite, triangle, trilliant, heart, or other). Use lowercase.",
            },
            size_type: {
              type: "string",
              enum: ["carat_range", "pieces_per_carat", "points"],
              description:
                "'carat_range' when the row is expressed as a carat band (e.g. 0.025-0.03ct, 0.10-0.14ct). " +
                "'pieces_per_carat' when expressed as pieces-per-carat (e.g. 200pc-150pc) — this is an INVERSE relationship: more pieces per carat = smaller stones. " +
                "'points' when the label uses jewellery points (e.g. '20 pts', '25pt', '30 pts') — 1 point = 0.01 carat. This is a DIRECT unit, completely different from pieces_per_carat. " +
                "NEVER confuse points with pieces_per_carat. NEVER silently convert between conventions.",
            },
            size_label: {
              type: "string",
              description:
                "Size exactly as it appears in the document (e.g. '200pc-150pc', '0.025-0.03ct', '20 pts').",
            },
            size_from: {
              type: "number",
              description:
                "Numeric lower bound in the convention's NATIVE unit — do NOT convert. " +
                "For carat_range: lower carat value (e.g. 0.025). " +
                "For pieces_per_carat: the smaller pcs/ct number (fewer pieces = larger stones). " +
                "For points: the lower point value as printed (e.g. 20 for '20 pts'). The confirm route converts points to carats; you output the raw number.",
            },
            size_to: {
              type: "number",
              description:
                "Numeric upper bound in the convention's NATIVE unit — do NOT convert. " +
                "For carat_range: upper carat value. " +
                "For pieces_per_carat: the larger pcs/ct number. " +
                "For points: the upper point value as printed. For a single point label (e.g. '20 pts' with no range), set size_from and size_to to the same value.",
            },
            quality: {
              type: "string",
              description:
                "Quality grade as stated in the document (e.g. 'DEF/VS', 'EF SI', 'FG VVS'). " +
                "Use 'unspecified' if the document lists no quality for this row.",
            },
            price_per_carat: {
              type: "number",
              description: "Price per carat in AUD as a positive number.",
            },
            flagged: {
              type: "boolean",
              description:
                "true if this row is ambiguous or uncertain — e.g. a merged/spanning cell, " +
                "unclear size convention, shape not clearly identifiable, or implausible price.",
            },
            flag_reason: {
              type: "string",
              description: "Required when flagged=true. Describe what is ambiguous.",
            },
          },
        },
      },
    },
  },
};

function buildSystemPrompt(knownSupplierNames: string[]): string {
  const supplierList =
    knownSupplierNames.length > 0
      ? knownSupplierNames.map((n) => `- ${n}`).join("\n")
      : "(none provided)";

  return `You are extracting melee/small-stone diamond price data from a supplier price list for Class A Jewellers.

Known suppliers:
${supplierList}

TRANSCRIPTION-ONLY RULE (most important rule — read this first):
You are a transcription tool, not a knowledge tool. Every value you output — every price, shape, size, quality grade, and supplier name — must be something you can literally see and read in the uploaded document right now. You must NOT recall, complete, supplement, or fill in values from your training data, prior knowledge of supplier price lists, or recognition of a document's style. If a cell is partially visible, illegible, cut off, or a table does not fully render in the image, flag that row as unreadable — do not fill it in from memory. Even if you recognise the document's format or think you know what a missing value should be, that knowledge must not appear in your output. Only what you can read.

SUPPLIER DETECTION: Look only for a company name that is explicitly visible as text in the document — in a header, letterhead, title, footer, or printed label. If you can read a company name that matches one of the known suppliers above, use that exact known name. If a name is visible but does not match any known supplier, report it as-is. You must NOT infer or guess the supplier from pricing conventions, quality-grade styles, table structure, price levels, or any content-based signal — those are not reliable identifiers and using them has caused real data errors. If no company name is explicitly readable in the document, return empty string and set supplier_confidence to 'ambiguous'.

ORIGIN DETECTION:
- If the document explicitly states "natural", "mined", "lab", "lab-grown", "CVD", "HPHT" etc.: origin_confidence = 'certain'.
- If the supplier name (as read from the document, not inferred) strongly implies an origin (e.g. "Grown Diamonds" or "lab" in the name → lab; "Sapphire Export", "Natural Diamonds" → natural): origin_confidence = 'inferred_from_supplier'.
- If neither signal is present or they conflict: origin_confidence = 'ambiguous'.

CRITICAL EXTRACTION RULES:
1. Preserve the exact size convention — 'pieces_per_carat' for rows like "200pc-150pc" (inverse relationship, MORE pieces = SMALLER stones), 'carat_range' for rows like "0.025-0.03ct", 'points' for rows like "20 pts" or "25pt" (1 point = 0.01ct, a direct unit). NEVER confuse points with pieces_per_carat — they are unrelated conventions. For points, output the raw point number in size_from/size_to (e.g. 20 for "20 pts"); conversion to carats happens server-side.
2. Every row must have a shape. If a table has a header shape covering multiple rows, apply it to each row.
3. price_per_carat is always in AUD per carat.
4. Flag any row you are not fully confident about rather than guessing silently. If a cell is illegible or a value is not clearly readable, flag the row — do not fill it from memory.
5. If the document contains conflicting origin signals, set origin_confidence to 'ambiguous' and describe in origin_conflict_note.
6. POA cells (Price on Application): set price_per_carat to 0, flagged to true, flag_reason to "POA — price on application, no numeric value". NEVER save a POA cell as a real price. This applies even if only one quality column in a row is POA — flag that entire row.`;
}

interface FileExtractionResult {
  file_name: string;
  rows: unknown[];
  suggested_supplier_name: string;
  supplier_confidence: string;
  suggested_origin: string;
  origin_confidence: string;
  origin_conflict_note: string | null;
}

async function extractSingleFile(
  file: File,
  client: Anthropic,
  systemPrompt: string
): Promise<FileExtractionResult> {
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const isPdf = file.type === "application/pdf";

  const fileContent: Anthropic.MessageParam["content"][number] = isPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: file.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data: base64,
        },
      };

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 16000,
    system: systemPrompt,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "extract_melee_price_rows" },
    messages: [
      {
        role: "user",
        content: [
          fileContent,
          {
            type: "text",
            text: "Extract all melee stone price rows from this price list. Call extract_melee_price_rows with the complete structured data.",
          },
        ],
      },
    ],
  });

  // Diagnostic — always log so we can see stop_reason, token usage, and row count in Vercel logs.
  // DO NOT remove until the 13,998-row explosion root cause is confirmed and fixed.
  console.log(
    `[melee-extract] file="${file.name}" stop_reason=${response.stop_reason}` +
    ` input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens}`
  );

  // Problem A fix: if the response was truncated (max_tokens), the tool input is
  // incomplete or malformed — do NOT silently accept it.
  if (response.stop_reason === "max_tokens") {
    console.error(`[melee-extract] TRUNCATED: output_tokens=${response.usage.output_tokens} for file="${file.name}"`);
    throw new Error(
      `Extraction was cut off mid-response for "${file.name}" — the output exceeded the length limit. ` +
      `Try splitting the file into smaller sections, or contact support.`
    );
  }

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return {
      file_name: file.name,
      rows: [],
      suggested_supplier_name: "",
      supplier_confidence: "ambiguous",
      suggested_origin: "natural",
      origin_confidence: "ambiguous",
      origin_conflict_note: `AI extraction did not return structured data for "${file.name}".`,
    };
  }

  const extracted = toolUse.input as {
    rows: unknown[];
    suggested_supplier_name: string;
    supplier_confidence: string;
    suggested_origin: string;
    origin_confidence: string;
    origin_conflict_note?: string;
  };

  const rows = extracted.rows ?? [];

  // Diagnostic — log row count and first/last rows to identify repetition loops or blank-row floods.
  // DO NOT remove until root cause confirmed.
  console.log(`[melee-extract] file="${file.name}" row_count=${rows.length}`);
  if (rows.length > 0) {
    console.log(`[melee-extract] first_row=${JSON.stringify(rows[0])}`);
    console.log(`[melee-extract] last_row=${JSON.stringify(rows[rows.length - 1])}`);
    if (rows.length > 1) {
      // Check for repetition: are rows 0 and 1 identical?
      console.log(`[melee-extract] second_row=${JSON.stringify(rows[1])}`);
      const row0str = JSON.stringify(rows[0]);
      const repeating = rows.slice(0, Math.min(10, rows.length)).every(r => JSON.stringify(r) === row0str);
      console.log(`[melee-extract] first_10_all_identical=${repeating}`);
    }
  }

  return {
    file_name: file.name,
    rows,
    suggested_supplier_name: extracted.suggested_supplier_name ?? "",
    supplier_confidence: extracted.supplier_confidence ?? "ambiguous",
    suggested_origin: extracted.suggested_origin ?? "natural",
    origin_confidence: extracted.origin_confidence ?? "ambiguous",
    origin_conflict_note: extracted.origin_conflict_note ?? null,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    await createTenantSupabaseClient(tenantId);

    const formData = await req.formData();
    const rawFiles = formData.getAll("file");
    const files = rawFiles.filter((f): f is File => f instanceof File && f.size > 0);
    const knownSupplierNames: string[] = JSON.parse(
      (formData.get("known_supplier_names") as string | null) ?? "[]"
    );

    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }
    if (files.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 files per upload" },
        { status: 400 }
      );
    }

    for (const file of files) {
      if (!ALLOWED_MIMES.includes(file.type)) {
        return NextResponse.json(
          {
            error: `Unsupported file type for "${file.name}": ${file.type}. Upload PDFs or images.`,
          },
          { status: 400 }
        );
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: `"${file.name}" exceeds 20 MB limit` },
          { status: 400 }
        );
      }
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const systemPrompt = buildSystemPrompt(knownSupplierNames);

    const results = await Promise.all(
      files.map((file) => extractSingleFile(file, client, systemPrompt))
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[melee-import/extract]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
