import { InventoryVariant } from './types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateJewelleryTagHTML(variant: InventoryVariant, productName: string): string {
  const metalParts: string[] = [];
  if (variant.metal_karat) metalParts.push(variant.metal_karat);
  if (variant.metal_colour && variant.metal_colour !== 'N/A') metalParts.push(variant.metal_colour);
  const metalStr = metalParts.join(' ');

  const diamondParts: string[] = [];
  if (variant.diamond_carat) diamondParts.push(`${variant.diamond_carat}ct`);
  if (variant.diamond_type && variant.diamond_type !== 'None') {
    diamondParts.push(variant.diamond_type === 'Lab Grown' ? 'Lab' : variant.diamond_type);
  }

  const sizeStr = variant.finger_size ? `Size ${variant.finger_size}` : '';

  const specsParts: string[] = [];
  if (metalStr) specsParts.push(metalStr);
  if (diamondParts.length) specsParts.push(diamondParts.join(' '));
  if (sizeStr) specsParts.push(sizeStr);
  const specsLine = specsParts.join(' · ');

  const sku = variant.sku || '';
  const price = variant.retail_price != null ? `$${variant.retail_price.toFixed(2)}` : '';

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
  @page { size: 40mm 20mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #000; }
  .tag {
    width: 40mm; height: 20mm; box-sizing: border-box;
    padding: 1.5mm 2mm;
    display: flex; flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }
  .product {
    font-size: 6pt; font-weight: 700;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.1;
  }
  .specs {
    font-size: 5pt;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.1;
  }
  .barcode {
    font-family: 'Libre Barcode 39 Text', sans-serif;
    font-size: 28pt;
    text-align: center;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
  }
  .sku-text {
    font-family: 'Courier New', monospace;
    font-size: 5pt;
    text-align: center;
    line-height: 1;
  }
  .footer {
    display: flex; justify-content: flex-end; align-items: flex-end;
  }
  .price {
    font-size: 7pt; font-weight: 700;
  }
</style>
</head>
<body>
<div class="tag">
  <div>
    <div class="product">${escapeHtml(productName)}</div>
    <div class="specs">${escapeHtml(specsLine)}</div>
  </div>
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
