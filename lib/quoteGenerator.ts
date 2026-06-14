import { Quote, LineItem } from "./types";
import { BLACK_LOGO_DATA_URI } from "./logoDataURIs";
import { staffEmail } from "./staffEmails";

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

export function generateQuoteHTML(
  quote: Quote,
  opts?: { payment_link_url?: string | null; deposit_amount?: number | null }
): string {
  const customerName = [quote.customer_first_name, quote.customer_last_name]
    .filter(Boolean)
    .join(" ");
  const lastName = (quote.customer_last_name ?? "").trim().replace(/\s+/g, "_") || "Customer";

  // ── Detect builder quote ────────────────────────────────────────────────────
  const builderData = quote.quote_builder_data as Record<string, unknown> | null | undefined;
  const isBuilderQuote = builderData != null;

  // ── Builder quote: three-line layout ───────────────────────────────────────
  let itemsSection = "";
  if (isBuilderQuote) {
    const priceNum = quote.quoted_price ?? quote.total ?? null;
    const priceText = priceNum != null
      ? `$${Number(priceNum).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "&nbsp;";

    const qbd = builderData as Record<string, unknown>;

    // ── NEW: Multi-item builder format (builder_items array) ──────────────
    if (Array.isArray(qbd.builder_items)) {
      const builderItems = qbd.builder_items as Array<Record<string, unknown>>;
      const multiItem = builderItems.length > 1;

      const tdLbl = `padding:7px 12px;font-size:9pt;color:#555;border-right:1px solid #e8e8e8;width:110px;vertical-align:top;`;
      const tdVal = `padding:7px 12px;font-size:9pt;color:#222;`;
      const rowBg = `background:#f9f9f9;`;

      let rows = "";

      builderItems.forEach((item, itemIdx) => {
        const heading = esc((item.subcategory as string | null) || (item.item_type as string | null) || "Custom Order");
        const itemAiDesc = item.ai_description as string | null | undefined;
        const itemMetals = Array.isArray(item.metals) ? item.metals as Array<{ type?: string; weight?: number }> : [];
        const stoneOptions = Array.isArray(item.stone_options) ? item.stone_options as Array<Record<string, unknown>> : [];
        const meleeStones = Array.isArray(item.melee_stones) ? item.melee_stones as Array<Record<string, unknown>> : [];
        const addons = item.addons as Record<string, unknown> | null | undefined;
        const fingerSize = item.finger_size as string | null | undefined;
        const stockSku = item.stock_sku as string | null | undefined;
        const itemPrice = typeof item.quoted_price === "number" ? item.quoted_price : null;

        if (itemIdx > 0) rows += `<tr><td colspan="2" style="padding:0;height:8px;background:#fff;"></td></tr>`;
        rows += `<tr style="background:#000"><th colspan="2" style="color:#fff;font-size:10pt;letter-spacing:0.5px;padding:8px 12px;text-align:left;">${multiItem ? `${itemIdx + 1}. ` : ""}${heading}</th></tr>`;

        if (itemAiDesc) {
          rows += `<tr style="background:#fff"><td colspan="2" style="padding:12px 12px 10px;font-size:10pt;line-height:1.7;color:#111;font-style:italic;">${esc(itemAiDesc)}</td></tr>`;
        }
        rows += `<tr><td colspan="2" style="padding:0;height:1px;background:#e0e0e0;"></td></tr>`;

        itemMetals.filter(m => m.type).forEach(m => {
          const w = m.weight ? ` &mdash; ${m.weight}g` : "";
          rows += `<tr style="${rowBg}"><td style="${tdLbl}">Metal</td><td style="${tdVal}">${esc(m.type ?? "")}${w}</td></tr>`;
        });

        if (stoneOptions.length > 1) {
          let optRows = "";
          stoneOptions.forEach((opt, oi) => {
            const stones = Array.isArray(opt.stones) ? opt.stones as Array<Record<string, unknown>> : [];
            const specsText = stones.map(s =>
              [s.carat_weight != null ? `${s.carat_weight}ct` : null, s.colour, s.clarity, s.origin, s.shape]
                .map(v => (v != null && v !== "" ? String(v) : null)).filter(Boolean).join(" ")
            ).filter(Boolean).join("; ");
            const optPrice = typeof opt.quoted_price === "number"
              ? `$${opt.quoted_price.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "";
            optRows += `<tr style="background:${oi % 2 === 0 ? "#fff" : "#f5f5f5"}"><td style="padding:5px 8px;font-size:8.5pt;font-weight:600;color:#222;border-right:1px solid #ddd;width:70px;">${esc(String(opt.label || `Option ${oi + 1}`))}</td><td style="padding:5px 8px;font-size:8.5pt;color:#444;border-right:1px solid #ddd;">${esc(specsText)}</td><td style="padding:5px 8px;font-size:8.5pt;font-weight:700;color:#000;text-align:right;white-space:nowrap;">${optPrice}</td></tr>`;
          });
          rows += `<tr style="${rowBg}"><td style="${tdLbl};padding-top:9px;">Stone Options</td><td style="padding:6px 12px;"><table style="width:100%;border-collapse:collapse;border:1px solid #e0e0e0;"><thead><tr style="background:#444;"><th style="padding:5px 8px;font-size:7.5pt;color:#fff;text-align:left;border-right:1px solid #666;">Option</th><th style="padding:5px 8px;font-size:7.5pt;color:#fff;text-align:left;border-right:1px solid #666;">Specifications</th><th style="padding:5px 8px;font-size:7.5pt;color:#fff;text-align:right;">Price</th></tr></thead><tbody>${optRows}</tbody></table></td></tr>`;
        } else if (stoneOptions.length === 1) {
          const opt = stoneOptions[0];
          const stones = Array.isArray(opt.stones) ? opt.stones as Array<Record<string, unknown>> : [];
          stones.forEach((s, si) => {
            const parts = [s.carat_weight != null ? `${s.carat_weight}ct` : null, s.colour, s.clarity, s.origin, s.shape]
              .map(v => (v != null && v !== "" ? String(v) : null)).filter(Boolean).join(" ");
            const lbl = stones.length === 1 ? "Stone" : `Stone ${si + 1}`;
            if (parts) rows += `<tr style="${rowBg}"><td style="${tdLbl}">${lbl}</td><td style="${tdVal}">${esc(parts)}</td></tr>`;
          });
        }

        meleeStones.filter(r => r.stone_type).forEach(r => {
          const qty = (r.qty as number) || 1;
          const parts = [qty > 1 ? `${qty}×` : null, r.stone_type, r.shape, r.carat_weight ? `(${r.carat_weight}ct each)` : null]
            .map(v => (v != null && v !== "" ? String(v) : null)).filter(Boolean).join(" ");
          if (parts) rows += `<tr style="${rowBg}"><td style="${tdLbl}">Melee</td><td style="${tdVal}">${esc(parts)}</td></tr>`;
        });

        if (addons) {
          const addonLines: string[] = [];
          if (addons.hand_engraving) addonLines.push("Hand Engraving");
          if (addons.laser_engraving) addonLines.push("Laser Engraving");
          if (addons.butterflies) addonLines.push("Butterfly Earring Backs");
          if (addons.chain) addonLines.push("Chain");
          if ((addons.additional_labour as number) > 0) addonLines.push("Additional Labour");
          if (addonLines.length > 0) rows += `<tr style="${rowBg}"><td style="${tdLbl}">Inclusions</td><td style="${tdVal}">${addonLines.map(esc).join(", ")}</td></tr>`;
        }

        if (fingerSize) rows += `<tr style="${rowBg}"><td style="${tdLbl}">Finger Size</td><td style="${tdVal}">${esc(fingerSize)}</td></tr>`;
        if (stockSku) rows += `<tr style="${rowBg}"><td style="${tdLbl}">Stock Ref</td><td style="${tdVal};font-family:monospace;">${esc(stockSku)}</td></tr>`;

        if (multiItem && itemPrice != null) {
          rows += `<tr style="background:#333"><td style="color:#ccc;font-size:8.5pt;padding:7px 12px;border-right:1px solid #555;">Item Price</td><td style="color:#fff;font-size:12pt;font-weight:700;padding:7px 12px;">$${itemPrice.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`;
        }
      });

      const grandTotal = typeof qbd.total_quoted_price === "number" ? qbd.total_quoted_price : priceNum;
      const gtText = grandTotal != null
        ? `$${Number(grandTotal).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "&nbsp;";
      rows += `<tr style="background:#000"><td style="color:#fff;font-weight:bold;padding:10px 12px;border-right:1px solid #444;width:110px;font-size:9pt;">${multiItem ? "Total " : ""}Price (incl. GST)</td><td style="color:#fff;font-weight:bold;font-size:15pt;padding:10px 12px;">${gtText}</td></tr>`;

      itemsSection = `<table class="line-items"><tbody>${rows}</tbody></table>`;

    // ── New detailed builder layout (metals array present) ────────────────
    } else if (Array.isArray(qbd.metals)) {
      const heading = esc(
        (qbd.subcategory as string | null) ||
        (qbd.item_type as string | null) ||
        "Custom Order"
      );

      const aiDesc = (quote.ai_description as string | null | undefined) ||
        (qbd.ai_description as string | null) ||
        (qbd.design as string | null);

      const fingerSize = (quote.finger_size as string | null | undefined) || (qbd.finger_size as string | null);
      const stockSku = (quote.stock_sku as string | null | undefined) || (qbd.stock_sku as string | null);

      const metals = qbd.metals as Array<{ type?: string; weight?: number }>;

      const rawMs = qbd.main_stone;
      const mainStones: Array<Record<string, unknown>> = Array.isArray(rawMs)
        ? rawMs as Array<Record<string, unknown>>
        : rawMs != null ? [rawMs as Record<string, unknown>] : [];

      const rawMelee = qbd.melee_stones;
      const meleeStones: Array<Record<string, unknown>> = Array.isArray(rawMelee)
        ? rawMelee as Array<Record<string, unknown>> : [];

      const addons = qbd.addons as Record<string, unknown> | null | undefined;
      const addonLines: string[] = [];
      if (addons) {
        if (addons.hand_engraving) addonLines.push("Hand Engraving");
        if (addons.laser_engraving) addonLines.push("Laser Engraving");
        if (addons.butterflies) addonLines.push("Butterfly Earring Backs");
        if (addons.chain) addonLines.push("Chain");
        if ((addons.additional_labour as number) > 0) addonLines.push("Additional Labour");
      }

      const tdLabel = `padding:7px 12px;font-size:9pt;color:#555;border-right:1px solid #e8e8e8;width:110px;vertical-align:top;`;
      const tdValue = `padding:7px 12px;font-size:9pt;color:#222;`;
      const rowBg = `background:#f9f9f9;`;

      let rows = "";

      rows += `<tr style="background:#000"><th colspan="2" style="color:#fff;font-size:10pt;letter-spacing:0.5px;padding:8px 12px;text-align:left;">${heading}</th></tr>`;

      if (aiDesc) {
        rows += `<tr style="background:#fff"><td colspan="2" style="padding:12px 12px 10px;font-size:10pt;line-height:1.7;color:#111;font-style:italic;">${esc(aiDesc)}</td></tr>`;
      }

      rows += `<tr><td colspan="2" style="padding:0;height:1px;background:#e0e0e0;"></td></tr>`;

      metals.filter(m => m.type).forEach((m) => {
        const weightStr = m.weight ? `${m.weight}g` : "";
        rows += `<tr style="${rowBg}"><td style="${tdLabel}">Metal</td><td style="${tdValue}">${esc(m.type ?? "")}${weightStr ? ` &mdash; ${esc(weightStr)}` : ""}</td></tr>`;
      });

      mainStones.forEach((s, i) => {
        const parts = [
          s.carat_weight != null ? `${s.carat_weight}ct` : null,
          s.colour, s.clarity, s.origin, s.shape,
        ].map(v => (v != null && v !== "" ? String(v) : null)).filter(Boolean).join(" ");
        const lbl = mainStones.length === 1 ? "Stone" : `Stone ${i + 1}`;
        if (parts) {
          rows += `<tr style="${rowBg}"><td style="${tdLabel}">${lbl}</td><td style="${tdValue}">${esc(parts)}</td></tr>`;
        }
      });

      meleeStones.filter(r => r.stone_type).forEach((r) => {
        const qty = (r.qty as number) || 1;
        const parts = [
          qty > 1 ? `${qty}×` : null,
          r.stone_type,
          r.shape,
          r.carat_weight ? `(${r.carat_weight}ct each)` : null,
        ].map(v => (v != null && v !== "" ? String(v) : null)).filter(Boolean).join(" ");
        if (parts) {
          rows += `<tr style="${rowBg}"><td style="${tdLabel}">Melee</td><td style="${tdValue}">${esc(parts)}</td></tr>`;
        }
      });

      if (addonLines.length > 0) {
        rows += `<tr style="${rowBg}"><td style="${tdLabel}">Inclusions</td><td style="${tdValue}">${addonLines.map(esc).join(", ")}</td></tr>`;
      }

      if (fingerSize) {
        rows += `<tr style="${rowBg}"><td style="${tdLabel}">Finger Size</td><td style="${tdValue}">${esc(fingerSize)}</td></tr>`;
      }

      if (stockSku) {
        rows += `<tr style="${rowBg}"><td style="${tdLabel}">Stock Ref</td><td style="${tdValue};font-family:monospace;">${esc(stockSku)}</td></tr>`;
      }

      rows += `<tr style="background:#000"><td style="color:#fff;font-weight:bold;padding:10px 12px;border-right:1px solid #444;width:110px;font-size:9pt;">Price (incl. GST)</td><td style="color:#fff;font-weight:bold;font-size:15pt;padding:10px 12px;">${priceText}</td></tr>`;

      itemsSection = `
  <table class="line-items">
    <tbody>
      ${rows}
    </tbody>
  </table>`;

    // ── Legacy multi-item layout: qbd.items array (no metals key) ─────────
    } else if (Array.isArray(qbd.items) && (qbd.items as unknown[]).length > 0) {
      const items = qbd.items as Array<{ job_type?: string; description?: string; retail_price?: string }>;
      const totalPrice = items.reduce((sum, item) => sum + (parseFloat(item.retail_price ?? '') || 0), 0);
      const multiItem = items.length > 1;

      let rows = "";
      items.forEach((item) => {
        const jobType = item.job_type ? esc(item.job_type) : null;
        const desc = item.description ? esc(item.description).replace(/\n/g, "<br>") : null;
        const itemPrice = parseFloat(item.retail_price ?? '') || 0;
        const itemPriceText = `$${itemPrice.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (jobType) {
          rows += `<tr style="background:#000"><th colspan="2" style="color:#fff;font-size:10pt;letter-spacing:0.5px;padding:8px 12px;text-align:left;">${jobType}</th></tr>`;
        }
        if (desc) {
          rows += `<tr style="background:#fff"><td colspan="2" style="padding:10px 12px;font-size:9.5pt;line-height:1.6;color:#222;">${desc}</td></tr>`;
        }
        if (multiItem && itemPrice > 0) {
          rows += `<tr style="background:#f0f0f0"><td style="padding:8px 12px;font-size:9pt;color:#555;border-right:1px solid #ddd;width:80px;vertical-align:middle;">Price</td><td style="padding:10px 12px;font-size:12pt;font-weight:bold;color:#000;">${itemPriceText}</td></tr>`;
        }
      });

      if (multiItem) {
        const totalText = `$${totalPrice.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        rows += `<tr style="background:#000"><td style="color:#fff;font-weight:bold;padding:10px 12px;border-right:1px solid #444;width:80px;">Total</td><td style="color:#fff;font-weight:bold;font-size:14pt;padding:10px 12px;">${totalText}</td></tr>`;
      } else {
        rows += `<tr style="background:#f0f0f0"><td style="padding:8px 12px;font-size:9pt;color:#555;border-right:1px solid #ddd;width:80px;vertical-align:middle;">Price</td><td style="padding:10px 12px;font-size:14pt;font-weight:bold;color:#000;">${priceText}</td></tr>`;
      }

      itemsSection = `
  <table class="line-items">
    <tbody>
      ${rows}
    </tbody>
  </table>`;

    // ── Legacy layout: job type heading + free-text description ─────────────
    } else if (quote.job_description) {
      const jobTypeText = esc(quote.job_type ?? "Custom Order");
      const descText = esc(quote.job_description).replace(/\n/g, "<br>");

      itemsSection = `
  <table class="line-items">
    <thead>
      <tr>
        <th colspan="2" style="font-size:11pt;letter-spacing:1px;">${jobTypeText}</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background:#ffffff;">
        <td colspan="2" style="padding:14px 12px;font-size:10pt;color:#222;line-height:1.6;">${descText}</td>
      </tr>
      <tr style="background:#f0f0f0;">
        <td style="padding:8px 12px;font-size:9pt;color:#555;border-right:1px solid #ddd;vertical-align:middle;width:110px;">Price</td>
        <td style="padding:10px 12px;font-size:14pt;font-weight:bold;color:#000;">${priceText}</td>
      </tr>
    </tbody>
  </table>`;

    } else {
      // ── Legacy auto-generated layout: Design / Stone / Price ──────────────
      const qbd = builderData!;
      const designText = typeof qbd.design === "string" ? esc(qbd.design) : "&nbsp;";

      let stoneText = "&nbsp;";

      // main_stone is an array in the new format; fall back to wrapping legacy single object
      const rawMs = qbd.main_stone;
      const msArr: Array<Record<string, unknown>> = Array.isArray(rawMs)
        ? (rawMs as Array<Record<string, unknown>>)
        : rawMs != null
        ? [rawMs as Record<string, unknown>]
        : [];

      if (msArr.length > 0) {
        // Check if all stones have identical specs
        const first = msArr[0];
        const allSame = msArr.length === 1 || msArr.every(s =>
          s.carat_weight === first.carat_weight &&
          s.shape === first.shape &&
          s.colour === first.colour &&
          s.clarity === first.clarity &&
          s.origin === first.origin
        );

        if (allSame) {
          const qty = msArr.length;
          const carat = first.carat_weight != null ? `${first.carat_weight}ct ` : "";
          const parts = [first.colour, first.clarity, first.origin, first.shape]
            .map(v => (v != null && v !== "" ? String(v) : null))
            .filter(Boolean)
            .join(" ");
          stoneText = esc(`${qty > 1 ? `${qty}x ` : ""}${carat}${parts}`);
        } else {
          // Different specs — one line per stone
          stoneText = msArr.map((s, i) => {
            const carat = s.carat_weight != null ? `${s.carat_weight}ct ` : "";
            const parts = [s.colour, s.clarity, s.origin, s.shape]
              .map(v => (v != null && v !== "" ? String(v) : null))
              .filter(Boolean)
              .join(" ");
            return esc(`Stone ${i + 1}: ${carat}${parts}`);
          }).join("<br>");
        }
      }

      const showStoneRow = msArr.length > 0;
      const priceRowBg = showStoneRow ? "#ffffff" : "#f0f0f0";

      itemsSection = `
  <table class="line-items">
    <thead>
      <tr>
        <th style="width:110px;">Item</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background:#ffffff;">
        <td style="padding:8px 12px;font-size:9pt;color:#555;border-right:1px solid #ddd;vertical-align:top;">Design</td>
        <td style="padding:8px 12px;font-size:9pt;color:#333;">${designText}</td>
      </tr>
      ${showStoneRow ? `<tr style="background:#f0f0f0;">
        <td style="padding:8px 12px;font-size:9pt;color:#555;border-right:1px solid #ddd;vertical-align:top;">Stone/s</td>
        <td style="padding:8px 12px;font-size:9pt;color:#333;">${stoneText}</td>
      </tr>` : ""}
      <tr style="background:${priceRowBg};">
        <td style="padding:8px 12px;font-size:9pt;color:#555;border-right:1px solid #ddd;vertical-align:top;">Price</td>
        <td style="padding:10px 12px;font-size:14pt;font-weight:bold;color:#000;">${priceText}</td>
      </tr>
    </tbody>
  </table>`;
    }
  } else {
    // ── Regular quote: existing line items table ──────────────────────────────
    const lineItems: LineItem[] = quote.line_items ?? [];

    type FilledItem = LineItem & { _empty?: boolean };
    const MIN_ROWS = 8;
    const filledItems: FilledItem[] = [...lineItems];
    while (filledItems.length < MIN_ROWS) {
      filledItems.push({ design: "", stone: "", price: "", cost_price: "", _empty: true });
    }

    const tableRows = filledItems
      .map((li, i) => {
        const isEven = i % 2 === 0;
        const bg = isEven ? "#ffffff" : "#f0f0f0";
        const isEmpty = li._empty;
        const rowNum = isEmpty ? "" : String(i + 1);
        const design = isEmpty ? "&nbsp;" : esc(li.design);
        const stone  = isEmpty ? "&nbsp;" : esc(li.stone);
        const price  = isEmpty ? "&nbsp;" : esc(li.price);
        return `<tr style="background:${bg};">
          <td style="padding:6px 10px;font-size:9pt;color:#333;border-right:1px solid #ddd;width:32px;text-align:center;">${rowNum}</td>
          <td style="padding:6px 10px;font-size:9pt;color:#333;border-right:1px solid #ddd;">${design}</td>
          <td style="padding:6px 10px;font-size:9pt;color:#333;border-right:1px solid #ddd;">${stone}</td>
          <td style="padding:6px 10px;font-size:9pt;color:#333;text-align:right;white-space:nowrap;width:110px;">${price}</td>
        </tr>`;
      })
      .join("");

    itemsSection = `
  <table class="line-items">
    <thead>
      <tr>
        <th style="text-align:center;width:32px;">#</th>
        <th>Design</th>
        <th>Stone</th>
        <th style="text-align:right;white-space:nowrap;">Price (incl. GST)</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>`;
  }

  const createdDate = formatDateAU(quote.created_at) || formatDateAU(new Date().toISOString());
  const staffName = esc(quote.staff_member ?? "");
  const staffEmailAddr = staffEmail(quote.staff_member);
  const notesSection = quote.notes
    ? `<div style="margin:10px 0 0;padding:10px 12px;background:#f9f9f9;border-left:3px solid #555;font-size:9pt;color:#444;line-height:1.7;"><div style="font-weight:bold;font-size:7.5pt;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;color:#777;">Notes</div>${esc(quote.notes).replace(/\n/g, "<br>")}</div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Quote_${esc(quote.reference_number)}_${esc(lastName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: 148mm 210mm portrait; margin: 10mm 10mm 10mm 10mm; }

  /* ── Screen-only PDF save bar (hidden when printing) ── */
  @media screen {
    .pdf-bar {
      position: fixed;
      top: 0; left: 0; right: 0;
      background: #1d4ed8;
      color: #fff;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      z-index: 1000;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .pdf-bar p { margin: 0; line-height: 1.4; }
    .pdf-bar strong { font-weight: bold; }
    .pdf-bar button {
      background: #fff;
      color: #1d4ed8;
      border: none;
      padding: 9px 22px;
      border-radius: 7px;
      font-weight: bold;
      cursor: pointer;
      font-size: 13px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .pdf-bar button:hover { background: #e0e7ff; }
    body { margin-top: 56px; }
  }
  @media print {
    .pdf-bar { display: none !important; }
    body { margin-top: 0; }
  }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9pt;
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
  table.line-items thead th:nth-child(3) {
    width: 160px;
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
  .pdfshift-banner, [class*='pdfshift-'] { display: none !important; }
</style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div>
      <img class="wordmark-logo" src="${BLACK_LOGO_DATA_URI}" alt="Vault">
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

  <!-- Line items / builder section -->
  ${itemsSection}
  ${notesSection}

  <hr class="table-divider">

  ${opts?.payment_link_url ? `
  <!-- Pay Now button -->
  <div style="text-align:center;margin:14px 0 10px;">
    <a href="${opts.payment_link_url}" style="display:inline-block;background:#000;color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:13pt;font-weight:bold;padding:14px 36px;text-decoration:none;letter-spacing:0.5px;">
      PAY NOW${opts.deposit_amount != null ? ` — $${Number(opts.deposit_amount).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}
    </a>
    <div style="margin-top:6px;font-size:7.5pt;color:#888;">Secure payment powered by Stripe</div>
  </div>
  <hr class="table-divider">
  ` : ""}

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

  <!-- Screen-only: PDF save bar -->
  <div class="pdf-bar">
    <p>To save as PDF: click <strong>Save as PDF</strong> → choose <em>Save as PDF</em> as the printer → click Save.</p>
    <button onclick="window.print()">🖨&nbsp; Save as PDF</button>
  </div>

</body>
</html>`;
}
