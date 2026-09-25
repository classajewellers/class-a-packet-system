"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { WorkshopJob } from "@/lib/types";
import { WorkshopTrack, TRACK_LABELS, TRACK_STAGES, STAGE_LABELS, STAGE_COLOURS, stagesForFilter, trackFromJobType } from "@/lib/workshopConfig";
import WorkshopJobCard from "@/components/WorkshopJobCard";
// WorkshopJobDrawer removed — this component is superseded by app/workshop/board/page.tsx

const fieldStyle: React.CSSProperties = {
  width: '100%', border: '1px solid #E8E8F0', borderRadius: 8,
  background: '#fff', fontSize: 14, padding: '0 12px', color: '#1A1A2E',
  outline: 'none', height: 40, fontFamily: 'inherit',
};

interface NewJobForm {
  customer_surname: string;
  description: string;
  category: string;
  complexity: string;
  job_type: string;
  track: string;
  assigned_jeweller: string;
  due_date: string;
  instructions: string;
}

const defaultForm: NewJobForm = {
  customer_surname: "",
  description: "",
  category: "other",
  complexity: "standard",
  job_type: "repair",
  track: "repair",
  assigned_jeweller: "",
  due_date: "",
  instructions: "",
};

interface Props {
  jobs: WorkshopJob[];
  onStageChange: (jobId: string, newStage: string) => Promise<void>;
  onRefresh: () => void;
  onJobDeleted: (id: string) => void;
}

type TrackFilter = WorkshopTrack | "all";

const TRACK_FILTER_OPTIONS: { value: TrackFilter; label: string }[] = [
  { value: "all",           label: "All Tracks" },
  { value: "repair",        label: "Repair" },
  { value: "collections",   label: "Collections" },
  { value: "manufacturing", label: "Manufacturing" },
];

