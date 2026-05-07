import { Quote, LineItem } from "./types";
import { formatCurrency } from "./formatters";
import { BLACK_LOGO_DATA_URI } from "./logoDataURIs";

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

function staffEmail(staffMember: string | null | undefined): string {
  if (!staffMember) return "jewellery@classa.com.au";
  const lower = staffMember.toLowerCase().trim();
  const map: Record<string, string> = {
    "josh mucklow": "josh@classa.com.au",
    "brad mucklow": "brad@classa.com.au",
    "ben mucklow": "ben@classa.com.au",
    "sam mucklow": "sam@classa.com.au",
  };
  return map[lower] ?? "jewellery@classa.com.au";
}

export function generateQuoteHTML(quote: Quote): string {
  const customerName = [quote.customer_first_name, quote.customer_last_name]
    .filter(Boolean)
    .join(" ");

  const lineItems: LineItem[] = quote.line_items ?? [];
  const total = quote.total ?? lineItems.reduce((s, li) => s + li.price, 0);

  // Build table rows — minimum 8 rows (fill with empties)
  const MIN_ROWS = 8;
  const filledItems = [...lineItems];
  while (filledItems.length < MIN_ROWS) {
    filledItems.push({ description: "", price: 0, _empty: true } as LineItem & { _empty?: boolean });
  }

  const tableRows = filledItems
    .map((li, i) => {
      const isEven = i % 2 === 0;
      const bg = isEven ? "#ffffff" : "#f0f0f0";
      const isEmpty = (li as LineItem & { _empty?: boolean })._empty;
      const rowNum = isEmpty ? "" : String(i + 1);
      const desc = isEmpty ? "&nbsp;" : esc(li.description);
      const price = isEmpty ? "&nbsp;" : (li.price ? formatCurrency(li.price) : "&nbsp;");
      return `<tr style="background:${bg};">
        <td style="padding:6px 10px;font-size:9pt;color:#333;border-right:1px solid #ddd;width:32px;text-align:center;">${rowNum}</td>
        <td style="padding:6px 10px;font-size:9pt;color:#333;border-right:1px solid #ddd;">${desc}</td>
        <td style="padding:6px 10px;font-size:9pt;color:#333;text-align:right;white-space:nowrap;width:110px;">${price}</td>
      </tr>`;
    })
    .join("");

  const createdDate = formatDateAU(quote.created_at) || formatDateAU(new Date().toISOString());
  const staffName = esc(quote.staff_member ?? "");
  const staffEmailAddr = staffEmail(quote.staff_member);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Quotation ${esc(quote.reference_number)} — Class A Jewellers</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 15mm 15mm 15mm 15mm; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10pt;
    color: #000;
    background: #fff;
  }

  /* ── Header ── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 14px;
  }
  .wordmark-logo {
    max-height: 60px;
    width: auto;
    object-fit: contain;
    display: block;
  }
  .header-right {
    text-align: right;
  }
  .quotation-title {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 22pt;
    font-weight: bold;
    letter-spacing: 2px;
    color: #000;
    line-height: 1;
    text-transform: uppercase;
  }
  .header-address {
    font-size: 8pt;
    color: #333;
    margin-top: 5px;
    line-height: 1.6;
  }

  /* ── Divider ── */
  .divider {
    border: none;
    border-top: 1.5px solid #000;
    margin: 10px 0 16px 0;
  }

  /* ── Customer / Date row ── */
  .customer-date-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 20px;
    gap: 20px;
  }
  .underline-field {
    flex: 1;
  }
  .underline-field-right {
    flex: 0 0 auto;
    min-width: 140px;
    text-align: right;
  }
  .field-label {
    font-size: 8pt;
    color: #555;
    margin-bottom: 3px;
  }
  .field-underline {
    font-size: 11pt;
    font-weight: 600;
    color: #000;
    border-bottom: 1px solid #000;
    padding-bottom: 2px;
    min-height: 20px;
  }

  /* ── Reference number row ── */
  .ref-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }
  .ref-label {
    font-size: 8pt;
    color: #555;
  }
  .ref-number {
    font-family: 'Courier New', monospace;
    font-size: 9pt;
    font-weight: bold;
    color: #000;
  }

  /* ── Line items table ── */
  table.line-items {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #ccc;
    margin-bottom: 0;
  }
  table.line-items thead tr {
    background: #000;
  }
  table.line-items thead th {
    padding: 8px 10px;
    text-align: left;
    font-size: 8.5pt;
    font-weight: bold;
    color: #fff;
    letter-spacing: 0.5px;
  }
  table.line-items thead th:last-child {
    text-align: right;
    white-space: nowrap;
  }
  table.line-items thead th:first-child {
    text-align: center;
    width: 32px;
  }
  .table-divider {
    border: none;
    border-top: 1.5px solid #000;
    margin: 0;
  }
  .total-section {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
    margin-bottom: 24px;
  }
  .total-label {
    font-size: 11pt;
    font-weight: bold;
    color: #000;
    margin-right: 20px;
    letter-spacing: 1px;
  }
  .total-amount {
    font-size: 11pt;
    font-weight: bold;
    color: #000;
    min-width: 110px;
    text-align: right;
  }

  /* ── Footer ── */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-top: 10px;
    padding-top: 12px;
    border-top: 1px solid #ccc;
  }
  .footer-terms {
    flex: 1;
    font-size: 8pt;
    color: #777;
    font-style: italic;
    line-height: 1.7;
  }
  .footer-staff {
    flex: 0 0 auto;
    text-align: right;
    font-size: 9pt;
    line-height: 1.7;
  }
  .footer-staff-name {
    font-weight: bold;
    color: #000;
  }
  .footer-staff-contact {
    color: #333;
  }
</style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div>
      <img class="wordmark-logo" src="${BLACK_LOGO_DATA_URI}" alt="Class A Jewellers">
    </div>
    <div class="header-right">
      <div class="quotation-title">Quotation</div>
      <div class="header-address">
        40 North East Road, Walkerville SA 5081<br>
        08 8344 7722 &nbsp;|&nbsp; classa.com.au
      </div>
    </div>
  </div>

  <hr class="divider">

  <!-- Reference row -->
  <div class="ref-row">
    <span class="ref-label">Reference: <span class="ref-number">${esc(quote.reference_number)}</span></span>
  </div>

  <!-- Customer / Date row -->
  <div class="customer-date-row">
    <div class="underline-field">
      <div class="field-label">Customer Name</div>
      <div class="field-underline">${esc(customerName) || "&nbsp;"}</div>
    </div>
    <div class="underline-field-right">
      <div class="field-label">Date</div>
      <div class="field-underline">${esc(createdDate)}</div>
    </div>
  </div>

  <!-- Line items table -->
  <table class="line-items">
    <thead>
      <tr>
        <th style="text-align:center;width:32px;">#</th>
        <th>Description</th>
        <th style="text-align:right;white-space:nowrap;">Price (incl. GST)</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <hr class="table-divider">

  <!-- Total -->
  <div class="total-section">
    <span class="total-label">TOTAL</span>
    <span class="total-amount">${formatCurrency(total)}</span>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-terms">
      Valid for 7 business days from the date of this quotation, subject to availability.<br>
      A 20% deposit is required to commence work.
    </div>
    <div class="footer-staff">
      ${staffName ? `<div class="footer-staff-name">${staffName}</div>` : ""}
      <div class="footer-staff-contact">${esc(staffEmailAddr)}</div>
      <div class="footer-staff-contact">08 8344 7722</div>
    </div>
  </div>

</body>
</html>`;
}
