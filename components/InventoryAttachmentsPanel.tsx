"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { Attachment, AttachmentType } from "@/lib/types";
import { Upload, X, Download, FileText, FileImage, File, Tag } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export type InventoryEntityType = "inventory_piece" | "inventory_product" | "purchase_order";

const ATTACHMENT_TYPE_LABELS: Record<AttachmentType, string> = {
  photo:             "Photo",
  certificate:       "Certificate",
  invoice:           "Invoice",
  valuation:         "Valuation",
  cad_file:          "CAD File",
  workshop_document: "Workshop Doc",
  other:             "Other",
};

const ATTACHMENT_TYPE_COLOURS: Record<AttachmentType, { bg: string; fg: string }> = {
  photo:             { bg: "#EEF2FF", fg: "#4338CA" },
  certificate:       { bg: "#ECFDF5", fg: "#065F46" },
  invoice:           { bg: "#FEF3C7", fg: "#92400E" },
  valuation:         { bg: "#FFF1F2", fg: "#9F1239" },
  cad_file:          { bg: "#F3F4F6", fg: "#374151" },
  workshop_document: { bg: "#FDF2F8", fg: "#9D174D" },
  other:             { bg: "#F9FAFB", fg: "#6B7280" },
};

// Accepted file types for this component
const ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif,.gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.zip";
const MAX_MB = 10;

// ── Sub-components ────────────────────────────────────────────────────────────

