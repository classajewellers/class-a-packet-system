import { fallbackReceiveTitle } from "@/lib/receiveStock";

export const DEFAULT_PAYMENT_TERMS = "Net 30";
export const GST_RATE = 0.1;

export interface PoDocumentLine {
  title?: string | null;
  notes?: string | null;
  categoryName?: string | null;
  metal_karat?: string | null;
  metal_colour?: string | null;
  metal_type?: string | null;
  quantity?: number | string | null;
  estimated_cost?: number | string | null;
  unit_cost?: number | string | null;
  xero_account_code?: string | null;
  xero_account_name?: string | null;
  sku?: string | null;
  supplier_design_no?: string | null;
  /** Short packet or job code. Never a customer name. */
  jobRef?: string | null;
}

export interface PoDocumentBusiness {
  legalName: string;
  abn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoSrc: string | null;
  gstRegistered: boolean;
}

export interface PoDocumentSupplier {
  name: string | null;
  address: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
}

export interface PoDocumentInput {
  business: PoDocumentBusiness;
  poNumber: string;
  supplier: PoDocumentSupplier;
  orderDate: string | null;
  expectedDate: string | null;
  expectedFromLeadTime: boolean;
  leadTimeDays: number | null;
  paymentTerms: string;
  shipToAddress: string | null;
  notes: string | null;
  lines: PoDocumentLine[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value: number): string {
  return "$" + value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function textOrNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text ? text : null;
}

export function fmtPoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return iso;
}

/** Add calendar days to a YYYY-MM-DD date without shifting across time zones. */
export function addCalendarDays(isoDate: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match || !Number.isFinite(days)) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

export function resolveExpectedDate(
  expected: string | null | undefined,
  orderDate: string | null | undefined,
  leadTimeDays: number | null | undefined,
  today: string,
): { date: string | null; fromLeadTime: boolean } {
  const explicit = textOrNull(expected);
  if (explicit) return { date: explicit.slice(0, 10), fromLeadTime: false };
  const days = leadTimeDays == null ? null : Number(leadTimeDays);
  if (days == null || !Number.isFinite(days) || days < 0) return { date: null, fromLeadTime: false };
  const base = (textOrNull(orderDate) ?? today).slice(0, 10);
  const date = addCalendarDays(base, days);
  return { date, fromLeadTime: date != null };
}

