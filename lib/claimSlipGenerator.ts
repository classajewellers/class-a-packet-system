/* eslint-disable @typescript-eslint/no-explicit-any */
import { Packet } from "./types";
import { formatDateAU, formatCurrency } from "./formatters";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveDelivery(packet: Packet): string {
  let pd: any = {};
  try {
    pd =
      typeof packet.packet_data === "string"
        ? JSON.parse(packet.packet_data)
        : (packet.packet_data ?? {});
  } catch {
    pd = {};
  }
  return (
    (packet as any).delivery_method ||
    packet.shipping_method ||
    pd?.shipping_method ||
    pd?.shippingMethod ||
    pd?.shipping_lines?.[0]?.title ||
    pd?.shippingLines?.[0]?.title ||
    "Pickup"
  );
}

/**
 * Generate an A5 claim slip HTML page for the customer.
 * Suitable for upload to Supabase Storage and sharing via SMS link.
 */
export function generateClaimSlipHTML(packet: Packet): string {
  const customerName =
    [packet.customer_first_name, packet.customer_last_name]
      .filter(Boolean)
      .join(" ") || "Customer";

  const dueDate = packet.due_date ? formatDateAU(packet.due_date) : "—";
  const totalCharges = formatCurrency(packet.total_charges);
  const deposit = formatCurrency(packet.deposit);
  const balanceOwing = Math.max(
    0,
    (packet.total_charges ?? 0) - (packet.deposit ?? 0)
  );
  const balance = formatCurrency(balanceOwing);

  const giftWrap =
    packet.gift_wrapping === true ||
    (packet.gift_wrapping as unknown) === "true"
      ? "YES"
      : "NO";

  const delivery = resolveDelivery(packet);

  const address = [
    packet.customer_street,
    packet.customer_suburb,
    packet.customer_state,
    packet.customer_postcode,
  ]
    .filter(Boolean)
    .join(", ");

  const issuedDate = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Articles block — show both articles and instructions if both present
  let articlesBlock = "";
  if (packet.articles && packet.instructions) {
    articlesBlock = `${packet.articles}\n\nInstructions: ${packet.instructions}`;
  } else {
    articlesBlock = packet.articles || packet.instructions || "—";
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claim Slip — ${esc(packet.reference_number)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    @page {
      size: A5 portrait;
      margin: 10mm 12mm;
    }

    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 9.5pt;
      color: #000;
      background: #fff;
      max-width: 124mm;
      margin: 0 auto;
      padding: 8mm 10mm;
    }

    /* ── Header ─── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 7pt;
      border-bottom: 2.5px solid #000;
      margin-bottom: 8pt;
    }
    .store-name {
      font-size: 14pt;
      font-weight: 900;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      line-height: 1.1;
    }
    .store-tagline {
      font-size: 7pt;
      color: #444;
      margin-top: 2pt;
      letter-spacing: 0.04em;
    }
    .store-details {
      font-size: 7pt;
      color: #444;
      line-height: 1.6;
      text-align: right;
    }

    /* ── CLAIM SLIP heading ─── */
    .claim-heading {
      text-align: center;
      margin: 6pt 0 5pt;
    }
    .claim-heading h1 {
      font-size: 17pt;
      font-weight: 900;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      border: 3px solid #000;
      display: inline-block;
      padding: 3pt 14pt;
    }

    /* ── Ref + customer ─── */
    .ref-number {
      text-align: center;
      font-size: 13pt;
      font-family: 'Courier New', Courier, monospace;
      font-weight: 700;
      letter-spacing: 0.1em;
      margin: 4pt 0 2pt;
    }
    .customer-name {
      text-align: center;
      font-size: 12pt;
      font-weight: 700;
      margin-bottom: 6pt;
    }
    .issued-date {
      text-align: center;
      font-size: 7.5pt;
      color: #555;
      margin-bottom: 5pt;
    }

    /* ── Due date box ─── */
    .due-date-box {
      background: #000;
      color: #fff;
      text-align: center;
      padding: 5pt 8pt;
      font-size: 11pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 8pt;
    }

    /* ── Sections ─── */
    .section {
      margin-bottom: 7pt;
    }
    .section-title {
      font-size: 7pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      border-bottom: 1.5px solid #000;
      padding-bottom: 1.5pt;
      margin-bottom: 3pt;
    }
    .section-content {
      font-size: 9pt;
      line-height: 1.55;
    }

    /* ── Articles box ─── */
    .articles-box {
      border: 1px solid #000;
      padding: 5pt 7pt;
      font-size: 8.5pt;
      line-height: 1.65;
      white-space: pre-wrap;
      min-height: 36pt;
    }

    /* ── Meta row (gift wrap / delivery / staff) ─── */
    .meta-row {
      display: flex;
      gap: 0;
      border: 1px solid #000;
      margin-bottom: 7pt;
    }
    .meta-cell {
      flex: 1;
      padding: 4pt 6pt;
      border-right: 1px solid #000;
    }
    .meta-cell:last-child {
      border-right: none;
    }
    .meta-label {
      font-size: 6.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 2pt;
    }
    .meta-value {
      font-size: 8.5pt;
      font-weight: 600;
    }

    /* ── Pricing table ─── */
    .price-table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000;
    }
    .price-table td {
      padding: 3.5pt 7pt;
      font-size: 9pt;
      border-bottom: 1px solid #ccc;
    }
    .price-table tr:last-child td {
      font-weight: 700;
      font-size: 10pt;
      border-top: 2px solid #000;
      border-bottom: none;
      background: #f5f5f5;
    }
    .price-table td:last-child {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    /* ── Disclaimer ─── */
    .disclaimer {
      border: 2.5px solid #000;
      padding: 6pt 8pt;
      font-size: 7.5pt;
      font-weight: 700;
      text-align: center;
      line-height: 1.6;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      margin: 8pt 0 7pt;
    }

    /* ── Signature ─── */
    .signature-line {
      display: flex;
      align-items: flex-end;
      gap: 6pt;
      font-size: 9pt;
      margin-bottom: 8pt;
    }
    .signature-blank {
      flex: 1;
      border-bottom: 1.5px solid #000;
      height: 16pt;
    }

    /* ── Footer ─── */
    .footer {
      border-top: 1.5px solid #000;
      padding-top: 5pt;
      font-size: 7pt;
      text-align: center;
      color: #444;
      line-height: 1.5;
    }

    /* ── Mobile view (when opened in browser, not print) ─── */
    @media screen {
      body {
        max-width: 480px;
        padding: 16px;
        font-size: 11pt;
      }
      .claim-heading h1 { font-size: 20pt; }
      .ref-number { font-size: 15pt; }
      .customer-name { font-size: 14pt; }
      .due-date-box { font-size: 13pt; }
    }
  </style>
</head>
<body>

  <!-- ── Header ── -->
  <div class="header">
    <div>
      <div class="store-name">Class A<br>Jewellers</div>
      <div class="store-tagline">Expert Jewellery Services</div>
    </div>
    <div class="store-details">
      40 North East Road<br>
      Walkerville SA 5081<br>
      +61 8 8344 7722<br>
      customercare@classa.com.au
    </div>
  </div>

  <!-- ── CLAIM SLIP heading ── -->
  <div class="claim-heading">
    <h1>Claim Slip</h1>
  </div>

  <!-- ── Reference + Customer ── -->
  <div class="ref-number">${esc(packet.reference_number)}</div>
  <div class="customer-name">${esc(customerName)}</div>
  <div class="issued-date">Issued: ${esc(issuedDate)}</div>

  <!-- ── Due date ── -->
  <div class="due-date-box">Collect By: ${esc(dueDate)}</div>

  <!-- ── Customer Details ── -->
  <div class="section">
    <div class="section-title">Customer Details</div>
    <div class="section-content">
      ${packet.customer_phone ? `<div><strong>Phone:</strong> ${esc(packet.customer_phone)}</div>` : ""}
      ${packet.customer_email ? `<div><strong>Email:</strong> ${esc(packet.customer_email)}</div>` : ""}
      ${address ? `<div><strong>Address:</strong> ${esc(address)}</div>` : ""}
    </div>
  </div>

  <!-- ── Articles & Instructions ── -->
  <div class="section">
    <div class="section-title">Articles &amp; Instructions</div>
    <div class="articles-box">${esc(articlesBlock)}</div>
  </div>

  <!-- ── Meta: gift wrap / delivery / staff ── -->
  <div class="meta-row">
    <div class="meta-cell">
      <div class="meta-label">Gift Wrapping</div>
      <div class="meta-value">${giftWrap}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Delivery</div>
      <div class="meta-value">${esc(delivery)}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Taken By</div>
      <div class="meta-value">${esc(packet.staff_member ?? "—")}</div>
    </div>
  </div>

  <!-- ── Pricing ── -->
  <div class="section">
    <div class="section-title">Pricing</div>
    <table class="price-table">
      <tr>
        <td>Total Charges</td>
        <td>${esc(totalCharges)}</td>
      </tr>
      <tr>
        <td>Deposit Paid</td>
        <td>${esc(deposit)}</td>
      </tr>
      <tr>
        <td>Balance Owing</td>
        <td>${esc(balance)}</td>
      </tr>
    </table>
  </div>

  <!-- ── Disclaimer ── -->
  <div class="disclaimer">
    This claim slip is required for collection.<br>
    This store is not responsible for articles left over 30 days.<br>
    No article can be picked up without this slip.
  </div>

  <!-- ── Signature ── -->
  <div class="signature-line">
    <span>Customer signature:</span>
    <div class="signature-blank"></div>
  </div>

  <!-- ── Footer ── -->
  <div class="footer">
    Class A Jewellers &nbsp;|&nbsp; 40 North East Road Walkerville SA 5081 &nbsp;|&nbsp; +61 8 8344 7722
  </div>

</body>
</html>`;
}
