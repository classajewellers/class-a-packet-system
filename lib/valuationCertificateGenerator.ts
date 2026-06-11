import { Packet, ItemSpecifications, StoneSpec } from "./types";

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCurrencyAU(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

export function generateValuationCertificate(packet: Packet, photoUrl?: string | null): void {
  const specs = (packet.item_specifications ?? {}) as Partial<ItemSpecifications>;
  const mainStone: Partial<StoneSpec> | undefined = (specs.stones ?? [])[0];
  const certNumber = packet.valuation_certificate_number;
  const approvedAt = packet.valuation_approved_at;
  const erv = packet.estimated_replacement_value;

  const customerName = [packet.customer_first_name, packet.customer_last_name].filter(Boolean).join(" ");
  const customerAddress = [packet.customer_street, packet.customer_suburb, packet.customer_state, packet.customer_postcode].filter(Boolean).join(", ");
  const certDate = approvedAt ? new Date(approvedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  const specRows: [string, string][] = [];
  if (specs.metal_type) {
    specRows.push(["Metal", [specs.metal_weight ? `${specs.metal_weight}g` : "", specs.metal_type, specs.hallmark ? `${specs.hallmark} hallmark` : "", specs.finish ? `${specs.finish} finish` : ""].filter(Boolean).join(", ")]);
  }
  if (mainStone?.stone_type) {
    specRows.push(["Main Stone", [mainStone.carat_weight ? `${mainStone.carat_weight}ct` : "", mainStone.shape, mainStone.stone_type].filter(Boolean).join(" ")]);
    if (mainStone.colour_grade) specRows.push(["Colour Grade", mainStone.colour_grade]);
    if (mainStone.clarity_grade) specRows.push(["Clarity Grade", mainStone.clarity_grade]);
    if (mainStone.cut_grade && mainStone.cut_grade !== "N/A") specRows.push(["Cut Grade", mainStone.cut_grade]);
    if (mainStone.polish && mainStone.polish !== "N/A") specRows.push(["Polish", mainStone.polish]);
    if (mainStone.symmetry && mainStone.symmetry !== "N/A") specRows.push(["Symmetry", mainStone.symmetry]);
    if (mainStone.fluorescence) specRows.push(["Fluorescence", mainStone.fluorescence]);
    if (mainStone.certificate_lab && mainStone.certificate_lab !== "None") {
      specRows.push(["Certificate", `${mainStone.certificate_lab}${mainStone.certificate_number ? ` #${mainStone.certificate_number}` : ""}`]);
    }
    if (mainStone.measurements) specRows.push(["Measurements", mainStone.measurements]);
    if (mainStone.setting_type) specRows.push(["Setting", mainStone.setting_type]);
  }
  if (specs.accent_description) specRows.push(["Accent Stones", specs.accent_description]);
  if (specs.ring_size) specRows.push(["Ring Size", specs.ring_size]);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Valuation Certificate — ${esc(certNumber ?? "DRAFT")}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4 portrait; margin: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; color: #1a1a1a; background: #fff; width: 210mm; }

  /* Header banner */
  .header-banner {
    background: #635BFF;
    color: #fff;
    padding: 20px 30px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .store-name { font-size: 22pt; font-weight: bold; letter-spacing: 2px; font-family: Georgia, serif; }
  .store-tagline { font-size: 8pt; letter-spacing: 3px; opacity: 0.85; margin-top: 3px; font-family: Arial, sans-serif; text-transform: uppercase; }
  .cert-meta { text-align: right; font-family: Arial, sans-serif; font-size: 8.5pt; color: #fff; line-height: 1.6; }

  .content { padding: 20px 30px; }

  /* Certificate title */
  .cert-title {
    text-align: center;
    margin-bottom: 16px;
    border-bottom: 2px solid #635BFF;
    padding-bottom: 12px;
  }
  .cert-title h1 { font-size: 17pt; font-weight: bold; letter-spacing: 1px; color: #1a1a1a; margin-bottom: 4px; }
  .cert-title p { font-size: 9.5pt; font-style: italic; color: #555; }

  /* Valuer box */
  .valuer-box {
    background: #f7f7f7;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 14px;
    font-family: Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.6;
  }
  .valuer-box strong { font-size: 10pt; }

  /* Two-column layout */
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
  .detail-box { font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.7; }
  .detail-box h3 { font-size: 7pt; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-bottom: 6px; font-family: Arial, sans-serif; }

  /* Item description */
  .item-section { margin-bottom: 14px; }
  .item-section h2 { font-size: 13pt; font-weight: bold; letter-spacing: 1px; margin-bottom: 6px; color: #1a1a1a; text-transform: uppercase; }
  .item-section p { font-size: 10pt; line-height: 1.7; color: #333; font-style: italic; }

  /* Specifications table */
  .spec-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-family: Arial, sans-serif; font-size: 9pt; }
  .spec-table td { padding: 6px 10px; border: 1px solid #e0e0e0; vertical-align: top; }
  .spec-table td:first-child { background: #f7f7f7; font-weight: 600; width: 35%; color: #555; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.5px; }

  /* Valuation photo */
  .photo-section { text-align: center; margin-bottom: 16px; }
  .photo-section img { max-width: 220px; max-height: 220px; object-fit: contain; border: 1px solid #e0e0e0; border-radius: 6px; }
  .photo-section p { font-family: Arial, sans-serif; font-size: 7.5pt; color: #888; margin-top: 4px; font-style: italic; }

  /* Valuation box */
  .valuation-box {
    border: 2px solid #1a1a1a;
    border-radius: 6px;
    padding: 16px;
    text-align: center;
    margin-bottom: 16px;
  }
  .valuation-box .erv-label { font-family: Arial, sans-serif; font-size: 8pt; text-transform: uppercase; letter-spacing: 3px; color: #555; margin-bottom: 6px; }
  .valuation-box .erv-value { font-size: 28pt; font-weight: bold; color: #1a1a1a; font-family: Arial, sans-serif; margin-bottom: 6px; }
  .valuation-box .erv-note { font-family: Arial, sans-serif; font-size: 8pt; color: #777; font-style: italic; }

  /* Signature */
  .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 16px; font-family: Arial, sans-serif; font-size: 9pt; }
  .sig-block { border-top: 1px solid #333; padding-top: 8px; }
  .sig-block p { line-height: 1.6; }

  /* Footer */
  .footer {
    border-top: 1px solid #e0e0e0;
    padding-top: 10px;
    text-align: center;
    font-family: Arial, sans-serif;
    font-size: 7.5pt;
    color: #888;
    line-height: 1.7;
  }
</style>
</head>
<body>

  <!-- Header -->
  <div class="header-banner">
    <div>
      <div class="store-name">CLASS A JEWELLERS</div>
      <div class="store-tagline">Est. 1989 &bull; Walkerville, South Australia</div>
    </div>
    <div class="cert-meta">
      <strong>Certificate No: ${esc(certNumber ?? "DRAFT")}</strong><br>
      Date of Valuation: ${esc(certDate)}<br>
      Ref: ${esc(packet.reference_number)}
    </div>
  </div>

  <div class="content">

    <!-- Title -->
    <div class="cert-title">
      <h1>JEWELLERY VALUATION CERTIFICATE</h1>
      <p>For Insurance Replacement Purposes</p>
    </div>

    <!-- Valuer + Client two-column -->
    <div class="two-col">
      <div class="valuer-box">
        <h3>Prepared By</h3>
        <strong>Sam Mucklow</strong><br>
        Licensed Jewellery Valuer<br>
        Vault<br>
        40 North East Road, Walkerville SA 5081<br>
        T: +61 8 8344 7722 &bull; E: sam@classa.com.au
      </div>
      <div class="detail-box">
        <h3>Client Details</h3>
        <strong>${esc(customerName) || "—"}</strong><br>
        ${customerAddress ? `${esc(customerAddress)}<br>` : ""}
        ${packet.customer_email ? `${esc(packet.customer_email)}<br>` : ""}
        ${packet.customer_phone ? esc(packet.customer_phone) : ""}
      </div>
    </div>

    <!-- Item description -->
    <div class="item-section">
      <h2>${esc(specs.item_type ?? "Jewellery Item")}</h2>
      ${specs.item_description ? `<p>${esc(specs.item_description)}</p>` : ""}
    </div>

    <!-- Specifications -->
    ${specRows.length > 0 ? `
    <table class="spec-table">
      <tbody>
        ${specRows.map(([k, v]) => `
        <tr>
          <td>${esc(k)}</td>
          <td>${esc(v)}</td>
        </tr>`).join("")}
      </tbody>
    </table>` : ""}

    ${photoUrl ? `
    <!-- Finished ring photo -->
    <div class="photo-section">
      <img src="${photoUrl}" alt="Finished item photograph" />
      <p>Photograph of the item as presented for valuation</p>
    </div>` : ""}

    <!-- Valuation -->
    <div class="valuation-box">
      <div class="erv-label">Estimated Replacement Value</div>
      <div class="erv-value">${formatCurrencyAU(erv)} AUD</div>
      <div class="erv-note">This valuation represents the estimated retail replacement cost at current market rates.</div>
    </div>

    <!-- Signature -->
    <div class="signature-section">
      <div class="sig-block">
        <p>Approved by: _________________________</p>
        <p>Sam Mucklow</p>
        <p>Licensed Jewellery Valuer</p>
      </div>
      <div class="sig-block">
        <p>Date: _____________________________</p>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      This certificate is valid for 3 years from the date of issue.<br>
      Vault recommends updating your valuation every 3 years.<br>
      Vault &bull; 40 North East Road Walkerville SA 5081 &bull; www.classa.com.au
    </div>

  </div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