export function resolvePaymentTerms(
  poTerms: string | null | undefined,
  supplierTerms: string | null | undefined,
): string {
  return textOrNull(poTerms) ?? textOrNull(supplierTerms) ?? DEFAULT_PAYMENT_TERMS;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

export function poTaxSummary(lineTotals: number[], gstRegistered: boolean): { subtotal: number; gst: number; total: number } {
  const subtotalCents = lineTotals.reduce((sum, amount) => sum + cents(amount), 0);
  const gstCents = gstRegistered ? Math.round(subtotalCents * GST_RATE) : 0;
  return {
    subtotal: subtotalCents / 100,
    gst: gstCents / 100,
    total: (subtotalCents + gstCents) / 100,
  };
}

/** The cost staff typed on the line. Quantity is separate and is not multiplied in. */
export function poLineCost(line: PoDocumentLine): { quantity: number; lineTotal: number } {
  const rawQty = Number(line.quantity ?? 1);
  const quantity = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 1;
  const estimated = line.estimated_cost == null || String(line.estimated_cost).trim() === ""
    ? null
    : Number(line.estimated_cost);
  if (estimated != null && Number.isFinite(estimated)) {
    return { quantity, lineTotal: Math.round(estimated * 100) / 100 };
  }
  const unit = line.unit_cost == null || String(line.unit_cost).trim() === "" ? 0 : Number(line.unit_cost);
  const unitAmount = Number.isFinite(unit) ? unit : 0;
  return { quantity, lineTotal: Math.round(unitAmount * quantity * 100) / 100 };
}

export function poLineDescription(line: PoDocumentLine): string {
  return fallbackReceiveTitle(line) || "Item";
}

function blockLines(lines: Array<string | null>): string {
  return lines.filter((line): line is string => !!line).map(line => escapeHtml(line)).join("<br/>");
}

export function generatePurchaseOrderHTML(input: PoDocumentInput): string {
  const showJob = input.lines.some(line => textOrNull(line.jobRef));
  const rows = input.lines.map((line, index) => {
    const cost = poLineCost(line);
    const what = poLineDescription(line);
    const supplierRef = textOrNull(line.supplier_design_no);
    const account = [textOrNull(line.xero_account_code), textOrNull(line.xero_account_name)].filter(Boolean).join(" ");
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(textOrNull(line.sku) ?? "—")}</td>
        <td>${escapeHtml(what)}${supplierRef ? `<div class="sub">Supplier ref ${escapeHtml(supplierRef)}</div>` : ""}</td>
        ${showJob ? `<td>${escapeHtml(textOrNull(line.jobRef) ?? "—")}</td>` : ""}
        <td class="right">${cost.quantity}</td>
        <td>${escapeHtml(account || "—")}</td>
        <td class="right">${money(cost.lineTotal)}</td>
      </tr>`;
  }).join("");

  const tax = poTaxSummary(input.lines.map(line => poLineCost(line).lineTotal), input.business.gstRegistered);
  const supplierName = textOrNull(input.supplier.name) ?? "No supplier on this order";
  const shipTo = textOrNull(input.shipToAddress) ?? textOrNull(input.business.address);
  const shipLabel = textOrNull(input.shipToAddress) ? "Ship to" : "Ship to (business address)";
  const expected = input.expectedDate
    ? `${fmtPoDate(input.expectedDate)}${input.expectedFromLeadTime && input.leadTimeDays != null ? ` (${input.leadTimeDays} day lead time)` : ""}`
    : "—";
  const logo = input.business.logoSrc
    ? `<img src="${escapeHtml(input.business.logoSrc)}" alt="" style="max-height:56px;max-width:180px;display:block;margin-bottom:8px;" />`
    : "";
  const colSpan = showJob ? 7 : 6;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Purchase order ${escapeHtml(input.poNumber)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1A1A2E; margin: 0; font-size: 10.5pt; }
  .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #1A1760; padding-bottom: 14px; }
  .brand { font-size: 16pt; font-weight: 800; color: #1A1760; }
  .muted { color: #4B5563; font-size: 9.5pt; line-height: 1.45; margin-top: 4px; }
  .po-title { text-align: right; }
  .po-title h1 { margin: 0; font-size: 16pt; letter-spacing: 0.04em; color: #1A1760; }
  .po-no { font-size: 13pt; font-weight: 700; margin-top: 4px; }
  .grid { display: flex; gap: 16px; margin-top: 16px; }
  .card { flex: 1; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 14px; }
  .label { font-size: 8pt; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #6B7280; margin-bottom: 6px; }
  .name { font-size: 12pt; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 9.5pt; }
  th { padding: 8px 6px; text-align: left; background: #F9FAFB; border-bottom: 2px solid #E5E7EB; font-size: 8pt; text-transform: uppercase; color: #6B7280; }
  td { padding: 8px 6px; border-bottom: 1px solid #E5E7EB; vertical-align: top; }
  th.right, td.right { text-align: right; }
  .sub { font-size: 8pt; color: #6B7280; margin-top: 2px; }
  .totals { margin-top: 12px; margin-left: auto; width: 240px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { border-top: 2px solid #1A1760; margin-top: 4px; padding-top: 6px; font-size: 12pt; font-weight: 800; }
  .notes { margin-top: 18px; padding: 12px 14px; background: #F9FAFB; border-radius: 8px; }
</style>
</head>
<body>
  <div class="top">
    <div>
      ${logo}
      <div class="brand">${escapeHtml(textOrNull(input.business.legalName) ?? "Purchase order")}</div>
      <div class="muted">${blockLines([
        textOrNull(input.business.abn) ? `ABN ${input.business.abn}` : null,
        textOrNull(input.business.address),
        textOrNull(input.business.phone),
        textOrNull(input.business.email),
      ])}</div>
    </div>
    <div class="po-title">
      <h1>PURCHASE ORDER</h1>
      <div class="po-no">${escapeHtml(input.poNumber)}</div>
    </div>
  </div>
  <div class="grid">
    <div class="card">
      <div class="label">Supplier</div>
      <div class="name">${escapeHtml(supplierName)}</div>
      <div class="muted">${blockLines([
        textOrNull(input.supplier.address),
        textOrNull(input.supplier.contactName) ? `Contact: ${input.supplier.contactName}` : null,
        textOrNull(input.supplier.phone),
        textOrNull(input.supplier.email),
      ])}</div>
    </div>
    <div class="card">
      <div class="label">Order</div>
      <div class="muted">
        <div><strong>Order date:</strong> ${fmtPoDate(input.orderDate)}</div>
        <div><strong>Expected delivery:</strong> ${escapeHtml(expected)}</div>
        <div><strong>Payment terms:</strong> ${escapeHtml(input.paymentTerms)}</div>
        <div><strong>${escapeHtml(shipLabel)}:</strong><br/>${escapeHtml(shipTo ?? "—")}</div>
      </div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>SKU</th>
        <th>What</th>
        ${showJob ? "<th>Job</th>" : ""}
        <th class="right">Qty</th>
        <th>Account</th>
        <th class="right">Cost</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="${colSpan}" style="text-align:center;color:#9CA3AF;">No line items</td></tr>`}
    </tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal (ex GST)</span><span>${money(tax.subtotal)}</span></div>
    <div><span>${input.business.gstRegistered ? "GST (10%)" : "GST"}</span><span>${money(tax.gst)}</span></div>
    <div class="grand"><span>Total</span><span>${money(tax.total)}</span></div>
  </div>
  <div class="muted" style="text-align:right;">${input.business.gstRegistered ? "Line costs exclude GST. GST is 10%." : "This business is not registered for GST."}</div>
  ${textOrNull(input.notes) ? `<div class="notes"><strong>Notes</strong><div class="muted">${escapeHtml(input.notes ?? "").replace(/\n/g, "<br/>")}</div></div>` : ""}
</body>
</html>`;
}