function AttachmentIcon({ fileType, signedUrl, fileName }: { fileType: string; signedUrl?: string | null; fileName: string }) {
  if (fileType === "image" && signedUrl) {
    return (
      <img
        src={signedUrl}
        alt={fileName}
        style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "1px solid #E5E7EB" }}
      />
    );
  }
  const isPdf = fileName.toLowerCase().endsWith(".pdf");
  const isImg = fileType === "image";
  const bg = isPdf ? "#FEE2E2" : isImg ? "#EEF2FF" : "#F3F4F6";
  const fg = isPdf ? "#EF4444" : isImg ? "#635BFF" : "#6B7280";
  const Icon = isPdf || isImg ? FileImage : FileText;
  return (
    <div style={{ width: 44, height: 44, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon size={20} color={fg} />
    </div>
  );
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Upload modal ──────────────────────────────────────────────────────────────

interface UploadModalProps {
  entityType: InventoryEntityType;
  entityId: string;
  tenantId: string;
  onClose: () => void;
  onUploaded: () => void;
}

function UploadModal({ entityType, entityId, tenantId, onClose, onUploaded }: UploadModalProps) {
  const [files, setFiles]               = useState<File[]>([]);
  const [attachmentType, setType]       = useState<AttachmentType>("photo");
  const [displayName, setDisplayName]   = useState("");
  const [notes, setNotes]               = useState("");
  const [uploading, setUploading]       = useState(false);
  const [progress, setProgress]         = useState(0);
  const [error, setError]               = useState("");
  const [dragOver, setDragOver]         = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFiles(fl: FileList | File[]) {
    const arr = Array.from(fl);
    const tooBig = arr.find(f => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) { setError(`"${tooBig.name}" exceeds ${MAX_MB} MB`); return; }
    setError("");
    setFiles(arr);
    if (arr.length === 1 && !displayName) setDisplayName(arr[0].name.replace(/\.[^.]+$/, ""));
  }

  async function handleUpload() {
    if (!files.length) { setError("Select at least one file."); return; }
    setUploading(true); setError(""); setProgress(0);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fd = new FormData();
      fd.append("file", file);
      fd.append("record_type", entityType);
      fd.append("record_id", entityId);
      fd.append("attachment_type", attachmentType);
      if (displayName && files.length === 1) fd.append("display_name", displayName);
      if (notes) fd.append("notes", notes);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const fileBase = (i / files.length) * 100;
            const fileShare = (e.loaded / e.total) * (100 / files.length);
            setProgress(Math.round(fileBase + fileShare));
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
          try { reject(new Error(JSON.parse(xhr.responseText).error ?? `Upload failed (${xhr.status})`)); }
          catch { reject(new Error(`Upload failed (${xhr.status})`)); }
        });
        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.open("POST", "/api/attachments");
        xhr.setRequestHeader("x-tenant-id", tenantId);
        xhr.send(fd);
      }).catch(err => { setError(err instanceof Error ? err.message : "Upload failed"); });
    }

    setUploading(false);
    onUploaded();
    onClose();
  }

  const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13, background: "#fff", boxSizing: "border-box" as const };
  const labelStyle = { fontSize: 12, fontWeight: 500 as const, color: "#6B7280", display: "block" as const, marginBottom: 4 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827" }}>Upload File</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B7280" }}><X size={18} /></button>
        </div>

        {error && <div style={{ padding: "10px 12px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{error}</div>}

        {/* Drop zone */}
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) pickFiles(e.dataTransfer.files); }}
          style={{ border: `2px dashed ${dragOver ? "#635BFF" : files.length ? "#10B981" : "#D1D5DB"}`, borderRadius: 10, padding: "16px 12px", textAlign: "center", cursor: uploading ? "wait" : "pointer", background: dragOver ? "#EEF2FF" : files.length ? "#F0FDF4" : "#FAFAFA", transition: "all .15s", marginBottom: 16 }}
        >
          <input ref={inputRef} type="file" accept={ACCEPT} multiple onChange={e => { if (e.target.files?.length) pickFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
          {uploading ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#635BFF", marginBottom: 6 }}>Uploading… {progress}%</div>
              <div style={{ height: 4, background: "#E5E7EB", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: "#635BFF", borderRadius: 999, transition: "width .1s" }} />
              </div>
            </div>
          ) : files.length ? (
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#065F46" }}>
                {files.length === 1 ? files[0].name : `${files.length} files selected`}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 11, color: "#9CA3AF" }}>Click to change</p>
            </div>
          ) : (
            <>
              <Upload size={18} color="#9CA3AF" style={{ margin: "0 auto 6px", display: "block" }} />
              <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
                <span style={{ fontWeight: 600, color: "#635BFF" }}>Click to upload</span> or drag & drop
              </p>
              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>JPG, PNG, WebP, HEIC, PDF, Word, Excel, CSV, ZIP · max {MAX_MB} MB</p>
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Attachment type */}
          <div>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={attachmentType} onChange={e => setType(e.target.value as AttachmentType)}>
              {(Object.keys(ATTACHMENT_TYPE_LABELS) as AttachmentType[]).map(t => (
                <option key={t} value={t}>{ATTACHMENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* Display name (only useful for single file) */}
          {files.length <= 1 && (
            <div>
              <label style={labelStyle}>Name <span style={{ fontWeight: 400, color: "#9CA3AF" }}>(optional)</span></label>
              <input style={inputStyle} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Descriptive name for this file" />
            </div>
          )}

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes <span style={{ fontWeight: 400, color: "#9CA3AF" }}>(optional)</span></label>
            <input style={inputStyle} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. GIA certificate number, lab report…" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleUpload} disabled={uploading || !files.length}
            style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: "#635BFF", color: "#fff", fontSize: 13, fontWeight: 600, cursor: uploading || !files.length ? "not-allowed" : "pointer", opacity: uploading || !files.length ? 0.7 : 1 }}>
            {uploading ? `Uploading…` : `Upload ${files.length > 1 ? `${files.length} files` : "file"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  entityType: InventoryEntityType;
  entityId: string;
  /** If true, hides upload/delete buttons (e.g. for staff-only view) */
  readOnly?: boolean;
}

export default function InventoryAttachmentsPanel({ entityType, entityId, readOnly = false }: Props) {
  const { user } = useUser();
  const tenantId = user?.tenantId ?? "";

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showUpload, setShowUpload]   = useState(false);
  const [typeFilter, setTypeFilter]   = useState<AttachmentType | "">("");

  const fetchAttachments = useCallback(async () => {
    if (!entityId || !tenantId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ record_type: entityType, record_id: entityId });
      if (typeFilter) params.set("attachment_type", typeFilter);
      const res = await fetch(`/api/attachments?${params}`, { headers: { "x-tenant-id": tenantId } });
      const json = await res.json();
      setAttachments(json.attachments ?? []);
    } catch {
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, tenantId, typeFilter]);

  useEffect(() => { fetchAttachments(); }, [fetchAttachments]);

  async function handleDelete(id: string) {
    if (!confirm("Remove this attachment? It won't be permanently deleted yet.")) return;
    await fetch(`/api/attachments/${id}`, { method: "DELETE", headers: { "x-tenant-id": tenantId } });
    setAttachments(prev => prev.filter(a => a.id !== id));
  }

  // Count by type for filter chips
  const allForRecord = attachments; // filtered list — we use it for count display

  const typeChips = Object.entries(ATTACHMENT_TYPE_LABELS) as [AttachmentType, string][];

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Files & Attachments
        </h3>
        {!readOnly && (
          <button
            onClick={() => setShowUpload(true)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "#EEF2FF", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#4338CA", fontWeight: 500 }}
          >
            <Upload size={12} /> Upload
          </button>
        )}
      </div>

      {/* Type filter chips */}
      {attachments.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            onClick={() => setTypeFilter("")}
            style={{ padding: "3px 9px", borderRadius: 999, border: "1px solid " + (typeFilter === "" ? "#635BFF" : "#E5E7EB"), background: typeFilter === "" ? "#EEF2FF" : "#fff", fontSize: 11, color: typeFilter === "" ? "#4338CA" : "#6B7280", cursor: "pointer", fontWeight: typeFilter === "" ? 600 : 400 }}
          >
            All
          </button>
          {typeChips.map(([t, label]) => {
            const colours = ATTACHMENT_TYPE_COLOURS[t];
            const active = typeFilter === t;
            return (
              <button key={t}
                onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
                style={{ padding: "3px 9px", borderRadius: 999, border: `1px solid ${active ? colours.fg : "#E5E7EB"}`, background: active ? colours.bg : "#fff", fontSize: 11, color: active ? colours.fg : "#6B7280", cursor: "pointer", fontWeight: active ? 600 : 400 }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      {loading ? (
        <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Loading…</p>
      ) : attachments.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <File size={24} color="#D1D5DB" style={{ margin: "0 auto 8px", display: "block" }} />
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>
            {typeFilter ? `No ${ATTACHMENT_TYPE_LABELS[typeFilter]} files` : "No files attached yet"}
          </p>
          {!readOnly && !typeFilter && (
            <button
              onClick={() => setShowUpload(true)}
              style={{ marginTop: 10, fontSize: 12, color: "#635BFF", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              Upload the first file
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {attachments.map(att => {
            const attType = (att.attachment_type ?? "other") as AttachmentType;
            const colours = ATTACHMENT_TYPE_COLOURS[attType];
            const label = att.display_name || att.file_name;
            return (
              <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10 }}>
                <AttachmentIcon fileType={att.file_type} signedUrl={att.signed_url} fileName={att.file_name} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {label}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                    <span style={{ ...colours, padding: "1px 7px", borderRadius: 999, fontSize: 10, fontWeight: 500 }}>
                      {ATTACHMENT_TYPE_LABELS[attType]}
                    </span>
                    {att.file_size && <span style={{ fontSize: 11, color: "#9CA3AF" }}>{formatSize(att.file_size)}</span>}
                    {att.notes && <span style={{ fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{att.notes}</span>}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {att.signed_url && (
                    <a href={att.signed_url} target="_blank" rel="noopener noreferrer" title="Open / Download"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, background: "#EEF2FF", color: "#635BFF", textDecoration: "none" }}>
                      <Download size={14} />
                    </a>
                  )}
                  {!readOnly && (
                    <button onClick={() => handleDelete(att.id)} title="Remove"
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, background: "#FEE2E2", color: "#EF4444", border: "none", cursor: "pointer" }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          entityType={entityType}
          entityId={entityId}
          tenantId={tenantId}
          onClose={() => setShowUpload(false)}
          onUploaded={() => fetchAttachments()}
        />
      )}
    </div>
  );
}
