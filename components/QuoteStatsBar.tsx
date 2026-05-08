"use client";

import { Quote } from "@/lib/types";
import { isOverdue, quoteStage } from "@/lib/pipeline";

interface Props {
  quotes: Quote[];
}

export default function QuoteStatsBar({ quotes }: Props) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const all = quotes ?? [];

  // This month only
  const thisMonth = all.filter((q) => new Date(q.created_at) >= startOfMonth);
  const monthTotal = thisMonth.length;

  // All-time counts by status
  const convertedCount = all.filter((q) => q.status === "converted").length;
  const jobWonCount    = all.filter((q) => q.status === "job_won").length;
  const jobLostCount   = all.filter((q) => q.status === "job_lost").length;

  // Conversion rate = (converted + job_won) / total active-stage+closed * 100
  // Denominator: everyone who has reached a closed state (won, converted, or lost)
  const closedCount = convertedCount + jobWonCount + jobLostCount;
  const wonTotal    = convertedCount + jobWonCount;
  const conversionRate =
    closedCount > 0 ? Math.round((wonTotal / closedCount) * 100) : null;

  // Overdue follow-ups (active pipeline stages only)
  const overdueCount = all.filter(
    (q) =>
      isOverdue(q.follow_up_date) &&
      quoteStage(q.status) !== "job_won" &&
      quoteStage(q.status) !== "job_lost" &&
      q.status !== "converted"
  ).length;

  const Stat = ({
    label,
    value,
    valueClass = "text-black",
    sub,
  }: {
    label: string;
    value: string;
    valueClass?: string;
    sub?: string;
  }) => (
    <div className="flex flex-col items-center px-5 py-3 min-w-[110px]">
      <p className={`text-xl font-bold ${valueClass}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5 text-center leading-tight">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5 text-center">{sub}</p>}
    </div>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-5 flex flex-wrap divide-x divide-gray-100">
      <Stat
        label="Quotes this month"
        value={String(monthTotal)}
      />
      <Stat
        label="Converted to orders"
        value={String(convertedCount)}
        valueClass="text-blue-600"
      />
      <Stat
        label="Job Won"
        value={String(jobWonCount)}
        valueClass="text-emerald-600"
      />
      <Stat
        label="Job Lost"
        value={String(jobLostCount)}
        valueClass={jobLostCount > 0 ? "text-red-500" : "text-black"}
      />
      <Stat
        label="Conversion rate"
        value={conversionRate !== null ? `${conversionRate}%` : "—"}
        valueClass={
          conversionRate !== null && conversionRate >= 50
            ? "text-emerald-600"
            : "text-black"
        }
        sub={closedCount > 0 ? `${wonTotal} of ${closedCount} closed` : undefined}
      />
      <Stat
        label="Overdue follow-ups"
        value={String(overdueCount)}
        valueClass={overdueCount > 0 ? "text-red-600 font-extrabold" : "text-black"}
      />
    </div>
  );
}
