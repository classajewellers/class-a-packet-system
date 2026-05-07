"use client";

import { Quote } from "@/lib/types";
import { isOverdue, quoteStage } from "@/lib/pipeline";

interface Props {
  quotes: Quote[];
}

export default function QuoteStatsBar({ quotes }: Props) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Pipeline quotes only (exclude converted — they've moved on)
  const pipelineQuotes = quotes.filter((q) => q.status !== "converted");

  // Total quotes created this month
  const monthTotal = pipelineQuotes.filter(
    (q) => new Date(q.created_at) >= startOfMonth
  ).length;

  // Closed (won + lost)
  const wonAll = pipelineQuotes.filter((q) => q.status === "job_won");
  const lostAll = pipelineQuotes.filter((q) => q.status === "job_lost");
  const closedCount = wonAll.length + lostAll.length;
  const wonCount = wonAll.length;
  const conversionRate =
    closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : null;

  // Overdue follow-ups (active stages only)
  const overdueCount = pipelineQuotes.filter(
    (q) =>
      isOverdue(q.follow_up_date) &&
      quoteStage(q.status) !== "job_won" &&
      quoteStage(q.status) !== "job_lost"
  ).length;

  const Stat = ({
    label,
    value,
    valueClass = "text-black",
  }: {
    label: string;
    value: string;
    valueClass?: string;
  }) => (
    <div className="flex flex-col items-center px-5 py-3 min-w-[120px]">
      <p className={`text-xl font-bold ${valueClass}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5 text-center leading-tight">{label}</p>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-5 flex flex-wrap divide-x divide-gray-100">
      <Stat label="Quotes this month" value={String(monthTotal)} />
      <Stat
        label="Conversion rate"
        value={conversionRate !== null ? `${conversionRate}%` : "—"}
        valueClass={
          conversionRate !== null && conversionRate >= 50
            ? "text-emerald-600"
            : "text-black"
        }
      />
      <Stat label="Total won" value={String(wonCount)} valueClass="text-emerald-600" />
      <Stat label="Total lost" value={String(lostAll.length)} valueClass={lostAll.length > 0 ? "text-red-500" : "text-black"} />
      <Stat
        label="Overdue follow-ups"
        value={String(overdueCount)}
        valueClass={overdueCount > 0 ? "text-red-600 font-extrabold" : "text-black"}
      />
    </div>
  );
}
