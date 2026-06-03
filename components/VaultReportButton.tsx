"use client";

import { useState, useRef } from "react";
import { useUser } from "@/context/UserContext";

const TYPES = ["Bug", "Idea", "Feature Request", "Decision"];

export default function VaultReportButton() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("Bug");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("description", description.trim());
      if (image) fd.append("image", image);
      if (user?.name) fd.append("submitted_by", user.name);
      await fetch("/api/vault/submit", { method: "POST", body: fd });
      setSubmitted(true);
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
        setDescription("");
        setImage(null);
        setType("Bug");
      }, 1800);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        title="Report a bug or share an idea"
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 40,
          width: 48, height: 48, borderRadius: "50%",
          background: "#635BFF", border: "none",
          boxShadow: "0 4px 16px rgba(99,91,255,0.45)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform .15s, box-shadow .15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 24px rgba(99,91,255,0.55)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(99,91,255,0.45)";
        }}
      >
        {/* Lightning bolt / report icon */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #E8E8F0" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1A1A2E" }}>Report</h2>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: "#6B7280" }}>Share a bug, idea, or feature request</p>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
            </div>

            {submitted ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                <p style={{ fontSize: 15, fontWeight: 600, color: "#1A1A2E", margin: 0 }}>Thanks! Your report was submitted.</p>
                <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>Our AI is processing it now.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Type */}
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Type</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      style={{ width: "100%", border: "1px solid #E8E8F0", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "#1A1A2E", background: "#fff", outline: "none", fontFamily: "inherit", appearance: "none", cursor: "pointer" }}
                    >
                      {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* Description */}
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Describe it</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What happened? What would you like to see?"
                      rows={5}
                      required
                      style={{ width: "100%", border: "1px solid #E8E8F0", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "#1A1A2E", background: "#fff", outline: "none", fontFamily: "inherit", resize: "vertical", minHeight: 100, boxSizing: "border-box" }}
                    />
                  </div>

                  {/* Image upload */}
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Screenshot <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
                    {image ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F0EFFF", borderRadius: 8, border: "1px solid #E0DFFF" }}>
                        <span style={{ fontSize: 13, color: "#635BFF", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{image.name}</span>
                        <button type="button" onClick={() => { setImage(null); if (fileRef.current) fileRef.current.value = ""; }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => fileRef.current?.click()} style={{ width: "100%", padding: "10px 12px", border: "1px dashed #D1D5DB", borderRadius: 8, background: "#FAFAFA", color: "#6B7280", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                        + Attach screenshot
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "16px 24px", borderTop: "1px solid #E8E8F0" }}>
                  <button type="button" onClick={() => setOpen(false)} style={{ background: "#F3F4F6", color: "#374151", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  <button type="submit" disabled={submitting || !description.trim()} style={{ background: submitting ? "#9CA3AF" : "#635BFF", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 14, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {submitting ? "Submitting…" : "Submit"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
