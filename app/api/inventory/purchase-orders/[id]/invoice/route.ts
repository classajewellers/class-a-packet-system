import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import { exposePoLineToClient } from "@/lib/poLineColumns";
import { poLineCost, poLineDescription, type PoDocumentLine } from "@/lib/purchaseOrderDocument";
import { XeroNotConnectedError, XeroReconnectRequiredError } from "@/lib/xero";
import { attachFileToXeroDraftBill, createXeroDraftBill, XERO_BILL_STATUS } from "@/lib/xeroDraftBill";

export const dynamic = "force-dynamic";

const MIGRATION_HINT = "Ask Vault DB to apply supabase/migrations/166_purchase_invoice_xero_draft.sql on staging. It adds due_date, xero_invoice_id, and xero_status. Nothing was sent to Xero.";

function missingInvoiceColumn(error: { message?: string; code?: string } | null): boolean {
  const message = error?.message ?? "";
  return error?.code === "42703"
    || error?.code === "PGRST204"
    || /due_date|xero_invoice_id|xero_status/.test(message);
}

function dateOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

async function loadPoContext(tenantId: string, poId: string) {
  const supabase = await createTenantSupabaseClient(tenantId);
  const { data: po, error: poErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_purchase_orders")
    .select("id, po_number, supplier_id, status")
    .eq("id", poId)
    .single();
  if (poErr || !po) return { error: NextResponse.json({ error: "Purchase order not found" }, { status: 404 }) };

  const { data: lineRows, error: linesErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_po_lines")
    .select("*")
    .eq("po_id", poId)
    .order("created_at", { ascending: true });
  if (linesErr) return { error: NextResponse.json({ error: linesErr.message }, { status: 500 }) };

  const lines = ((lineRows ?? []) as Record<string, unknown>[]).map(row => exposePoLineToClient(row));
  const categoryIds = lines.map(line => line.category_id).filter((id): id is string => typeof id === "string" && id.length > 0);
  const categoryName = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: categories } = await tenantScoped(supabase, tenantId)
      .from("inventory_categories")
      .select("id, name")
      .in("id", categoryIds);
    for (const category of categories ?? []) categoryName.set(category.id, category.name);
  }

  let supplierName = "";
  if (po.supplier_id) {
    const { data: supplier } = await tenantScoped(supabase, tenantId)
      .from("inventory_suppliers")
      .select("name")
      .eq("id", po.supplier_id)
      .maybeSingle();
    supplierName = supplier?.name ?? "";
  }

  return { supabase, po, lines, categoryName, supplierName };
}

