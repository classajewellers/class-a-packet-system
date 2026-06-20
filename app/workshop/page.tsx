"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { hasPermission, canManage } from "@/lib/userTypes";
import { formatDateAU, formatCurrency } from "@/lib/formatters";
import { Packet } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  full_name: string | null;
  role: string | null;
}

type KanbanStatus = "intake" | "on_bench" | "quality_check" | "ready" | "collected";
type JobType = "repair" | "custom_order" | "stock_work" | "online_order";
type JobTypeFilter = "all" | JobType;
type StatusFilter = "all" | "overdue" | "due_today" | "ready";

// ── Constants ─────────────────────────────────────────────────────────────────

const COLUMNS: { status: KanbanStatus; label: string; bg: string; headerBg: string; accent: string }[] = [
  { status: "intake",        label: "Intake",               bg: "#F9FAFB", headerBg: "#F3F4F6", accent: "#6B7280" },
  { status: "on_bench",      label: "On Bench",             bg: "#FFFBEB", headerBg: "#FEF3C7", accent: "#D97706" },
  { status: "quality_check", label: "Quality Check",        bg: "#EFF6FF", headerBg: "#DBEAFE", accent: "#3B82F6" },
  { status: "ready",         label: "Ready for Collection", bg: "#F0FDF4", headerBg: "#DCFCE7", accent: "#16A34A" },
  { status: "collected",     label: "Collected",            bg: "#FAF5FF", headerBg: "#EDE9FE", accent: "#7C3AED" },
];

const JOB_TYPE_LABELS: Record<string, string> = {
  repair:        "Repair",
  custom_order:  "Custom",
  stock_work:    "Stock",
  online_order:  "Online",
};

