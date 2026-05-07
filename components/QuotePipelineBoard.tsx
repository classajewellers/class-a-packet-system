"use client";

import { Quote } from "@/lib/types";
import {
  PIPELINE_STAGES,
  STAGE_CONFIG,
  isOverdue,
  quoteStage,
} from "@/lib/pipeline";
import QuoteCard from "@/components/QuoteCard";

interface Props {
  quotes: Quote[];
  onQuoteClick: (quote: Quote) => void;
}

function sortCards(cards: Quote[]): Quote[] {
  return [...cards].sort((a, b) => {
    const aOverdue = isOverdue(a.follow_up_date) ? 0 : 1;
    const bOverdue = isOverdue(b.follow_up_date) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;

    // Then by follow_up_date ascending (null last)
    if (a.follow_up_date && b.follow_up_date) {
      if (a.follow_up_date < b.follow_up_date) return -1;
      if (a.follow_up_date > b.follow_up_date) return 1;
    } else if (a.follow_up_date) return -1;
    else if (b.follow_up_date) return 1;

    // Then by created_at ascending
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

export default function QuotePipelineBoard({ quotes, onQuoteClick }: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4 min-h-[60vh] items-start">
      {PIPELINE_STAGES.map((stage) => {
        const config = STAGE_CONFIG[stage];
        const cards = sortCards(
          quotes.filter((q) => quoteStage(q.status) === stage)
        );
        const overdueCount = cards.filter(
          (q) => isOverdue(q.follow_up_date) && stage !== "job_won" && stage !== "job_lost"
        ).length;

        return (
          <div
            key={stage}
            className="flex-shrink-0 w-64 flex flex-col rounded-2xl overflow-hidden border border-gray-200 shadow-sm"
          >
            {/* Column header */}
            <div
              className="px-3 py-2.5 flex items-center justify-between"
              style={{ backgroundColor: config.color }}
            >
              <span className="text-white font-semibold text-sm tracking-wide">
                {config.label}
              </span>
              <div className="flex items-center gap-1.5">
                {overdueCount > 0 && (
                  <span className="bg-white/30 text-white text-xs font-bold rounded-full px-1.5 py-0.5">
                    {overdueCount} overdue
                  </span>
                )}
                <span className="bg-white/20 text-white text-xs font-bold rounded-full px-2 py-0.5">
                  {cards.length}
                </span>
              </div>
            </div>

            {/* Cards */}
            <div className="flex-1 bg-gray-50 p-2 space-y-2 min-h-[200px]">
              {cards.length === 0 ? (
                <p className="text-xs text-gray-400 text-center pt-6 italic">
                  No quotes
                </p>
              ) : (
                cards.map((q) => (
                  <QuoteCard key={q.id} quote={q} onClick={() => onQuoteClick(q)} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
