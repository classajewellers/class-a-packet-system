/**
 * Handheld read of a known tag.
 * printed -> active once (conditional on status), and last_seen_at on every
 * read except damaged, retired and replaced. No CHECK exists on
 * verification_method; the column comment lists uhf_reader_manual, azh_p1
 * and uhf_reader_api. The handheld uses uhf_handheld_scan.
 */
import { SupabaseClient } from "@supabase/supabase-js";
import { tenantScoped } from "@/lib/tenantScoped";

const SKIP = new Set(["damaged", "retired", "replaced"]);

export type HandheldRead = "activate" | "seen" | "skip";

export function handheldReadUpdate(status: string): HandheldRead {
  if (SKIP.has(status)) return "skip";
  if (status === "printed") return "activate";
  return "seen";
}

/** Returns the status the scan should display after the read. */
export async function applyHandheldTagReads(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  tags: { epc: string; status: string }[],
): Promise<Map<string, string>> {
  const now = new Date().toISOString();
  const display = new Map<string, string>();
  const printed: string[] = [];
  const seen: string[] = [];
  for (const tag of tags) {
    const epc = tag.epc.toLowerCase();
    const action = handheldReadUpdate(tag.status);
    if (action === "skip") {
      display.set(epc, tag.status);
      continue;
    }
    if (action === "activate") {
      printed.push(epc);
      display.set(epc, "active");
    } else {
      seen.push(epc);
      display.set(epc, tag.status);
    }
  }

  const tagsTable = () => tenantScoped(supabase, tenantId).from("inventory_rfid_tags");

  if (printed.length) {
    const { error } = await tagsTable()
      .update({
        status: "active",
        verified_at: now,
        activated_at: now,
        verification_method: "uhf_handheld_scan",
        verified_by: userId,
        last_seen_at: now,
      })
      .in("epc", printed)
      .eq("status", "printed");
    if (error) throw new Error(error.message);
  }

  if (seen.length) {
    const { error } = await tagsTable()
      .update({ last_seen_at: now })
      .in("epc", seen)
      .not("status", "in", "(damaged,retired,replaced)");
    if (error) throw new Error(error.message);
  }

  return display;
}
