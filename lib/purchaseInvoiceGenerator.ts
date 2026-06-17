import { InventoryPurchaseInvoice, InventoryPurchaseLine } from './types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—';
  return '$' + Number(v).toFixed(2);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function generatePurchaseInvoiceHTML(
  invoice: InventoryPurchaseInvoice,
  lines: InventoryPurchaseLine[],
  supplierName: string
): string {
  const lineRows = lines.map((line, i) => {
    const variantSku = line.variant?.sku ?? '—';
    const rowStyle = line.is_faulty
      ? 'background:#FEE2E2;color:#991B1B;'
      : '';
    return `
      <tr style="${rowStyle}">
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;">${i + 1}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;">
          ${escapeHtml(line.description || '')}
          ${line.is_faulty ? `<div style="font-size:10px;color:#991B1B;margin-top:4px;"><strong>FAULTY:</strong> ${escapeHtml(line.faulty_notes || '')}</div>` : ''}
        </td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;">${escapeHtml(line.component_type || '—')}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;font-family:monospace;">${escapeHtml(variantSku)}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;text-align:right;">${line.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;text-align:right;">${fmtCurrency(line.unit_cost)}</td>
        <td style="padding:8px;border-bottom:1px solid #E5E7EB;text-align:right;">${fmtCurrency(line.total_cost)}</td>
      </tr>
    `;
  }).join('');

  const linesTotal = lines.reduce((sum, l) => sum + (l.total_cost ?? 0), 0);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Purchase Invoice ${escapeHtml(invoice.invoice_number)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1A1A2E; margin: 0; padding: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1A1760; padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-size: 18pt; font-weight: 800; letter-spacing: 0.04em; color: #1A1760; }
  .title { font-size: 14pt; font-weight: 600; color: #6B7280; margin-top: 4px; }
  .meta { text-align: right; font-size: 11pt; }
  .meta div { margin-bottom: 4px; }
  .meta strong { color: #1A1A2E; }
  .status { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 10pt; font-weight: 600; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 16px; }
  th { padding: 10px 8px; text-align: left; background: #F9FAFB; border-bottom: 2px solid #E5E7EB; font-size: 9pt; text-transform: uppercase; color: #6B7280; letter-spacing: 0.05em; }
  th.right { text-align: right; }
  .totals { margin-top: 24px; display: flex; justify-content: flex-end; }
  .totals-box { min-width: 240px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 11pt; }
  .totals-row.grand { border-top: 2px solid #1A1760; margin-top: 6px; padding-top: 10px; font-weight: 700; font-size: 13pt; }
  .notes { margin-top: 24px; padding: 12px 16px; background: #F9FAFB; border-radius: 8px; font-size: 10pt; color: #4B5563; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">CLASS A JEWELLERS</div>
      <div class="title">Purchase Invoice</div>
    </div>
    <div class="meta">
      <div><strong>Invoice #:</strong> ${escapeHtml(invoice.invoice_number)}</div>
      <div><strong>Supplier:</strong> ${escapeHtml(supplierName)}</div>
      <div><strong>Date:</strong> ${fmtDate(invoice.invoice_date)}</div>
      <div><strong>Status:</strong> <span class="status">${escapeHtml(invoice.status)}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Description</th>
        <th>Type</th>
        <th>Variant SKU</th>
        <th class="right">Qty</th>
        <th class="right">Unit Cost</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows || '<tr><td colspan="7" style="padding:16px;text-align:center;color:#9CA3AF;">No line items</td></tr>'}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row"><span>Line items total</span><span>${fmtCurrency(linesTotal)}</span></div>
      <div class="totals-row grand"><span>Invoice Total</span><span>${fmtCurrency(invoice.total_amount ?? linesTotal)}</span></div>
    </div>
  </div>

  ${invoice.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(invoice.notes)}</div>` : ''}

<script>
  window.onload = function () { window.print(); };
</script>
</body>
</html>`;
}
