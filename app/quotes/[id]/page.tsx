"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Quote } from "@/lib/types";
import { useUser } from "@/context/UserContext";
import { formatDateAU } from "@/lib/formatters";
import { hasPermission } from "@/lib/userTypes";
import { BLACK_LOGO_DATA_URI } from "@/lib/logoDataURIs";

// ─── Print stylesheet ──────────────────────────────────────────────────────────

const PRINT_STYLE = `
/* ── Default: hide print-only elements on screen ── */
.print-only { display: none !important; }

@media print {
  @page { size: A4 portrait; margin: 15mm; }

  /* ── Hide app chrome ── */
  .ds-sidebar,
  .ds-topbar,
  .no-print { display: none !important; }

  /* ── Fix app shell for print ── */
  .app-shell  { display: block !important; }
  .app-main   { display: block !important; overflow: visible !important; }
  .app-content {
    overflow: visible !important;
    padding: 0 !important;
    animation: none !important;
  }

  /* ── Base ── */
  body, html {
    background: #fff !important;
    font-size: 11px !important;
    font-family: Arial, Helvetica, sans-serif !important;
  }
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* ── Show print-only sections ── */
  .print-only { display: block !important; }

  /* ── Page wrapper ── */
  .quote-print-wrapper {
    max-width: none !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  /* ── Customer card: strip chrome ── */
  .quote-customer-card {
    border: none !important;
    border-bottom: 1px solid #ccc !important;
    border-radius: 0 !important;
    padding: 6px 0 10px !important;
    margin-bottom: 12px !important;
    background: transparent !important;
  }
  .quote-customer-name {
    font-size: 13pt !important;
    margin-bottom: 3px !important;
  }
  .quote-customer-contact {
    font-size: 9pt !important;
    color: #333 !important;
  }

  /* ── Item cards ── */
  .quote-item-card {
    border: 1px solid #ccc !important;
    border-radius: 0 !important;
    padding: 0 !important;
    margin-bottom: 10px !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    overflow: visible !important;
  }

  /* Black heading bar matches quoteGenerator */
  .item-heading-bar {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    background: #000 !important;
    color: #fff !important;
    padding: 7px 12px !important;
    margin-bottom: 0 !important;
    border-radius: 0 !important;
  }
  .item-heading-bar * { color: #fff !important; }
  .item-heading-text {
    font-size: 10pt !important;
    font-weight: bold !important;
    letter-spacing: 0.5px !important;
  }
  .item-heading-price {
    font-size: 10pt !important;
    font-weight: bold !important;
  }

  /* AI description: italic, no background box */
  .item-ai-desc {
    font-style: italic !important;
    font-size: 10pt !important;
    line-height: 1.7 !important;
    color: #111 !important;
    background: #fff !important;
    border: none !important;
    border-left: none !important;
    border-radius: 0 !important;
    padding: 10px 12px 8px !important;
    margin: 0 !important;
  }

  /* Detail rows table */
  .item-details-table {
    border: none !important;
    border-top: 1px solid #e0e0e0 !important;
  }
  .item-details-table td {
    padding: 5px 12px !important;
    font-size: 9pt !important;
  }
  .item-details-table .td-label {
    color: #555 !important;
    width: 110px !important;
    border-right: 1px solid #e8e8e8 !important;
  }
  .item-details-table .td-value {
    color: #222 !important;
  }

  /* Stone options inner table */
  .stone-opts-outer-td { padding: 5px 12px !important; }
  .stone-opts-inner-table { border: 1px solid #ddd !important; }
  .stone-opts-inner-table th {
    padding: 4px 7px !important;
    font-size: 8pt !important;
    background: #444 !important;
    color: #fff !important;
  }
  .stone-opts-inner-table td {
    padding: 4px 7px !important;
    font-size: 8.5pt !important;
  }

  /* Notes card */
  .quote-notes-card {
    border-left: 3px solid #555 !important;
    border-top: none !important;
    border-right: none !important;
    border-bottom: none !important;
    border-radius: 0 !important;
    background: #f9f9f9 !important;
    padding: 8px 12px !important;
    margin-bottom: 10px !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  /* Price bar */
  .quote-price-bar {
    background: #000 !important;
    color: #fff !important;
    border-radius: 0 !important;
    padding: 10px 12px !important;
    margin-top: 0 !important;
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
  .quote-price-bar * { color: #fff !important; }
  .quote-price-label { font-size: 9pt !important; color: #aaa !important; }
  .quote-price-amount { font-size: 15pt !important; font-weight: bold !important; }

  /* Footer */
  .quote-print-footer {
    display: flex !important;
    justify-content: space-between !important;
    align-items: flex-start !important;
    margin-top: 12px !important;
    padding-top: 10px !important;
    border-top: 1px solid #ccc !important;
    font-size: 8pt !important;
    gap: 24px !important;
  }
  .print-footer-terms {
    flex: 1 !important;
    color: #777 !important;
    font-style: italic !important;
    line-height: 1.7 !important;
  }
  .print-footer-staff {
    text-align: right !important;
    line-height: 1.7 !important;
    color: #333 !important;
  }
}
`;

