"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CadVersionStatus } from "@/lib/cadStage";
import { cadRenderError, cadSourceError } from "@/lib/cadStage";

export interface CadVersionRow {
  id: string;
  version_number: number;
  status: CadVersionStatus;
  note: string | null;
  decision_note: string | null;
  render_filename: string | null;
  source_filename: string | null;
  render_storage_path: string | null;
  source_storage_path: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
  drives_casting: boolean;
}

const STATUS_LABEL: Record<CadVersionStatus, string> = {
  pending: "Waiting for approval",
  approved: "Approved",
  changes_requested: "Changes requested",
  rejected: "Rejected",
};

const STATUS_COLOR: Record<CadVersionStatus, { bg: string; color: string }> = {
  pending: { bg: "#FEF3C7", color: "#B45309" },
  approved: { bg: "#ECFDF5", color: "#047857" },
  changes_requested: { bg: "#EFF6FF", color: "#1D4ED8" },
  rejected: { bg: "#FEF2F2", color: "#B91C1C" },
};

export default function CadApprovalPanel({
  packetId,
  isManager,
  onPacket,
  designerName,
  assignControl,
  onVersions,
}: {
  packetId: string;
  isManager: boolean;
  onPacket: (packet: Record<string, unknown>) => void;
  designerName?: string | null;
  assignControl?: ReactNode;
  onVersions?: (versions: CadVersionRow[]) => void;
}) {
  const [versions, setVersions] = useState<CadVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [renderFile, setRenderFile] = useState<File | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workshop/packets/${packetId}/cad`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load CAD versions");
        setVersions([]);
        return;
      }
      const next = (json.versions ?? []) as CadVersionRow[];
      setVersions(next);
      onVersions?.(next);
    } catch {
      setError("Could not load CAD versions");
    } finally {
      setLoading(false);
    }
  }, [packetId, onVersions]);

  useEffect(() => { load(); }, [load]);

  async function openFile(path: string | null) {
    if (!path) return;
    const res = await fetch(`/api/attachments/signed-url?path=${encodeURIComponent(path)}`);
    const json = await res.json();
    if (!res.ok || !json.signedUrl) {
      setError(json.error ?? "Could not open the file");
      return;
    }
    window.open(json.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!renderFile || !sourceFile) {
      setError("Choose both a render and a source file.");
      return;
    }
    const renderErr = cadRenderError(renderFile);
    if (renderErr) { setError(renderErr); return; }
    const sourceErr = cadSourceError(sourceFile);
    if (sourceErr) { setError(sourceErr); return; }

    const body = new FormData();
    body.set("render", renderFile);
    body.set("source", sourceFile);
    if (note.trim()) body.set("note", note.trim());
    setUploading(true);
    try {
      const res = await fetch(`/api/workshop/packets/${packetId}/cad`, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Upload failed"); return; }
      if (json.packet) onPacket(json.packet);
      setRenderFile(null);
      setSourceFile(null);
      setNote("");
      formRef.current?.reset();
      await load();
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function decide(versionId: string, action: "approve" | "request_changes" | "reject") {
    setError(null);
    if (action !== "approve" && !decisionNote.trim()) {
      setError(action === "reject" ? "Add a reject reason first." : "Add a note describing the changes.");
      return;
    }
    setBusyId(versionId);
    try {
      const res = await fetch(`/api/workshop/packets/${packetId}/cad/${versionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: decisionNote.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Could not save the decision"); return; }
      setDecisionNote("");
      if (json.packet) onPacket(json.packet);
      await load();
    } catch {
      setError("Could not save the decision");
    } finally {
      setBusyId(null);
    }
  }

  const input: React.CSSProperties = {
    width: "100%", border: "1px solid #E8E8F0", borderRadius: 8, padding: "7px 10px",
    fontSize: 13, color: "#1A1A2E", background: "#fff", fontFamily: "inherit", boxSizing: "border-box",
  };

  const latest = versions.reduce<CadVersionRow | null>((best, row) => (
    !best || row.version_number > best.version_number ? row : best
  ), null);
  const fileStatus = latest ? `Files uploaded — Version ${latest.version_number}` : "No file uploaded yet";
  const approverName = latest?.status === "pending" || !latest?.decided_by_name ? "a manager" : latest.decided_by_name;
  const approvalStatus = !latest
    ? "No version to approve yet"
    : latest.status === "pending"
      ? "Waiting for approval"
      : latest.status === "changes_requested"
        ? "Changes requested"
        : latest.status === "rejected"
          ? "Rejected"
          : "Approved";
  const decisionWhen = latest?.decided_at
    ? new Date(latest.decided_at).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div>
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <section style={{ border: "1px solid #E8E8F0", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>CAD Design</div>
            {assignControl ?? (
              <div style={{ fontSize: 14, fontWeight: 700, color: designerName ? "#1A1A2E" : "#9CA3AF" }}>{designerName ?? "No CAD designer"}</div>
            )}
            <div style={{ fontSize: 13, color: "#374151", marginTop: 8 }}>{fileStatus}</div>
          </section>
          <section style={{ border: "1px solid #E8E8F0", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>CAD Approval</div>
            <div style={{ fontSize: 13, color: "#374151" }}>Approver: {approverName}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A2E", marginTop: 4 }}>{approvalStatus}</div>
            {latest?.status === "changes_requested" && latest.decision_note && (
              <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>{latest.decision_note}</div>
            )}
            {latest?.status === "rejected" && latest.decision_note && (
              <div style={{ fontSize: 13, color: "#374151", marginTop: 6 }}>{latest.decision_note}</div>
            )}
            {latest && latest.status !== "pending" && decisionWhen && (
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>Decided {decisionWhen}</div>
            )}
          </section>
        </div>
      )}

      <div style={{ fontSize: 13, color: "#4B5563", marginBottom: 12, lineHeight: 1.45 }}>
        Upload a render and the source file on CAD Design. That moves the job to CAD Approval.
        A manager approves that version to move the job to Casting. Only the approved version is used for the casting order.
        Request Changes sends the job back to CAD Design with a note. Reject stays on CAD Approval.
      </div>

      {error && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: "#DC2626" }}>
          {error}
        </div>
      )}

      <form ref={formRef} onSubmit={upload} style={{ border: "1px solid #E8E8F0", borderRadius: 10, padding: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginBottom: 8 }}>New version</div>
        <label style={{ display: "block", fontSize: 12, color: "#374151", marginBottom: 8 }}>
          Render (JPG, PNG, WebP, or PDF)
          <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setRenderFile(e.target.files?.[0] ?? null)} style={{ display: "block", marginTop: 4, fontSize: 12 }} />
        </label>
        <label style={{ display: "block", fontSize: 12, color: "#374151", marginBottom: 8 }}>
          Source file (STL, 3DM, STEP, IGES, OBJ, DXF, ZIP, PDF)
          <input type="file" accept=".stl,.3dm,.step,.stp,.igs,.iges,.obj,.zip,.dxf,.dwg,.pdf" onChange={(e) => setSourceFile(e.target.files?.[0] ?? null)} style={{ display: "block", marginTop: 4, fontSize: 12 }} />
        </label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Note for the approver (optional)" style={{ ...input, resize: "vertical", marginBottom: 8 }} />
        <button type="submit" disabled={uploading} style={{ background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: uploading ? 0.6 : 1 }}>
          {uploading ? "Uploading…" : "Upload version"}
        </button>
      </form>

      {isManager && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Approval note</div>
          <textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={2} placeholder="Required for Request Changes and Reject" style={{ ...input, resize: "vertical" }} />
        </div>
      )}

      {loading && <div style={{ fontSize: 13, color: "#9CA3AF" }}>Loading versions…</div>}
      {!loading && versions.length === 0 && <div style={{ fontSize: 13, color: "#9CA3AF" }}>No CAD versions yet.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {versions.map((version) => {
          const tone = STATUS_COLOR[version.status];
          return (
            <div key={version.id} style={{ border: "1px solid #E8E8F0", borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E" }}>Version {version.version_number}</div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: tone.bg, color: tone.color }}>
                  {STATUS_LABEL[version.status]}
                </span>
              </div>
              {version.drives_casting && (
                <div style={{ fontSize: 12, fontWeight: 700, color: "#047857", marginBottom: 6 }}>This approved version drives the casting order.</div>
              )}
              <div style={{ fontSize: 12, color: "#4B5563", marginBottom: 6 }}>
                {version.render_filename && (
                  <button type="button" onClick={() => openFile(version.render_storage_path)} style={{ background: "none", border: "none", padding: 0, color: "#635BFF", fontWeight: 600, cursor: "pointer", marginRight: 12 }}>
                    Render: {version.render_filename}
                  </button>
                )}
                {version.source_filename && (
                  <button type="button" onClick={() => openFile(version.source_storage_path)} style={{ background: "none", border: "none", padding: 0, color: "#635BFF", fontWeight: 600, cursor: "pointer" }}>
                    Source: {version.source_filename}
                  </button>
                )}
              </div>
              {version.note && <div style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>Designer note: {version.note}</div>}
              {version.decision_note && <div style={{ fontSize: 12, color: "#374151", marginBottom: 4 }}>Decision: {version.decision_note}</div>}
              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: version.status === "pending" && isManager ? 8 : 0 }}>
                {new Date(version.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
              {version.status === "pending" && isManager && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" disabled={busyId === version.id} onClick={() => decide(version.id, "approve")} style={{ background: "#047857", color: "#fff", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Approve → Casting
                  </button>
                  <button type="button" disabled={busyId === version.id} onClick={() => decide(version.id, "request_changes")} style={{ background: "#fff", color: "#1D4ED8", border: "1px solid #BFDBFE", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Request Changes
                  </button>
                  <button type="button" disabled={busyId === version.id} onClick={() => decide(version.id, "reject")} style={{ background: "#fff", color: "#B91C1C", border: "1px solid #FECACA", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
