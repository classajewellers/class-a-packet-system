"use client";

import { WorkshopJob } from "@/lib/types";

const CATEGORY_BADGES: Record<string, string> = {
  eng_ring:     "bg-purple-100 text-purple-700",
  wed_ring:     "bg-blue-100 text-blue-700",
  custom_ring:  "bg-indigo-100 text-indigo-700",
  repair:       "bg-orange-100 text-orange-700",
  bracelet:     "bg-pink-100 text-pink-700",
  other:        "bg-gray-100 text-gray-600",
};

const CATEGORY_LABELS: Record<string, string> = {
  eng_ring:     "Eng. Ring",
  wed_ring:     "Wed. Ring",
  custom_ring:  "Custom Ring",
  repair:       "Repair",
  bracelet:     "Bracelet",
  other:        "Other",
};

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function formatDateAU(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function daysInStage(changedAt: string): number {
  const changed = new Date(changedAt);
  const now = new Date();
  return Math.floor((now.getTime() - changed.getTime()) / (1000 * 60 * 60 * 24));
}

interface Props {
  job: WorkshopJob;
  onClick?: () => void;
}

export default function WorkshopJobCard({ job, onClick }: Props) {
  const today = todayISO();
  const isOverdue = job.due_date != null && job.due_date < today;
  const isDueToday = job.due_date === today;

  const dueDateColor = isOverdue
    ? "text-red-600 font-semibold"
    : isDueToday
    ? "text-amber-600 font-semibold"
    : "text-gray-400";

  const days = daysInStage(job.stage_changed_at);

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 cursor-grab select-none hover:shadow-md transition-shadow"
    >
      {/* Customer surname */}
      <p className="text-lg font-bold text-gray-900 leading-tight truncate">
        {job.customer_surname || "Unknown"}
      </p>

      {/* Description */}
      {job.description && (
        <p className="text-sm text-gray-600 mt-0.5 truncate">{job.description}</p>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mt-2">
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${CATEGORY_BADGES[job.category] ?? CATEGORY_BADGES.other}`}>
          {CATEGORY_LABELS[job.category] ?? job.category}
        </span>
        {job.complexity === "complex" && (
          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
            Complex
          </span>
        )}
        {job.job_type === "minor" && (
          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
            Minor
          </span>
        )}
      </div>

      {/* Assigned jeweller */}
      {job.assigned_jeweller && (
        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          {job.assigned_jeweller}
        </p>
      )}

      {/* Due date + ref */}
      <div className="flex items-center justify-between mt-2">
        <span className={`text-xs ${dueDateColor}`}>
          {job.due_date ? formatDateAU(job.due_date) : "No due date"}
        </span>
        <span className="font-mono text-xs text-gray-300">{job.reference_number || ""}</span>
      </div>

      {/* Days in stage */}
      <p className="text-xs text-gray-300 mt-1">{days} day{days !== 1 ? "s" : ""} in stage</p>
    </div>
  );
}
