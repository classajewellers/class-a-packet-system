"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { hasPermission } from "@/lib/userTypes";

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
  "Low":      { bg: "var(--vault-surface)", color: "var(--vault-text-secondary)" },
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
  const { user, hydrated } = useUser();
  const router = useRouter();
  useEffect(() => {
    if (hydrated && user && !hasPermission(user, "vault_brain")) router.replace("/");
  }, [user, hydrated, router]);

  const [reports, setReports] = useState<VaultReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stuckWebhooks, setStuckWebhooks] = useState<{ stuckCount: number; oldestMinutes: number | null } | null>(null);

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

  // Webhook health — surfaces any Shopify webhook stuck in received/processing
  // beyond a reasonable window (see app/api/webhook-events/health). Checked
  // whenever staff load this page rather than on a schedule, since there's no
  // cron infrastructure in this app yet.
  useEffect(() => {
    if (!user?.tenantId) return;
    fetch("/api/webhook-events/health", { cache: "no-store", headers: { 'x-tenant-id': user.tenantId } })
      .then((r) => r.json())
      .then((json) => setStuckWebhooks(json))
      .catch(() => setStuckWebhooks(null));
  }, [user?.tenantId]);

  if (!user || !hasPermission(user, "vault_brain")) return null;

  const filtered = filter === "All" ? reports : reports.filter((r) => r.type === filter);

  return (
    <div style={{ padding: 32, maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: "var(--vault-text-page-title)", fontWeight: 600, color: "var(--vault-text)", margin: 0 }}>Vault Brain</h1>
        <p style={{ fontSize: 14, color: "var(--vault-text-secondary)", marginTop: 4 }}>AI-processed reports from staff — bugs, ideas, decisions, and requests.</p>
      </div>

      {/* Webhook health banner — only shown when something is actually stuck */}
      {stuckWebhooks && stuckWebhooks.stuckCount > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 10,
          padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#991B1B",
        }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <span>
            <strong>{stuckWebhooks.stuckCount}</strong> Shopify webhook{stuckWebhooks.stuckCount !== 1 ? "s" : ""} stuck without completing
            {stuckWebhooks.oldestMinutes != null && ` — oldest is ${stuckWebhooks.oldestMinutes} minute${stuckWebhooks.oldestMinutes !== 1 ? "s" : ""} old`}.
            An order may be missing from Vault — check the webhook_events table.
          </span>
        </div>
      )}

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
                color: active ? "var(--vault-text)" : "var(--vault-text-secondary)",
                borderBottom: `2px solid ${active ? "var(--vault-text)" : "transparent"}`,
                marginBottom: -1, fontFamily: "inherit",
                transition: "color .15s",
              }}
            >
              {f} {count > 0 && <span style={{ fontSize: 11, background: active ? "var(--vault-surface-selected)" : "var(--vault-surface)", color: active ? "var(--vault-text)" : "var(--vault-text-muted)", borderRadius: 999, padding: "1px 6px", marginLeft: 4 }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Feed */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--vault-text-muted)", fontSize: 14 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <p style={{ color: "var(--vault-text-muted)", fontSize: 15 }}>No reports yet.</p>
          <p style={{ color: "#C4C4D4", fontSize: 13, marginTop: 4 }}>Staff can submit reports using the ⚡ button in the bottom right.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((r) => {
            const typeStyle = TYPE_STYLES[r.type] ?? { bg: "var(--vault-surface)", color: "var(--vault-text)", label: r.type };
            const priStyle = PRIORITY_STYLES[r.priority ?? "Medium"] ?? PRIORITY_STYLES["Medium"];
            const isExpanded = expandedId === r.id;

            return (
              <div
                key={r.id}
                style={{ background: "var(--vault-canvas)", border: "1px solid #E8E8F0", borderRadius: 12, padding: "16px 20px", transition: "box-shadow .15s" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = "var(--vault-shadow-elevated)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.boxShadow = "none")}
              >
                {/* Top row: badges + meta */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ background: typeStyle.bg, color: typeStyle.color, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.03em" }}>{typeStyle.label}</span>
                    {r.area && <span style={{ background: "var(--vault-surface)", color: "var(--vault-text-secondary)", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 500 }}>{r.area}</span>}
                    {r.priority && <span style={{ background: priStyle.bg, color: priStyle.color, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{r.priority}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: "var(--vault-text-muted)", whiteSpace: "nowrap" }}>
                      {r.submitted_by ? `${r.submitted_by} · ` : ""}{timeAgo(r.created_at)}
                    </span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      title={isExpanded ? "Collapse" : "Expand"}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--vault-text-muted)", fontSize: 16, padding: "0 4px", lineHeight: 1 }}
                    >
                      {isExpanded ? "▲" : "▼"}
                    </button>
                  </div>
                </div>

                {/* Title */}
                <p style={{ fontSize: 15, fontWeight: 700, color: "var(--vault-text)", margin: "10px 0 4px" }}>
                  {r.title ?? "Untitled Report"}
                </p>

                {/* Summary */}
                <p style={{ fontSize: 13, color: "var(--vault-text-secondary)", margin: 0, lineHeight: 1.5 }}>
                  {r.summary ?? r.raw_description}
                </p>

                {/* Tags */}
                {r.tags && r.tags.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {r.tags.map((tag) => (
                      <span key={tag} style={{ background: "var(--vault-surface-selected)", color: "var(--vault-text)", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 500 }}>#{tag}</span>
                    ))}
                  </div>
                )}

                {/* Expanded: raw description + screenshot */}
                {isExpanded && (
                  <div style={{ marginTop: 16, padding: 16, background: "var(--vault-surface)", borderRadius: 8, border: "1px solid #E8E8F0" }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--vault-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>Original Description</p>
                    <p style={{ fontSize: 13, color: "var(--vault-text)", margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.raw_description}</p>
                    {r.image_url && (
                      <div style={{ marginTop: 12 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--vault-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>Screenshot</p>
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
