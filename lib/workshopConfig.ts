/**
 * Workshop track and stage configuration — single source of truth.
 * Three tracks, each with its own stage sequence.
 */

// ── Tracks ────────────────────────────────────────────────────────────────────

export type WorkshopTrack = "repair" | "collections" | "manufacturing";

export const TRACK_LABELS: Record<WorkshopTrack, string> = {
  repair:        "Repair",
  collections:   "Collections",
  manufacturing: "Manufacturing / Designs",
};

export const TRACK_COLOURS: Record<WorkshopTrack, { bg: string; text: string; border: string }> = {
  repair:        { bg: "#CCFBF1", text: "#0F766E", border: "#5EEAD4" },   // teal
  collections:   { bg: "#FFEDD5", text: "#C2410C", border: "#FDBA74" },   // coral/orange
  manufacturing: { bg: "#FEF3C7", text: "#B45309", border: "#FCD34D" },   // amber/gold
};

// ── Stage ids + display names ─────────────────────────────────────────────────

export const STAGE_LABELS: Record<string, string> = {
  sr_job_drawer:        "SR Job Drawer",
  ws_precheck:          "W/S Pre-Check",
  ws_manager_precheck:  "WS Manager Pre-Check",
  admin_populate_pkt:   "Admin Populate PKT",
  ws_job_box:           "W/S Job Box",
  designs:              "Designs",
  send_file_order_parts:"Send File & Order Parts",
  order_box:            "Order Box (CAD)",
  wsjb_qc_precheck:     "WSJB QC Pre-Check",
  jeweller:             "Jeweller",
  qc:                   "QC",
  value:                "Value",
  marketing_value:      "Marketing → Value",
  fjb:                  "FJB",
  completed:            "Completed",
};

// ── Stage sequences per track ─────────────────────────────────────────────────

export const TRACK_STAGES: Record<WorkshopTrack, string[]> = {
  repair: [
    "sr_job_drawer",
    "ws_precheck",
    "ws_manager_precheck",
    "ws_job_box",
    "jeweller",
    "qc",
    "value",
    "fjb",
  ],
  collections: [
    "sr_job_drawer",
    "ws_precheck",
    "admin_populate_pkt",
    "ws_job_box",
    "jeweller",
    "qc",
    "marketing_value",
  ],
  manufacturing: [
    "sr_job_drawer",
    "ws_precheck",
    "designs",
    "send_file_order_parts",
    "order_box",
    "wsjb_qc_precheck",
    "jeweller",
    "qc",
  ],
};

// Union of all stage ids across all tracks (plus completed), deduplicated, in a
// sensible display order for "All tracks" view.
export const ALL_STAGES: string[] = [
  "sr_job_drawer",
  "ws_precheck",
  "ws_manager_precheck",
  "admin_populate_pkt",
  "ws_job_box",
  "designs",
  "send_file_order_parts",
  "order_box",
  "wsjb_qc_precheck",
  "jeweller",
  "qc",
  "value",
  "marketing_value",
  "fjb",
];

// Column accent colours — one per stage (for the column headers on the board)
export const STAGE_COLOURS: Record<string, string> = {
  sr_job_drawer:         "#635BFF",
  ws_precheck:           "#8B5CF6",
  ws_manager_precheck:   "#7C3AED",
  admin_populate_pkt:    "#DB2777",
  ws_job_box:            "#F59E0B",
  designs:               "#06B6D4",
  send_file_order_parts: "#0EA5E9",
  order_box:             "#3B82F6",
  wsjb_qc_precheck:      "#6366F1",
  jeweller:              "#10B981",
  qc:                    "#F97316",
  value:                 "#22C55E",
  marketing_value:       "#EC4899",
  fjb:                   "#6B7280",
  completed:             "#D1D5DB",
};

// ── Staff lists ───────────────────────────────────────────────────────────────

/** Workshop setters / CAD staff — used at ws_precheck and designs stages */
export const WS_STAFF = [
  { name: "Ben Mucklow",      role: "SET w/s + CAD" },
  { name: "Viv Valladares",   role: "SET w/s + CAD" },
  { name: "Joseph Onorato",   role: "w/s" },
  { name: "David Johnson",    role: "w/s" },
  { name: "Jack Mullan",      role: "w/s" },
];

/** WSJB staff — used at wsjb stages, jeweller, qc etc. */
export const WSJB_STAFF = [
  { name: "Pre-Check",         role: "WSJB" },
  { name: "QC",                role: "WSJB" },
  { name: "Repairs",           role: "WSJB" },
  { name: "Manufac. Orders",   role: "WSJB" },
  { name: "Collections",       role: "WSJB" },
  { name: "Ryan",              role: "Sub.C" },
  { name: "McAskills",         role: "Sub.C" },
  { name: "Joel",              role: "Sub.C" },
  { name: "Donna",             role: "WSJB" },
];

/** Sub-contractor names shown in the sub-contractor dropdown */
export const SUBCONTRACTOR_NAMES = ["Ryan", "Joel", "McAskills"];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive the default track from a job type string. */
export function trackFromJobType(jobType: string): WorkshopTrack {
  if (jobType === "custom_order") return "manufacturing";
  if (jobType === "collections")  return "collections";
  return "repair";
}

/** Return the stages to show on the board for a given track filter. */
export function stagesForFilter(filter: WorkshopTrack | "all"): string[] {
  if (filter === "all") return ALL_STAGES;
  return TRACK_STAGES[filter];
}

/** Is this stage a "WSJB" stage (where WSJB staff should be shown)? */
export function isWsjbStage(stage: string): boolean {
  return ["wsjb_qc_precheck", "jeweller", "qc", "value", "marketing_value", "fjb"].includes(stage);
}

/** Is this stage a "WS" stage (where WS staff should be shown)? */
export function isWsStage(stage: string): boolean {
  return ["ws_precheck", "designs"].includes(stage);
}
