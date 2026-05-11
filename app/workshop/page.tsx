"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { WorkshopJob } from "@/lib/types";
import { formatDateAU } from "@/lib/formatters";
import dynamic from "next/dynamic";

// Lazy-load DnD to avoid SSR issues
const WorkshopBoard = dynamic(() => import("@/components/WorkshopBoard"), { ssr: false });

export default function WorkshopPage() {
  const { user } = useUser();
  const router = useRouter();

  // Manager-only guard
  useEffect(() => {
    if (user && user.role !== "manager") {
      router.replace("/orders");
    }
  }, [user, router]);

  const [jobs, setJobs] = useState<WorkshopJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "list">("board");
  const [jobTypeFilter, setJobTypeFilter] = useState<"all" | "major" | "minor" | "overdue">("all");
  const [jewellerFilter, setJewellerFilter] = useState<string>("all");

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/workshop/jobs", { cache: "no-store" });
      const json = await res.json();
      setJobs(json.jobs ?? []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  async function handleStageChange(jobId: string, newStage: string) {
    setJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, stage: newStage, stage_changed_at: new Date().toISOString() } : j));
    await fetch(`/api/workshop/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
  }

  if (!user || user.role !== "manager") return null;

  const today = new Date().toISOString().split("T")[0];

  // Jewellers list from jobs
  const jewellers = Array.from(new Set(jobs.map((j) => j.assigned_jeweller).filter(Boolean))) as string[];

  const filteredJobs = jobs.filter((j) => {
    if (jobTypeFilter === "major" && j.job_type !== "major") return false;
    if (jobTypeFilter === "minor" && j.job_type !== "minor") return false;
    if (jobTypeFilter === "overdue" && (j.due_date == null || j.due_date >= today)) return false;
    if (jewellerFilter !== "all" && j.assigned_jeweller !== jewellerFilter) return false;
    return true;
  });

  const mainJobs = filteredJobs.filter((j) => !j.is_subcontractor);
  const subcontractorJobs = jobs.filter((j) => j.is_subcontractor);

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["all", "major", "minor", "overdue"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setJobTypeFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                jobTypeFilter === f ? "bg-black text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f === "overdue" ? "Overdue" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        {jewellers.length > 0 && (
          <select
            value={jewellerFilter}
            onChange={(e) => setJewellerFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="all">All Jewellers</option>
            {jewellers.map((j) => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        )}
        <div className="ml-auto flex rounded-lg border border-gray-200 overflow-hidden text-sm font-semibold">
          <button
            onClick={() => setView("board")}
            className={`px-4 py-1.5 transition-colors ${view === "board" ? "bg-black text-white" : "bg-white text-gray-500 hover:text-black"}`}
          >Board</button>
          <button
            onClick={() => setView("list")}
            className={`px-4 py-1.5 transition-colors border-l border-gray-200 ${view === "list" ? "bg-black text-white" : "bg-white text-gray-500 hover:text-black"}`}
          >List</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-8 h-8 mx-auto mb-2 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm">Loading workshop…</p>
        </div>
      ) : view === "board" ? (
        <WorkshopBoard jobs={mainJobs} onStageChange={handleStageChange} onRefresh={fetchJobs} />
      ) : (
        /* List view */
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-black">{mainJobs.length} job{mainJobs.length !== 1 ? "s" : ""}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Customer</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Description</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Category</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Jeweller</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Stage</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Due Date</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500">Days In Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {mainJobs.map((j) => {
                  const isOverdue = j.due_date != null && j.due_date < today;
                  const days = Math.floor((Date.now() - new Date(j.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <tr key={j.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-semibold text-gray-800">{j.customer_surname || "—"}</td>
                      <td className="px-5 py-3 text-gray-600 max-w-xs truncate">{j.description || "—"}</td>
                      <td className="px-5 py-3 text-gray-500 capitalize">{j.category}</td>
                      <td className="px-5 py-3 text-gray-500">{j.assigned_jeweller || "—"}</td>
                      <td className="px-5 py-3 text-gray-500 capitalize">{j.stage.replace(/_/g, " ")}</td>
                      <td className={`px-5 py-3 text-sm ${isOverdue ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                        {formatDateAU(j.due_date) || "—"}
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs">{days}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subcontractors */}
      {subcontractorJobs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h2 className="text-sm font-semibold text-black">Subcontractors ({subcontractorJobs.length})</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {subcontractorJobs.map((j) => (
              <div key={j.id} className="px-5 py-4 flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-gray-800">{j.subcontractor_name || "Unknown"}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{j.description}</p>
                  {j.subcontractor_instructions && (
                    <p className="text-xs text-gray-400 mt-1">{j.subcontractor_instructions}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Due: {formatDateAU(j.subcontractor_due_date) || "—"} &bull; Ref: {j.reference_number || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                    j.subcontractor_status === "received"
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}>
                    {j.subcontractor_status === "received" ? "Received" : "Sent"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
