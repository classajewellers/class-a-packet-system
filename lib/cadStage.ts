/** Stage keys added on workshop_stages by migration 168. */
export const CAD_DESIGN_STATUS = "cad_design";
export const CASTING_STATUS = "casting";
export const CAD_DESIGNER_SLUG = "cad_designer";

export const CAD_PATH_STEPS: Record<string, string> = {
  cad_design: "CAD Design",
  casting: "Casting",
  polish_finish: "Polish/Finish",
  polish_set: "Polish/Set",
};

export type CadVersionStatus = "pending" | "approved" | "changes_requested" | "rejected";

export function pathwayStepIndex(
  steps: { name?: string }[] | null | undefined,
  stageKey: string
): number | null {
  const name = CAD_PATH_STEPS[stageKey];
  if (!name || !steps) return null;
  const idx = steps.findIndex((step) => step?.name === name);
  return idx >= 0 ? idx : null;
}

export function isCastingOverdue(packet: {
  status?: string | null;
  workshop_supplier_expected_return?: string | null;
  workshop_supplier_returned?: boolean | null;
}): boolean {
  if (packet.status !== CASTING_STATUS) return false;
  if (packet.workshop_supplier_returned) return false;
  const due = packet.workshop_supplier_expected_return;
  if (!due) return false;
  const today = new Date().toISOString().slice(0, 10);
  return due.slice(0, 10) < today;
}

const RENDER_EXT = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);
const SOURCE_EXT = new Set([
  "stl", "3dm", "step", "stp", "igs", "iges", "obj", "zip", "dxf", "dwg", "sat", "3dc", "jcd", "pdf",
]);

export const CAD_RENDER_MAX_BYTES = 20 * 1024 * 1024;
export const CAD_SOURCE_MAX_BYTES = 40 * 1024 * 1024;

export function fileExtension(name: string): string {
  const parts = name.split(".");
  return (parts.length > 1 ? parts[parts.length - 1] : "").toLowerCase();
}

export function cadRenderError(file: { name: string; size: number }): string | null {
  if (!RENDER_EXT.has(fileExtension(file.name))) {
    return "Render must be a JPG, PNG, WebP, or PDF.";
  }
  if (file.size > CAD_RENDER_MAX_BYTES) return "Render must be 20 MB or smaller.";
  return null;
}

export function cadSourceError(file: { name: string; size: number }): string | null {
  if (!SOURCE_EXT.has(fileExtension(file.name))) {
    return "Source must be a CAD file (STL, 3DM, STEP, IGES, OBJ, DXF, ZIP, PDF).";
  }
  if (file.size > CAD_SOURCE_MAX_BYTES) return "Source file must be 40 MB or smaller.";
  return null;
}
