"use client";

import { useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { WorkshopJob } from "@/lib/types";
import WorkshopJobCard from "@/components/WorkshopJobCard";

const STAGES = [
  { id: "new",           label: "New",           color: "#6366f1" },
  { id: "cad",           label: "CAD",            color: "#8b5cf6" },
  { id: "cadbox",        label: "CAD Box",        color: "#7c3aed" },
  { id: "precheck",      label: "Pre-Check",      color: "#f59e0b" },
  { id: "in_progress",   label: "In Progress",    color: "#3b82f6" },
  { id: "collection",    label: "Collection",     color: "#06b6d4" },
  { id: "manufacturing", label: "Manufacturing",  color: "#10b981" },
  { id: "qc",            label: "QC",             color: "#f97316" },
  { id: "ready",         label: "Ready",          color: "#22c55e" },
  { id: "completed",     label: "Completed",      color: "#6b7280" },
];

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
}

export default function WorkshopBoard({ jobs, onStageChange, onRefresh }: Props) {
  const [localJobs, setLocalJobs] = useState<WorkshopJob[]>(jobs);
  const [addingToStage, setAddingToStage] = useState<string | null>(null);
  const [newJobForm, setNewJobForm] = useState<NewJobForm>(defaultForm);
  const [saving, setSaving] = useState(false);

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

  return (
    <>
      {/* Add Job Modal */}
      {addingToStage && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-gray-900 mb-4">
              New Job — {STAGES.find((s) => s.id === addingToStage)?.label}
            </h3>
            <div className="space-y-3">
              <input
                placeholder="Customer surname *"
                value={newJobForm.customer_surname}
                onChange={(e) => setNewJobForm((f) => ({ ...f, customer_surname: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
              <input
                placeholder="Description"
                value={newJobForm.description}
                onChange={(e) => setNewJobForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newJobForm.category}
                  onChange={(e) => setNewJobForm((f) => ({ ...f, category: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
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
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={newJobForm.complexity}
                  onChange={(e) => setNewJobForm((f) => ({ ...f, complexity: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="standard">Standard</option>
                  <option value="complex">Complex</option>
                </select>
                <input
                  type="date"
                  value={newJobForm.due_date}
                  onChange={(e) => setNewJobForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <input
                placeholder="Assigned jeweller"
                value={newJobForm.assigned_jeweller}
                onChange={(e) => setNewJobForm((f) => ({ ...f, assigned_jeweller: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              />
              <textarea
                placeholder="Instructions"
                value={newJobForm.instructions}
                onChange={(e) => setNewJobForm((f) => ({ ...f, instructions: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black resize-none"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setAddingToStage(null); setNewJobForm(defaultForm); }}
                className="flex-1 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >Cancel</button>
              <button
                onClick={() => handleAddJob(addingToStage)}
                disabled={saving || !newJobForm.customer_surname.trim()}
                className="flex-1 py-2 rounded-xl bg-black text-white text-sm font-semibold hover:bg-[#222] disabled:opacity-50"
              >{saving ? "Saving…" : "Add Job"}</button>
            </div>
          </div>
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "60vh" }}>
          {STAGES.map((stage) => {
            const stageJobs = localJobs.filter((j) => j.stage === stage.id);
            return (
              <div key={stage.id} className="flex-shrink-0 w-56 flex flex-col">
                {/* Column header */}
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-t-xl mb-1"
                  style={{ background: stage.color + "18", borderBottom: `2px solid ${stage.color}` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-800">{stage.label}</span>
                    <span
                      className="text-xs font-bold rounded-full px-1.5 py-0.5 text-white"
                      style={{ background: stage.color }}
                    >{stageJobs.length}</span>
                  </div>
                  <button
                    onClick={() => setAddingToStage(stage.id)}
                    className="text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none"
                    title="Add job"
                  >+</button>
                </div>

                {/* Droppable column */}
                <Droppable droppableId={stage.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 rounded-b-xl p-2 space-y-2 min-h-[200px] transition-colors ${
                        snapshot.isDraggingOver ? "bg-blue-50" : "bg-gray-50"
                      }`}
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
                              <WorkshopJobCard job={job} />
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
