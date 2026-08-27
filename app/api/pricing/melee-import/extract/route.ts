import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createTenantSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Maximum file size: 20 MB
const MAX_BYTES = 20 * 1024 * 1024;

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "extract_melee_price_rows",
  description:
    "Extract structured melee/small-stone price rows from a supplier price list document.",
  input_schema: {
    type: "object" as const,
    required: ["rows", "origin_confidence", "suggested_origin"],
    properties: {
      suggested_origin: {
        type: "string",
        enum: ["natural", "lab"],
        description:
          "Origin inferred from the document itself (text, header, branding). " +
          "If the document gives no signal, default to the supplier_default passed in the prompt.",
      },
      origin_confidence: {
        type: "string",
        enum: ["certain", "inferred_from_supplier", "ambiguous"],
        description:
          "'certain' = document explicitly states natural/lab. " +
          "'inferred_from_supplier' = no document signal, using supplied default. " +
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
              enum: ["carat_range", "pieces_per_carat"],
              description:
                "'carat_range' when the row is expressed as a carat band (e.g. 0.025-0.03ct). " +
                "'pieces_per_carat' when the row is expressed as pieces-per-carat (e.g. 200pc-150pc). " +
                "NEVER silently convert between conventions.",
            },
            size_label: {
              type: "string",
              description:
                "Size exactly as it appears in the document (e.g. '200pc-150pc', '0.025-0.03ct', '3/4 to 1ct').",
            },
            size_from: {
              type: "number",
              description:
                "Numeric lower bound. For carat_range: lower carat value. " +
                "For pieces_per_carat: the smaller pcs/ct number (fewer pieces = larger stones).",
            },
            size_to: {
              type: "number",
              description:
                "Numeric upper bound. For carat_range: upper carat value. " +
                "For pieces_per_carat: the larger pcs/ct number.",
            },
            quality: {
              type: "string",
              description:
                "Quality grade as stated in the document (e.g. 'DEF/VS', 'EF SI', 'FG VVS', " +
                "'SI1', 'VS2'). Use 'unspecified' if the document lists no quality for this row.",
            },
            price_per_carat: {
              type: "number",
              description: "Price per carat in AUD as a positive number.",
            },
            flagged: {
              type: "boolean",
              description:
                "true if this row is ambiguous or uncertain — e.g. a merged/spanning cell, " +
                "unclear size convention, shape not clearly identifiable, or the price seems " +
                "implausible. Flag for human review rather than silently guessing.",
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const tenantId = req.headers.get("x-tenant-id") ?? "";
    const supabase = await createTenantSupabaseClient(tenantId);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const supplierId = formData.get("supplier_id") as string | null;
    const supplierDefault = (formData.get("supplier_origin_default") as string) ?? "natural";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (!supplierId) {
      return NextResponse.json({ error: "supplier_id is required" }, { status: 400 });
    }

    // Validate file type
    const mime = file.type;
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (!allowed.includes(mime)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${mime}. Upload a PDF or image.` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: "File exceeds 20 MB limit" },
        { status: 400 }
      );
    }

    // Fetch supplier name for the prompt
    const { data: supplier, error: supplierErr } = await supabase
      .from("inventory_suppliers")
      .select("id, name")
      .eq("id", supplierId)
      .single();

    if (supplierErr || !supplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    const base64 = Buffer.from(bytes).toString("base64");
    const isPdf = mime === "application/pdf";

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const fileContent: Anthropic.MessageParam["content"][number] = isPdf
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: base64,
          },
        };

    const systemPrompt = `You are extracting melee/small-stone diamond price data from a supplier price list for Class A Jewellers.

Supplier: ${supplier.name}
Supplier origin default: ${supplierDefault} (use this if the document itself gives no explicit natural/lab signal)

CRITICAL RULES:
1. Preserve the exact size convention used in each row — 'pieces_per_carat' for rows like "200pc-150pc", 'carat_range' for rows like "0.025-0.03ct". Never convert one to the other.
2. Every row must have a shape. If a table has a header shape that applies to multiple rows, apply it to each row.
3. price_per_carat is always in AUD per carat.
4. Flag any row you are not fully confident about rather than guessing silently.
5. If the document contains any text that contradicts the supplier origin default (e.g. the document says "Lab" but the supplier default is "natural"), set origin_confidence to 'ambiguous' and describe it in origin_conflict_note.`;

    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
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

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return NextResponse.json(
        { error: "AI extraction did not return structured data" },
        { status: 500 }
      );
    }

    const extracted = toolUse.input as {
      rows: unknown[];
      suggested_origin: string;
      origin_confidence: string;
      origin_conflict_note?: string;
    };

    return NextResponse.json({
      rows: extracted.rows,
      suggested_origin: extracted.suggested_origin,
      origin_confidence: extracted.origin_confidence,
      origin_conflict_note: extracted.origin_conflict_note ?? null,
      supplier: { id: supplier.id, name: supplier.name },
      file_name: file.name,
    });
  } catch (err) {
    console.error("[melee-import/extract]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 }
    );
  }
}
