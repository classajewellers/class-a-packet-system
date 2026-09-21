// Lets server-side code (webhook handlers, background jobs) file a Vault
// Brain report directly, bypassing the staff-submission UI and the AI
// classification step in app/api/vault/submit/route.ts — the caller already
// knows exactly what happened and why, so there's nothing for Claude to
// infer here. Same table, same shape, so it renders identically to a
// staff-submitted "Bug" report on /vault/brain.
//
// Best-effort only: a failure to file the report is logged, never thrown —
// this exists to surface OTHER failures to staff, so it must never itself
// become a new source of unhandled errors in whatever caller invokes it.
import { createServerSupabaseClient } from "@/lib/supabase-server";

interface SystemReportInput {
  tenantId: string;
  title: string;
  summary: string;
  area: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  tags?: string[];
  source: string; // e.g. "system:shopify-webhook" — goes in submitted_by
}

export async function fileVaultBrainSystemReport(input: SystemReportInput): Promise<void> {
  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("vault_reports").insert({
      type: "Bug",
      raw_description: input.summary,
      title: input.title,
      area: input.area,
      priority: input.priority,
      summary: input.summary,
      tags: input.tags ?? [],
      image_url: null,
      submitted_by: input.source,
      tenant_id: input.tenantId,
    });
    if (error) {
      console.error("[vaultBrainSystemReport] failed to file report:", error.message);
    }
  } catch (err) {
    console.error("[vaultBrainSystemReport] unexpected error filing report:", err instanceof Error ? err.message : err);
  }
}
