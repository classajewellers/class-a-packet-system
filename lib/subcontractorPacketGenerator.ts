import { WorkshopJob } from "@/lib/types";

function formatDateAU(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function generateSubcontractorPacketHTML(job: WorkshopJob): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4 portrait; margin: 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid #1B1F2E; }
  .store-name { font-size: 22pt; font-weight: 900; letter-spacing: 2px; color: #1B1F2E; }
  .store-sub { font-size: 10pt; color: #635BFF; font-weight: 600; letter-spacing: 1px; }
  .store-info { text-align: right; font-size: 9pt; color: #555; line-height: 1.8; }
  .doc-title { font-size: 16pt; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #1B1F2E; margin: 20px 0 4px; }
  .sub-title { font-size: 11pt; color: #555; margin-bottom: 24px; }
  .to-block { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
  .to-label { font-size: 8pt; text-transform: uppercase; letter-spacing: 1.5px; color: #635BFF; font-weight: 700; margin-bottom: 4px; }
  .to-name { font-size: 18pt; font-weight: 800; color: #1B1F2E; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #635BFF; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 10px; }
  .due-block { background: #1B1F2E; color: white; border-radius: 8px; padding: 16px 24px; margin: 24px 0; display: flex; align-items: center; justify-content: space-between; }
  .due-label { font-size: 9pt; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.7; }
  .due-date { font-size: 22pt; font-weight: 900; }
  .ref-badge { display: inline-block; background: #635BFF; color: white; font-size: 9pt; font-weight: 700; padding: 3px 12px; border-radius: 4px; font-family: monospace; }
  .return-note { background: #EEF2FF; border: 1px solid #635BFF; border-radius: 8px; padding: 16px; font-size: 10pt; color: #1B1F2E; line-height: 1.6; margin-top: 24px; }
  .signature-line { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 8px; font-size: 9pt; color: #888; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="store-name">CLASS A</div>
      <div class="store-sub">JEWELLERS</div>
    </div>
    <div class="store-info">
      40 North East Road, Walkerville SA 5081<br>
      (08) 8344 7722<br>
      customercare@classa.com.au
    </div>
  </div>

  <div class="doc-title">Subcontractor Work Order</div>
  <div class="sub-title">Please complete the work described below and return to Vault.</div>

  <div class="to-block">
    <div class="to-label">To</div>
    <div class="to-name">${job.subcontractor_name ?? "—"}</div>
  </div>

  <div class="section">
    <div class="section-title">Work Description</div>
    <p style="font-size:11pt;line-height:1.6;">${job.description ?? "—"}</p>
  </div>

  ${job.subcontractor_instructions || job.instructions ? `
  <div class="section">
    <div class="section-title">Instructions</div>
    <p style="font-size:11pt;line-height:1.6;white-space:pre-wrap;">${job.subcontractor_instructions ?? job.instructions ?? ""}</p>
  </div>` : ""}

  <div class="due-block">
    <div>
      <div class="due-label">Return Due Date</div>
      <div class="due-date">${formatDateAU(job.subcontractor_due_date)}</div>
    </div>
    ${job.reference_number ? `<div class="ref-badge">${job.reference_number}</div>` : ""}
  </div>

  <div class="return-note">
    <strong>Please return completed work to:</strong><br>
    Vault, 40 North East Road, Walkerville SA 5081<br>
    Phone: (08) 8344 7722 &bull; Email: customercare@classa.com.au
  </div>

  <div class="signature-line">
    Received by: ___________________________________ &nbsp;&nbsp;&nbsp; Date: _______________
  </div>
</body>
</html>`;
}

export function printSubcontractorPacket(job: WorkshopJob): void {
  const html = generateSubcontractorPacketHTML(job);
  const win = window.open("", "_blank");
  if (!win) {
    alert("Popup blocked. Please allow popups.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}