const JOB_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  repair:        { bg: "#EEF2FF", color: "#4F46E5" },
  custom_order:  { bg: "#FFF7ED", color: "#C2410C" },
  stock_work:    { bg: "#F0FDF4", color: "#15803D" },
  online_order:  { bg: "#EFF6FF", color: "#3B82F6" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string { return new Date().toISOString().split("T")[0]; }

function isOverdue(due: string | null): boolean {
  return !!due && due < today();
}

function isDueToday(due: string | null): boolean {
  return !!due && due === today();
}

function customerName(p: Packet): string {
  if (p.job_type === "stock_work") return "Internal";
  return [p.customer_first_name, p.customer_last_name].filter(Boolean).join(" ") || "No name";
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function JobCard({
  packet,
  onDragStart,
  onClick,
}: {
  packet: Packet;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onClick: (p: Packet) => void;
}) {
  const overdue = isOverdue(packet.due_date);
  const dueToday = isDueToday(packet.due_date);
  const jt = packet.job_type ?? "repair";
  const jtColor = JOB_TYPE_COLORS[jt] ?? JOB_TYPE_COLORS.repair;

  const leftBorder = overdue ? "4px solid #EF4444" : dueToday ? "4px solid #F59E0B" : "4px solid transparent";

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, packet.id)}
      onClick={() => onClick(packet)}
      style={{
        background: "#fff",
        border: "1px solid #E8E8F0",
        borderLeft: leftBorder,
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "grab",
        userSelect: "none",
        transition: "box-shadow .12s",
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.10)")}
      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = "none")}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: "#9CA3AF", letterSpacing: "0.03em" }}>
          {packet.reference_number}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: jtColor.bg, color: jtColor.color, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {JOB_TYPE_LABELS[jt] ?? jt}
        </span>
      </div>

      {/* Customer */}
      <div style={{ fontWeight: 600, color: "#1A1A2E", fontSize: 13, marginBottom: 4 }}>
        {customerName(packet)}
      </div>

      {/* Description */}
      {packet.articles && (
        <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {packet.articles}
        </div>
      )}

      {/* Bottom row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        {/* Due date */}
        {packet.due_date ? (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 6,
            background: overdue ? "#FEE2E2" : dueToday ? "#FEF3C7" : "#F3F4F6",
            color: overdue ? "#DC2626" : dueToday ? "#B45309" : "#6B7280",
          }}>
            {overdue ? "⚠ " : dueToday ? "⏰ " : ""}{formatDateAU(packet.due_date)}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "#D1D5DB" }}>No due date</span>
        )}

        {/* Assigned jeweller initials */}
        {packet.assigned_to_name && (
          <span style={{
            width: 24, height: 24, borderRadius: "50%",
            background: "#635BFF", color: "#fff",
            fontSize: 10, fontWeight: 700,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {initials(packet.assigned_to_name)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Slide-Over Panel ──────────────────────────────────────────────────────────

function SlideOver({
  packet,
  profiles,
  isManager,
  onClose,
  onUpdate,
  onDelete,
}: {
  packet: Packet;
  profiles: Profile[];
  isManager: boolean;
  onClose: () => void;
  onUpdate: (updated: Packet) => void;
  onDelete: (id: string) => void;
}) {
  const { user } = useUser();
  const [local, setLocal] = useState<Packet>(packet);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const tenantId = user?.tenantId ?? "";

  // Update on packet change (e.g. after drag)
  useEffect(() => { setLocal(packet); }, [packet]);

  const headers = { "Content-Type": "application/json", "x-tenant-id": tenantId };

  const patch = useCallback(async (fields: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/workshop/packets/${local.id}`, {
        method: "PATCH", headers, body: JSON.stringify(fields),
      });
      const json = await res.json();
      if (json.packet) {
        const updated = { ...json.packet, assigned_to_name: local.assigned_to_name };
        if (fields.assigned_to !== undefined) {
          updated.assigned_to_name = profiles.find(p => p.id === fields.assigned_to)?.full_name ?? null;
        }
        setLocal(updated);
        onUpdate(updated);
      }
    } catch { /* noop */ } finally {
      setSaving(false);
    }
  }, [local.id, local.assigned_to_name, profiles, headers, onUpdate]);

  const handleStatusChange = (status: KanbanStatus) => patch({ status });

  const handleDelete = async () => {
    if (!confirm("Delete this job permanently?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/workshop/packets/${local.id}`, { method: "DELETE", headers });
      onDelete(local.id);
      onClose();
    } catch { /* noop */ } finally {
      setDeleting(false);
    }
  };

  const STATUS_BTN = (s: KanbanStatus, label: string, accent: string) => {
    const active = local.status === s;
    return (
      <button
        key={s}
        onClick={() => handleStatusChange(s)}
        style={{
          padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
          border: `1px solid ${active ? accent : "#E8E8F0"}`,
          background: active ? accent : "#fff",
          color: active ? "#fff" : "#6B7280",
          cursor: "pointer", transition: "all .12s", whiteSpace: "nowrap" as const,
        }}
      >
        {label}
      </button>
    );
  };

  const FIELD = (label: string, content: React.ReactNode) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
      {content}
    </div>
  );

  const INPUT_STYLE: React.CSSProperties = { width: "100%", border: "1px solid #E8E8F0", borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "#1A1A2E", outline: "none", background: "#fff", fontFamily: "inherit" };
  const TEXTAREA_STYLE: React.CSSProperties = { ...INPUT_STYLE, resize: "vertical" as const };

  const overdue = isOverdue(local.due_date);
  const dueToday = isDueToday(local.due_date);

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100 }}
        onClick={onClose}
      />
      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 101,
        width: "min(520px, 100vw)",
        background: "#fff",
        display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E8F0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#9CA3AF", marginBottom: 2 }}>{local.reference_number}</div>
            <div style={{ fontWeight: 700, color: "#1A1A2E", fontSize: 18 }}>{customerName(local)}</div>
            {local.customer_email && <div style={{ fontSize: 12, color: "#6B7280" }}>{local.customer_email}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9CA3AF", flexShrink: 0 }}>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status stage buttons */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #E8E8F0", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Stage</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STATUS_BTN("intake",        "Intake",               "#6B7280")}
            {STATUS_BTN("on_bench",      "On Bench",             "#D97706")}
            {STATUS_BTN("quality_check", "Quality Check",        "#3B82F6")}
            {STATUS_BTN("ready",         "Ready",                "#16A34A")}
            {STATUS_BTN("collected",     "Collected",            "#7C3AED")}
          </div>
          {saving && <div style={{ fontSize: 11, color: "#635BFF", marginTop: 6 }}>Saving…</div>}
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* Due date highlight */}
          {(overdue || dueToday) && (
            <div style={{ background: overdue ? "#FEE2E2" : "#FEF3C7", border: `1px solid ${overdue ? "#FCA5A5" : "#FDE68A"}`, borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, fontWeight: 600, color: overdue ? "#DC2626" : "#B45309" }}>
              {overdue ? "⚠ Overdue" : "⏰ Due today"}
            </div>
          )}

          {/* Job details */}
          {FIELD("Job Type",
            <select
              value={local.job_type ?? "repair"}
              onChange={e => patch({ job_type: e.target.value })}
              style={INPUT_STYLE}
            >
              <option value="repair">Repair</option>
              <option value="custom_order">Custom Order</option>
              <option value="online_order">Online Order</option>
              <option value="stock_work">Stock Work</option>
            </select>
          )}

          {FIELD("Assigned To",
            <select
              value={local.assigned_to ?? ""}
              onChange={e => patch({ assigned_to: e.target.value || null })}
              style={INPUT_STYLE}
            >
              <option value="">— Unassigned —</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
              ))}
            </select>
          )}

          {FIELD("Due Date",
            <input
              type="date"
              value={local.due_date ?? ""}
              onChange={e => patch({ due_date: e.target.value || null })}
              style={INPUT_STYLE}
            />
          )}

          {FIELD("Description of Work",
            <textarea
              rows={3}
              defaultValue={local.articles ?? ""}
              onBlur={e => { if (e.target.value !== (local.articles ?? "")) patch({ articles: e.target.value || null }); }}
              style={TEXTAREA_STYLE}
              placeholder="Describe the job…"
            />
          )}

          {FIELD("Instructions",
            <textarea
              rows={2}
              defaultValue={local.instructions ?? ""}
              onBlur={e => { if (e.target.value !== (local.instructions ?? "")) patch({ instructions: e.target.value || null }); }}
              style={TEXTAREA_STYLE}
              placeholder="Additional instructions…"
            />
          )}

          {FIELD("Internal Notes",
            <textarea
              rows={2}
              defaultValue={local.internal_notes ?? ""}
              onBlur={e => { if (e.target.value !== (local.internal_notes ?? "")) patch({ internal_notes: e.target.value || null }); }}
              style={TEXTAREA_STYLE}
              placeholder="Staff-only notes…"
            />
          )}

          {/* Pricing */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Quoted Price</div>
              <input
                type="number"
                step="0.01"
                defaultValue={local.total_charges ?? ""}
                onBlur={e => { const v = e.target.value ? Number(e.target.value) : null; if (v !== local.total_charges) patch({ total_charges: v }); }}
                style={INPUT_STYLE}
                placeholder="0.00"
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Deposit Taken</div>
              <input
                type="number"
                step="0.01"
                defaultValue={local.deposit ?? ""}
                onBlur={e => { const v = e.target.value ? Number(e.target.value) : null; if (v !== local.deposit) patch({ deposit: v }); }}
                style={INPUT_STYLE}
                placeholder="0.00"
              />
            </div>
          </div>

          {local.balance !== null && local.total_charges !== null && (
            <div style={{ background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: "#1A1A2E", marginBottom: 12 }}>
              Balance owing: {formatCurrency(local.balance ?? 0)}
            </div>
          )}

          {/* Customer info */}
          {local.job_type !== "stock_work" && (
            <div style={{ borderTop: "1px solid #E8E8F0", paddingTop: 16, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Customer Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13, color: "#374151" }}>
                <div><span style={{ color: "#9CA3AF" }}>Phone: </span>{local.customer_phone || "—"}</div>
                <div><span style={{ color: "#9CA3AF" }}>Email: </span>{local.customer_email || "—"}</div>
                {(local.customer_street || local.customer_suburb) && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={{ color: "#9CA3AF" }}>Address: </span>
                    {[local.customer_street, local.customer_suburb, local.customer_state, local.customer_postcode].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dates */}
          <div style={{ borderTop: "1px solid #E8E8F0", paddingTop: 16, marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13, color: "#374151" }}>
            <div><span style={{ color: "#9CA3AF" }}>In Date: </span>{local.in_date ? formatDateAU(local.in_date) : "—"}</div>
            <div><span style={{ color: "#9CA3AF" }}>Staff: </span>{local.staff_member || "—"}</div>
            {local.collected_at && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: "#9CA3AF" }}>Collected: </span>{new Date(local.collected_at).toLocaleDateString("en-AU")}</div>}
          </div>

          {/* Certificate toggle */}
          <div style={{ borderTop: "1px solid #E8E8F0", paddingTop: 16, marginTop: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!local.valuation_required}
                onChange={e => patch({ valuation_required: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: "#635BFF" }}
              />
              <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>Certificate Required</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        {isManager && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #E8E8F0", flexShrink: 0 }}>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ background: "#FEE2E2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: deleting ? 0.5 : 1 }}
            >
              {deleting ? "Deleting…" : "Delete Job"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── New Job Modal ─────────────────────────────────────────────────────────────

function NewJobModal({
  profiles,
  onClose,
  onCreate,
  tenantId,
}: {
  profiles: Profile[];
  onClose: () => void;
  onCreate: (packet: Packet) => void;
  tenantId: string;
}) {
  const [jobType, setJobType] = useState<JobType>("repair");
  const [form, setForm] = useState({
    customer_first_name: "",
    customer_last_name: "",
    customer_email: "",
    customer_phone: "",
    articles: "",
    due_date: "",
    total_charges: "",
    deposit: "",
    assigned_to: "",
    internal_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.articles.trim()) { setError("Description of work is required."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/workshop/packets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ ...form, job_type: jobType }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      if (json.packet) {
        const assignedName = profiles.find(p => p.id === form.assigned_to)?.full_name ?? null;
        onCreate({ ...json.packet, assigned_to_name: assignedName });
        onClose();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const INPUT: React.CSSProperties = { width: "100%", border: "1px solid #E8E8F0", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#1A1A2E", outline: "none", background: "#fff", fontFamily: "inherit" };
  const LABEL: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 };

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200 }} onClick={onClose} />
      <div style={{
        position: "fixed", zIndex: 201,
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        background: "#fff", borderRadius: 16,
        width: "min(560px, calc(100vw - 32px))",
        maxHeight: "calc(100vh - 48px)",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }}>
        {/* Modal header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #E8E8F0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A1A2E" }}>New Workshop Job</h2>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}>
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Job type selector */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {(["repair", "custom_order", "online_order", "stock_work"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setJobType(t)}
                style={{
                  flex: 1, padding: "8px 6px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: jobType === t ? "2px solid #635BFF" : "1px solid #E8E8F0",
                  background: jobType === t ? "#EEF2FF" : "#fff",
                  color: jobType === t ? "#635BFF" : "#6B7280",
                  cursor: "pointer",
                }}
              >
                {JOB_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {/* Customer section — not for stock_work */}
          {jobType !== "stock_work" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#635BFF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Customer</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={LABEL}>First Name</label>
                  <input type="text" value={form.customer_first_name} onChange={e => set("customer_first_name", e.target.value)} style={INPUT} placeholder="Jane" />
                </div>
                <div>
                  <label style={LABEL}>Last Name</label>
                  <input type="text" value={form.customer_last_name} onChange={e => set("customer_last_name", e.target.value)} style={INPUT} placeholder="Smith" />
                </div>
                <div>
                  <label style={LABEL}>Phone</label>
                  <input type="tel" value={form.customer_phone} onChange={e => set("customer_phone", e.target.value)} style={INPUT} placeholder="04xx xxx xxx" />
                </div>
                <div>
                  <label style={LABEL}>Email</label>
                  <input type="email" value={form.customer_email} onChange={e => set("customer_email", e.target.value)} style={INPUT} placeholder="jane@example.com" />
                </div>
              </div>
            </div>
          )}

          {/* Job details */}
          <div style={{ fontSize: 12, fontWeight: 700, color: "#635BFF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Job Details</div>

          <div style={{ marginBottom: 10 }}>
            <label style={LABEL}>Description of Work *</label>
            <textarea
              value={form.articles}
              onChange={e => set("articles", e.target.value)}
              rows={3}
              style={{ ...INPUT, resize: "vertical" as const }}
              placeholder={jobType === "stock_work" ? "What needs to be done?" : "Describe what the customer needs…"}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={LABEL}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Assigned To</label>
              <select value={form.assigned_to} onChange={e => set("assigned_to", e.target.value)} style={INPUT}>
                <option value="">— Unassigned —</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name ?? p.id}</option>
                ))}
              </select>
            </div>
          </div>

          {jobType !== "stock_work" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={LABEL}>Quoted Price ($)</label>
                <input type="number" step="0.01" value={form.total_charges} onChange={e => set("total_charges", e.target.value)} style={INPUT} placeholder="0.00" />
              </div>
              <div>
                <label style={LABEL}>Deposit Taken ($)</label>
                <input type="number" step="0.01" value={form.deposit} onChange={e => set("deposit", e.target.value)} style={INPUT} placeholder="0.00" />
              </div>
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <label style={LABEL}>Internal Notes</label>
            <input type="text" value={form.internal_notes} onChange={e => set("internal_notes", e.target.value)} style={INPUT} placeholder="Staff-only notes…" />
          </div>

          {error && (
            <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#DC2626", marginBottom: 10 }}>
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div style={{ padding: "12px 24px 20px", borderTop: "1px solid #E8E8F0", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #E8E8F0", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
          <button
            type="submit"
            form="new-job-form"
            onClick={handleSubmit as unknown as React.MouseEventHandler<HTMLButtonElement>}
            disabled={saving}
            style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#635BFF", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Creating…" : `Create ${JOB_TYPE_LABELS[jobType]} Job`}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WorkshopPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "workshop")) router.replace("/");
  }, [user, hydrated, router]);

  const tenantId = user?.tenantId ?? "";
  const isManager = canManage(user?.role ?? null);

  // ── State ──────────────────────────────────────────────────────────────────
  const [packets, setPackets]       = useState<Packet[]>([]);
  const [profiles, setProfiles]     = useState<Profile[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);
  const [showNewJob, setShowNewJob]  = useState(false);
  const [jobTypeFilter, setJobTypeFilter] = useState<JobTypeFilter>("all");
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("all");
  const [collectedOpen, setCollectedOpen] = useState(false);
  const [showCollected, setShowCollected] = useState(false);
  const [includeCollected, setIncludeCollected] = useState(false);
  const dragId = useRef<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchPackets = useCallback(async (withCollected = includeCollected) => {
    if (!tenantId) return;
    try {
      const url = `/api/workshop/packets${withCollected ? "?include_collected=1" : ""}`;
      const res = await fetch(url, { cache: "no-store", headers: { "x-tenant-id": tenantId } });
      const json = await res.json();
      setPackets(json.packets ?? []);
    } catch {
      setPackets([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, includeCollected]);

  useEffect(() => { fetchPackets(); }, [fetchPackets]);

  useEffect(() => {
    if (!tenantId) return;
    fetch("/api/profiles", { headers: { "x-tenant-id": tenantId } })
      .then(r => r.json())
      .then(j => setProfiles(j.profiles ?? []))
      .catch(() => {});
  }, [tenantId]);

  // ── Filter logic ───────────────────────────────────────────────────────────
  const filteredPackets = packets.filter(p => {
    if (jobTypeFilter !== "all" && p.job_type !== jobTypeFilter) return false;
    if (statusFilter === "overdue"   && !isOverdue(p.due_date))  return false;
    if (statusFilter === "due_today" && !isDueToday(p.due_date)) return false;
    if (statusFilter === "ready"     && p.status !== "ready")     return false;
    return true;
  });

  const byStatus = (status: KanbanStatus) =>
    filteredPackets.filter(p => p.status === status || (!p.status && status === "intake"));

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragId.current = id;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = async (e: React.DragEvent, toStatus: KanbanStatus) => {
    e.preventDefault();
    const id = dragId.current;
    if (!id) return;
    dragId.current = null;

    const packet = packets.find(p => p.id === id);
    if (!packet || packet.status === toStatus) return;

    // Optimistic update
    setPackets(prev => prev.map(p => p.id === id
      ? { ...p, status: toStatus, status_updated_at: new Date().toISOString() }
      : p
    ));
    if (selectedPacket?.id === id) setSelectedPacket(prev => prev ? { ...prev, status: toStatus } : null);

    try {
      await fetch(`/api/workshop/packets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ status: toStatus }),
      });
    } catch {
      fetchPackets();
    }
  };

  const handleUpdate = (updated: Packet) => {
    setPackets(prev => prev.map(p => p.id === updated.id ? updated : p));
    if (selectedPacket?.id === updated.id) setSelectedPacket(updated);
  };

  const handleDelete = (id: string) => {
    setPackets(prev => prev.filter(p => p.id !== id));
  };

  const handleCreate = (packet: Packet) => {
    setPackets(prev => [packet, ...prev]);
  };

  const toggleCollected = () => {
    const next = !includeCollected;
    setIncludeCollected(next);
    setCollectedOpen(next);
    fetchPackets(next);
  };

  // ── Counts ─────────────────────────────────────────────────────────────────
  const overdueCount = packets.filter(p => isOverdue(p.due_date) && p.status !== "collected").length;
  const readyCount   = packets.filter(p => p.status === "ready").length;

  // ── Render ─────────────────────────────────────────────────────────────────
  const CARD_STYLE: React.CSSProperties = { background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", gap: 16 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Workshop</h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "2px 0 0" }}>Everything on the bench</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {overdueCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, background: "#FEE2E2", color: "#DC2626", padding: "4px 10px", borderRadius: 999 }}>
              {overdueCount} overdue
            </span>
          )}
          {readyCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, background: "#DCFCE7", color: "#16A34A", padding: "4px 10px", borderRadius: 999 }}>
              {readyCount} ready for collection
            </span>
          )}
          <button
            onClick={() => setShowNewJob(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "#635BFF", color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Job
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ ...CARD_STYLE, padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", flexShrink: 0 }}>
        {/* Job type tabs */}
        <div style={{ display: "flex", gap: 4, background: "#F3F4F6", borderRadius: 8, padding: 3 }}>
          {([
            ["all", "All"],
            ["repair", "Repairs"],
            ["custom_order", "Custom Orders"],
            ["online_order", "Online Orders"],
            ["stock_work", "Stock Work"],
          ] as [JobTypeFilter, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setJobTypeFilter(v)}
              style={{
                padding: "5px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, border: "none",
                background: jobTypeFilter === v ? "#fff" : "transparent",
                color: jobTypeFilter === v ? "#1A1A2E" : "#6B7280",
                boxShadow: jobTypeFilter === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: "#E8E8F0" }} />

        {/* Status pills */}
        <div style={{ display: "flex", gap: 6 }}>
          {([
            ["all", "All", "#6B7280", "#F3F4F6"],
            ["overdue", "Overdue", "#DC2626", "#FEE2E2"],
            ["due_today", "Due Today", "#B45309", "#FEF3C7"],
            ["ready", "Ready", "#16A34A", "#DCFCE7"],
          ] as [StatusFilter, string, string, string][]).map(([v, label, color, bg]) => (
            <button
              key={v}
              onClick={() => setStatusFilter(v)}
              style={{
                padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: "none",
                background: statusFilter === v ? bg : "transparent",
                color: statusFilter === v ? color : "#6B7280",
                cursor: "pointer",
                outline: statusFilter === v ? `1px solid ${color}33` : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Kanban board ── */}
      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9CA3AF", fontSize: 14 }}>
          Loading jobs…
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", gap: 12, overflowX: "auto", overflowY: "hidden", paddingBottom: 4 }}>
          {COLUMNS.map(col => {
            const cards = byStatus(col.status);
            const isCollected = col.status === "collected";

            if (isCollected) {
              return (
                <div key={col.status} style={{ flexShrink: 0, width: collectedOpen ? 280 : 140, transition: "width .2s", display: "flex", flexDirection: "column" }}>
                  <button
                    onClick={toggleCollected}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between",
                      background: col.headerBg, border: "1px solid #E8E8F0", borderRadius: 10,
                      padding: "10px 14px", cursor: "pointer", width: "100%", marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, color: col.accent }}>
                      {collectedOpen ? "▾" : "▸"} Collected
                    </span>
                    {collectedOpen && <span style={{ fontSize: 12, color: col.accent, fontWeight: 600 }}>{cards.length}</span>}
                  </button>

                  {collectedOpen && (
                    <div
                      style={{ flex: 1, overflowY: "auto", background: col.bg, borderRadius: 10, border: "1px solid #E8E8F0", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => handleDrop(e, col.status)}
                    >
                      {cards.length === 0 && (
                        <div style={{ padding: "24px 8px", textAlign: "center", color: "#D1D5DB", fontSize: 12 }}>No collected jobs</div>
                      )}
                      {cards.map(p => (
                        <JobCard key={p.id} packet={p} onDragStart={handleDragStart} onClick={() => setSelectedPacket(p)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div key={col.status} style={{ flexShrink: 0, width: 280, display: "flex", flexDirection: "column" }}>
                {/* Column header */}
                <div style={{ background: col.headerBg, borderRadius: "10px 10px 0 0", border: "1px solid #E8E8F0", borderBottom: "none", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: col.accent }}>{col.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,0.6)", color: col.accent, borderRadius: 999, padding: "1px 7px" }}>{cards.length}</span>
                </div>

                {/* Drop zone */}
                <div
                  style={{ flex: 1, overflowY: "auto", background: col.bg, border: "1px solid #E8E8F0", borderTop: "none", borderRadius: "0 0 10px 10px", padding: 8, display: "flex", flexDirection: "column", gap: 8, minHeight: 200 }}
                  onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.outline = `2px dashed ${col.accent}`; }}
                  onDragLeave={e => { (e.currentTarget as HTMLDivElement).style.outline = "none"; }}
                  onDrop={e => { (e.currentTarget as HTMLDivElement).style.outline = "none"; handleDrop(e, col.status); }}
                >
                  {cards.length === 0 && (
                    <div style={{ padding: "24px 8px", textAlign: "center", color: "#D1D5DB", fontSize: 12 }}>Drop cards here</div>
                  )}
                  {cards.map(p => (
                    <JobCard key={p.id} packet={p} onDragStart={handleDragStart} onClick={() => setSelectedPacket(p)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Slide-over panel ── */}
      {selectedPacket && (
        <SlideOver
          packet={selectedPacket}
          profiles={profiles}
          isManager={isManager}
          onClose={() => setSelectedPacket(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}

      {/* ── New Job modal ── */}
      {showNewJob && (
        <NewJobModal
          profiles={profiles}
          tenantId={tenantId}
          onClose={() => setShowNewJob(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