export default function WorkshopBoard({ jobs, onStageChange, onRefresh, onJobDeleted }: Props) {
  const { user } = useUser();
  const [localJobs, setLocalJobs] = useState<WorkshopJob[]>(jobs);
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("all");
  const [valuationFilter, setValuationFilter] = useState(false);
  const [addingToStage, setAddingToStage] = useState<string | null>(null);
  const [newJobForm, setNewJobForm] = useState<NewJobForm>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [selectedJob, setSelectedJob] = useState<WorkshopJob | null>(null);

  // Keep local in sync with prop changes (detect list-level changes)
  if (jobs !== localJobs && JSON.stringify(jobs.map((j) => j.id)) !== JSON.stringify(localJobs.map((j) => j.id))) {
    setLocalJobs(jobs);
  }

  const visibleStages = stagesForFilter(trackFilter);

  // Apply track filter then valuation filter
  const visibleJobs = localJobs
    .filter((j) => trackFilter === "all" || (j.track ?? "repair") === trackFilter)
    .filter((j) => !valuationFilter || j.valuation_required === true);

  function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStage = destination.droppableId;
    setLocalJobs((prev) =>
      prev.map((j) => j.id === draggableId ? { ...j, stage: newStage, stage_changed_at: new Date().toISOString() } : j)
    );
    onStageChange(draggableId, newStage);
  }

  async function handleAddJob(stage: string) {
    if (!newJobForm.customer_surname.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/workshop/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify({ ...newJobForm, stage }),
      });
      setAddingToStage(null);
      setNewJobForm(defaultForm);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  function handleJobUpdate(updated: WorkshopJob) {
    setLocalJobs((prev) => prev.map((j) => j.id === updated.id ? updated : j));
    setSelectedJob(updated);
  }

  function handleJobDelete(id: string) {
    setLocalJobs((prev) => prev.filter((j) => j.id !== id));
    setSelectedJob(null);
    onJobDeleted(id);
  }

  // When opening "Add job" from a specific column, pre-fill the track to match
  // the column's track (if in a filtered view) or the first track that includes
  // that stage.
  function openAddJob(stage: string) {
    const defaultTrack =
      trackFilter !== "all"
        ? trackFilter
        : (Object.entries(TRACK_STAGES).find(([, stages]) => stages[0] === stage)?.[0] as WorkshopTrack | undefined) ?? "repair";
    setNewJobForm({ ...defaultForm, track: defaultTrack });
    setAddingToStage(stage);
  }

  return (
    <>
      {/* Job detail drawer (removed — use app/workshop/board instead) */}

      {/* Track + Valuation filter bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {TRACK_FILTER_OPTIONS.map((opt) => {
          const active = trackFilter === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setTrackFilter(opt.value)}
              style={{
                padding: '5px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${active ? '#635BFF' : '#E8E8F0'}`,
                background: active ? '#635BFF' : '#FFFFFF',
                color: active ? '#fff' : '#6B7280',
                cursor: 'pointer',
                transition: 'all .15s',
              }}
            >
              {opt.label}
            </button>
          );
        })}

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: '#E8E8F0', margin: '0 2px' }} />

        {/* Valuation filter */}
        <button
          onClick={() => setValuationFilter((v) => !v)}
          style={{
            padding: '5px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            border: `1px solid ${valuationFilter ? '#D97706' : '#E8E8F0'}`,
            background: valuationFilter ? '#FEF3C7' : '#FFFFFF',
            color: valuationFilter ? '#92400E' : '#6B7280',
            cursor: 'pointer',
            transition: 'all .15s',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z" />
          </svg>
          Certificate
        </button>
      </div>

      {/* Add Job Modal */}
      {addingToStage && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 480, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', marginBottom: 16 }}>
              New Job — {STAGE_LABELS[addingToStage] ?? addingToStage}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                placeholder="Customer surname *"
                value={newJobForm.customer_surname}
                onChange={(e) => setNewJobForm((f) => ({ ...f, customer_surname: e.target.value }))}
                style={fieldStyle}
              />
              <input
                placeholder="Description"
                value={newJobForm.description}
                onChange={(e) => setNewJobForm((f) => ({ ...f, description: e.target.value }))}
                style={fieldStyle}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <select
                  value={newJobForm.category}
                  onChange={(e) => setNewJobForm((f) => ({ ...f, category: e.target.value }))}
                  style={fieldStyle}
                >
                  <option value="eng_ring">Eng. Ring</option>
                  <option value="wed_ring">Wed. Ring</option>
                  <option value="custom_ring">Custom Ring</option>
                  <option value="repair">Repair</option>
                  <option value="bracelet">Bracelet</option>
                  <option value="other">Other</option>
                </select>
                <select
                  value={newJobForm.job_type}
                  onChange={(e) => {
                    const jt = e.target.value;
                    setNewJobForm((f) => ({
                      ...f,
                      job_type: jt,
                      // Auto-update track when job type changes
                      track: f.track === trackFromJobType(f.job_type) ? trackFromJobType(jt) : f.track,
                    }));
                  }}
                  style={fieldStyle}
                >
                  <option value="repair">Repair</option>
                  <option value="custom_order">Custom Order</option>
                  <option value="collections">Collections</option>
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                </select>
              </div>

              {/* Track — shown so staff can override */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Track</label>
                <select
                  value={newJobForm.track}
                  onChange={(e) => setNewJobForm((f) => ({ ...f, track: e.target.value }))}
                  style={fieldStyle}
                >
                  {(Object.entries(TRACK_LABELS) as [WorkshopTrack, string][]).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <select
                  value={newJobForm.complexity}
                  onChange={(e) => setNewJobForm((f) => ({ ...f, complexity: e.target.value }))}
                  style={fieldStyle}
                >
                  <option value="standard">Standard</option>
                  <option value="complex">Complex</option>
                </select>
                <input
                  type="date"
                  value={newJobForm.due_date}
                  onChange={(e) => setNewJobForm((f) => ({ ...f, due_date: e.target.value }))}
                  style={fieldStyle}
                />
              </div>
              <input
                placeholder="Assigned jeweller"
                value={newJobForm.assigned_jeweller}
                onChange={(e) => setNewJobForm((f) => ({ ...f, assigned_jeweller: e.target.value }))}
                style={fieldStyle}
              />
              <textarea
                placeholder="Instructions"
                value={newJobForm.instructions}
                onChange={(e) => setNewJobForm((f) => ({ ...f, instructions: e.target.value }))}
                rows={2}
                style={{ ...fieldStyle, height: 'auto', padding: '8px 12px', resize: 'vertical' as const }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => { setAddingToStage(null); setNewJobForm(defaultForm); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #E8E8F0', fontSize: 14, fontWeight: 600, color: '#6B7280', background: '#fff', cursor: 'pointer' }}
              >Cancel</button>
              <button
                onClick={() => handleAddJob(addingToStage)}
                disabled={saving || !newJobForm.customer_surname.trim()}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: '#635BFF', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', opacity: (saving || !newJobForm.customer_surname.trim()) ? 0.5 : 1 }}
              >{saving ? "Saving…" : "Add Job"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 16, minHeight: '60vh', alignItems: 'flex-start' }}>
          {visibleStages.map((stageId) => {
            const stageJobs = visibleJobs.filter((j) => j.stage === stageId);
            const colour = STAGE_COLOURS[stageId] ?? "#635BFF";
            const label = STAGE_LABELS[stageId] ?? stageId;

            return (
              <div key={stageId} style={{ flexShrink: 0, width: 224, display: 'flex', flexDirection: 'column' }}>
                {/* Column header */}
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px', borderRadius: '10px 10px 0 0', marginBottom: 2,
                    background: colour + '15', borderBottom: `2px solid ${colour}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1A1A2E', lineHeight: 1.3 }}>{label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 6px', color: '#fff', background: colour, flexShrink: 0 }}>
                      {stageJobs.length}
                    </span>
                  </div>
                  <button
                    onClick={() => openAddJob(stageId)}
                    style={{ color: '#9CA3AF', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}
                    title="Add job"
                  >+</button>
                </div>

                {/* Droppable column */}
                <Droppable droppableId={stageId}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{
                        flex: 1, borderRadius: '0 0 10px 10px', padding: 8,
                        display: 'flex', flexDirection: 'column', gap: 8,
                        minHeight: 200,
                        background: snapshot.isDraggingOver ? '#EEF2FF' : '#F9FAFB',
                        transition: 'background 0.15s',
                      }}
                    >
                      {stageJobs.map((job, index) => (
                        <Draggable key={job.id} draggableId={job.id} index={index}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              style={{ ...prov.draggableProps.style, opacity: snap.isDragging ? 0.85 : 1 }}
                            >
                              <WorkshopJobCard job={job} onClick={() => setSelectedJob(job)} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </>
  );
}
