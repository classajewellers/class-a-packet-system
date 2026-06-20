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

export interface BankDetails {
  bank_name?: string | null;
  account_name?: string | null;
  bsb?: string | null;
  account_number?: string | null;
}

export function generateQuoteHTML(
  quote: Quote,
  opts?: { payment_link_url?: string | null; deposit_amount?: number | null; hidePayment?: boolean; bankDetails?: BankDetails | null }
): string {
  const customerName = [quote.customer_first_name, quote.customer_last_name]
    .filter(Boolean)
    .join(" ");
  const lastName = (quote.customer_last_name ?? "").trim().replace(/\s+/g, "_") || "Customer";

  // ── Shared row style constants ───────────────────────────────────────────────
  const SL = `width:110px;padding:7px 16px 7px 0;font-size:8pt;color:#9CA3AF;vertical-align:top;border-bottom:1px solid #F0F0F5;`;
  const SV = `padding:7px 0;font-size:9pt;color:#1A1A2E;border-bottom:1px solid #F0F0F5;`;
  const PRICE_LBL = `width:110px;padding:12px 16px 4px 0;font-size:7.5pt;text-transform:uppercase;letter-spacing:0.08em;color:#9CA3AF;border-top:1px solid #E8E8F0;`;
  const PRICE_VAL = `padding:12px 0 4px;font-size:15pt;font-weight:700;color:#1A1A2E;text-align:right;border-top:1px solid #E8E8F0;`;

  const secHdr = (label: string) =>
    `<tr><td colspan="2" style="padding:14px 0 0;"><div style="font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#635BFF;padding-bottom:7px;">${label}</div><div style="height:1px;background:#E8E8F0;"></div></td></tr>`;

  // ── Detect builder quote ────────────────────────────────────────────────────
  const builderData = quote.quote_builder_data as Record<string, unknown> | null | undefined;
  const isBuilderQuote = builderData != null;

  // ── Builder quote ───────────────────────────────────────────────────────────
  let itemsSection = "";
  if (isBuilderQuote) {
    const priceNum = quote.quoted_price ?? quote.total ?? null;
    const priceText = priceNum != null
      ? `$${Number(priceNum).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "&nbsp;";

    const qbd = builderData as Record<string, unknown>;

    // ── Multi-item builder (builder_items array) ──────────────────────────────
    if (Array.isArray(qbd.builder_items)) {
      const builderItems = qbd.builder_items as Array<Record<string, unknown>>;
      const multiItem = builderItems.length > 1;
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

        if (itemIdx > 0) rows += `<tr><td colspan="2" style="padding:0;height:10px;"></td></tr>`;
        rows += secHdr(`${multiItem ? `${itemIdx + 1}. ` : ""}${heading}`);

        if (itemAiDesc) {
          rows += `<tr><td colspan="2" style="padding:10px 0 12px;font-size:10.5pt;font-style:italic;line-height:1.85;color:#1A1A2E;">${esc(itemAiDesc)}</td></tr>`;
        }

        itemMetals.filter(m => m.type).forEach(m => {
          const w = m.weight ? ` &mdash; ${m.weight}g` : "";
          rows += `<tr><td style="${SL}">Metal</td><td style="${SV}">${esc(m.type ?? "")}${w}</td></tr>`;
        });

        if (stoneOptions.length > 1) {
          stoneOptions.forEach((opt, oi) => {
            const stones = Array.isArray(opt.stones) ? opt.stones as Array<Record<string, unknown>> : [];
            const specsText = stones.map(s =>
              [s.carat_weight != null ? `${s.carat_weight}ct` : null, s.colour, s.clarity, s.origin, s.shape]
                .map(v => (v != null && v !== "" ? String(v) : null)).filter(Boolean).join(" ")
            ).filter(Boolean).join("; ");
            const optPrice = typeof opt.quoted_price === "number"
              ? `$${opt.quoted_price.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "";
            const optLabel = esc(String(opt.label || `Option ${oi + 1}`));
            const priceSpan = optPrice ? `<span style="float:right;color:#635BFF;font-weight:600;">${optPrice}</span>` : "";
            rows += `<tr><td style="${SL}"><span style="font-weight:600;">${optLabel}</span></td><td style="${SV}">${esc(specsText)}${priceSpan}</td></tr>`;
          });
        } else if (stoneOptions.length === 1) {
          const opt = stoneOptions[0];
          const stones = Array.isArray(opt.stones) ? opt.stones as Array<Record<string, unknown>> : [];
          stones.forEach((s, si) => {
            const parts = [s.carat_weight != null ? `${s.carat_weight}ct` : null, s.colour, s.clarity, s.origin, s.shape]
              .map(v => (v != null && v !== "" ? String(v) : null)).filter(Boolean).join(" ");
            const lbl = stones.length === 1 ? "Stone" : `Stone ${si + 1}`;
            if (parts) rows += `<tr><td style="${SL}">${lbl}</td><td style="${SV}">${esc(parts)}</td></tr>`;
          });
        }

        meleeStones.filter(r => r.stone_type).forEach(r => {
          const qty = (r.qty as number) || 1;
          const parts = [qty > 1 ? `${qty}×` : null, r.stone_type, r.shape, r.carat_weight ? `(${r.carat_weight}ct each)` : null]
            .map(v => (v != null && v !== "" ? String(v) : null)).filter(Boolean).join(" ");
          if (parts) rows += `<tr><td style="${SL}">Melee</td><td style="${SV}">${esc(parts)}</td></tr>`;
        });

        if (addons) {
          const addonLines: string[] = [];
          if (addons.hand_engraving) addonLines.push("Hand Engraving");
          if (addons.laser_engraving) addonLines.push("Laser Engraving");
          if (addons.butterflies) addonLines.push("Butterfly Earring Backs");
          if (addons.chain) addonLines.push("Chain");
          if ((addons.additional_labour as number) > 0) addonLines.push("Additional Labour");
          if (Array.isArray(addons.components)) {
            (addons.components as Array<{ name: string }>).forEach(c => { if (c.name) addonLines.push(c.name); });
          }
          if (addonLines.length > 0) rows += `<tr><td style="${SL}">Inclusions</td><td style="${SV}">${addonLines.map(esc).join(", ")}</td></tr>`;
        }

        if (fingerSize) rows += `<tr><td style="${SL}">Finger Size</td><td style="${SV}">${esc(fingerSize)}</td></tr>`;
        if (stockSku)   rows += `<tr><td style="${SL}">Stock Ref</td><td style="${SV};font-family:monospace;">${esc(stockSku)}</td></tr>`;

        if (multiItem && itemPrice != null) {
          const ipStr = `$${itemPrice.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          rows += `<tr><td style="width:110px;padding:9px 16px 9px 0;font-size:8pt;color:#9CA3AF;border-top:1px solid #E8E8F0;">Item Price</td><td style="padding:9px 0;font-size:12pt;font-weight:700;color:#1A1A2E;text-align:right;border-top:1px solid #E8E8F0;">${ipStr}</td></tr>`;
        }
      });

      const grandTotal = typeof qbd.total_quoted_price === "number" ? qbd.total_quoted_price : priceNum;
      const gtText = grandTotal != null
        ? `$${Number(grandTotal).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "&nbsp;";
      const totalLabel = multiItem ? "Total Price (incl. GST)" : "Price (incl. GST)";
      rows += `<tr><td style="${PRICE_LBL}">${totalLabel}</td><td style="${PRICE_VAL}">${gtText}</td></tr>`;

      itemsSection = `<table class="line-items"><tbody>${rows}</tbody></table>`;

    // ── Detailed builder (metals array) ───────────────────────────────────────
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

      let rows = "";
      rows += secHdr(heading);

      if (aiDesc) {
        rows += `<tr><td colspan="2" style="padding:10px 0 12px;font-size:10.5pt;font-style:italic;line-height:1.85;color:#1A1A2E;">${esc(aiDesc)}</td></tr>`;
      }

      metals.filter(m => m.type).forEach(m => {
        const weightStr = m.weight ? ` &mdash; ${m.weight}g` : "";
        rows += `<tr><td style="${SL}">Metal</td><td style="${SV}">${esc(m.type ?? "")}${weightStr}</td></tr>`;
      });

      mainStones.forEach((s, i) => {
        const parts = [
          s.carat_weight != null ? `${s.carat_weight}ct` : null,
          s.colour, s.clarity, s.origin, s.shape,
        ].map(v => (v != null && v !== "" ? String(v) : null)).filter(Boolean).join(" ");
        const lbl = mainStones.length === 1 ? "Stone" : `Stone ${i + 1}`;
        if (parts) rows += `<tr><td style="${SL}">${lbl}</td><td style="${SV}">${esc(parts)}</td></tr>`;
      });

      meleeStones.filter(r => r.stone_type).forEach(r => {
        const qty = (r.qty as number) || 1;
        const parts = [
          qty > 1 ? `${qty}×` : null,
          r.stone_type, r.shape,
          r.carat_weight ? `(${r.carat_weight}ct each)` : null,
        ].map(v => (v != null && v !== "" ? String(v) : null)).filter(Boolean).join(" ");
        if (parts) rows += `<tr><td style="${SL}">Melee</td><td style="${SV}">${esc(parts)}</td></tr>`;
      });

      if (addonLines.length > 0) rows += `<tr><td style="${SL}">Inclusions</td><td style="${SV}">${addonLines.map(esc).join(", ")}</td></tr>`;
      if (fingerSize) rows += `<tr><td style="${SL}">Finger Size</td><td style="${SV}">${esc(fingerSize)}</td></tr>`;
      if (stockSku)   rows += `<tr><td style="${SL}">Stock Ref</td><td style="${SV};font-family:monospace;">${esc(stockSku)}</td></tr>`;

      rows += `<tr><td style="${PRICE_LBL}">Price (incl. GST)</td><td style="${PRICE_VAL}">${priceText}</td></tr>`;

      itemsSection = `<table class="line-items"><tbody>${rows}</tbody></table>`;

    // ── Legacy multi-item layout (qbd.items array) ────────────────────────────
    } else if (Array.isArray(qbd.items) && (qbd.items as unknown[]).length > 0) {
      const items = qbd.items as Array<{ job_type?: string; description?: string; retail_price?: string }>;
      const totalPrice = items.reduce((sum, item) => sum + (parseFloat(item.retail_price ?? "") || 0), 0);
      const multiItem = items.length > 1;
      let rows = "";

      items.forEach(item => {
        const jobType = item.job_type ? esc(item.job_type) : null;
        const desc = item.description ? esc(item.description).replace(/\n/g, "<br>") : null;
        const itemPrice = parseFloat(item.retail_price ?? "") || 0;
        const itemPriceText = `$${itemPrice.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (jobType) rows += secHdr(jobType);
        if (desc)    rows += `<tr><td colspan="2" style="padding:8px 0 10px;font-size:9.5pt;line-height:1.75;color:#1A1A2E;">${desc}</td></tr>`;
        if (multiItem && itemPrice > 0) {
          rows += `<tr><td style="width:110px;padding:8px 16px 8px 0;font-size:8pt;color:#9CA3AF;border-top:1px solid #E8E8F0;">Item Price</td><td style="padding:8px 0;font-size:12pt;font-weight:700;color:#1A1A2E;text-align:right;border-top:1px solid #E8E8F0;">${itemPriceText}</td></tr>`;
        }
      });

      if (multiItem) {
        const totalText = `$${totalPrice.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        rows += `<tr><td style="${PRICE_LBL}">Total Price (incl. GST)</td><td style="${PRICE_VAL}">${totalText}</td></tr>`;
      } else {
        rows += `<tr><td style="${PRICE_LBL}">Price (incl. GST)</td><td style="${PRICE_VAL}">${priceText}</td></tr>`;
      }

      itemsSection = `<table class="line-items"><tbody>${rows}</tbody></table>`;

    // ── Legacy: job type + free-text description ──────────────────────────────
    } else if (quote.job_description) {
      const jobTypeText = esc(quote.job_type ?? "Custom Order");
      const descText = esc(quote.job_description).replace(/\n/g, "<br>");

      itemsSection = `<table class="line-items"><tbody>
        ${secHdr(jobTypeText)}
        <tr><td colspan="2" style="padding:10px 0 12px;font-size:10pt;line-height:1.75;color:#1A1A2E;">${descText}</td></tr>
        <tr><td style="${PRICE_LBL}">Price (incl. GST)</td><td style="${PRICE_VAL}">${priceText}</td></tr>
      </tbody></table>`;

    } else {
      // ── Legacy auto-generated: Design / Stone / Price ─────────────────────
      const designText = typeof qbd.design === "string" ? esc(qbd.design) : "&nbsp;";

      let stoneText = "&nbsp;";
      const rawMs = qbd.main_stone;
      const msArr: Array<Record<string, unknown>> = Array.isArray(rawMs)
        ? (rawMs as Array<Record<string, unknown>>)
        : rawMs != null ? [rawMs as Record<string, unknown>] : [];

      if (msArr.length > 0) {
        const first = msArr[0];
        const allSame = msArr.length === 1 || msArr.every(s =>
          s.carat_weight === first.carat_weight && s.shape === first.shape &&
          s.colour === first.colour && s.clarity === first.clarity && s.origin === first.origin
        );

        if (allSame) {
          const qty = msArr.length;
          const carat = first.carat_weight != null ? `${first.carat_weight}ct ` : "";
          const parts = [first.colour, first.clarity, first.origin, first.shape]
            .map(v => (v != null && v !== "" ? String(v) : null)).filter(Boolean).join(" ");
          stoneText = esc(`${qty > 1 ? `${qty}x ` : ""}${carat}${parts}`);
        } else {
          stoneText = msArr.map((s, i) => {
            const carat = s.carat_weight != null ? `${s.carat_weight}ct ` : "";
            const parts = [s.colour, s.clarity, s.origin, s.shape]
              .map(v => (v != null && v !== "" ? String(v) : null)).filter(Boolean).join(" ");
            return esc(`Stone ${i + 1}: ${carat}${parts}`);
          }).join("<br>");
        }
      }

      const showStoneRow = msArr.length > 0;

      itemsSection = `<table class="line-items"><tbody>
        ${designText !== "&nbsp;" ? `<tr><td style="${SL}">Design</td><td style="${SV}">${designText}</td></tr>` : ""}
        ${showStoneRow ? `<tr><td style="${SL}">Stone</td><td style="${SV}">${stoneText}</td></tr>` : ""}
        <tr><td style="${PRICE_LBL}">Price (incl. GST)</td><td style="${PRICE_VAL}">${priceText}</td></tr>
      </tbody></table>`;
    }

  } else {
    // ── Regular quote: line items table ──────────────────────────────────────
    const lineItems: LineItem[] = quote.line_items ?? [];
    type FilledItem = LineItem & { _empty?: boolean };
    const MIN_ROWS = 8;
    const filledItems: FilledItem[] = [...lineItems];
    while (filledItems.length < MIN_ROWS) {
      filledItems.push({ design: "", stone: "", price: "", cost_price: "", _empty: true });
    }

    const tableRows = filledItems.map((li, i) => {
      const isEmpty = li._empty;
      const rowNum = isEmpty ? "" : String(i + 1);
      const design = isEmpty ? "&nbsp;" : esc(li.design);
      const stone  = isEmpty ? "&nbsp;" : esc(li.stone);
      const price  = isEmpty ? "&nbsp;" : esc(li.price);
      return `<tr style="border-bottom:1px solid #F0F0F5;">
        <td style="padding:7px 8px 7px 0;font-size:8.5pt;color:#9CA3AF;text-align:center;width:24px;">${rowNum}</td>
        <td style="padding:7px 8px;font-size:9pt;color:#1A1A2E;">${design}</td>
        <td style="padding:7px 8px;font-size:9pt;color:#1A1A2E;">${stone}</td>
        <td style="padding:7px 0;font-size:9pt;color:#1A1A2E;text-align:right;white-space:nowrap;">${price}</td>
      </tr>`;
    }).join("");

    itemsSection = `<table class="line-items">
      <thead>
        <tr style="border-bottom:1px solid #E8E8F0;">
          <th style="width:24px;padding:0 8px 8px 0;text-align:center;font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#635BFF;">#</th>
          <th style="padding:0 8px 8px;font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#635BFF;text-align:left;">Design</th>
          <th style="padding:0 8px 8px;font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#635BFF;text-align:left;">Stone</th>
          <th style="padding:0 0 8px;font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#635BFF;text-align:right;white-space:nowrap;">Price (incl. GST)</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>`;
  }

  const createdDate = formatDateAU(quote.created_at) || formatDateAU(new Date().toISOString());
  const staffName = esc(quote.staff_member ?? "");
  const staffEmailAddr = staffEmail(quote.staff_member);

  const notesSection = quote.notes
    ? `<div style="margin:12px 0 0;padding:10px 14px;background:#F9FAFB;border-left:2px solid #635BFF;border-radius:0 4px 4px 0;font-size:8.5pt;color:#6B7280;line-height:1.75;"><div style="font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#635BFF;margin-bottom:4px;">Notes</div>${esc(quote.notes).replace(/\n/g, "<br>")}</div>`
    : "";

  // ── Payment / deposit box ───────────────────────────────────────────────────
  const depositAmt = opts?.deposit_amount != null
    ? `$${Number(opts.deposit_amount).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;

  const paymentSection = !opts?.hidePayment && opts?.payment_link_url ? `
<div style="margin:16px 0 0;">
  <a href="${opts.payment_link_url}" style="text-decoration:none;display:block;border:1px solid #635BFF;border-radius:6px;padding:14px 20px;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:6.5pt;text-transform:uppercase;letter-spacing:0.12em;color:#9CA3AF;font-weight:700;margin-bottom:4px;">30% Deposit Required</div>
        <div style="font-size:19pt;font-weight:700;color:#635BFF;">${depositAmt ?? "&nbsp;"}</div>
      </div>
      <div style="font-size:10pt;font-weight:500;color:#635BFF;letter-spacing:0.03em;">Pay Now &rsaquo;</div>
    </div>
  </a>
  <div style="text-align:center;margin-top:5px;font-size:7pt;color:#9CA3AF;">Secure payment powered by Stripe</div>
</div>` : "";

  // ── Bank details ────────────────────────────────────────────────────────────
  const bankSection = (() => {
    const bd = opts?.bankDetails;
    if (!bd) return "";
    const bdRows: string[] = [];
    if (bd.bank_name)      bdRows.push(`<tr><td style="font-size:7.5pt;color:#9CA3AF;padding:3px 16px 3px 0;width:100px;">Bank</td><td style="font-size:8pt;color:#1A1A2E;">${esc(bd.bank_name)}</td></tr>`);
    if (bd.account_name)   bdRows.push(`<tr><td style="font-size:7.5pt;color:#9CA3AF;padding:3px 16px 3px 0;">Account Name</td><td style="font-size:8pt;color:#1A1A2E;">${esc(bd.account_name)}</td></tr>`);
    if (bd.bsb)            bdRows.push(`<tr><td style="font-size:7.5pt;color:#9CA3AF;padding:3px 16px 3px 0;">BSB</td><td style="font-size:8pt;color:#1A1A2E;">${esc(bd.bsb)}</td></tr>`);
    if (bd.account_number) bdRows.push(`<tr><td style="font-size:7.5pt;color:#9CA3AF;padding:3px 16px 3px 0;">Account No.</td><td style="font-size:8.5pt;color:#1A1A2E;font-family:monospace;">${esc(bd.account_number)}</td></tr>`);
    if (bdRows.length === 0) return "";
    return `<div style="margin:12px 0 0;border:1px solid #E8E8F0;border-radius:6px;padding:10px 16px;">
      <div style="font-size:6.5pt;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#635BFF;margin-bottom:8px;">Bank Transfer</div>
      <table style="border-collapse:collapse;width:100%;"><tbody>${bdRows.join("")}</tbody></table>
    </div>`;
  })();

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Quote_${esc(quote.reference_number)}_${esc(lastName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: 148mm 210mm portrait; margin: 10mm 10mm 10mm 10mm; }

  @media screen {
    .pdf-bar {
      position: fixed; top: 0; left: 0; right: 0;
      background: #1d4ed8; color: #fff;
      padding: 12px 24px;
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      z-index: 1000; font-family: Arial, Helvetica, sans-serif; font-size: 13px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    }
    .pdf-bar p { margin: 0; line-height: 1.4; }
    .pdf-bar strong { font-weight: bold; }
    .pdf-bar button {
      background: #fff; color: #1d4ed8; border: none; padding: 9px 22px;
      border-radius: 7px; font-weight: bold; cursor: pointer; font-size: 13px;
      white-space: nowrap; flex-shrink: 0;
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
    color: #1A1A2E;
    background: #fff;
  }

  /* ── Header ─────────────────────────────────────────────────────────── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 14px;
  }
  .wordmark-logo {
    max-height: 54px;
    width: auto;
    object-fit: contain;
    display: block;
  }
  .header-right { text-align: right; }
  .quotation-title {
    font-size: 14pt;
    font-weight: 300;
    letter-spacing: 0.25em;
    color: #9CA3AF;
    text-transform: uppercase;
    line-height: 1;
  }
  .header-address {
    font-size: 7.5pt;
    color: #9CA3AF;
    margin-top: 6px;
    line-height: 1.7;
  }

  /* ── Divider ─────────────────────────────────────────────────────────── */
  .divider {
    border: none;
    border-top: 1px solid #E8E8F0;
    margin: 10px 0 16px;
  }

  /* ── Meta row (ref + date) ───────────────────────────────────────────── */
  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 14px;
  }
  .meta-label {
    font-size: 6.5pt;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #9CA3AF;
    font-weight: 700;
    margin-bottom: 3px;
  }
  .meta-value {
    font-size: 11pt;
    font-weight: 700;
    color: #1A1A2E;
  }
  .meta-value.mono { font-family: 'Courier New', monospace; font-size: 10pt; }
  .meta-right { text-align: right; }

  /* ── Customer block ──────────────────────────────────────────────────── */
  .customer-block {
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 1px solid #E8E8F0;
  }
  .customer-name {
    font-size: 13pt;
    font-weight: 600;
    color: #1A1A2E;
  }

  /* ── Line items table ────────────────────────────────────────────────── */
  table.line-items {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0;
  }
  table.line-items thead th {
    text-align: left;
    background: transparent;
  }

  /* ── Footer ──────────────────────────────────────────────────────────── */
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-top: 14px;
    padding-top: 10px;
    border-top: 1px solid #E8E8F0;
  }
  .footer-terms {
    flex: 1;
    font-size: 7.5pt;
    color: #9CA3AF;
    font-style: italic;
    line-height: 1.8;
  }
  .footer-staff {
    flex: 0 0 auto;
    text-align: right;
    font-size: 8pt;
    line-height: 1.8;
  }
  .footer-staff-name { font-weight: 600; color: #1A1A2E; }
  .footer-staff-contact { color: #9CA3AF; }
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
        08 8344 7722 &nbsp;&middot;&nbsp; classa.com.au
      </div>
    </div>
  </div>

  <hr class="divider">

  <!-- Reference + Date -->
  <div class="meta-row">
    <div>
      <div class="meta-label">Reference</div>
      <div class="meta-value mono">${esc(quote.reference_number)}</div>
    </div>
    <div class="meta-right">
      <div class="meta-label">Date</div>
      <div class="meta-value">${esc(createdDate)}</div>
    </div>
  </div>

  <!-- Customer -->
  <div class="customer-block">
    <div class="meta-label">Prepared for</div>
    <div class="customer-name">${esc(customerName) || "&nbsp;"}</div>
  </div>

  <!-- Items -->
  ${itemsSection}
  ${notesSection}

  <!-- Deposit / payment -->
  ${paymentSection}

  <!-- Bank transfer -->
  ${bankSection}

  <!-- Footer -->
  <div class="footer">
    <div class="footer-terms">
      Valid for 7 business days from the date of this quotation, subject to availability.<br>
      A 30% deposit is required to commence work.
    </div>
    <div class="footer-staff">
      ${staffName ? `<div class="footer-staff-name">${staffName}</div>` : ""}
      <div class="footer-staff-contact">${esc(staffEmailAddr)}</div>
      <div class="footer-staff-contact">08 8344 7722</div>
    </div>
  </div>

  <!-- Screen-only: PDF save bar -->
  <div class="pdf-bar">
    <p>To save as PDF: click <strong>Save as PDF</strong> &rarr; choose <em>Save as PDF</em> as the printer &rarr; click Save.</p>
    <button onclick="window.print()">&#128438;&nbsp; Save as PDF</button>
  </div>

</body>
</html>`;
}