// ─── Screen styles ────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E8E8F0",
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
};
const TD_L: React.CSSProperties = {
  padding: "7px 12px",
  fontSize: 13,
  color: "#6B7280",
  borderRight: "1px solid #E8E8F0",
  width: 140,
  verticalAlign: "top",
};
const TD_V: React.CSSProperties = { padding: "7px 12px", fontSize: 13, color: "#1A1A2E" };
const SEC_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "#6B7280",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 8,
  display: "block",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  follow_up_1: "Follow Up 1",
  follow_up_2: "Follow Up 2",
  job_won: "Job Won",
  job_lost: "Job Lost",
  converted: "Converted",
};
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending:     { bg: "#FEF3C7", text: "#92400E" },
  follow_up_1: { bg: "#DBEAFE", text: "#1E40AF" },
  follow_up_2: { bg: "#EDE9FE", text: "#4C1D95" },
  job_won:     { bg: "#DCFCE7", text: "#166534" },
  job_lost:    { bg: "#FEE2E2", text: "#991B1B" },
  converted:   { bg: "#D1FAE5", text: "#065F46" },
};

// ─── Stone option helpers ─────────────────────────────────────────────────────

function stoneSpecs(stones: Array<Record<string, unknown>>): string {
  return stones
    .map(s =>
      [
        s.carat_weight != null ? `${s.carat_weight}ct` : null,
        s.colour ?? s.color,
        s.clarity,
        s.origin,
        s.shape,
      ]
        .filter(Boolean)
        .join(" ")
    )
    .filter(Boolean)
    .join("; ");
}

// ─── StoneOptionsTable ────────────────────────────────────────────────────────

