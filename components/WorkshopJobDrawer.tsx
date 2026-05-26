"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { WorkshopJob, ComponentItem } from "@/lib/types";
import { useUser } from "@/context/UserContext";

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

const STATUS_STYLES: Record<ComponentItem["status"], React.CSSProperties> = {
  ordered: { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' },
  arrived: { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE' },
  checked: { background: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0' },
};
const STATUS_NEXT: Record<ComponentItem["status"], ComponentItem["status"]> = {
  ordered: "arrived",
  arrived: "checked",
  checked: "ordered",
};

const fieldStyle: React.CSSProperties = {
  width: '100%', border: '1px solid #E8E8F0', borderRadius: 8,
  background: '#fff', fontSize: 14, padding: '0 12px', color: '#1A1A2E',
  outline: 'none', height: 40, fontFamily: 'inherit',
};

const textareaStyle: React.CSSProperties = {
  width: '100%', border: '1px solid #E8E8F0', borderRadius: 8,
  background: '#fff', fontSize: 14, padding: '8px 12px', color: '#1A1A2E',
  outline: 'none', fontFamily: 'inherit', resize: 'vertical',
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
  const { user } = useUser();
  const isManager = user?.role === "manager";
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

  async function handleDeleteJob() {
    if (!window.confirm("Delete this workshop job? This cannot be undone.")) return;
    setDeleting(true);
    try {
      console.log("[delete workshop] deleting job:", job.id);
      const res = await fetch(`/api/workshop/jobs/${job.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      console.log("[delete workshop] response status:", res.status);
      const json = await res.json();
      console.log("[delete workshop] response:", json);
      if (json.success) {
        onDelete(job.id);
        onClose();
      } else {
        alert("Delete failed: " + (json.error || "Unknown error"));
      }
    } catch (err) {
      console.error("[delete workshop] error:", err);
      alert("Delete failed: " + String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      {/* Backdrop */}
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />

      {/* Drawer */}
      <div style={{ width: 480, background: '#FFFFFF', borderLeft: '1px solid #E8E8F0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 20, background: '#FFFFFF', borderBottom: '1px solid #E8E8F0', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>{STAGES.find((s) => s.id === local.stage)?.label ?? local.stage}</p>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>{local.customer_surname ?? "Workshop Job"}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {saving && <span style={{ fontSize: 12, color: '#9CA3AF' }}>Saving…</span>}
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
            >
              <svg style={{ width: 20, height: 20, color: '#6B7280' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {local.packet_id && (
          <div style={{ padding: '8px 20px', borderBottom: '1px solid #E8E8F0', background: '#F9FAFB' }}>
            <Link
              href={`/orders?open_packet=${local.packet_id}`}
              style={{ fontSize: 12, fontWeight: 600, color: '#635BFF', textDecoration: 'none' }}
              onClick={onClose}
            >
              View Order &amp; Specs →
            </Link>
          </div>
        )}

        <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Stage selector */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Stage</p>
            <select
              value={local.stage}
              onChange={(e) => {
                setField("stage", e.target.value);
                patch({ stage: e.target.value });
              }}
              style={fieldStyle}
            >
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          {/* Job details */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, borderBottom: '1px solid #E8E8F0', paddingBottom: 4 }}>Job Details</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Customer Surname</label>
                <input
                  type="text"
                  value={local.customer_surname ?? ""}
                  onChange={(e) => setField("customer_surname", e.target.value)}
                  onBlur={(e) => handleBlurSave("customer_surname", e.target.value || null)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Description</label>
                <textarea
                  rows={2}
                  value={local.description ?? ""}
                  onChange={(e) => setField("description", e.target.value)}
                  onBlur={(e) => handleBlurSave("description", e.target.value || null)}
                  style={textareaStyle}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Category</label>
                  <select
                    value={local.category}
                    onChange={(e) => { setField("category", e.target.value); patch({ category: e.target.value }); }}
                    style={fieldStyle}
                  >
                    {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Complexity</label>
                  <select
                    value={local.complexity}
                    onChange={(e) => { setField("complexity", e.target.value); patch({ complexity: e.target.value }); }}
                    style={fieldStyle}
                  >
                    <option value="standard">Standard</option>
                    <option value="complex">Complex</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Job Type</label>
                  <select
                    value={local.job_type}
                    onChange={(e) => { setField("job_type", e.target.value); patch({ job_type: e.target.value }); }}
                    style={fieldStyle}
                  >
                    <option value="major">Major</option>
                    <option value="minor">Minor</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Due Date</label>
                  <input
                    type="date"
                    value={local.due_date ?? ""}
                    onChange={(e) => { setField("due_date", e.target.value || null); patch({ due_date: e.target.value || null }); }}
                    style={fieldStyle}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Assigned Jeweller</label>
                <select
                  value={local.assigned_jeweller ?? ""}
                  onChange={(e) => { setField("assigned_jeweller", e.target.value || null); patch({ assigned_jeweller: e.target.value || null }); }}
                  style={fieldStyle}
                >
                  <option value="">— Unassigned —</option>
                  {JEWELLERS.map((j) => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Instructions</label>
                <textarea
                  rows={3}
                  value={local.instructions ?? ""}
                  onChange={(e) => setField("instructions", e.target.value)}
                  onBlur={(e) => handleBlurSave("instructions", e.target.value || null)}
                  style={textareaStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Notes</label>
                <textarea
                  rows={2}
                  value={local.notes ?? ""}
                  onChange={(e) => setField("notes", e.target.value)}
                  onBlur={(e) => handleBlurSave("notes", e.target.value || null)}
                  style={textareaStyle}
                />
              </div>
            </div>
          </div>

          {/* Components section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E8E8F0', paddingBottom: 4, marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Components</p>
              <button
                onClick={() => setAddingComponent((v) => !v)}
                style={{ fontSize: 12, fontWeight: 600, color: '#635BFF', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                + Add Component
              </button>
            </div>

            {/* All received banner */}
            {allReceived && (
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 12, padding: '8px 12px' }}>
                <span style={{ color: '#166534', fontSize: 14 }}>✓</span>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#166534', margin: 0 }}>All components received — ready for Pre-Check</p>
              </div>
            )}

            {/* Add component form */}
            {addingComponent && (
              <div style={{ background: '#F9FAFB', borderRadius: 12, border: '1px solid #E8E8F0', padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  placeholder="Component name *"
                  value={newComp.name}
                  onChange={(e) => setNewComp((c) => ({ ...c, name: e.target.value }))}
                  style={fieldStyle}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input
                    placeholder="Quantity"
                    value={newComp.quantity}
                    onChange={(e) => setNewComp((c) => ({ ...c, quantity: e.target.value }))}
                    style={fieldStyle}
                  />
                  <select
                    value={newComp.status}
                    onChange={(e) => setNewComp((c) => ({ ...c, status: e.target.value as ComponentItem["status"] }))}
                    style={fieldStyle}
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
                  style={fieldStyle}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { setAddingComponent(false); setNewComp({ name: "", quantity: "1", status: "ordered", notes: "" }); }}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid #E8E8F0', fontSize: 12, fontWeight: 600, color: '#6B7280', background: '#fff', cursor: 'pointer' }}
                  >Cancel</button>
                  <button
                    onClick={addComponent}
                    disabled={!newComp.name.trim()}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: '#635BFF', color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', opacity: !newComp.name.trim() ? 0.4 : 1 }}
                  >Add</button>
                </div>
              </div>
            )}

            {/* Component list */}
            {local.components.length === 0 && !addingComponent ? (
              <p style={{ fontSize: 14, color: '#9CA3AF', fontStyle: 'italic' }}>No components added yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {local.components.map((comp) => (
                  <div key={comp.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#fff', border: '1px solid #E8E8F0', borderRadius: 12, padding: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>{comp.name}</span>
                        <span style={{ fontSize: 12, color: '#9CA3AF' }}>× {comp.quantity}</span>
                        <button
                          onClick={() => cycleStatus(comp.id)}
                          style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', ...STATUS_STYLES[comp.status] }}
                          title="Click to advance status"
                        >
                          {comp.status.charAt(0).toUpperCase() + comp.status.slice(1)}
                        </button>
                      </div>
                      {comp.notes && <p style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{comp.notes}</p>}
                    </div>
                    <button
                      onClick={() => deleteComponent(comp.id)}
                      style={{ flexShrink: 0, color: '#D1D5DB', background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}
                      title="Remove component"
                    >
                      <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Meta */}
          <p style={{ fontSize: 12, color: '#9CA3AF' }}>
            Ref: {local.reference_number || "—"} &bull; Created {formatDateAU(local.created_at?.split("T")[0])}
          </p>

          {/* Delete — manager only */}
          {isManager && (
            <div style={{ paddingBottom: 8 }}>
              <button
                type="button"
                onClick={handleDeleteJob}
                disabled={deleting}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#EF4444', color: '#fff', fontSize: 14, fontWeight: 600, padding: '12px 0', borderRadius: 8, border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.5 : 1 }}
              >
                <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                {deleting ? "Deleting…" : "Delete Job"}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
