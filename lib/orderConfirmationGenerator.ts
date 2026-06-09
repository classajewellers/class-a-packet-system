import { Packet } from "@/lib/types";
import { packetTypeLabel, formatDateAU, formatCurrency } from "@/lib/formatters";

export function generateOrderConfirmationHTML(packet: Packet): string {
  const customerName = [packet.customer_first_name, packet.customer_last_name].filter(Boolean).join(" ");
  const balance = Math.max(0, (packet.total_charges ?? 0) - (packet.deposit ?? 0));

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #1B1F2E; }
  .store-info { text-align: right; font-size: 9pt; color: #555; line-height: 1.6; }
  .title { font-size: 22pt; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #1B1F2E; margin: 16px 0 4px; }
  .ref-line { font-size: 10pt; color: #666; margin-bottom: 20px; }
  .section { margin-bottom: 18px; }
  .section-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #635BFF; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 10px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; }
  .field label { font-size: 8pt; color: #888; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 1px; }
  .field span { font-size: 10pt; font-weight: 500; }
  .terms { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; font-size: 8.5pt; color: #555; line-height: 1.6; margin-top: 20px; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 8pt; color: #888; }
  .balance-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
  .balance-row.total { font-weight: 700; font-size: 11pt; border-top: 2px solid #1B1F2E; border-bottom: none; margin-top: 4px; }
  .badge { display: inline-block; background: #1B1F2E; color: white; font-size: 9pt; font-weight: 600; padding: 2px 10px; border-radius: 4px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size:18pt;font-weight:900;letter-spacing:2px;color:#1B1F2E;">CLASS A</div>
      <div style="font-size:10pt;color:#635BFF;font-weight:600;letter-spacing:1px;">JEWELLERS</div>
    </div>
    <div class="store-info">
      40 North East Road, Walkerville SA 5081<br>
      (08) 8344 7722<br>
      customercare@classa.com.au<br>
      www.classa.com.au
    </div>
  </div>

  <div class="title">Order Confirmation</div>
  <div class="ref-line">
    <span class="badge">${packet.reference_number}</span>
    &nbsp;&nbsp;Date: ${formatDateAU(new Date().toISOString().split("T")[0])}
  </div>

  <div class="section">
    <div class="section-title">Customer Details</div>
    <div class="grid-2">
      <div class="field"><label>Name</label><span>${customerName || "—"}</span></div>
      <div class="field"><label>Phone</label><span>${packet.customer_phone || "—"}</span></div>
      <div class="field"><label>Email</label><span>${packet.customer_email || "—"}</span></div>
      ${packet.customer_street ? `<div class="field"><label>Address</label><span>${[packet.customer_street, packet.customer_suburb, packet.customer_state, packet.customer_postcode].filter(Boolean).join(", ")}</span></div>` : ""}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Order Details</div>
    <div class="grid-2">
      <div class="field"><label>Order Type</label><span>${packetTypeLabel(packet.packet_type)}</span></div>
      <div class="field"><label>Staff Member</label><span>${packet.staff_member || "—"}</span></div>
      <div class="field"><label>In Date</label><span>${formatDateAU(packet.in_date) || "—"}</span></div>
      <div class="field"><label>Due Date</label><span>${formatDateAU(packet.due_date) || "—"}</span></div>
      ${packet.gift_wrapping !== null && packet.gift_wrapping !== undefined ? `<div class="field"><label>Gift Wrapping</label><span>${packet.gift_wrapping ? "Yes" : "No"}</span></div>` : ""}
      ${packet.delivery_method ? `<div class="field"><label>Delivery</label><span>${packet.delivery_method}</span></div>` : ""}
    </div>
    ${packet.articles ? `<div class="field" style="margin-top:10px"><label>Items / Articles</label><span style="white-space:pre-wrap">${packet.articles}</span></div>` : ""}
    ${packet.instructions ? `<div class="field" style="margin-top:8px"><label>Instructions</label><span style="white-space:pre-wrap">${packet.instructions}</span></div>` : ""}
  </div>

  <div class="section">
    <div class="section-title">Pricing</div>
    <div style="max-width:300px">
      <div class="balance-row"><span>Total Charges</span><span>${packet.total_charges != null ? formatCurrency(packet.total_charges) : "—"}</span></div>
      <div class="balance-row"><span>Deposit Paid</span><span>${packet.deposit != null ? formatCurrency(packet.deposit) : "—"}</span></div>
      <div class="balance-row total"><span>Balance Owing</span><span>${formatCurrency(balance)}</span></div>
    </div>
  </div>

  <div class="terms">
    <strong>Important:</strong> This confirmation records the details of your item(s) as provided at the time of drop-off. Please contact us within 24 hours if any details are incorrect. This store is not responsible for articles left over 30 days. No article can be picked up without your receipt.
  </div>

  <div class="footer">
    Vault &bull; 40 North East Road, Walkerville SA 5081 &bull; (08) 8344 7722 &bull; customercare@classa.com.au
  </div>
</body>
</html>`;
}

export function printOrderConfirmation(packet: Packet): void {
  const html = generateOrderConfirmationHTML(packet);
  const win = window.open("", "_blank");
  if (!win) {
    alert("Popup blocked. Please allow popups for this site.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}
