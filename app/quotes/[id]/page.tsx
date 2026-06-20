"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Quote } from "@/lib/types";
import { useUser } from "@/context/UserContext";
import { formatDateAU } from "@/lib/formatters";
import { hasPermission, canManage } from "@/lib/userTypes";

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
                <th style={{ padding: "5px 8px", width: 90, borderBottom: "1px solid #E8E8F0" }} />
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
                    <td style={{ padding: "6px 8px", textAlign: "right" }}>
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
    if (Array.isArray(addons.components)) {
      (addons.components as Array<{ name: string }>).forEach(c => { if (c.name) addonLines.push(c.name); });
    }
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
  const [downloading] = useState(false); // kept for ref safety, replaced by downloadingSize
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [depositInput, setDepositInput] = useState<string>("");
  const [depositPercent, setDepositPercent] = useState<number>(30);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  const isManager = canManage(user?.role);

  async function handleDelete() {
    if (!window.confirm("Delete this quote? This cannot be undone.")) return;
    const res = await fetch(`/api/quotes/${id}`, {
      method: "DELETE",
      headers: { "x-tenant-id": user?.tenantId ?? "" },
    });
    if (res.ok) {
      router.push("/quotes");
    } else {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Failed to delete quote.");
    }
  }

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
        else {
          setQuote(json.quote);
          setFollowUpNotes(json.quote.follow_up_notes ?? "");
          // Pre-populate payment link if already generated
          if (json.quote.stripe_payment_link_url) {
            setPaymentLinkUrl(json.quote.stripe_payment_link_url);
          }
        }
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false));
  }, [id, user?.tenantId, hydrated]);

  const [downloadingSize, setDownloadingSize] = useState<"a4" | "a5" | null>(null);

  const handleDownloadPDF = async (size: "a4" | "a5") => {
    setDownloadingSize(size);
    try {
      const res = await fetch(`/api/quotes/${quote!.id}/pdf`, {
        method: "POST",
        headers: { "x-tenant-id": user?.tenantId ?? "", "Content-Type": "application/json" },
        body: JSON.stringify({ size }),
      });
      if (!res.ok) {
        const text = await res.text();
        alert("Could not generate PDF: " + text);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Quote_${quote!.reference_number}_${(quote!.customer_last_name ?? "").trim().replace(/\s+/g, "_") || "Quote"}_${size.toUpperCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Download failed: " + err);
    } finally {
      setDownloadingSize(null);
    }
  };

  async function handleGeneratePaymentLink() {
    if (!quote || !id || generatingLink) return;
    setGeneratingLink(true);
    try {
      const body: { amount?: number } = {};
      const quoteTotal = quote.quoted_price ?? quote.total ?? 0;
      const computedDeposit = Math.round((depositPercent / 100) * quoteTotal * 100) / 100;
      if (computedDeposit > 0) body.amount = computedDeposit;

      const res = await fetch(`/api/quotes/${id}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? "Failed to generate payment link"); return; }
      setPaymentLinkUrl(json.payment_link_url);
      setQuote(q => q ? { ...q, stripe_payment_link_url: json.payment_link_url, deposit_amount: json.deposit_amount } : q);
    } catch (err) {
      alert("Error: " + err);
    } finally {
      setGeneratingLink(false);
    }
  }

  function handleCopyLink() {
    if (!paymentLinkUrl) return;
    navigator.clipboard.writeText(paymentLinkUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  async function saveFollowUpNotes(notes: string) {
    if (!id) return;
    await fetch(`/api/quotes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
      body: JSON.stringify({ follow_up_notes: notes }),
    });
  }

  async function handleGenerateFollowUpEmail() {
    if (!quote || generatingEmail) return;
    setGeneratingEmail(true);
    setGeneratedEmail(null);
    try {
      const res = await fetch("/api/quotes/generate-followup-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" },
        body: JSON.stringify({
          customerName: [quote.customer_first_name, quote.customer_last_name].filter(Boolean).join(" ") || null,
          itemDescription: quote.ai_description || quote.design_brief || null,
          quotedPrice: quote.quoted_price ?? quote.total ?? null,
          followUpNotes,
          staffName: user?.name ?? null,
        }),
      });
      const json = await res.json();
      if (json.email) setGeneratedEmail(json.email);
    } catch { /* noop */ } finally {
      setGeneratingEmail(false);
    }
  }

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
    <div className="quote-print-wrapper" style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>

        {/* ── Header with nav + action buttons ────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
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
            {isManager && (
              <button
                onClick={handleDelete}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#EF4444", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                </svg>
                Delete
              </button>
            )}
            <button
              onClick={() => handleDownloadPDF("a5")}
              disabled={downloadingSize !== null}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#374151", border: "1px solid #E8E8F0", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: downloadingSize !== null ? "wait" : "pointer", opacity: downloadingSize === "a5" ? 0.7 : 1 }}
              onMouseEnter={e => { if (!downloadingSize) e.currentTarget.style.background = "#F9FAFB"; }}
              onMouseLeave={e => { if (!downloadingSize) e.currentTarget.style.background = "#fff"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              {downloadingSize === "a5" ? "Generating…" : "Print (A5)"}
            </button>
            <button
              onClick={() => handleDownloadPDF("a4")}
              disabled={downloadingSize !== null}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#374151", border: "1px solid #E8E8F0", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: downloadingSize !== null ? "wait" : "pointer", opacity: downloadingSize === "a4" ? 0.7 : 1 }}
              onMouseEnter={e => { if (!downloadingSize) e.currentTarget.style.background = "#F9FAFB"; }}
              onMouseLeave={e => { if (!downloadingSize) e.currentTarget.style.background = "#fff"; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              {downloadingSize === "a4" ? "Generating…" : "Send (A4)"}
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
            <button
              onClick={() => setShowPaymentPanel(p => !p)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: paymentLinkUrl ? "#F0FDF4" : "#000", color: paymentLinkUrl ? "#166534" : "#fff", border: paymentLinkUrl ? "1px solid #86EFAC" : "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
              </svg>
              {paymentLinkUrl ? "Payment Link" : "Generate Payment Link"}
            </button>
          </div>
        </div>

        {/* ── Status bar (screen only) ─────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <span style={{ background: sc.bg, color: sc.text, fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999 }}>
            {STATUS_LABELS[quote.status] ?? quote.status}
          </span>
          {quote.assigned_to && <span style={{ fontSize: 13, color: "#6B7280" }}>· {quote.assigned_to}</span>}
          {quote.follow_up_date && <span style={{ fontSize: 13, color: "#6B7280" }}>· Follow up: {formatDateAU(quote.follow_up_date)}</span>}
          <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: "auto" }}>{createdDate}</span>
        </div>

        {/* ── Payment link panel ───────────────────────────────────────────── */}
        {showPaymentPanel && (
          <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A2E", marginBottom: 12 }}>
              {paymentLinkUrl ? "Payment Link" : "Generate Payment Link"}
            </div>

            {paymentLinkUrl ? (
              /* Show existing link */
              <div>
                {quote.deposit_paid && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 12px", background: "#D1FAE5", borderRadius: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    <span style={{ fontSize: 13, color: "#065F46", fontWeight: 600 }}>
                      Deposit paid{quote.deposit_paid_at ? ` — ${formatDateAU(quote.deposit_paid_at.split("T")[0])}` : ""}
                      {quote.deposit_amount ? ` ($${Number(quote.deposit_amount).toLocaleString("en-AU", { minimumFractionDigits: 2 })})` : ""}
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    readOnly
                    value={paymentLinkUrl}
                    style={{ flex: 1, padding: "8px 12px", border: "1px solid #E8E8F0", borderRadius: 8, fontSize: 13, color: "#374151", background: "#F9FAFB", fontFamily: "monospace", minWidth: 0 }}
                  />
                  <button
                    onClick={handleCopyLink}
                    style={{ padding: "8px 16px", background: linkCopied ? "#10B981" : "#635BFF", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {linkCopied ? "Copied!" : "Copy Link"}
                  </button>
                  <a
                    href={paymentLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ padding: "8px 14px", background: "#F3F4F6", color: "#374151", borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" }}
                  >
                    Open ↗
                  </a>
                </div>
                <button
                  onClick={() => { setPaymentLinkUrl(null); setQuote(q => q ? { ...q, stripe_payment_link_url: null } : q); }}
                  style={{ marginTop: 8, fontSize: 12, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Generate a new link
                </button>
              </div>
            ) : (
              /* Generate form */
              <div>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>Deposit percentage</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={5}
                    value={depositPercent}
                    onChange={e => setDepositPercent(Math.max(1, Math.min(100, Number(e.target.value) || 30)))}
                    style={{ width: 72, padding: "8px 10px", border: "1px solid #E8E8F0", borderRadius: 8, fontSize: 13, color: "#374151", textAlign: "right" }}
                  />
                  <span style={{ fontSize: 13, color: "#6B7280" }}>%</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1A1A2E", minWidth: 80 }}>
                    = ${Math.round((depositPercent / 100) * ((quote.quoted_price ?? quote.total ?? 0)) * 100) / 100 > 0
                      ? (Math.round((depositPercent / 100) * ((quote.quoted_price ?? quote.total ?? 0)) * 100) / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })
                      : "—"}
                  </span>
                  <button
                    onClick={handleGeneratePaymentLink}
                    disabled={generatingLink}
                    style={{ marginLeft: "auto", padding: "8px 20px", background: "#000", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: generatingLink ? "wait" : "pointer", opacity: generatingLink ? 0.7 : 1, whiteSpace: "nowrap" }}
                  >
                    {generatingLink ? "Generating…" : "Generate Link"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Customer ────────────────────────────────────────────────────── */}
        <div className="quote-customer-card" style={CARD}>
          <span style={SEC_LABEL}>Customer</span>
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

        {/* ── Follow-up ────────────────────────────────────────────────────── */}
        <div style={CARD}>
          <span style={SEC_LABEL}>Follow-up</span>

          {/* Schedule pills */}
          {quote.follow_up_7d && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {[
                { label: "7 days",    date: quote.follow_up_7d },
                { label: "14 days",   date: quote.follow_up_14d },
                { label: "1 month",   date: quote.follow_up_1m },
                { label: "3 months",  date: quote.follow_up_3m },
                { label: "6 months",  date: quote.follow_up_6m },
              ].filter(d => d.date).map(({ label, date }) => (
                <div key={label} style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 8, padding: "5px 12px", fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ color: "#9CA3AF" }}>{label}</span>
                  <span style={{ fontWeight: 600, color: "#374151" }}>{formatDateAU(date!)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Notes textarea */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 6, fontWeight: 500 }}>Notes</label>
            <textarea
              value={followUpNotes}
              onChange={e => setFollowUpNotes(e.target.value)}
              onBlur={() => saveFollowUpNotes(followUpNotes)}
              style={{ width: "100%", border: "1px solid #E8E8F0", borderRadius: 8, padding: "8px 12px", fontSize: 13, resize: "vertical", minHeight: 72, outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: "#374151", lineHeight: 1.6 }}
              placeholder="What did the customer discuss? What are they looking for?"
            />
          </div>

          {/* Generate email button */}
          <button
            onClick={handleGenerateFollowUpEmail}
            disabled={generatingEmail}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1px solid #635BFF", background: generatingEmail ? "#F5F3FF" : "#EEF2FF", color: "#635BFF", fontSize: 13, fontWeight: 600, cursor: generatingEmail ? "wait" : "pointer", opacity: generatingEmail ? 0.8 : 1 }}
          >
            {generatingEmail ? "Generating…" : "Generate Follow-up Email"}
          </button>

          {/* Generated email output */}
          {generatedEmail && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>Generated Email</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(generatedEmail); setEmailCopied(true); setTimeout(() => setEmailCopied(false), 2000); }}
                  style={{ fontSize: 12, color: "#635BFF", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500 }}
                >
                  {emailCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, color: "#374151", background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 8, padding: "12px 14px", lineHeight: 1.7, margin: 0, fontFamily: "inherit" }}>
                {generatedEmail}
              </pre>
            </div>
          )}
        </div>

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

        {/* ── Add Item button ────────────────────────────────── */}
        <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
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
  );
}
