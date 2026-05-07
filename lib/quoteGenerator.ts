import { Quote, LineItem } from "./types";
import { formatCurrency } from "./formatters";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateAU(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function generateQuoteHTML(quote: Quote): string {
  const customerName = [quote.customer_first_name, quote.customer_last_name]
    .filter(Boolean)
    .join(" ");

  const lineItems: LineItem[] = quote.line_items ?? [];
  const total = quote.total ?? lineItems.reduce((s, li) => s + li.price, 0);

  const lineItemRows = lineItems
    .map(
      (li) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:10pt;">${esc(li.description)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:10pt;text-align:right;white-space:nowrap;">${formatCurrency(li.price)}</td>
    </tr>`
    )
    .join("");

  const createdDate = formatDateAU(quote.created_at);

  const quoteTypeLabel =
    quote.quote_type === "repair" ? "Repair Quote" : "Custom Order Quote";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Quote ${esc(quote.reference_number)} — Class A Jewellers</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 15mm; }
  body {
    font-family: Arial, sans-serif;
    font-size: 10pt;
    color: #000;
    background: #fff;
    position: relative;
  }
  .header-banner {
    background: #A3B2A4;
    color: #fff;
    text-align: center;
    padding: 14px 20px;
    margin-bottom: 6px;
  }
  .header-banner h1 {
    font-family: Georgia, serif;
    font-size: 22pt;
    font-weight: bold;
    letter-spacing: 2px;
  }
  .store-details {
    text-align: center;
    font-size: 8pt;
    color: #666;
    margin-bottom: 20px;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
  }
  .quote-heading {
    font-size: 24pt;
    font-weight: bold;
    color: #000;
  }
  .quote-meta {
    text-align: right;
    font-size: 9pt;
    color: #333;
    line-height: 1.6;
  }
  .quote-meta .ref {
    font-family: monospace;
    font-size: 10pt;
    font-weight: bold;
    color: #000;
  }
  .section {
    margin-bottom: 18px;
  }
  .section-title {
    font-size: 8pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #666;
    letter-spacing: 1px;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 4px;
    margin-bottom: 8px;
  }
  .customer-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 20px;
  }
  .field-label {
    font-size: 7.5pt;
    color: #888;
    margin-bottom: 1px;
  }
  .field-value {
    font-size: 10pt;
    color: #000;
  }
  table.line-items {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
  }
  table.line-items thead tr {
    background: #f3f4f6;
  }
  table.line-items thead th {
    padding: 8px 12px;
    text-align: left;
    font-size: 8pt;
    font-weight: bold;
    text-transform: uppercase;
    color: #666;
    letter-spacing: 0.5px;
  }
  table.line-items thead th:last-child {
    text-align: right;
  }
  .total-row td {
    background: #000;
    color: #fff;
    font-weight: bold;
    font-size: 11pt;
    padding: 10px 12px;
  }
  .total-row td:last-child {
    text-align: right;
  }
  .description-text {
    font-size: 10pt;
    color: #333;
    line-height: 1.5;
    white-space: pre-wrap;
  }
  .footer-contact {
    margin-top: 24px;
    padding: 12px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    font-size: 9pt;
    color: #444;
    text-align: center;
  }
  .fine-print {
    margin-top: 12px;
    font-size: 7.5pt;
    color: #999;
    text-align: center;
    line-height: 1.5;
  }
  .turnaround-badge {
    display: inline-block;
    background: #A3B2A4;
    color: #fff;
    font-size: 9pt;
    font-weight: bold;
    padding: 4px 12px;
    border-radius: 4px;
  }
  .type-label {
    font-size: 8.5pt;
    color: #A3B2A4;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 2px;
  }
</style>
</head>
<body>

  <div class="header-banner">
    <h1>CLASS A JEWELLERS</h1>
  </div>

  <div class="store-details">
    40 North East Road, Walkerville SA 5081 &nbsp;|&nbsp; +61 8 8344 7722 &nbsp;|&nbsp; jewellery@classa.com.au &nbsp;|&nbsp; www.classa.com.au
  </div>

  <div class="meta-row">
    <div>
      <div class="type-label">${esc(quoteTypeLabel)}</div>
      <div class="quote-heading">QUOTE</div>
    </div>
    <div class="quote-meta">
      <div class="ref">${esc(quote.reference_number)}</div>
      <div>Date: ${esc(createdDate)}</div>
      ${quote.staff_member ? `<div>Prepared by: ${esc(quote.staff_member)}</div>` : ""}
    </div>
  </div>

  <!-- Customer -->
  <div class="section">
    <div class="section-title">Customer Details</div>
    <div class="customer-grid">
      <div>
        <div class="field-label">Name</div>
        <div class="field-value">${esc(customerName) || "—"}</div>
      </div>
      <div>
        <div class="field-label">Phone</div>
        <div class="field-value">${esc(quote.customer_phone) || "—"}</div>
      </div>
      <div>
        <div class="field-label">Email</div>
        <div class="field-value">${esc(quote.customer_email) || "—"}</div>
      </div>
    </div>
  </div>

  <!-- Item Description -->
  ${
    quote.item_description
      ? `
  <div class="section">
    <div class="section-title">Item Description</div>
    <div class="description-text">${esc(quote.item_description)}</div>
  </div>`
      : ""
  }

  <!-- Repair specific -->
  ${
    quote.quote_type === "repair" && quote.repair_description
      ? `
  <div class="section">
    <div class="section-title">Repair Description</div>
    <div class="description-text">${esc(quote.repair_description)}</div>
  </div>`
      : ""
  }

  <!-- Custom order specific -->
  ${
    quote.quote_type === "custom_order" && quote.design_brief
      ? `
  <div class="section">
    <div class="section-title">Design Brief</div>
    <div class="description-text">${esc(quote.design_brief)}</div>
  </div>`
      : ""
  }

  ${
    quote.quote_type === "custom_order" && quote.metal_type
      ? `
  <div class="section">
    <div class="section-title">Metal Type</div>
    <div class="field-value">${esc(quote.metal_type)}</div>
  </div>`
      : ""
  }

  ${
    quote.quote_type === "custom_order" && quote.stone_details
      ? `
  <div class="section">
    <div class="section-title">Stone Details</div>
    <div class="description-text">${esc(quote.stone_details)}</div>
  </div>`
      : ""
  }

  <!-- Line Items -->
  <div class="section">
    <div class="section-title">Pricing</div>
    <table class="line-items">
      <thead>
        <tr>
          <th>Description</th>
          <th>Price</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemRows || `<tr><td style="padding:8px 12px;font-size:10pt;color:#999;" colspan="2">No line items</td></tr>`}
        <tr class="total-row">
          <td>Total</td>
          <td>${formatCurrency(total)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Estimated Turnaround -->
  ${
    quote.estimated_turnaround
      ? `
  <div class="section">
    <div class="section-title">Estimated Turnaround</div>
    <div><span class="turnaround-badge">${esc(quote.estimated_turnaround)}</span></div>
  </div>`
      : ""
  }

  <!-- Notes -->
  ${
    quote.notes
      ? `
  <div class="section">
    <div class="section-title">Notes</div>
    <div class="description-text">${esc(quote.notes)}</div>
  </div>`
      : ""
  }

  <div class="footer-contact">
    To proceed with this quote please contact us at <strong>jewellery@classa.com.au</strong> or call <strong>+61 8 8344 7722</strong>
  </div>

  <div class="fine-print">
    Prices are valid for 7 days from the date of this quote. Class A Jewellers reserves the right to amend this quote if item specifications change.
  </div>

</body>
</html>`;
}