function StoneOptionsTable({
  stoneOptions,
  onAccept,
  acceptingIdx,
}: {
  stoneOptions: Array<Record<string, unknown>>;
  onAccept: (idx: number) => void;
  acceptingIdx: number | null;
}) {
  if (!Array.isArray(stoneOptions) || stoneOptions.length === 0) return null;

  if (stoneOptions.length > 1) {
    return (
      <tr>
        <td className="stone-opts-outer-td" style={{ ...TD_L, verticalAlign: "top", paddingTop: 10 }}>Stone Options</td>
        <td className="stone-opts-outer-td" style={{ padding: "8px 12px" }}>
          <table className="stone-opts-inner-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#F3F4F6" }}>
                <th style={{ padding: "5px 8px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", borderBottom: "1px solid #E8E8F0", width: 80 }}>Option</th>
                <th style={{ padding: "5px 8px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", borderBottom: "1px solid #E8E8F0" }}>Specifications</th>
                <th style={{ padding: "5px 8px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#6B7280", borderBottom: "1px solid #E8E8F0", whiteSpace: "nowrap" }}>Price</th>
                <th className="no-print" style={{ padding: "5px 8px", width: 90, borderBottom: "1px solid #E8E8F0" }} />
              </tr>
            </thead>
            <tbody>
              {stoneOptions.map((opt, oi) => {
                const stones = Array.isArray(opt.stones) ? opt.stones as Array<Record<string, unknown>> : [];
                const specs = stoneSpecs(stones);
                const optPrice = typeof opt.quoted_price === "number"
                  ? `$${opt.quoted_price.toLocaleString("en-AU")}`
                  : "—";
                const isAccepting = acceptingIdx === oi;
                return (
                  <tr key={oi} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 600, color: "#1A1A2E" }}>
                      {String(opt.label ?? `Option ${oi + 1}`)}
                    </td>
                    <td style={{ padding: "6px 8px", color: "#374151" }}>{specs || "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "#635BFF", whiteSpace: "nowrap" }}>
                      {optPrice}
                    </td>
                    <td className="no-print" style={{ padding: "6px 8px", textAlign: "right" }}>
                      <button
                        onClick={() => onAccept(oi)}
                        disabled={isAccepting}
                        style={{
                          background: "#10B981",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          padding: "4px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: isAccepting ? "wait" : "pointer",
                          whiteSpace: "nowrap",
                          opacity: isAccepting ? 0.7 : 1,
                        }}
                      >
                        {isAccepting ? "…" : "Accept"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </td>
      </tr>
    );
  }

  // Single option: individual stone rows
  const stones = Array.isArray(stoneOptions[0]?.stones)
    ? (stoneOptions[0].stones as Array<Record<string, unknown>>)
    : [];
  return (
    <>
      {stones.map((s, si) => {
        const parts = [
          s.carat_weight != null ? `${s.carat_weight}ct` : null,
          s.colour ?? s.color,
          s.clarity,
          s.origin,
          s.shape,
        ]
          .filter(Boolean)
          .join(" ");
        if (!parts) return null;
        return (
          <tr key={si} style={{ background: "#F9FAFB" }}>
            <td className="td-label" style={TD_L}>Stone{stones.length > 1 ? ` ${si + 1}` : ""}</td>
            <td className="td-value" style={TD_V}>{parts}</td>
          </tr>
        );
      })}
    </>
  );
}

// ─── ItemSection ──────────────────────────────────────────────────────────────

function ItemSection({
  item,
  index,
  total,
  onAcceptOption,
  acceptingIdx,
}: {
  item: Record<string, unknown>;
  index: number;
  total: number;
  onAcceptOption: (itemIdx: number, optionIdx: number) => void;
  acceptingIdx: number | null;
}) {
  const heading =
    (item.subcategory as string | null) ||
    (item.item_type as string | null) ||
    "Custom Order";
  const aiDesc = typeof item.ai_description === "string" ? item.ai_description : null;
  const stoneOptions = Array.isArray(item.stone_options)
    ? (item.stone_options as Array<Record<string, unknown>>)
    : [];
  const metals = Array.isArray(item.metals)
    ? (item.metals as Array<{ type?: string; weight?: number }>)
    : [];
  const meleeStones = Array.isArray(item.melee_stones)
    ? (item.melee_stones as Array<Record<string, unknown>>)
    : [];
  const addons =
    item.addons != null && typeof item.addons === "object"
      ? (item.addons as Record<string, unknown>)
      : null;
  const itemPrice = typeof item.quoted_price === "number" ? item.quoted_price : null;

  const addonLines: string[] = [];
  if (addons) {
    if (addons.hand_engraving) addonLines.push("Hand Engraving");
    if (addons.laser_engraving) addonLines.push("Laser Engraving");
    if (addons.butterflies) addonLines.push("Butterfly Earring Backs");
    if (addons.chain) addonLines.push("Chain");
    if (Number(addons.additional_labour ?? 0) > 0) addonLines.push("Additional Labour");
  }

  return (
    <div className="quote-item-card" style={CARD}>
      {/* Heading — becomes black bar on print */}
      <div
        className="item-heading-bar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div className="item-heading-text" style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E" }}>
          {total > 1 ? `Item ${index + 1}: ` : ""}{heading}
        </div>
        {itemPrice != null && total > 1 && (
          <div className="item-heading-price" style={{ fontSize: 20, fontWeight: 700, color: "#635BFF" }}>
            ${itemPrice.toLocaleString("en-AU")}
          </div>
        )}
      </div>

      {/* AI / design description */}
      {aiDesc && (
        <div
          className="item-ai-desc"
          style={{
            fontSize: 14,
            color: "#374151",
            fontStyle: "italic",
            lineHeight: 1.7,
            marginBottom: 14,
            padding: "10px 12px",
            background: "#F9FAFB",
            borderRadius: 8,
            borderLeft: "3px solid #635BFF",
          }}
        >
          {aiDesc}
        </div>
      )}

      {/* Detail rows */}
      <table
        className="item-details-table"
        style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #E8E8F0" }}
      >
        <tbody>
          {metals.filter(m => m.type).map((m, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
              <td className="td-label" style={TD_L}>Metal</td>
              <td className="td-value" style={TD_V}>{m.type}{m.weight ? ` — ${m.weight}g` : ""}</td>
            </tr>
          ))}
          <StoneOptionsTable
            stoneOptions={stoneOptions}
            onAccept={(oi) => onAcceptOption(index, oi)}
            acceptingIdx={acceptingIdx}
          />
          {meleeStones.filter(r => r.stone_type).map((r, i) => {
            const qty = Number(r.qty ?? 1);
            const parts = [qty > 1 ? `${qty}×` : null, r.stone_type, r.shape, r.carat_weight ? `(${r.carat_weight}ct)` : null]
              .filter(Boolean).join(" ");
            return (
              <tr key={i} style={{ background: "#F9FAFB" }}>
                <td className="td-label" style={TD_L}>Melee</td>
                <td className="td-value" style={TD_V}>{parts}</td>
              </tr>
            );
          })}
          {addonLines.length > 0 && (
            <tr style={{ background: "#F9FAFB" }}>
              <td className="td-label" style={TD_L}>Inclusions</td>
              <td className="td-value" style={TD_V}>{addonLines.join(", ")}</td>
            </tr>
          )}
          {typeof item.finger_size === "string" && item.finger_size && (
            <tr>
              <td className="td-label" style={TD_L}>Finger Size</td>
              <td className="td-value" style={TD_V}>{item.finger_size}</td>
            </tr>
          )}
          {typeof item.stock_sku === "string" && item.stock_sku && (
            <tr style={{ background: "#F9FAFB" }}>
              <td className="td-label" style={TD_L}>Stock Ref</td>
              <td className="td-value" style={{ ...TD_V, fontFamily: "monospace" }}>{item.stock_sku}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function QuoteViewPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined);
  const { user, hydrated } = useUser();
  const router = useRouter();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingIdx, setAcceptingIdx] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "quotes")) router.replace("/");
  }, [user, hydrated, router]);

  useEffect(() => {
    if (!hydrated) return;
    if (!id) { setError("No quote ID in URL"); setLoading(false); return; }

    fetch(`/api/quotes/${id}`, { headers: { "x-tenant-id": user?.tenantId ?? "" } })
      .then(async res => {
        const json = await res.json();
        if (!res.ok || !json.quote) setError(json.error ?? `HTTP ${res.status} — quote not found`);
        else setQuote(json.quote);
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, [id, user?.tenantId, hydrated]);

  function handlePrint() { window.print(); }

  function buildOrderUrl(
    q: Quote,
    builderItems: Array<Record<string, unknown>> | null,
    acceptedItemIdx: number,
    acceptedOptIdx: number
  ): string {
    if (builderItems && builderItems.length > 0) {
      const item = builderItems[acceptedItemIdx] ?? builderItems[0];
      const stoneOpts = Array.isArray(item.stone_options) ? (item.stone_options as Array<Record<string, unknown>>) : [];
      const opt = stoneOpts[acceptedOptIdx] ?? stoneOpts[0];
      const stones = Array.isArray(opt?.stones) ? (opt.stones as Array<Record<string, unknown>>) : [];
      const specs = stoneSpecs(stones);
      const design = typeof item.design === "string" ? item.design : "";
      const aiDesc = typeof item.ai_description === "string" ? item.ai_description : "";
      const subcat = (item.subcategory as string) || (item.item_type as string) || "";
      const price = typeof opt?.quoted_price === "number" ? opt.quoted_price : (typeof item.quoted_price === "number" ? item.quoted_price : null);

      const articles = [subcat, design ? `Design: ${design}` : null, specs ? `Stone: ${specs}` : null].filter(Boolean).join("\n");
      const instructions = aiDesc || design || "";

      const p = new URLSearchParams();
      p.set("from_quote", q.id);
      if (articles) p.set("articles", articles);
      if (instructions) p.set("instructions", instructions);
      if (price != null) p.set("total_charges", String(price));
      p.set("accepted_option", String(acceptedOptIdx));
      return `/orders/new?${p.toString()}`;
    }
    return `/orders/new?from_quote=${q.id}`;
  }

  async function handleAcceptOption(itemIdx: number, optionIdx: number) {
    if (!quote || !id) return;
    setAcceptingIdx(optionIdx);
    try {
      await fetch(`/api/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
        body: JSON.stringify({ status: "job_won", accepted_option: optionIdx }),
      });
      setQuote(q => q ? { ...q, status: "job_won" } : q);
    } catch { /* navigate anyway */ }

    const qbd = quote.quote_builder_data != null && typeof quote.quote_builder_data === "object"
      ? (quote.quote_builder_data as Record<string, unknown>) : null;
    const builderItems = qbd && Array.isArray(qbd.builder_items) ? (qbd.builder_items as Array<Record<string, unknown>>) : null;
    router.push(buildOrderUrl(quote, builderItems, itemIdx, optionIdx));
  }

  async function handleConvertToOrder() {
    if (!quote || !id) return;
    setConverting(true);
    try {
      await fetch(`/api/quotes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
        body: JSON.stringify({ status: "job_won", accepted_option: 0 }),
      });
      setQuote(q => q ? { ...q, status: "job_won" } : q);
    } catch { /* navigate anyway */ }

    const qbd = quote.quote_builder_data != null && typeof quote.quote_builder_data === "object"
      ? (quote.quote_builder_data as Record<string, unknown>) : null;
    const builderItems = qbd && Array.isArray(qbd.builder_items) ? (qbd.builder_items as Array<Record<string, unknown>>) : null;
    router.push(buildOrderUrl(quote, builderItems, 0, 0));
  }

  if (!hydrated || loading) {
    return <div style={{ padding: 48, textAlign: "center", color: "#6B7280", fontSize: 14 }}>Loading quote…</div>;
  }

  if (error || !quote) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <p style={{ color: "#EF4444", marginBottom: 8, fontSize: 14, fontWeight: 500 }}>{error ?? "Quote not found"}</p>
        <Link href="/quotes" style={{ color: "#635BFF", fontSize: 14 }}>← Back to Quotes</Link>
      </div>
    );
  }

  // ── Parse builder data ────────────────────────────────────────────────────

  const qbd = quote.quote_builder_data != null && typeof quote.quote_builder_data === "object"
    ? (quote.quote_builder_data as Record<string, unknown>) : null;
  const builderItems = qbd && Array.isArray(qbd.builder_items)
    ? (qbd.builder_items as Array<Record<string, unknown>>) : null;
  const singleItemQbd = !builderItems && qbd && Array.isArray(qbd.metals) ? qbd : null;

  const sc = STATUS_COLORS[quote.status] ?? { bg: "#F3F4F6", text: "#374151" };
  const totalPrice = quote.quoted_price ?? quote.total;
  const customerName = [quote.customer_first_name, quote.customer_last_name].filter(Boolean).join(" ") || "—";
  const createdDate = formatDateAU(quote.created_at?.split("T")[0]);

  return (
    <>
      <style>{PRINT_STYLE}</style>

      <div className="quote-print-wrapper" style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>

        {/* ── Print-only: Class A Letterhead ──────────────────────────────── */}
        <div className="print-only" style={{ marginBottom: 16 }}>
          {/* Logo row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={BLACK_LOGO_DATA_URI} alt="Class A Jewellers" style={{ maxHeight: 52, width: "auto", display: "block" }} />
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: "bold", letterSpacing: 2, textTransform: "uppercase", color: "#000", lineHeight: 1 }}>Quotation</div>
              <div style={{ fontSize: 9, color: "#333", marginTop: 5, lineHeight: 1.6 }}>
                40 North East Road, Walkerville SA 5081<br />
                08 8344 7722 &nbsp;|&nbsp; classa.com.au
              </div>
            </div>
          </div>
          {/* Divider */}
          <div style={{ borderTop: "1.5px solid #000", margin: "8px 0 12px" }} />
          {/* Ref + date row */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 14 }}>
            <span style={{ color: "#555" }}>
              Reference: <strong style={{ fontFamily: "monospace", color: "#000" }}>{quote.reference_number}</strong>
            </span>
            <span style={{ color: "#555" }}>{createdDate}</span>
          </div>
        </div>

        {/* ── Screen: Header with nav + action buttons ────────────────────── */}
        <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/quotes" style={{ color: "#6B7280", textDecoration: "none", fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Quotes
            </Link>
            <span style={{ color: "#D1D5DB" }}>/</span>
            <span style={{ fontFamily: "monospace", fontSize: 13, color: "#6B7280" }}>{quote.reference_number}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={handlePrint}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#374151", border: "1px solid #E8E8F0", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
              onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Download PDF
            </button>
            <button
              onClick={handleConvertToOrder}
              disabled={converting}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#10B981", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: converting ? "wait" : "pointer", opacity: converting ? 0.7 : 1 }}
              onMouseEnter={e => { if (!converting) e.currentTarget.style.background = "#059669"; }}
              onMouseLeave={e => { if (!converting) e.currentTarget.style.background = "#10B981"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {converting ? "Converting…" : "Convert to Order"}
            </button>
            <Link
              href={`/quotes/builder?quote_id=${quote.id}`}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#EEF2FF", color: "#635BFF", border: "1px solid #635BFF", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Item
            </Link>
          </div>
        </div>

        {/* ── Status bar (screen only) ─────────────────────────────────────── */}
        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <span style={{ background: sc.bg, color: sc.text, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}>
            {STATUS_LABELS[quote.status] ?? quote.status}
          </span>
          {quote.assigned_to && <span style={{ fontSize: 13, color: "#6B7280" }}>· {quote.assigned_to}</span>}
          {quote.follow_up_date && <span style={{ fontSize: 13, color: "#6B7280" }}>· Follow up: {formatDateAU(quote.follow_up_date)}</span>}
          <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: "auto" }}>{createdDate}</span>
        </div>

        {/* ── Customer ────────────────────────────────────────────────────── */}
        <div className="quote-customer-card" style={CARD}>
          <span className="no-print" style={SEC_LABEL}>Customer</span>
          <div className="quote-customer-name" style={{ fontSize: 18, fontWeight: 700, color: "#1A1A2E", marginBottom: 6 }}>{customerName}</div>
          <div className="quote-customer-contact" style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {quote.customer_email && <span style={{ fontSize: 13, color: "#6B7280" }}>{quote.customer_email}</span>}
            {quote.customer_phone && <span style={{ fontSize: 13, color: "#6B7280" }}>{quote.customer_phone}</span>}
          </div>
        </div>

        {/* ── Items: new builder_items format ──────────────────────────────── */}
        {builderItems && builderItems.length > 0 && builderItems.map((item, idx) => (
          <ItemSection
            key={idx}
            item={item}
            index={idx}
            total={builderItems.length}
            onAcceptOption={handleAcceptOption}
            acceptingIdx={acceptingIdx}
          />
        ))}

        {/* ── Items: legacy metals format — pass top-level ai_description ── */}
        {!builderItems && singleItemQbd && (
          <ItemSection
            item={{
              ...singleItemQbd,
              // ai_description may be on the quote root for old-format quotes
              ai_description: singleItemQbd.ai_description ?? quote.ai_description ?? null,
              stone_options: singleItemQbd.main_stone
                ? [{ id: "opt0", label: "Option 1", stones: Array.isArray(singleItemQbd.main_stone) ? singleItemQbd.main_stone : [singleItemQbd.main_stone] }]
                : [],
            }}
            index={0}
            total={1}
            onAcceptOption={handleAcceptOption}
            acceptingIdx={acceptingIdx}
          />
        )}

        {/* ── Plain design brief (no builder data) ────────────────────────── */}
        {!builderItems && !singleItemQbd && (quote.design_brief || quote.ai_description) && (
          <div className="quote-item-card" style={CARD}>
            <div
              className="item-heading-bar"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}
            >
              <div className="item-heading-text" style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E" }}>
                Custom Order
              </div>
            </div>
            {quote.ai_description && (
              <div className="item-ai-desc" style={{ fontSize: 14, color: "#374151", fontStyle: "italic", lineHeight: 1.7, marginBottom: quote.design_brief ? 14 : 0, padding: "10px 12px", background: "#F9FAFB", borderRadius: 8, borderLeft: "3px solid #635BFF" }}>
                {quote.ai_description}
              </div>
            )}
            {quote.design_brief && (
              <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, padding: "10px 12px" }}>{quote.design_brief}</div>
            )}
          </div>
        )}

        {/* ── Notes ───────────────────────────────────────────────────────── */}
        {quote.notes && (
          <div className="quote-notes-card" style={CARD}>
            <span style={SEC_LABEL}>Notes</span>
            <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>{quote.notes}</p>
          </div>
        )}

        {/* ── Price bar ───────────────────────────────────────────────────── */}
        {totalPrice != null && (
          <div
            className="quote-price-bar"
            style={{ background: "#1A1A2E", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            <span className="quote-price-label" style={{ fontSize: 14, fontWeight: 500, color: "#9CA3AF" }}>Total Price (incl. GST)</span>
            <span className="quote-price-amount" style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>
              ${Number(totalPrice).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* ── Print-only footer ────────────────────────────────────────────── */}
        <div className="print-only quote-print-footer" style={{ display: "none" }}>
          <div className="print-footer-terms">
            Valid for 7 business days from the date of this quotation, subject to availability.<br />
            A 20% deposit is required to commence work.
          </div>
          <div className="print-footer-staff">
            {quote.assigned_to && <div style={{ fontWeight: "bold", color: "#000" }}>{quote.assigned_to}</div>}
            <div>08 8344 7722</div>
            <div>classa.com.au</div>
          </div>
        </div>

        {/* ── Add Item button (screen only) ────────────────────────────────── */}
        <div className="no-print" style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
          <Link
            href={`/quotes/builder?quote_id=${quote.id}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: 10, border: "1px dashed #635BFF", background: "#EEF2FF", color: "#635BFF", fontSize: 14, fontWeight: 600, textDecoration: "none" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Item to Quote
          </Link>
        </div>

      </div>
    </>
  );
}
