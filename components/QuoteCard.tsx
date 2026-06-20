"use client";

import { Quote } from "@/lib/types";
import { isOverdue, quoteStage } from "@/lib/pipeline";

interface TierInfo {
  tier_name: string;
  colour: string;
}

interface Props {
  quote: Quote;
  onClick: () => void;
  tierInfo?: TierInfo | null;
}

export default function QuoteCard({ quote, onClick, tierInfo }: Props) {
  const customerName =
    [quote.customer_first_name, quote.customer_last_name].filter(Boolean).join(" ") || "—";

  const created = new Date(quote.created_at).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const overdue = isOverdue(quote.follow_up_date);
  const stage = quoteStage(quote.status);
  const isActive = stage !== "job_won" && stage !== "job_lost";
  const showOverdue = overdue && isActive;

  const typeLabel = quote.quote_type === "repair" ? "Repair" : "Custom Order";
  const typeBadge: React.CSSProperties = quote.quote_type === "repair"
    ? { background: '#DBEAFE', color: '#1E40AF' }
    : { background: '#EEF2FF', color: '#635BFF' };

  const isConverted = !!quote.converted_to_packet_id;

  return (
    <div
      onClick={onClick}
      style={{ background: '#FFFFFF', borderRadius: 10, border: '1px solid #E8E8F0', padding: 12, cursor: 'pointer', userSelect: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      {/* Name + tier + converted badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flexWrap: 'wrap' }}>
          <p style={{ fontWeight: 600, fontSize: 14, color: '#1A1A2E', lineHeight: 1.2, margin: 0 }}>{customerName}</p>
          {tierInfo && (
            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: `${tierInfo.colour}22`, color: tierInfo.colour, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.6 }}>
              {tierInfo.tier_name}
            </span>
          )}
        </div>
        {isConverted && (
          <span style={{ flexShrink: 0, fontSize: 11, background: '#DBEAFE', color: '#1E40AF', borderRadius: 999, padding: '2px 6px', fontWeight: 500, lineHeight: 1.4, textAlign: 'right' }}>
            ✓ {quote.packet_reference ?? "Converted"}
          </span>
        )}
      </div>

      {/* Reference */}
      <p style={{ fontFamily: 'monospace', fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>{quote.reference_number}</p>

      {/* Type badge */}
      <span style={{ display: 'inline-block', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 500, marginBottom: 8, ...typeBadge }}>
        {typeLabel}
      </span>

      {/* Follow-up date */}
      {quote.follow_up_date && (
        <div style={{ fontSize: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4, color: showOverdue ? '#EF4444' : '#6B7280', fontWeight: showOverdue ? 600 : 400 }}>
          {showOverdue && (
            <svg style={{ width: 12, height: 12, flexShrink: 0 }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          )}
          <span>
            {showOverdue ? "Overdue · " : "Follow up · "}
            {new Date(quote.follow_up_date + "T00:00:00").toLocaleDateString("en-AU", {
              day: "2-digit",
              month: "short",
            })}
          </span>
        </div>
      )}

      {/* Assigned to */}
      {quote.assigned_to && (
        <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {quote.assigned_to}
        </p>
      )}

      {/* Created date */}
      <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{created}</p>
    </div>
  );
}
