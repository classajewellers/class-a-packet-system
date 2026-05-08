"use client";

import { Quote } from "@/lib/types";
import { isOverdue, quoteStage } from "@/lib/pipeline";

interface Props {
  quote: Quote;
  onClick: () => void;
}

export default function QuoteCard({ quote, onClick }: Props) {
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
  const typeBg =
    quote.quote_type === "repair"
      ? "bg-blue-100 text-blue-800"
      : "bg-purple-100 text-purple-800";

  const isConverted = !!quote.converted_to_packet_id;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all select-none"
    >
      {/* Name + converted badge */}
      <div className="flex items-start justify-between gap-1 mb-1">
        <p className="font-semibold text-sm text-black leading-tight">{customerName}</p>
        {isConverted && (
          <span className="flex-shrink-0 text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-medium leading-tight text-right">
            ✓ {quote.packet_reference ?? "Converted"}
          </span>
        )}
      </div>

      {/* Reference */}
      <p className="font-mono text-xs text-gray-400 mb-2">{quote.reference_number}</p>

      {/* Type badge */}
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeBg} mb-2`}>
        {typeLabel}
      </span>

      {/* Follow-up date */}
      {quote.follow_up_date && (
        <div className={`text-xs mb-1 flex items-center gap-1 ${showOverdue ? "text-red-600 font-semibold" : "text-gray-500"}`}>
          {showOverdue && (
            <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
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
        <p className="text-xs text-gray-500 mb-1 truncate">👤 {quote.assigned_to}</p>
      )}

      {/* Created date */}
      <p className="text-xs text-gray-400 mt-1">{created}</p>
    </div>
  );
}
