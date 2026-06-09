"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

interface VaultReport {
  id: string;
  type: string;
  raw_description: string;
  title: string | null;
  area: string | null;
  priority: string | null;
  summary: string | null;
  tags: string[] | null;
  image_url: string | null;
  submitted_by: string | null;
  created_at: string;
}

type FilterType = "All" | "Bug" | "Idea" | "Feature Request" | "Decision";
const FILTERS: FilterType[] = ["All", "Bug", "Idea", "Feature Request", "Decision"];

const TYPE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  "Bug":             { bg: "#FEE2E2", color: "#991B1B", label: "Bug" },
  "Idea":            { bg: "#EEF2FF", color: "#3730A3", label: "Idea" },
  "Feature Request": { bg: "#DBEAFE", color: "#1E40AF", label: "Feature" },
  "Decision":        { bg: "#FEF3C7", color: "#92400E", label: "Decision" },
};

const PRIORITY_STYLES: Record<string, { bg: string; color: string }> = {
  "Critical": { bg: "#FEE2E2", color: "#991B1B" },
  "High":     { bg: "#FEF3C7", color: "#92400E" },
  "Medium":   { bg: "#E0F2FE", color: "#0369A1" },
  "Low":      { bg: "#F3F4F6", color: "#6B7280" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export default function VaultBrainPage() {
  const { user } = useUser();
  const router = useRouter();
  useEffect(() => {
    if (user && !canManage(user.role)) router.replace("/orders");
  }, [user, router]);

  const [reports, setReports] = useState<VaultReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vault/reports", { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } });
      const json = await res.json();
      setReports(json.reports ?? []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  if (!user || !canManage(user.role)) return null;

  const filtered = filter === "All" ? reports : reports.filter((r) => r.type === filter);

  return (
    <div style={{ padding: 32, maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Vault Brain</h1>
        <p style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>AI-processed reports from staff — bugs, ideas, decisions, and requests.</p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid #E8E8F0", paddingBottom: 0 }}>
        {FILTERS.map((f) => {
          const active = filter === f;
          const count = f === "All" ? reports.length : reports.filter((r) => r.type === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "8px 14px", background: "none", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: active ? 600 : 400,
                color: active ? "#635BFF" : "#6B7280",
                borderBottom: `2px solid ${active ? "#635BFF" : "transparent"}`,
                marginBottom: -1, fontFamily: "inherit",
                transition: "color .15s",
              }}
            >
              {f} {count > 0 && <span style={{ fontSize: 11, background: active ? "#EEF2FF" : "#F3F4F6", color: active ? "#635BFF" : "#9CA3AF", borderRadius: 999, padding: "1px 6px", marginLeft: 4 }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Feed */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#9CA3AF", fontSize: 14 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <p style={{ color: "#9CA3AF", fontSize: 15 }}>No reports yet.</p>
          <p style={{ color: "#C4C4D4", fontSize: 13, marginTop: 4 }}>Staff can submit reports using the ⚡ button in the bottom right.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((r) => {
            const typeStyle = TYPE_STYLES[r.type] ?? { bg: "#F3F4F6", color: "#374151", label: r.type };
            const priStyle = PRIORITY_STYLES[r.priority ?? "Medium"] ?? PRIORITY_STYLES["Medium"];
            const isExpanded = expandedId === r.id;

            return (
              <div
                key={r.id}
                style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, padding: "16px 20px", transition: "box-shadow .15s" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = "none")}
              >
                {/* Top row: badges + meta */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ background: typeStyle.bg, color: typeStyle.color, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.03em" }}>{typeStyle.label}</span>
                    {r.area && <span style={{ background: "#F3F4F6", color: "#6B7280", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 500 }}>{r.area}</span>}
                    {r.priority && <span style={{ background: priStyle.bg, color: priStyle.color, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{r.priority}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap" }}>
                      {r.submitted_by ? `${r.submitted_by} · ` : ""}{timeAgo(r.created_at)}
                    </span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      title={isExpanded ? "Collapse" : "Expand"}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 16, padding: "0 4px", lineHeight: 1 }}
                    >
                      {isExpanded ? "▲" : "▼"}
                    </button>
                  </div>
                </div>

                {/* Title */}
                <p style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E", margin: "10px 0 4px" }}>
                  {r.title ?? "Untitled Report"}
                </p>

                {/* Summary */}
                <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
                  {r.summary ?? r.raw_description}
                </p>

                {/* Tags */}
                {r.tags && r.tags.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {r.tags.map((tag) => (
                      <span key={tag} style={{ background: "#F0EFFF", color: "#635BFF", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 500 }}>#{tag}</span>
                    ))}
                  </div>
                )}

                {/* Expanded: raw description + screenshot */}
                {isExpanded && (
                  <div style={{ marginTop: 16, padding: 16, background: "#F9FAFB", borderRadius: 8, border: "1px solid #E8E8F0" }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>Original Description</p>
                    <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.raw_description}</p>
                    {r.image_url && (
                      <div style={{ marginTop: 12 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>Screenshot</p>
                        <img src={r.image_url} alt="Screenshot" style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #E8E8F0" }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
