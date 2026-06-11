"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { Attachment } from "@/lib/types";

interface Props {
  entityType: "packet" | "quote";
  entityId: string;
}

const ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.heif,.pdf";
const MAX_SIZE_MB = 20;

function FileIcon({ fileType }: { fileType: string }) {
  if (fileType === "pdf") {
    return (
      <div style={{ width: 40, height: 40, borderRadius: 8, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#EF4444" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
    );
  }
  return (
    <div style={{ width: 40, height: 40, borderRadius: 8, background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#635BFF" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
      </svg>
    </div>
  );
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AttachmentsSection({ entityType, entityId }: Props) {
  const { user } = useUser();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = useCallback(async () => {
    if (!entityId) return;
    try {
      const res = await fetch(
        `/api/attachments/list?entity_type=${entityType}&entity_id=${entityId}`,
        { headers: { "x-tenant-id": user?.tenantId ?? "" } }
      );
      const json = await res.json();
      setAttachments(json.attachments ?? []);
    } catch {
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, user?.tenantId]);

  useEffect(() => { fetchAttachments(); }, [fetchAttachments]);

  async function uploadFile(file: File) {
    setError(null);
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("entity_type", entityType);
    formData.append("entity_id", entityId);

    setUploading(true);
    setUploadProgress(0);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          try {
            const json = JSON.parse(xhr.responseText);
            reject(new Error(json.error ?? `Upload failed (${xhr.status})`));
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        }
      });
      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      xhr.open("POST", "/api/attachments/upload");
      xhr.setRequestHeader("x-tenant-id", user?.tenantId ?? "");
      xhr.send(formData);
    }).catch((err) => {
      setError(err instanceof Error ? err.message : "Upload failed");
    });

    setUploading(false);
    setUploadProgress(0);
    await fetchAttachments();
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    for (const file of files) {
      await uploadFile(file);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      handleFiles(e.target.files);
      e.target.value = "";
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this attachment? This cannot be undone.")) return;
    await fetch(`/api/attachments/${id}`, {
      method: "DELETE",
      headers: { "x-tenant-id": user?.tenantId ?? "" },
    });
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 500, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12, borderBottom: "1px solid #E8E8F0", paddingBottom: 4 }}>
        Attachments
      </p>

      {/* Drop zone */}
      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragOver ? "#635BFF" : "#D1D5DB"}`,
          borderRadius: 10,
          padding: "14px 12px",
          textAlign: "center",
          cursor: uploading ? "wait" : "pointer",
          background: dragOver ? "#EEF2FF" : "#FAFAFA",
          transition: "all .15s",
          marginBottom: 12,
        }}
      >
        <input ref={fileInputRef} type="file" accept={ACCEPT} multiple onChange={handleInputChange} style={{ display: "none" }} />

        {uploading ? (
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#635BFF", marginBottom: 6 }}>Uploading… {uploadProgress}%</div>
            <div style={{ height: 4, background: "#E8E8F0", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${uploadProgress}%`, background: "#635BFF", borderRadius: 999, transition: "width .1s" }} />
            </div>
          </div>
        ) : (
          <>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#9CA3AF" strokeWidth={1.5} style={{ margin: "0 auto 6px" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>
              <span style={{ fontWeight: 600, color: "#635BFF" }}>Click to upload</span> or drag & drop
            </p>
            <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>JPG, PNG, WebP, HEIC, PDF · max {MAX_SIZE_MB} MB</p>
          </>
        )}
      </div>

      {error && (
        <p style={{ fontSize: 12, color: "#EF4444", marginBottom: 10 }}>{error}</p>
      )}

      {/* File list */}
      {loading ? (
        <p style={{ fontSize: 13, color: "#9CA3AF" }}>Loading…</p>
      ) : attachments.length === 0 ? (
        <p style={{ fontSize: 13, color: "#9CA3AF" }}>No attachments yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {attachments.map((att) => (
            <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#F9FAFB", border: "1px solid #E8E8F0", borderRadius: 10 }}>
              {att.file_type === "image" && att.signed_url ? (
                <img
                  src={att.signed_url}
                  alt={att.file_name}
                  style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8, flexShrink: 0, border: "1px solid #E8E8F0" }}
                />
              ) : (
                <FileIcon fileType={att.file_type} />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: "#1A1A2E", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.file_name}</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{formatSize(att.file_size)}</p>
              </div>

              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {att.signed_url && (
                  <a
                    href={att.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Download"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, background: "#EEF2FF", color: "#635BFF", textDecoration: "none" }}
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                  </a>
                )}
                <button
                  onClick={() => handleDelete(att.id)}
                  title="Delete"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, background: "#FEE2E2", color: "#EF4444", border: "none", cursor: "pointer" }}
                >
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
