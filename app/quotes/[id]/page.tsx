"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Quote } from "@/lib/types";
import { generateQuoteHTML } from "@/lib/quoteGenerator";
import { useUser } from "@/context/UserContext";
import { formatDateAU } from "@/lib/formatters";
import { hasPermission } from "@/lib/userTypes";

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

export default function QuoteViewPage() {
  const { id } = useParams<{ id: string }>();
  const { user, hydrated } = useUser();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "quotes")) router.replace("/");
  }, [user, hydrated, router]);

  useEffect(() => {
    if (!hydrated) return;
    fetch(`/api/quotes/${id}`, { headers: { "x-tenant-id": user?.tenantId ?? "" } })
      .then(r => r.json())
      .then(json => {
        if (json.quote) setQuote(json.quote);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, user?.tenantId, hydrated]);

  function handleDownloadPDF() {
    if (!quote) return;
    const html = generateQuoteHTML(quote);
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
  }

  if (!hydrated || loading) {
    return <div style={{ padding: 48, textAlign: "center", color: "#6B7280", fontSize: 14 }}>Loading quote…</div>;
  }

  if (notFound || !quote) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <p style={{ color: "#6B7280", marginBottom: 16, fontSize: 14 }}>Quote not found.</p>
        <Link href="/quotes" style={{ color: "#635BFF", fontSize: 14 }}>← Back to Quotes</Link>
      </div>
    );
  }

  const customerName = [quote.customer_first_name, quote.customer_last_name].filter(Boolean).join(" ") || "—";
  const qbd = quote.quote_builder_data as Record<string, unknown> | null | undefined;
  const builderItems = (qbd && Array.isArray((qbd as Record<string, unknown>).builder_items))
    ? (qbd as Record<string, unknown>).builder_items as Array<Record<string, unknown>>
    : null;
  const singleItemQbd = (qbd && Array.isArray((qbd as Record<string, unknown>).metals))
    ? qbd as Record<string, unknown>
    : null;

  const sc = STATUS_COLORS[quote.status] ?? { bg: "#F3F4F6", text: "#374151" };
  const card: React.CSSProperties = { background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 20, marginBottom: 16 };
  const secLabel: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, display: "block" };
  const tdL: React.CSSProperties = { padding: "7px 12px", fontSize: 13, color: "#6B7280", borderRight: "1px solid #E8E8F0", width: 140, verticalAlign: "top" };
  const tdV: React.CSSProperties = { padding: "7px 12px", fontSize: 13, color: "#1A1A2E" };

  function renderStoneOptions(stoneOptions: Array<Record<string, unknown>>) {
    if (stoneOptions.length > 1) {
      return (
        <tr>
          <td style={{ ...tdL, verticalAlign: "top", paddingTop: 10 }}>Stone Options</td>
          <td style={{ padding: "8px 12px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F3F4F6" }}>
                  <th style={{ padding: "5px 8px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", borderBottom: "1px solid #E8E8F0", width: 80 }}>Option</th>
                  <th style={{ padding: "5px 8px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6B7280", borderBottom: "1px solid #E8E8F0" }}>Specifications</th>
                  <th style={{ padding: "5px 8px", textAlign: "right", fontSize: 11, fontWeight: 600, color: "#6B7280", borderBottom: "1px solid #E8E8F0", whiteSpace: "nowrap" }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {stoneOptions.map((opt, oi) => {
                  const stones = Array.isArray(opt.stones) ? opt.stones as Array<Record<string, unknown>> : [];
                  const specs = stones.map(s =>
                    [s.carat_weight != null ? `${s.carat_weight}ct` : null, s.colour, s.clarity, s.origin, s.shape]
                      .filter(Boolean).join(" ")
                  ).filter(Boolean).join("; ");
                  const optPrice = typeof opt.quoted_price === "number"
                    ? `$${opt.quoted_price.toLocaleString("en-AU")}`
                    : "—";
                  return (
                    <tr key={oi} style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 600, color: "#1A1A2E" }}>{String(opt.label || `Option ${oi + 1}`)}</td>
                      <td style={{ padding: "6px 8px", color: "#374151" }}>{specs || "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "#635BFF", whiteSpace: "nowrap" }}>{optPrice}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </td>
        </tr>
      );
    }
    if (stoneOptions.length === 1) {
      const stones = Array.isArray(stoneOptions[0].stones) ? stoneOptions[0].stones as Array<Record<string, unknown>> : [];
      return (
        <>
          {stones.map((s, si) => {
            const parts = [s.carat_weight != null ? `${s.carat_weight}ct` : null, s.colour, s.clarity, s.origin, s.shape]
              .filter(Boolean).join(" ");
            if (!parts) return null;
            return (
              <tr key={si} style={{ background: "#F9FAFB" }}>
                <td style={tdL}>Stone {stones.length > 1 ? si + 1 : ""}</td>
                <td style={tdV}>{parts}</td>
              </tr>
            );
          })}
        </>
      );
    }
    return null;
  }

  function ItemSection({ item, index, total }: { item: Record<string, unknown>; index: number; total: number }) {
    const heading = (item.subcategory as string) || (item.item_type as string) || "Custom Order";
    const stoneOptions = Array.isArray(item.stone_options) ? item.stone_options as Array<Record<string, unknown>> : [];
    const metals = Array.isArray(item.metals) ? item.metals as Array<{ type?: string; weight?: number }> : [];
    const meleeStones = Array.isArray(item.melee_stones) ? item.melee_stones as Array<Record<string, unknown>> : [];
    const addons = item.addons as Record<string, unknown> | null;
    const itemPrice = typeof item.quoted_price === "number" ? item.quoted_price : null;

    const addonLines: string[] = [];
    if (addons) {
      if (addons.hand_engraving) addonLines.push("Hand Engraving");
      if (addons.laser_engraving) addonLines.push("Laser Engraving");
      if (addons.butterflies) addonLines.push("Butterfly Earring Backs");
      if (addons.chain) addonLines.push("Chain");
      if ((addons.additional_labour as number) > 0) addonLines.push("Additional Labour");
    }

    return (
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E" }}>
            {total > 1 ? `Item ${index + 1}: ` : ""}{heading}
          </div>
          {itemPrice != null && total > 1 && (
            <div style={{ fontSize: 20, fontWeight: 700, color: "#635BFF" }}>
              ${itemPrice.toLocaleString("en-AU")}
            </div>
          )}
        </div>

        {(item.ai_description as string | null) && (
          <div style={{ fontSize: 14, color: "#374151", fontStyle: "italic", lineHeight: 1.7, marginBottom: 14, padding: "10px 12px", background: "#F9FAFB", borderRadius: 8, borderLeft: "3px solid #635BFF" }}>
            {item.ai_description as string}
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #E8E8F0" }}>
          <tbody>
            {metals.filter(m => m.type).map((m, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
                <td style={tdL}>Metal</td>
                <td style={tdV}>{m.type}{m.weight ? ` — ${m.weight}g` : ""}</td>
              </tr>
            ))}
            {renderStoneOptions(stoneOptions)}
            {meleeStones.filter(r => r.stone_type).map((r, i) => {
              const qty = (r.qty as number) || 1;
              const parts = [qty > 1 ? `${qty}×` : null, r.stone_type, r.shape, r.carat_weight ? `(${r.carat_weight}ct)` : null]
                .filter(Boolean).join(" ");
              return (
                <tr key={i} style={{ background: "#F9FAFB" }}>
                  <td style={tdL}>Melee</td>
                  <td style={tdV}>{parts}</td>
                </tr>
              );
            })}
            {addonLines.length > 0 && (
              <tr style={{ background: "#F9FAFB" }}>
                <td style={tdL}>Inclusions</td>
                <td style={tdV}>{addonLines.join(", ")}</td>
              </tr>
            )}
            {(item.finger_size as string | null) && (
              <tr>
                <td style={tdL}>Finger Size</td>
                <td style={tdV}>{item.finger_size as string}</td>
              </tr>
            )}
            {(item.stock_sku as string | null) && (
              <tr style={{ background: "#F9FAFB" }}>
                <td style={tdL}>Stock Ref</td>
                <td style={{ ...tdV, fontFamily: "monospace" }}>{item.stock_sku as string}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }

  const totalPrice = quote.quoted_price ?? quote.total;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/quotes" style={{ color: "#6B7280", textDecoration: "none", fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
            Quotes
          </Link>
          <span style={{ color: "#D1D5DB" }}>/</span>
          <span style={{ fontFamily: "monospace", fontSize: 13, color: "#6B7280" }}>{quote.reference_number}</span>
        </div>
        <button
          onClick={handleDownloadPDF}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#4F46E5")}
          onMouseLeave={e => (e.currentTarget.style.background = "#635BFF")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Download PDF
        </button>
      </div>

      {/* Status bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ background: sc.bg, color: sc.text, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}>
          {STATUS_LABELS[quote.status] ?? quote.status}
        </span>
        {quote.assigned_to && <span style={{ fontSize: 13, color: "#6B7280" }}>· {quote.assigned_to}</span>}
        {quote.follow_up_date && <span style={{ fontSize: 13, color: "#6B7280" }}>· Follow up: {formatDateAU(quote.follow_up_date)}</span>}
        <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: "auto" }}>{formatDateAU(quote.created_at?.split("T")[0])}</span>
      </div>

      {/* Customer */}
      <div style={card}>
        <span style={secLabel}>Customer</span>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A2E", marginBottom: 6 }}>{customerName}</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {quote.customer_email && <span style={{ fontSize: 13, color: "#6B7280" }}>{quote.customer_email}</span>}
          {quote.customer_phone && <span style={{ fontSize: 13, color: "#6B7280" }}>{quote.customer_phone}</span>}
        </div>
      </div>

      {/* Quote content */}
      {builderItems ? (
        builderItems.map((item, idx) => (
          <ItemSection key={idx} item={item} index={idx} total={builderItems.length} />
        ))
      ) : singleItemQbd ? (
        <ItemSection
          item={{
            ...singleItemQbd,
            stone_options: singleItemQbd.main_stone
              ? [{ id: "opt0", label: "Option 1", stones: Array.isArray(singleItemQbd.main_stone) ? singleItemQbd.main_stone : [singleItemQbd.main_stone] }]
              : [],
          }}
          index={0}
          total={1}
        />
      ) : quote.design_brief ? (
        <div style={card}>
          <span style={secLabel}>Design Brief</span>
          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7 }}>{quote.design_brief}</p>
        </div>
      ) : null}

      {/* AI Description (legacy single-item non-builder) */}
      {!builderItems && !singleItemQbd && quote.ai_description && (
        <div style={card}>
          <span style={secLabel}>Description</span>
          <p style={{ fontSize: 14, color: "#374151", fontStyle: "italic", lineHeight: 1.7 }}>{quote.ai_description}</p>
        </div>
      )}

      {/* Notes */}
      {quote.notes && (
        <div style={card}>
          <span style={secLabel}>Notes</span>
          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{quote.notes}</p>
        </div>
      )}

      {/* Price */}
      {totalPrice != null && (
        <div style={{ background: "#1A1A2E", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#9CA3AF" }}>Total Price (incl. GST)</span>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>
            ${Number(totalPrice).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </div>
  );
}
