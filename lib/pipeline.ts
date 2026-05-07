export type PipelineStage =
  | "pending"
  | "follow_up_1"
  | "follow_up_2"
  | "job_won"
  | "job_lost";

export const PIPELINE_STAGES: PipelineStage[] = [
  "pending",
  "follow_up_1",
  "follow_up_2",
  "job_won",
  "job_lost",
];

export interface StageConfig {
  label: string;
  color: string;       // hex for inline style headers/badges
  tailwindBg: string;  // Tailwind class for buttons
  tailwindText: string;
  tailwindBorder: string;
  timestampField: string; // DB column that records when this stage was entered
}

export const STAGE_CONFIG: Record<PipelineStage, StageConfig> = {
  pending: {
    label: "Pending",
    color: "#6B7280",
    tailwindBg: "bg-gray-500 hover:bg-gray-600",
    tailwindText: "text-white",
    tailwindBorder: "border-gray-500",
    timestampField: "pending_at",
  },
  follow_up_1: {
    label: "Follow Up 1",
    color: "#3B82F6",
    tailwindBg: "bg-blue-500 hover:bg-blue-600",
    tailwindText: "text-white",
    tailwindBorder: "border-blue-500",
    timestampField: "follow_up_1_at",
  },
  follow_up_2: {
    label: "Follow Up 2",
    color: "#F59E0B",
    tailwindBg: "bg-amber-500 hover:bg-amber-600",
    tailwindText: "text-white",
    tailwindBorder: "border-amber-500",
    timestampField: "follow_up_2_at",
  },
  job_won: {
    label: "Job Won",
    color: "#10B981",
    tailwindBg: "bg-emerald-500 hover:bg-emerald-600",
    tailwindText: "text-white",
    tailwindBorder: "border-emerald-500",
    timestampField: "job_won_at",
  },
  job_lost: {
    label: "Job Lost",
    color: "#EF4444",
    tailwindBg: "bg-red-500 hover:bg-red-600",
    tailwindText: "text-white",
    tailwindBorder: "border-red-500",
    timestampField: "job_lost_at",
  },
};

/** Returns today's ISO date string YYYY-MM-DD */
export function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

/** True when follow_up_date is today or earlier */
export function isOverdue(followUpDate: string | null | undefined): boolean {
  if (!followUpDate) return false;
  return followUpDate <= todayDateStr();
}

/** 7 days from today as YYYY-MM-DD */
export function defaultFollowUpDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

/** Canonical stage for a quote (treats "converted" as job_won for display purposes) */
export function quoteStage(status: string): PipelineStage {
  if (PIPELINE_STAGES.includes(status as PipelineStage)) {
    return status as PipelineStage;
  }
  // "converted" quotes display in the job_won column
  if (status === "converted") return "job_won";
  return "pending";
}
