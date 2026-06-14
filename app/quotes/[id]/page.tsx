"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Quote } from "@/lib/types";
import { useUser } from "@/context/UserContext";
import { formatDateAU } from "@/lib/formatters";
import { hasPermission } from "@/lib/userTypes";

// ─── Print stylesheet injected once at module load ────────────────────────────
// Hides Vault shell (sidebar, topbar) and all UI chrome, leaving only quote content.
const PRINT_STYLE = `
@media print {
  .ds-sidebar, .ds-topbar, .no-print { display: none !important; }
  .app-shell { display: block !important; }
  .app-main  { display: block !important; overflow: visible !important; }
  .app-content { overflow: visible !important; padding: 0 !important; animation: none !important; }
  body, html { background: #fff !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

// ─── Styles ───────────────────────────────────────────────────────────────────

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

// ─── StoneOptionsTable (module-level, receives onAccept callback) ─────────────

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
        <td style={{ ...TD_L, verticalAlign: "top", paddingTop: 10 }}>Stone Options</td>
        <td style={{ padding: "8px 12px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
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

  // Single option: individual stone rows (no accept button needed — use top-level Convert)
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
            <td style={TD_L}>Stone{stones.length > 1 ? ` ${si + 1}` : ""}</td>
            <td style={TD_V}>{parts}</td>
          </tr>
        );
      })}
    </>
  );
}

// ─── ItemSection (module-level) ───────────────────────────────────────────────

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
    <div style={CARD}>
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

      {typeof item.ai_description === "string" && item.ai_description && (
        <div style={{ fontSize: 14, color: "#374151", fontStyle: "italic", lineHeight: 1.7, marginBottom: 14, padding: "10px 12px", background: "#F9FAFB", borderRadius: 8, borderLeft: "3px solid #635BFF" }}>
          {item.ai_description}
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #E8E8F0" }}>
        <tbody>
          {metals.filter(m => m.type).map((m, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB" }}>
              <td style={TD_L}>Metal</td>
              <td style={TD_V}>{m.type}{m.weight ? ` — ${m.weight}g` : ""}</td>
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
                <td style={TD_L}>Melee</td>
                <td style={TD_V}>{parts}</td>
              </tr>
            );
          })}
          {addonLines.length > 0 && (
            <tr style={{ background: "#F9FAFB" }}>
              <td style={TD_L}>Inclusions</td>
              <td style={TD_V}>{addonLines.join(", ")}</td>
            </tr>
          )}
          {typeof item.finger_size === "string" && item.finger_size && (
            <tr>
              <td style={TD_L}>Finger Size</td>
              <td style={TD_V}>{item.finger_size}</td>
            </tr>
          )}
          {typeof item.stock_sku === "string" && item.stock_sku && (
            <tr style={{ background: "#F9FAFB" }}>
              <td style={TD_L}>Stock Ref</td>
              <td style={{ ...TD_V, fontFamily: "monospace" }}>{item.stock_sku}</td>
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
  // acceptingIdx tracks which stone option row is mid-request
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

  // ── PDF: print current page ────────────────────────────────────────────────
  function handlePrint() {
    window.print();
  }

  // ── Build order URL from a specific stone option (or default option 0) ────
  function buildOrderUrl(
    q: Quote,
    builderItems: Array<Record<string, unknown>> | null,
    singleItemQbd: Record<string, unknown> | null,
    acceptedItemIdx: number,
    acceptedOptIdx: number
  ): string {
    const base = `/orders/new?from_quote=${q.id}`;

    // For new builder_items format, pass accepted indices so /orders/new can read them
    if (builderItems && builderItems.length > 0) {
      const item = builderItems[acceptedItemIdx] ?? builderItems[0];
      const stoneOpts = Array.isArray(item.stone_options)
        ? (item.stone_options as Array<Record<string, unknown>>)
        : [];
      const opt = stoneOpts[acceptedOptIdx] ?? stoneOpts[0];
      const stones = Array.isArray(opt?.stones) ? (opt.stones as Array<Record<string, unknown>>) : [];
      const specs = stoneSpecs(stones);
      const design = typeof item.design === "string" ? item.design : "";
      const aiDesc = typeof item.ai_description === "string" ? item.ai_description : "";
      const subcat = (item.subcategory as string) || (item.item_type as string) || "";
      const price = typeof opt?.quoted_price === "number" ? opt.quoted_price : (typeof item.quoted_price === "number" ? item.quoted_price : null);

      const articles = [subcat, design ? `Design: ${design}` : null, specs ? `Stone: ${specs}` : null]
        .filter(Boolean).join("\n");
      const instructions = aiDesc || design || "";

      const p = new URLSearchParams();
      p.set("from_quote", q.id);
      if (articles) p.set("articles", articles);
      if (instructions) p.set("instructions", instructions);
      if (price != null) p.set("total_charges", String(price));
      p.set("accepted_option", String(acceptedOptIdx));
      return `/orders/new?${p.toString()}`;
    }

    return base;
  }

  // ── Accept option: mark job won + navigate to order ───────────────────────
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
    const builderItems = qbd && Array.isArray(qbd.builder_items)
      ? (qbd.builder_items as Array<Record<string, unknown>>) : null;
    const singleItemQbd = !builderItems && qbd && Array.isArray(qbd.metals) ? qbd : null;

    router.push(buildOrderUrl(quote, builderItems, singleItemQbd, itemIdx, optionIdx));
  }

  // ── Convert to Order (top-level, uses option 0 by default) ────────────────
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
    const builderItems = qbd && Array.isArray(qbd.builder_items)
      ? (qbd.builder_items as Array<Record<string, unknown>>) : null;
    const singleItemQbd = !builderItems && qbd && Array.isArray(qbd.metals) ? qbd : null;

    router.push(buildOrderUrl(quote, builderItems, singleItemQbd, 0, 0));
  }

  // ── Loading / error states ─────────────────────────────────────────────────

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

  // ── Parse builder data ─────────────────────────────────────────────────────

  const qbd = quote.quote_builder_data != null && typeof quote.quote_builder_data === "object"
    ? (quote.quote_builder_data as Record<string, unknown>) : null;
  const builderItems = qbd && Array.isArray(qbd.builder_items)
    ? (qbd.builder_items as Array<Record<string, unknown>>) : null;
  const singleItemQbd = !builderItems && qbd && Array.isArray(qbd.metals) ? qbd : null;

  const sc = STATUS_COLORS[quote.status] ?? { bg: "#F3F4F6", text: "#374151" };
  const totalPrice = quote.quoted_price ?? quote.total;
  const customerName = [quote.customer_first_name, quote.customer_last_name].filter(Boolean).join(" ") || "—";

  return (
    <>
      {/* Print stylesheet — injected inline so it travels with the component */}
      <style>{PRINT_STYLE}</style>

      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>

        {/* ── Header (hidden on print) ───────────────────────────────────── */}
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

          {/* Action buttons */}
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

        {/* ── Print header (only visible when printing) ───────────────────── */}
        <div style={{ display: "none" }} className="print-only">
          <style>{`.print-only { display: none !important; } @media print { .print-only { display: block !important; } }`}</style>
          <div style={{ marginBottom: 20, paddingBottom: 12, borderBottom: "2px solid #E8E8F0" }}>
            <div style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Quote</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1A1A2E" }}>{quote.reference_number}</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{formatDateAU(quote.created_at?.split("T")[0])}</div>
          </div>
        </div>

        {/* ── Status bar (hidden on print) ────────────────────────────────── */}
        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <span style={{ background: sc.bg, color: sc.text, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}>
            {STATUS_LABELS[quote.status] ?? quote.status}
          </span>
          {quote.assigned_to && <span style={{ fontSize: 13, color: "#6B7280" }}>· {quote.assigned_to}</span>}
          {quote.follow_up_date && <span style={{ fontSize: 13, color: "#6B7280" }}>· Follow up: {formatDateAU(quote.follow_up_date)}</span>}
          <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: "auto" }}>{formatDateAU(quote.created_at?.split("T")[0])}</span>
        </div>

        {/* ── Customer ────────────────────────────────────────────────────── */}
        <div style={CARD}>
          <span style={SEC_LABEL}>Customer</span>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A2E", marginBottom: 6 }}>{customerName}</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {quote.customer_email && <span style={{ fontSize: 13, color: "#6B7280" }}>{quote.customer_email}</span>}
            {quote.customer_phone && <span style={{ fontSize: 13, color: "#6B7280" }}>{quote.customer_phone}</span>}
          </div>
        </div>

        {/* ── Items ───────────────────────────────────────────────────────── */}
        {builderItems && builderItems.length > 0 && (
          <>
            {builderItems.map((item, idx) => (
              <ItemSection
                key={idx}
                item={item}
                index={idx}
                total={builderItems.length}
                onAcceptOption={handleAcceptOption}
                acceptingIdx={acceptingIdx}
              />
            ))}
          </>
        )}

        {!builderItems && singleItemQbd && (
          <ItemSection
            item={{
              ...singleItemQbd,
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

        {!builderItems && !singleItemQbd && quote.design_brief && (
          <div style={CARD}>
            <span style={SEC_LABEL}>Design Brief</span>
            <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, margin: 0 }}>{quote.design_brief}</p>
          </div>
        )}

        {!builderItems && !singleItemQbd && quote.ai_description && (
          <div style={CARD}>
            <span style={SEC_LABEL}>Description</span>
            <p style={{ fontSize: 14, color: "#374151", fontStyle: "italic", lineHeight: 1.7, margin: 0 }}>{quote.ai_description}</p>
          </div>
        )}

        {/* ── Notes ───────────────────────────────────────────────────────── */}
        {quote.notes && (
          <div style={CARD}>
            <span style={SEC_LABEL}>Notes</span>
            <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>{quote.notes}</p>
          </div>
        )}

        {/* ── Price bar ───────────────────────────────────────────────────── */}
        {totalPrice != null && (
          <div style={{ background: "#1A1A2E", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#9CA3AF" }}>Total Price (incl. GST)</span>
            <span style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>
              ${Number(totalPrice).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* ── Add Item button (hidden on print) ───────────────────────────── */}
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
