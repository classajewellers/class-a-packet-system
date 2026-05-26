"use client";

import { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { WorkshopJob } from "@/lib/types";
import WorkshopJobCard from "@/components/WorkshopJobCard";
import WorkshopJobDrawer from "@/components/WorkshopJobDrawer";

const STAGES = [
  { id: "new",           label: "New",           color: "#635BFF" },
  { id: "cad",           label: "CAD",            color: "#8B5CF6" },
  { id: "cadbox",        label: "CAD Box",        color: "#7C3AED" },
  { id: "precheck",      label: "Pre-Check",      color: "#F59E0B" },
  { id: "in_progress",   label: "In Progress",    color: "#3B82F6" },
  { id: "collection",    label: "Collection",     color: "#06B6D4" },
  { id: "manufacturing", label: "Manufacturing",  color: "#10B981" },
  { id: "qc",            label: "QC",             color: "#F97316" },
  { id: "ready",         label: "Ready",          color: "#22C55E" },
  { id: "completed",     label: "Completed",      color: "#6B7280" },
];

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
  assigned_jeweller: string;
  due_date: string;
  instructions: string;
}

const defaultForm: NewJobForm = {
  customer_surname: "",
  description: "",
  category: "other",
  complexity: "standard",
  job_type: "major",
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

export default function WorkshopBoard({ jobs, onStageChange, onRefresh, onJobDeleted }: Props) {
  const [localJobs, setLocalJobs] = useState<WorkshopJob[]>(jobs);
  const [addingToStage, setAddingToStage] = useState<string | null>(null);
  const [newJobForm, setNewJobForm] = useState<NewJobForm>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [selectedJob, setSelectedJob] = useState<WorkshopJob | null>(null);

  // Keep local in sync with prop changes
  if (jobs !== localJobs && JSON.stringify(jobs.map((j) => j.id)) !== JSON.stringify(localJobs.map((j) => j.id))) {
    setLocalJobs(jobs);
  }

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
        headers: { "Content-Type": "application/json" },
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
    onJobDeleted(id); // also update parent so the prop stays in sync
  }

  return (
    <>
      {/* Job detail drawer */}
      {selectedJob && (
        <WorkshopJobDrawer
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onUpdate={handleJobUpdate}
          onDelete={handleJobDelete}
        />
      )}

      {/* Add Job Modal */}
      {addingToStage && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 480, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', marginBottom: 16 }}>
              New Job — {STAGES.find((s) => s.id === addingToStage)?.label}
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
                  onChange={(e) => setNewJobForm((f) => ({ ...f, job_type: e.target.value }))}
                  style={fieldStyle}
                >
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
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

      <DragDropContext onDragEnd={onDragEnd}>
        <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 16, minHeight: '60vh' }}>
          {STAGES.map((stage) => {
            const stageJobs = localJobs.filter((j) => j.stage === stage.id);
            return (
              <div key={stage.id} style={{ flexShrink: 0, width: 224, display: 'flex', flexDirection: 'column' }}>
                {/* Column header */}
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '10px 10px 0 0', marginBottom: 2, background: stage.color + '15', borderBottom: `2px solid ${stage.color}` }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1A2E' }}>{stage.label}</span>
                    <span
                      style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '1px 6px', color: '#fff', background: stage.color }}
                    >{stageJobs.length}</span>
                  </div>
                  <button
                    onClick={() => setAddingToStage(stage.id)}
                    style={{ color: '#9CA3AF', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}
                    title="Add job"
                  >+</button>
                </div>

                {/* Droppable column */}
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      style={{ flex: 1, borderRadius: '0 0 10px 10px', padding: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, background: snapshot.isDraggingOver ? '#EEF2FF' : '#F9FAFB', transition: 'background 0.15s' }}
                    >
                      {stageJobs.map((job, index) => (
                        <Draggable key={job.id} draggableId={job.id} index={index}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              style={{
                                ...prov.draggableProps.style,
                                opacity: snap.isDragging ? 0.85 : 1,
                              }}
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
