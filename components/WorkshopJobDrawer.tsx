"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { WorkshopJob, ComponentItem } from "@/lib/types";

const JEWELLERS = ["Ben Mucklow", "Viv Valladares", "Joseph Onorato", "David Johnson", "Jack Mullan"];

const CATEGORY_OPTIONS = [
  { value: "eng_ring",    label: "Eng. Ring" },
  { value: "wed_ring",    label: "Wed. Ring" },
  { value: "custom_ring", label: "Custom Ring" },
  { value: "repair",      label: "Repair" },
  { value: "bracelet",    label: "Bracelet" },
  { value: "other",       label: "Other" },
];

const STAGES = [
  { id: "new",           label: "New" },
  { id: "cad",           label: "CAD" },
  { id: "cadbox",        label: "CAD Box" },
  { id: "precheck",      label: "Pre-Check" },
  { id: "in_progress",   label: "In Progress" },
  { id: "collection",    label: "Collection" },
  { id: "manufacturing", label: "Manufacturing" },
  { id: "qc",            label: "QC" },
  { id: "ready",         label: "Ready" },
  { id: "completed",     label: "Completed" },
];

const STATUS_COLORS: Record<ComponentItem["status"], string> = {
  ordered: "bg-amber-100 text-amber-700 border-amber-200",
  arrived: "bg-blue-100 text-blue-700 border-blue-200",
  checked: "bg-emerald-100 text-emerald-700 border-emerald-200",
};
const STATUS_NEXT: Record<ComponentItem["status"], ComponentItem["status"]> = {
  ordered: "arrived",
  arrived: "checked",
  checked: "ordered",
};

