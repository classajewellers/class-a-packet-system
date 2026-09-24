import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import { exposePoLineToClient } from "@/lib/poLineColumns";
import { generatePurchaseOrderHTML, type PoDocumentLine } from "@/lib/purchaseOrderDocument";
import { renderHtmlDocument } from "@/lib/htmlToPdf";
import { logSuppressedOutbound, outboundBlock } from "@/lib/outbound-guard";

export const dynamic = "force-dynamic";

const SENT_STATUS = "ordered";

function headerMessage(parts: string[]): string {
  return encodeURIComponent(parts.filter(Boolean).join(" "));
}

async function emailPdf(opts: {
  tenantId: string;
  to: string | null;
  poNumber: string;
  supplierName: string;
  filename: string;
  bytes: ArrayBuffer;
}): Promise<string> {
  if (!opts.to) {
    return "This supplier has no email address, so it was not emailed.";
  }
  const block = outboundBlock("email", opts.tenantId);
  if (block) {
    logSuppressedOutbound("email", opts.tenantId, { to: opts.to, po: opts.poNumber }, block);
    return "Email was held back on this test tenant, so it was not emailed.";
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return "Email is not set up on this Preview, so it was not emailed.";
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: `Purchase order ${opts.poNumber}`,
      text: `Please find purchase order ${opts.poNumber} from ${opts.supplierName || "us"} attached.`,
      attachments: [{
        filename: opts.filename,
        content: Buffer.from(opts.bytes).toString("base64"),
      }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[po-send] email failed:", res.status, body.slice(0, 300));
    return "The email could not be sent.";
  }
  return `Emailed to ${opts.to}.`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const tenantId = req.headers.get("x-tenant-id") ?? "";
  if (!tenantId) return NextResponse.json({ error: "Missing tenant" }, { status: 400 });
  const supabase = await createTenantSupabaseClient(tenantId);

  const { data: po, error: poErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_purchase_orders")
    .select("*")
    .eq("id", params.id)
    .single();
  if (poErr || !po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
  if (po.status === "cancelled") {
    return NextResponse.json({ error: "This purchase order is cancelled." }, { status: 400 });
  }

  const { data: lineRows, error: linesErr } = await tenantScoped(supabase, tenantId)
    .from("inventory_po_lines")
    .select("*")
    .eq("po_id", params.id)
    .order("created_at", { ascending: true });
  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });
  const lines = ((lineRows ?? []) as Record<string, unknown>[]).map(row => exposePoLineToClient(row));
  if (lines.length === 0) {
    return NextResponse.json({ error: "Add at least one line before sending this purchase order." }, { status: 400 });
  }

  let supplierName = "";
  let supplierEmail: string | null = null;
  if (po.supplier_id) {
    const { data: supplier } = await tenantScoped(supabase, tenantId)
      .from("inventory_suppliers")
      .select("name, email")
      .eq("id", po.supplier_id)
      .maybeSingle();
    supplierName = supplier?.name ?? "";
    const email = (supplier?.email ?? "").trim();
    supplierEmail = email.includes("@") ? email : null;
  }

  const categoryIds = lines.map(line => line.category_id).filter((id): id is string => typeof id === "string" && id.length > 0);
  const categoryName = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: categories } = await tenantScoped(supabase, tenantId)
      .from("inventory_categories")
      .select("id, name")
      .in("id", categoryIds);
    for (const category of categories ?? []) categoryName.set(category.id, category.name);
  }

  const { data: tenant } = await supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle();

  const html = generatePurchaseOrderHTML({
    storeName: tenant?.name || "Purchase order",
    poNumber: po.po_number || "PO",
    supplierName: supplierName || "Supplier",
    orderDate: po.order_date ?? null,
    expectedDate: po.expected_date ?? null,
    notes: po.notes ?? null,
    lines: lines.map((line): PoDocumentLine => ({
      title: line.title as string | null,
      notes: line.notes as string | null,
      categoryName: line.category_id ? categoryName.get(String(line.category_id)) ?? null : null,
      metal_karat: line.metal_karat as string | null,
      metal_colour: line.metal_colour as string | null,
      metal_type: line.metal_type as string | null,
      quantity: line.quantity as number | null,
      estimated_cost: line.estimated_cost as number | null,
      unit_cost: line.unit_cost as number | null,
    })),
  });

  const document = await renderHtmlDocument(html, po.po_number || "purchase-order");

  const notes: string[] = [];
  if (document.kind === "pdf") {
    notes.push(await emailPdf({
      tenantId,
      to: supplierEmail,
      poNumber: po.po_number || "PO",
      supplierName,
      filename: document.filename,
      bytes: document.bytes,
    }));
  } else {
    notes.push(document.message);
    notes.push("It was not emailed.");
  }

  if (po.status === "draft") {
    const today = new Date().toISOString().slice(0, 10);
    const { error: statusErr } = await tenantScoped(supabase, tenantId)
      .from("inventory_purchase_orders")
      .update({
        status: SENT_STATUS,
        order_date: po.order_date ?? today,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id);
    notes.push(statusErr
      ? "The file is ready, but the order could not be marked as ordered."
      : "Marked as ordered.");
  }

  const bytes = document.kind === "pdf"
    ? new Uint8Array(document.bytes)
    : new TextEncoder().encode(document.html);
  const contentType = document.kind === "pdf" ? "application/pdf" : "text/html; charset=utf-8";
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${document.filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Po-Message": headerMessage(notes),
    },
  });
}
