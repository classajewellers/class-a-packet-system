"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

interface JobListItem {
  id: string;
  reference_number: string | null;
  in_date: string | null;
  customer_last_name: string | null;
  instructions: string | null;
  articles: string | null;
  product_category: string | null;
  staff_member: string | null;
  workshop_due_date: string | null;
  workshop_due_date_overridden: boolean | null;
  manufacture_type: string | null;
  job_complexity: string | null;
  workshop_supplier: string | null;
  collected_date: string | null;
  packet_type: string;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function todayString(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function isOverdue(job: JobListItem): boolean {
  if (!job.workshop_due_date) return false;
  if (job.collected_date) return false;
  return job.workshop_due_date < todayString();
}

function isComplete(job: JobListItem): boolean {
  return job.collected_date != null;
}

function rowBg(job: JobListItem): string {
  if (isComplete(job)) return "#DCFCE7";
  if (isOverdue(job)) return "#FEE2E2";
  return "#FEF9C3";
}

export default function MinorJobsPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const isManager = canManage(user?.role);

  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchSurname, setSearchSurname] = useState("");
  const [filterComplexity, setFilterComplexity] = useState("");
  const [showComplete, setShowComplete] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState<{ id: string; value: string } | null>(null);
  const [savingDueDate, setSavingDueDate] = useState(false);