function newComponentId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDateAU(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

interface Props {
  job: WorkshopJob;
  onClose: () => void;
  onUpdate: (updated: WorkshopJob) => void;
  onDelete: (id: string) => void;
}

export default function WorkshopJobDrawer({ job, onClose, onUpdate, onDelete }: Props) {
  const [local, setLocal] = useState<WorkshopJob>({ ...job, components: job.components ?? [] });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingComponent, setAddingComponent] = useState(false);
  const [newComp, setNewComp] = useState<Omit<ComponentItem, "id">>({
    name: "", quantity: "1", status: "ordered", notes: "",
  });

  const patch = useCallback(async (updates: Partial<WorkshopJob>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/workshop/jobs/${local.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Save failed");
      const json = await res.json() as { job: WorkshopJob };
      const updated = { ...json.job, components: json.job.components ?? [] };
      setLocal(updated);
      onUpdate(updated);
    } catch (err) {
      console.error("[WorkshopJobDrawer] patch failed:", err);
    } finally {
      setSaving(false);
    }
  }, [local.id, onUpdate]);

  function setField<K extends keyof WorkshopJob>(key: K, value: WorkshopJob[K]) {
    setLocal((prev) => ({ ...prev, [key]: value }));
  }

  function handleBlurSave<K extends keyof WorkshopJob>(key: K, value: WorkshopJob[K]) {
    patch({ [key]: value });
  }

  // ── Components ────────────────────────────────────────────────────────────

  function saveComponents(components: ComponentItem[]) {
    setLocal((prev) => ({ ...prev, components }));
    patch({ components } as Partial<WorkshopJob>);
  }

  function addComponent() {
    if (!newComp.name.trim()) return;
    const updated = [...local.components, { ...newComp, id: newComponentId() }];
    saveComponents(updated);
    setNewComp({ name: "", quantity: "1", status: "ordered", notes: "" });
    setAddingComponent(false);
  }

  function cycleStatus(id: string) {
    const updated = local.components.map((c) =>
      c.id === id ? { ...c, status: STATUS_NEXT[c.status] } : c
    );
    saveComponents(updated);
  }

  function deleteComponent(id: string) {
    saveComponents(local.components.filter((c) => c.id !== id));
  }

  const allReceived =
    local.components.length > 0 &&
    local.components.every((c) => c.status === "arrived" || c.status === "checked");

  // ── Delete job ────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!confirm(`Delete job for ${local.customer_surname ?? "this customer"}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/workshop/jobs/${local.id}`, { method: "DELETE" });
      onDelete(local.id);
    } finally {
      setDeleting(false);
    }
  }

  const field = "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-md bg-white shadow-2xl overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <p className="text-xs text-gray-500">{STAGES.find((s) => s.id === local.stage)?.label ?? local.stage}</p>
            <h2 className="font-bold text-base text-black">{local.customer_surname ?? "Workshop Job"}</h2>
          </div>
          <div className="flex items-center gap-3">
            {saving && <span className="text-xs text-gray-400 animate-pulse">Saving…</span>}
            <button onClick={onClose} className="rounded-full p-2 hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {local.packet_id && (
          <div className="px-5 py-2 border-b border-gray-100 bg-gray-50">
            <Link
              href={`/orders?open_packet=${local.packet_id}`}
              className="text-xs font-semibold text-[#A3B2A4] hover:text-black transition-colors"
              onClick={onClose}
            >
              View Order & Specs →
            </Link>
          </div>
        )}

        <div className="flex-1 px-5 py-4 space-y-6">

          {/* Stage selector */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Stage</p>
            <select
              value={local.stage}
              onChange={(e) => {
                setField("stage", e.target.value);
                patch({ stage: e.target.value });
              }}
              className={field}
            >
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          {/* Job details */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 border-b border-gray-100 pb-1">Job Details</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Customer Surname</label>
                <input
                  type="text"
                  value={local.customer_surname ?? ""}
                  onChange={(e) => setField("customer_surname", e.target.value)}
                  onBlur={(e) => handleBlurSave("customer_surname", e.target.value || null)}
                  className={field}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</label>
                <textarea
                  rows={2}
                  value={local.description ?? ""}
                  onChange={(e) => setField("description", e.target.value)}
                  onBlur={(e) => handleBlurSave("description", e.target.value || null)}
                  className={`${field} resize-none`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Category</label>
                  <select
                    value={local.category}
                    onChange={(e) => { setField("category", e.target.value); patch({ category: e.target.value }); }}
                    className={field}
                  >
                    {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Complexity</label>
                  <select
                    value={local.complexity}
                    onChange={(e) => { setField("complexity", e.target.value); patch({ complexity: e.target.value }); }}
                    className={field}
                  >
                    <option value="standard">Standard</option>
                    <option value="complex">Complex</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Job Type</label>
                  <select
                    value={local.job_type}
                    onChange={(e) => { setField("job_type", e.target.value); patch({ job_type: e.target.value }); }}
                    className={field}
                  >
                    <option value="major">Major</option>
                    <option value="minor">Minor</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Due Date</label>
                  <input
                    type="date"
                    value={local.due_date ?? ""}
                    onChange={(e) => { setField("due_date", e.target.value || null); patch({ due_date: e.target.value || null }); }}
                    className={field}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Assigned Jeweller</label>
                <select
                  value={local.assigned_jeweller ?? ""}
                  onChange={(e) => { setField("assigned_jeweller", e.target.value || null); patch({ assigned_jeweller: e.target.value || null }); }}
                  className={field}
                >
                  <option value="">— Unassigned —</option>
                  {JEWELLERS.map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Instructions</label>
                <textarea
                  rows={3}
                  value={local.instructions ?? ""}
                  onChange={(e) => setField("instructions", e.target.value)}
                  onBlur={(e) => handleBlurSave("instructions", e.target.value || null)}
                  className={`${field} resize-none`}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={local.notes ?? ""}
                  onChange={(e) => setField("notes", e.target.value)}
                  onBlur={(e) => handleBlurSave("notes", e.target.value || null)}
                  className={`${field} resize-none`}
                />
              </div>
            </div>
          </div>

          {/* Components section */}
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-1 mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Components</p>
              <button
                onClick={() => setAddingComponent((v) => !v)}
                className="text-xs font-semibold text-[#A3B2A4] hover:text-black transition-colors"
              >
                + Add Component
              </button>
            </div>

            {/* All received banner */}
            {allReceived && (
              <div className="mb-3 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                <span className="text-emerald-600 text-sm">✓</span>
                <p className="text-sm font-semibold text-emerald-700">All components received — ready for Pre-Check</p>
              </div>
            )}

            {/* Add component form */}
            {addingComponent && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 mb-3 space-y-2">
                <input
                  placeholder="Component name *"
                  value={newComp.name}
                  onChange={(e) => setNewComp((c) => ({ ...c, name: e.target.value }))}
                  className={field}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Quantity"
                    value={newComp.quantity}
                    onChange={(e) => setNewComp((c) => ({ ...c, quantity: e.target.value }))}
                    className={field}
                  />
                  <select
                    value={newComp.status}
                    onChange={(e) => setNewComp((c) => ({ ...c, status: e.target.value as ComponentItem["status"] }))}
                    className={field}
                  >
                    <option value="ordered">Ordered</option>
                    <option value="arrived">Arrived</option>
                    <option value="checked">Checked</option>
                  </select>
                </div>
                <input
                  placeholder="Notes (optional)"
                  value={newComp.notes}
                  onChange={(e) => setNewComp((c) => ({ ...c, notes: e.target.value }))}
                  className={field}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setAddingComponent(false); setNewComp({ name: "", quantity: "1", status: "ordered", notes: "" }); }}
                    className="flex-1 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                  >Cancel</button>
                  <button
                    onClick={addComponent}
                    disabled={!newComp.name.trim()}
                    className="flex-1 py-2 rounded-lg bg-black text-white text-xs font-semibold hover:bg-[#222] disabled:opacity-40"
                  >Add</button>
                </div>
              </div>
            )}

            {/* Component list */}
            {local.components.length === 0 && !addingComponent ? (
              <p className="text-sm text-gray-400 italic">No components added yet</p>
            ) : (
              <div className="space-y-2">
                {local.components.map((comp) => (
                  <div key={comp.id} className="flex items-start gap-2 bg-white border border-gray-200 rounded-xl p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 truncate">{comp.name}</span>
                        <span className="text-xs text-gray-400">× {comp.quantity}</span>
                        <button
                          onClick={() => cycleStatus(comp.id)}
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border cursor-pointer hover:opacity-80 transition-opacity ${STATUS_COLORS[comp.status]}`}
                          title="Click to advance status"
                        >
                          {comp.status.charAt(0).toUpperCase() + comp.status.slice(1)}
                        </button>
                      </div>
                      {comp.notes && <p className="text-xs text-gray-500 mt-0.5">{comp.notes}</p>}
                    </div>
                    <button
                      onClick={() => deleteComponent(comp.id)}
                      className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors p-0.5"
                      title="Remove component"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Meta */}
          <p className="text-xs text-gray-400">
            Ref: {local.reference_number || "—"} &bull; Created {formatDateAU(local.created_at?.split("T")[0])}
          </p>

          {/* Delete */}
          <div className="pt-2 pb-4">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full flex items-center justify-center gap-2 bg-red-600 text-white text-sm font-semibold py-3 rounded-xl hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              {deleting ? "Deleting…" : "Delete Job"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
