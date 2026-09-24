import { fallbackReceiveTitle } from "@/lib/receiveStock";

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
}

export interface PoDocumentInput {
  storeName: string;
  poNumber: string;
  supplierName: string;
  orderDate: string | null;
  expectedDate: string | null;
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

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
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

export function generatePurchaseOrderHTML(input: PoDocumentInput): string {
  const rows = input.lines.map((line, index) => {
    const cost = poLineCost(line);
    const what = poLineDescription(line);
    return `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;">${index + 1}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;">${escapeHtml(what)}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;text-align:right;">${cost.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;text-align:right;">${money(cost.lineTotal)}</td>
      </tr>`;
  }).join("");

  const total = input.lines.reduce((sum, line) => sum + poLineCost(line).lineTotal, 0);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Purchase order ${escapeHtml(input.poNumber)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1A1A2E; margin: 0; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #1A1760; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 18pt; font-weight: 800; color: #1A1760; }
  .title { font-size: 14pt; font-weight: 600; color: #6B7280; margin-top: 4px; }
  .meta { text-align: right; font-size: 11pt; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { padding: 10px 8px; text-align: left; background: #F9FAFB; border-bottom: 2px solid #E5E7EB; font-size: 9pt; text-transform: uppercase; color: #6B7280; }
  th.right, td.right { text-align: right; }
  .totals { margin-top: 24px; display: flex; justify-content: flex-end; font-size: 13pt; font-weight: 700; }
  .notes { margin-top: 24px; padding: 12px 16px; background: #F9FAFB; border-radius: 8px; font-size: 10pt; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">${escapeHtml(input.storeName || "Purchase order")}</div>
      <div class="title">Purchase order</div>
    </div>
    <div class="meta">
      <div><strong>PO #:</strong> ${escapeHtml(input.poNumber)}</div>
      <div><strong>Supplier:</strong> ${escapeHtml(input.supplierName || "—")}</div>
      <div><strong>Order date:</strong> ${fmtDate(input.orderDate)}</div>
      <div><strong>Expected:</strong> ${fmtDate(input.expectedDate)}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>What</th>
        <th class="right">Qty</th>
        <th class="right">Cost</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#9CA3AF;">No line items</td></tr>'}
    </tbody>
  </table>
  <div class="totals"><span>Total ${money(Math.round(total * 100) / 100)}</span></div>
  ${input.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(input.notes)}</div>` : ""}
</body>
</html>`;
}