function lineDocument(line: Record<string, unknown>, categoryName: Map<string, string>): PoDocumentLine {
  return {
    title: line.title as string | null,
    notes: line.notes as string | null,
    categoryName: line.category_id ? categoryName.get(String(line.category_id)) ?? null : null,
    metal_karat: line.metal_karat as string | null,
    metal_colour: line.metal_colour as string | null,
    metal_type: line.metal_type as string | null,
    quantity: line.quantity as number | null,
    estimated_cost: line.estimated_cost as number | null,
    unit_cost: line.unit_cost as number | null,
    xero_account_code: line.xero_account_code as string | null,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  const loaded = await loadPoContext(tenantId, params.id);
  if ("error" in loaded && loaded.error) return loaded.error;
  const { supabase, lines, categoryName } = loaded;

  const { data, error } = await tenantScoped(supabase, tenantId)
    .from("inventory_purchase_invoices")
    .select("id, invoice_number, invoice_date, due_date, total_amount, status, xero_invoice_id, xero_status, po_id")
    .eq("po_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    if (missingInvoiceColumn(error)) {
      return NextResponse.json({ error: MIGRATION_HINT, invoice: null }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lineTotal = lines.reduce((sum, line) => sum + poLineCost(lineDocument(line, categoryName)).lineTotal, 0);
  const missingAccounts = lines
    .filter(line => !String(line.xero_account_code ?? "").trim())
    .map(line => poLineDescription(lineDocument(line, categoryName)));

  return NextResponse.json({
    invoice: data?.[0] ?? null,
    line_total: Math.round(lineTotal * 100) / 100,
    missing_accounts: missingAccounts,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });

  const body = await req.json().catch(() => null) as {
    invoice_number?: unknown;
    invoice_date?: unknown;
    due_date?: unknown;
    total_amount?: unknown;
  } | null;
  const invoiceNumber = typeof body?.invoice_number === "string" ? body.invoice_number.trim() : "";
  if (!invoiceNumber) return NextResponse.json({ error: "Enter the supplier invoice number." }, { status: 400 });
  const invoiceDate = dateOrNull(body?.invoice_date);
  const dueDate = dateOrNull(body?.due_date);
  const totalAmount = body?.total_amount == null || body.total_amount === ""
    ? null
    : Number(body.total_amount);
  if (totalAmount != null && !Number.isFinite(totalAmount)) {
    return NextResponse.json({ error: "Enter a valid invoice total." }, { status: 400 });
  }

  const loaded = await loadPoContext(tenantId, params.id);
  if ("error" in loaded && loaded.error) return loaded.error;
  const { supabase, po, lines, categoryName, supplierName } = loaded;
  if (po.status === "cancelled") {
    return NextResponse.json({ error: "This purchase order is cancelled." }, { status: 400 });
  }
  if (!supplierName) {
    return NextResponse.json({ error: "This purchase order has no supplier name, so Xero has nowhere to put the bill." }, { status: 400 });
  }
  if (lines.length === 0) {
    return NextResponse.json({ error: "This purchase order has no lines." }, { status: 400 });
  }

  const billLines = lines.map(line => {
    const doc = lineDocument(line, categoryName);
    const cost = poLineCost(doc);
    const description = poLineDescription(doc);
    const qtyNote = cost.quantity === 1 ? "" : ` (qty ${cost.quantity})`;
    return {
      description: `${description}${qtyNote}`,
      quantity: 1,
      unitAmount: cost.lineTotal,
      accountCode: String(line.xero_account_code ?? "").trim(),
      label: description,
    };
  });
  const missing = billLines.filter(line => !line.accountCode).map(line => line.label);
  if (missing.length > 0) {
    return NextResponse.json({
      error: `These lines have no Xero account yet: ${missing.join(", ")}. Pick an account on each line, then send the draft.`,
    }, { status: 400 });
  }

  const { data: existingRows, error: existingErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_purchase_invoices")
    .select("id, xero_invoice_id, xero_status")
    .eq("po_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (existingErr) {
    if (missingInvoiceColumn(existingErr)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }
  const existing = existingRows?.[0] ?? null;
  if (existing?.xero_invoice_id) {
    return NextResponse.json({
      error: `A Xero draft already exists for this purchase order (${existing.xero_invoice_id}). Review it in Xero. Vault did not create another bill.`,
      xero_invoice_id: existing.xero_invoice_id,
      xero_status: existing.xero_status ?? XERO_BILL_STATUS,
    }, { status: 409 });
  }

  const row = {
    tenant_id: tenantId,
    po_id: params.id,
    supplier_id: po.supplier_id,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    due_date: dueDate,
    total_amount: totalAmount,
    status: "pending",
    xero_status: null as string | null,
  };

  let invoiceId = existing?.id as string | undefined;
  if (invoiceId) {
    const { error } = await tenantScoped(supabase, tenantId)
      .from("inventory_purchase_invoices")
      .update(row)
      .eq("id", invoiceId);
    if (error) {
      if (missingInvoiceColumn(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { data, error } = await tenantScoped(supabase, tenantId)
      .from("inventory_purchase_invoices")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) {
      if (missingInvoiceColumn(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
      return NextResponse.json({ error: error?.message ?? "Could not save the invoice" }, { status: 500 });
    }
    invoiceId = data.id;
  }

  let xeroInvoiceId: string;
  try {
    const created = await createXeroDraftBill(tenantId, {
      contactName: supplierName,
      invoiceNumber,
      invoiceDate,
      dueDate,
      reference: po.po_number || params.id,
      lines: billLines.map(({ description, quantity, unitAmount, accountCode }) => ({
        description, quantity, unitAmount, accountCode,
      })),
    });
    xeroInvoiceId = created.invoiceId;
  } catch (err) {
    if (err instanceof XeroNotConnectedError || err instanceof XeroReconnectRequiredError) {
      return NextResponse.json({ error: err.message, invoice_id: invoiceId }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Xero did not accept the draft bill.";
    return NextResponse.json({ error: message, invoice_id: invoiceId }, { status: 502 });
  }

  const { error: stampErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_purchase_invoices")
    .update({ xero_invoice_id: xeroInvoiceId, xero_status: XERO_BILL_STATUS })
    .eq("id", invoiceId);
  if (stampErr) {
    return NextResponse.json({
      error: `Xero created draft ${xeroInvoiceId}, but Vault could not save that id. ${stampErr.message}`,
      xero_invoice_id: xeroInvoiceId,
      xero_status: XERO_BILL_STATUS,
    }, { status: 500 });
  }

  const lineIds = lines.map(line => line.id).filter((id): id is string => typeof id === "string");
  let piecesStamped = 0;
  let pieceNote = "";
  if (lineIds.length > 0) {
    const { data: pieces } = await tenantScoped(supabase, tenantId)
      .from("inventory_pieces")
      .select("id, invoice_id")
      .in("po_line_id", lineIds);
    const pieceRows = (pieces ?? []) as { id: string; invoice_id: string | null }[];
    const toStamp = pieceRows.filter(piece => !piece.invoice_id).map(piece => piece.id);
    if (toStamp.length > 0) {
      const { error: pieceErr } = await tenantScoped(supabase, tenantId)
        .from("inventory_pieces")
        .update({ invoice_id: invoiceId })
        .in("id", toStamp);
      if (pieceErr) {
        pieceNote = " The draft was created, but the received pieces were not linked to this invoice.";
      } else {
        piecesStamped = toStamp.length;
      }
    }
  }

  let attachmentNote = "";
  const { data: files } = await tenantScoped(supabase, tenantId)
    .from("attachments")
    .select("file_name, file_url, file_type, attachment_type, created_at")
    .eq("entity_type", "purchase_order")
    .eq("entity_id", params.id)
    .eq("archived", false)
    .order("created_at", { ascending: false });
  const fileRows = (files ?? []) as { file_name: string | null; file_url: string | null; file_type: string | null; attachment_type: string | null }[];
  const file = fileRows.find(item => item.attachment_type === "invoice") ?? fileRows[0];
  if (file?.file_url) {
    const { data: blob, error: downloadErr } = await supabase.storage.from("attachments").download(file.file_url);
    if (!downloadErr && blob) {
      try {
        const bytes = await blob.arrayBuffer();
        const contentType = file.file_type === "image" ? "image/jpeg" : "application/pdf";
        await attachFileToXeroDraftBill(tenantId, xeroInvoiceId, file.file_name || "invoice", bytes, contentType);
        attachmentNote = " The invoice file was attached to the Xero draft.";
      } catch (err) {
        const message = err instanceof Error ? err.message : "attachment failed";
        attachmentNote = ` The draft was created. The invoice file stayed in Vault and was not attached in Xero (${message}).`;
      }
    }
  }

  return NextResponse.json({
    invoice_id: invoiceId,
    xero_invoice_id: xeroInvoiceId,
    xero_status: XERO_BILL_STATUS,
    pieces_stamped: piecesStamped,
    message: `Xero draft bill ${xeroInvoiceId} was created. A person still needs to review it in Xero.${pieceNote}${attachmentNote}`,
  });
}

export async function PUT(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const tenantId = _req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      read: false,
      message: "Invoice reading is not set up on this Preview. Type the invoice number, dates, and total.",
    });
  }

  const supabase = await createTenantSupabaseClient(tenantId);
  const { data: files, error } = await tenantScoped(supabase, tenantId)
    .from("attachments")
    .select("file_name, file_url, file_type, attachment_type, created_at")
    .eq("entity_type", "purchase_order")
    .eq("entity_id", params.id)
    .eq("archived", false)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fileRows = (files ?? []) as { file_name: string | null; file_url: string | null; file_type: string | null; attachment_type: string | null }[];
  const readable = fileRows.filter(file => {
    const name = (file.file_name ?? "").toLowerCase();
    return file.file_type === "image" || name.endsWith(".pdf") || name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".webp");
  });
  const file = readable.find(item => item.attachment_type === "invoice") ?? readable[0];
  if (!file?.file_url) {
    return NextResponse.json({
      read: false,
      message: "Attach an invoice photo or PDF first. You can still type the fields.",
    });
  }

  const { data: blob, error: downloadErr } = await supabase.storage.from("attachments").download(file.file_url);
  if (downloadErr || !blob) {
    return NextResponse.json({
      read: false,
      message: "The invoice file could not be opened. Type the fields instead.",
    });
  }

  const name = (file.file_name ?? "").toLowerCase();
  const isPdf = name.endsWith(".pdf");
  const mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" = name.endsWith(".png") ? "image/png"
    : name.endsWith(".webp") ? "image/webp"
    : name.endsWith(".gif") ? "image/gif"
    : "image/jpeg";
  const bytes = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const content = isPdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: bytes } }
    : { type: "image" as const, source: { type: "base64" as const, media_type: mediaType, data: bytes } };

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      system: "Read a supplier invoice. Return only JSON with keys invoice_number, invoice_date, due_date, total_amount. Dates are YYYY-MM-DD or null. total_amount is a number or null. Use null when a value is not visible. Do not guess.",
      messages: [{
        role: "user",
        content: [content, { type: "text", text: "Read the invoice number, invoice date, due date, and total amount." }],
      }],
    });
    const block = message.content.find(item => item.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return NextResponse.json({
      read: true,
      file_name: file.file_name,
      invoice_number: typeof parsed.invoice_number === "string" ? parsed.invoice_number : "",
      invoice_date: dateOrNull(parsed.invoice_date) ?? "",
      due_date: dateOrNull(parsed.due_date) ?? "",
      total_amount: typeof parsed.total_amount === "number" && Number.isFinite(parsed.total_amount) ? parsed.total_amount : null,
    });
  } catch (err) {
    console.error("[po-invoice-read]", err instanceof Error ? err.message : err);
    return NextResponse.json({
      read: false,
      message: "The invoice could not be read. Type the invoice number, dates, and total, then send the draft.",
    });
  }
}
