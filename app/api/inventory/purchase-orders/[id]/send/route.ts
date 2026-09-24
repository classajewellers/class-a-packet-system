import { NextRequest, NextResponse } from "next/server";
import { createTenantSupabaseClient } from "@/lib/supabase-server";
import { tenantScoped } from "@/lib/tenantScoped";
import { exposePoLineToClient } from "@/lib/poLineColumns";
import { generatePurchaseOrderHTML, resolveExpectedDate, resolvePaymentTerms, type PoDocumentLine } from "@/lib/purchaseOrderDocument";
import { renderHtmlDocument } from "@/lib/htmlToPdf";
import { logSuppressedOutbound, outboundBlock } from "@/lib/outbound-guard";

export const dynamic = "force-dynamic";

const SENT_STATUS = "ordered";

async function logoForPdf(
  supabase: Awaited<ReturnType<typeof createTenantSupabaseClient>>,
  brandLogoUrl: string | null,
): Promise<string | null> {
  const value = brandLogoUrl?.trim() ?? "";
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith("storage:attachments/")) return null;
  const path = value.slice("storage:attachments/".length);
  const { data, error } = await supabase.storage.from("attachments").download(path);
  if (error || !data) return null;
  const bytes = Buffer.from(await data.arrayBuffer()).toString("base64");
  const ext = path.split(".").pop()?.toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
  return `data:${mime};base64,${bytes}`;
}

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

  let supplier: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    contact_name?: string | null;
    address?: string | null;
    payment_terms?: string | null;
    lead_time_days?: number | null;
  } | null = null;
  if (po.supplier_id) {
    const full = await tenantScoped(supabase, tenantId)
      .from("inventory_suppliers")
      .select("name, email, phone, contact_name, address, payment_terms, lead_time_days")
      .eq("id", po.supplier_id)
      .maybeSingle();
    if (full.error && /address|payment_terms/.test(full.error.message ?? "")) {
      const basic = await tenantScoped(supabase, tenantId)
        .from("inventory_suppliers")
        .select("name, email, phone, contact_name, lead_time_days")
        .eq("id", po.supplier_id)
        .maybeSingle();
      supplier = basic.data;
    } else {
      supplier = full.data;
    }
  }
  const supplierEmailRaw = (supplier?.email ?? "").trim();
  const supplierEmail = supplierEmailRaw.includes("@") ? supplierEmailRaw : null;

  const categoryIds = lines.map(line => line.category_id).filter((id): id is string => typeof id === "string" && id.length > 0);
  const categoryName = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: categories } = await tenantScoped(supabase, tenantId)
      .from("inventory_categories")
      .select("id, name")
      .in("id", categoryIds);
    for (const category of categories ?? []) categoryName.set(category.id, category.name);
  }

  const tenantFull = await supabase
    .from("tenants")
    .select("name, phone, email, address, brand_logo_url, gst_registered, abn")
    .eq("id", tenantId)
    .maybeSingle();
  const tenant = (tenantFull.error && /abn/.test(tenantFull.error.message ?? "")
    ? (await supabase.from("tenants").select("name, phone, email, address, brand_logo_url, gst_registered").eq("id", tenantId).maybeSingle()).data
    : tenantFull.data) as {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      brand_logo_url?: string | null;
      gst_registered?: boolean | null;
      abn?: string | null;
    } | null;

  const packetIds = lines.map(line => line.packet_id).filter((id): id is string => typeof id === "string" && id.length > 0);
  const packetRef = new Map<string, string>();
  if (packetIds.length > 0) {
    const { data: packets } = await tenantScoped(supabase, tenantId)
      .from("packets")
      .select("id, reference_number")
      .in("id", packetIds);
    for (const packet of (packets ?? []) as { id: string; reference_number: string | null }[]) {
      if (packet.reference_number) packetRef.set(packet.id, packet.reference_number);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const expected = resolveExpectedDate(po.expected_date, po.order_date, supplier?.lead_time_days, today);
  const logoSrc = await logoForPdf(supabase, tenant?.brand_logo_url ?? null);

  const html = generatePurchaseOrderHTML({
    business: {
      legalName: tenant?.name || "Purchase order",
      abn: tenant?.abn ?? null,
      address: tenant?.address ?? null,
      phone: tenant?.phone ?? null,
      email: tenant?.email ?? null,
      logoSrc,
      gstRegistered: tenant?.gst_registered !== false,
    },
    poNumber: po.po_number || "PO",
    supplier: {
      name: supplier?.name ?? po.supplier_name ?? null,
      address: supplier?.address ?? null,
      contactName: supplier?.contact_name ?? null,
      phone: supplier?.phone ?? null,
      email: supplierEmail,
    },
    orderDate: po.order_date ?? null,
    expectedDate: expected.date,
    expectedFromLeadTime: expected.fromLeadTime,
    leadTimeDays: supplier?.lead_time_days ?? null,
    paymentTerms: resolvePaymentTerms(po.payment_terms, supplier?.payment_terms),
    shipToAddress: po.ship_to_address ?? null,
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
      xero_account_code: line.xero_account_code as string | null,
      xero_account_name: line.xero_account_name as string | null,
      sku: line.sku as string | null,
      supplier_design_no: line.supplier_design_no as string | null,
      jobRef: line.packet_id ? packetRef.get(String(line.packet_id)) ?? null : null,
    })),
  });

  const document = await renderHtmlDocument(html, po.po_number || "purchase-order");

  const notes: string[] = [];
  if (document.kind === "pdf") {
    notes.push(await emailPdf({
      tenantId,
      to: supplierEmail,
      poNumber: po.po_number || "PO",
      supplierName: supplier?.name || tenant?.name || "us",
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