  const fetchJobs = useCallback(async () => {
    if (!hydrated) return;
    try {
      const res = await fetch("/api/workshop/job-lists?type=minor", {
        cache: "no-store",
        headers: { "x-tenant-id": user?.tenantId ?? "" },
      });
      const json = await res.json();
      setJobs(json.jobs ?? []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [hydrated, user?.tenantId]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  async function saveDueDate(id: string, value: string) {
    setSavingDueDate(true);
    try {
      await fetch(`/api/workshop/job-lists/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": user?.tenantId ?? "",
        },
        body: JSON.stringify({ workshop_due_date: value, workshop_due_date_overridden: true }),
      });
      setJobs((prev) =>
        prev.map((j) =>
          j.id === id
            ? { ...j, workshop_due_date: value, workshop_due_date_overridden: true }
            : j
        )
      );
    } finally {
      setSavingDueDate(false);
      setEditingDueDate(null);
    }
  }

  // Filtering
  let filtered = [...jobs];
  if (!showComplete) {
    filtered = filtered.filter((j) => !isComplete(j));
  }
  if (searchSurname) {
    filtered = filtered.filter((j) =>
      j.customer_last_name?.toLowerCase().includes(searchSurname.toLowerCase())
    );
  }
  if (filterComplexity) {
    filtered = filtered.filter((j) => j.job_complexity === filterComplexity);
  }

  // Sort by in_date asc
  filtered.sort((a, b) => {
    if (!a.in_date) return 1;
    if (!b.in_date) return -1;
    return a.in_date.localeCompare(b.in_date);
  });

  // Grouping: track last rendered in_date
  let lastRenderedDate = "";

  if (!hydrated || !user) return null;

  return (
    <div style={{ fontFamily: "Inter, sans-serif", padding: "24px 32px", paddingBottom: 40, backgroundColor: "#F9FAFB", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 24 }}>
        <button
          onClick={() => router.push("/workshop")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#635BFF",
            fontSize: 14,
            fontFamily: "Inter, sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: 0,
          }}
        >
          ← Workshop
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827", fontFamily: "Inter, sans-serif" }}>
          Minor Job List
        </h1>
      </div>

      {/* Filter bar */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E8E8F0",
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 24,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder="Search surname..."
          value={searchSurname}
          onChange={(e) => setSearchSurname(e.target.value)}
          style={{
            padding: "8px 12px",
            border: "1px solid #E8E8F0",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "Inter, sans-serif",
            outline: "none",
            minWidth: 180,
          }}
        />

        <select
          value={filterComplexity}
          onChange={(e) => setFilterComplexity(e.target.value)}
          style={{
            padding: "8px 12px",
            border: "1px solid #E8E8F0",
            borderRadius: 8,
            fontSize: 13,
            fontFamily: "Inter, sans-serif",
            outline: "none",
            background: "#fff",
          }}
        >
          <option value="">All Complexity</option>
          <option value="Standard">Standard</option>
          <option value="Complex">Complex</option>
        </select>

        <button
          onClick={() => setShowComplete((v) => !v)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            background: showComplete ? "#16A34A" : "#9CA3AF",
            color: "#fff",
            transition: "background 0.15s",
          }}
        >
          Show Complete
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
          Loading jobs…
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #E8E8F0",
            borderRadius: 12,
            padding: 48,
            textAlign: "center",
            color: "#6B7280",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No active jobs</div>
          {!showComplete && (
            <div style={{ fontSize: 13 }}>
              Toggle "Show Complete" to see collected jobs.
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "Inter, sans-serif" }}>
            <thead>
              <tr style={{ background: "#F9FAFB" }}>
                {["Date Taken", "Surname", "Complexity", "Description", "Staff", "Due Date", "Status"].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: "10px 12px",
                      textAlign: "left",
                      color: "#6B7280",
                      fontWeight: 600,
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      borderBottom: "1px solid #E8E8F0",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => {
                const showDate = job.in_date !== lastRenderedDate;
                if (job.in_date) lastRenderedDate = job.in_date;

                const isEditingThis = editingDueDate?.id === job.id;

                return (
                  <tr
                    key={job.id}
                    onClick={() => router.push("/orders/" + job.id)}
                    style={{
                      background: rowBg(job),
                      cursor: "pointer",
                      borderBottom: "1px solid #E8E8F0",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.filter = "brightness(0.97)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.filter = "none";
                    }}
                  >
                    {/* Date Taken — grouped */}
                    <td style={{ padding: "10px 12px", color: "#374151", whiteSpace: "nowrap", verticalAlign: "top" }}>
                      {showDate ? formatDate(job.in_date) : ""}
                    </td>

                    {/* Surname */}
                    <td style={{ padding: "10px 12px", color: "#111827", fontWeight: 500, verticalAlign: "top" }}>
                      {job.customer_last_name ?? "—"}
                    </td>

                    {/* Complexity badge */}
                    <td style={{ padding: "10px 12px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                      {job.job_complexity === "Complex" ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 10px",
                            borderRadius: 999,
                            background: "#FEE2E2",
                            color: "#DC2626",
                            fontWeight: 600,
                            fontSize: 11,
                          }}
                        >
                          Complex
                        </span>
                      ) : job.job_complexity === "Standard" ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 10px",
                            borderRadius: 999,
                            background: "#DCFCE7",
                            color: "#16A34A",
                            fontWeight: 600,
                            fontSize: 11,
                          }}
                        >
                          Standard
                        </span>
                      ) : (
                        <span style={{ color: "#9CA3AF" }}>{job.job_complexity ?? "—"}</span>
                      )}
                    </td>

                    {/* Description */}
                    <td style={{ padding: "10px 12px", color: "#374151", maxWidth: 260, verticalAlign: "top" }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {job.instructions ?? job.articles ?? "—"}
                      </div>
                    </td>

                    {/* Staff */}
                    <td style={{ padding: "10px 12px", color: "#374151", verticalAlign: "top", whiteSpace: "nowrap" }}>
                      {job.staff_member ?? "—"}
                    </td>

                    {/* Due Date */}
                    <td
                      style={{ padding: "10px 12px", color: "#374151", verticalAlign: "top", whiteSpace: "nowrap" }}
                      onClick={(e) => {
                        if (isManager) {
                          e.stopPropagation();
                          setEditingDueDate({ id: job.id, value: job.workshop_due_date ?? "" });
                        }
                      }}
                    >
                      {isEditingThis ? (
                        <input
                          type="date"
                          value={editingDueDate?.value ?? ""}
                          autoFocus
                          onChange={(e) =>
                            setEditingDueDate({ id: job.id, value: e.target.value })
                          }
                          onBlur={() => {
                            if (editingDueDate && editingDueDate.value) {
                              saveDueDate(job.id, editingDueDate.value);
                            } else {
                              setEditingDueDate(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editingDueDate?.value) {
                              saveDueDate(job.id, editingDueDate.value);
                            } else if (e.key === "Escape") {
                              setEditingDueDate(null);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          disabled={savingDueDate}
                          style={{
                            fontSize: 12,
                            fontFamily: "Inter, sans-serif",
                            border: "1px solid #635BFF",
                            borderRadius: 6,
                            padding: "4px 8px",
                            outline: "none",
                          }}
                        />
                      ) : (
                        <span>
                          {formatDate(job.workshop_due_date)}
                          {job.workshop_due_date_overridden && (
                            <span style={{ marginLeft: 4 }} title="Due date manually overridden">✏️</span>
                          )}
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: "10px 12px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                      {isComplete(job) ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 10px",
                            borderRadius: 999,
                            background: "#DCFCE7",
                            color: "#16A34A",
                            fontWeight: 600,
                            fontSize: 11,
                          }}
                        >
                          Collected
                        </span>
                      ) : (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 10px",
                            borderRadius: 999,
                            background: "#EEF2FF",
                            color: "#635BFF",
                            fontWeight: 600,
                            fontSize: 11,
                          }}
                        >
                          Active
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
