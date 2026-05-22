"use client";

import { WorkshopJob } from "@/lib/types";

const CATEGORY_BADGE_STYLES: Record<string, React.CSSProperties> = {
  eng_ring:     { background: '#EEF2FF', color: '#635BFF' },
  wed_ring:     { background: '#DBEAFE', color: '#1E40AF' },
  custom_ring:  { background: '#EDE9FE', color: '#6D28D9' },
  repair:       { background: '#FEF3C7', color: '#92400E' },
  bracelet:     { background: '#FCE7F3', color: '#9D174D' },
  other:        { background: '#F3F4F6', color: '#374151' },
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

  const days = daysInStage(job.stage_changed_at);
  const categoryStyle = CATEGORY_BADGE_STYLES[job.category] ?? CATEGORY_BADGE_STYLES.other;

  return (
    <div
      onClick={onClick}
      style={{ background: '#FFFFFF', borderRadius: 10, border: '1px solid #E8E8F0', padding: 12, cursor: 'grab', userSelect: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      {/* Customer surname */}
      <p style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
        {job.customer_surname || "Unknown"}
      </p>

      {/* Description */}
      {job.description && (
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.description}</p>
      )}

      {/* Badges */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
        <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, ...categoryStyle }}>
          {CATEGORY_LABELS[job.category] ?? job.category}
        </span>
        {job.complexity === "complex" && (
          <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#FEE2E2', color: '#991B1B' }}>
            Complex
          </span>
        )}
        {job.job_type === "minor" && (
          <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#F3F4F6', color: '#6B7280' }}>
            Minor
          </span>
        )}
      </div>

      {/* Assigned jeweller */}
      {job.assigned_jeweller && (
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg style={{ width: 12, height: 12, flexShrink: 0 }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          {job.assigned_jeweller}
        </p>
      )}

      {/* Due date + ref */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 12, color: isOverdue ? '#EF4444' : isDueToday ? '#F59E0B' : '#9CA3AF', fontWeight: (isOverdue || isDueToday) ? 600 : 400 }}>
          {job.due_date ? formatDateAU(job.due_date) : "No due date"}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#D1D5DB' }}>{job.reference_number || ""}</span>
      </div>

      {/* Days in stage */}
      <p style={{ fontSize: 11, color: '#D1D5DB', marginTop: 4 }}>{days} day{days !== 1 ? "s" : ""} in stage</p>
    </div>
  );
}
