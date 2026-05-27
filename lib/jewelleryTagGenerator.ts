import { InventoryPiece } from './types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generatePieceTagHTML(piece: InventoryPiece, designName: string): string {
  const metalParts: string[] = [];
  if (piece.metal_karat) metalParts.push(piece.metal_karat);
  if (piece.metal_colour && piece.metal_colour !== 'N/A') metalParts.push(piece.metal_colour);
  const metalStr = metalParts.join(' ');

  const diamondParts: string[] = [];
  if (piece.diamond_type && piece.diamond_type !== 'None') {
    if (piece.diamond_carat) diamondParts.push(`${piece.diamond_carat}ct`);
    diamondParts.push(piece.diamond_type === 'Lab Grown' ? 'Lab' : piece.diamond_type);
    const grading: string[] = [];
    if (piece.diamond_colour) grading.push(piece.diamond_colour);
    if (piece.diamond_clarity) grading.push(piece.diamond_clarity);
    if (grading.length) diamondParts.push(grading.join('/'));
  }

  const sizeStr = piece.finger_size
    ? `Size ${piece.finger_size}`
    : (piece.other_specs || '');

  const specsParts: string[] = [];
  if (metalStr) specsParts.push(metalStr);
  if (diamondParts.length) specsParts.push(diamondParts.join(' '));
  if (sizeStr) specsParts.push(sizeStr);
  const specsLine = specsParts.join(' · ');

  const sku = piece.sku || '';
  const price = piece.retail_price != null ? `$${Number(piece.retail_price).toFixed(2)}` : '';

  // Libre Barcode 39 Text requires asterisks around the value as start/stop characters
  const barcodeValue = `*${sku}*`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Tag — ${escapeHtml(sku)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39+Text&display=swap" rel="stylesheet" />
<style>
  @page { size: 80mm 40mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #000; }
  .tag {
    width: 80mm; height: 40mm; box-sizing: border-box;
    padding: 2mm;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .design {
    font-size: 8pt; font-weight: 700;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.15;
  }
  .specs {
    font-size: 7pt;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.15;
    margin-top: 0.5mm;
  }
  .barcode {
    font-family: 'Libre Barcode 39 Text', monospace;
    font-size: 38pt;
    text-align: center;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
  }
  .sku-text {
    font-family: 'Courier New', monospace;
    font-size: 7pt;
    text-align: center;
    line-height: 1;
  }
  .footer {
    margin-top: auto;
    display: flex; justify-content: flex-end; align-items: flex-end;
  }
  .price {
    font-size: 10pt; font-weight: 700;
  }
</style>
</head>
<body>
<div class="tag">
  <div class="design">${escapeHtml(designName)}</div>
  <div class="specs">${escapeHtml(specsLine)}</div>
  <div class="barcode">${escapeHtml(barcodeValue)}</div>
  <div class="sku-text">${escapeHtml(sku)}</div>
  <div class="footer">
    <span class="price">${escapeHtml(price)}</span>
  </div>
</div>
<script>
  window.onload = function () { window.print(); };
</script>
</body>
</html>`;
}
