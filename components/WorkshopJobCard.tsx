"use client";

import { WorkshopJob } from "@/lib/types";
import { WorkshopTrack, TRACK_LABELS, TRACK_COLOURS } from "@/lib/workshopConfig";

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

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  if (!m || !d) return iso;
  return `${d}/${m}`;
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

  // Track badge
  const track = (job.track ?? "repair") as WorkshopTrack;
  const trackColour = TRACK_COLOURS[track] ?? TRACK_COLOURS.repair;
  const trackLabel = TRACK_LABELS[track] ?? track;

  return (
    <div
      onClick={onClick}
      style={{
        background: '#FFFFFF', borderRadius: 10, border: '1px solid #E8E8F0',
        padding: 12, cursor: 'grab', userSelect: 'none',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {/* Track badge — top right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4, marginBottom: 4 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0, flex: 1 }}>
          {job.customer_surname || "Unknown"}
        </p>
        <span
          style={{
            flexShrink: 0, display: 'inline-flex', padding: '1px 6px', borderRadius: 999,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
            background: trackColour.bg, color: trackColour.text,
            border: `1px solid ${trackColour.border}`,
          }}
        >
          {track === "manufacturing" ? "MFG" : trackLabel.toUpperCase().slice(0, 4)}
        </span>
      </div>

      {/* Description */}
      {job.description && (
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.description}</p>
      )}

      {/* Badges row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
        <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, ...categoryStyle }}>
          {CATEGORY_LABELS[job.category] ?? job.category}
        </span>
        {job.valuation_required && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#EEF2FF', color: '#635BFF', border: '1px solid #C7D2FE' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z" />
            </svg>
            CERTIFICATE
          </span>
        )}
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

      {/* Assigned jeweller / sub-contractor */}
      {(job.assigned_jeweller || job.is_subcontractor) && (
        <p style={{ fontSize: 12, color: '#6B7280', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg style={{ width: 12, height: 12, flexShrink: 0 }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          {job.is_subcontractor && job.subcontractor_name
            ? `Sub.C — ${job.subcontractor_name}`
            : job.assigned_jeweller}
        </p>
      )}

      {/* Manufacture type / supplier badges */}
      {(job.manufacture_type || job.workshop_supplier) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
          {job.manufacture_type && (
            <span style={{ display: 'inline-flex', padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 500, background: '#F3F4F6', color: '#6B7280' }}>
              {job.manufacture_type}
            </span>
          )}
          {job.workshop_supplier && (
            <span style={{ display: 'inline-flex', padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 500, background: '#DBEAFE', color: '#1E40AF' }}>
              → {job.workshop_supplier}
            </span>
          )}
        </div>
      )}

      {/* Due date + ref */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <span style={{ fontSize: 12, padding: '2px 7px', borderRadius: 6, background: isOverdue ? '#FEE2E2' : isDueToday ? '#FEF3C7' : '#F3F4F6', color: isOverdue ? '#EF4444' : isDueToday ? '#F59E0B' : '#9CA3AF', fontWeight: (isOverdue || isDueToday) ? 600 : 400 }}>
          {job.due_date ? formatDateShort(job.due_date) : "No date"}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#D1D5DB' }}>{job.reference_number || ""}</span>
      </div>

      {/* Days in stage */}
      <p style={{ fontSize: 11, color: '#D1D5DB', marginTop: 4 }}>{days} day{days !== 1 ? "s" : ""} in stage</p>
    </div>
  );
}
